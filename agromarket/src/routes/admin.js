const express = require('express');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const validar = require('../middleware/validate');
const { requerirLogin, requerirRol } = require('../middleware/auth');
const { addDays, parseJson } = require('../utils');
const avisosSrv = require('../services/avisos');
const auditoria = require('../services/auditoria');
const email = require('../services/email');

const router = express.Router();
router.use(requerirLogin, requerirRol('admin', 'moderador'));

router.get('/', async (req, res) => {
  const c = async (q) => Number((await q.count({ c: '*' }).first()).c);
  const hoy = new Date(Date.now() - 86400000);
  const stats = {
    enRevision: await c(db('avisos').where('estado', 'en_revision')),
    reportesPendientes: await c(db('reportes').where('estado', 'pendiente')),
    activos: await c(db('avisos').where('estado', 'activo')),
    usuarios: await c(db('usuarios').where('estado', 'activo')),
    nuevosHoy: await c(db('avisos').where('created_at', '>', hoy)),
    contactosHoy: await c(db('contactos').where('created_at', '>', hoy)),
    ingresos: Number((await db('pagos').where('estado', 'aprobado').sum({ s: 'monto' }).first()).s || 0),
  };
  const ultimos = await db('auditoria').orderBy('created_at', 'desc').limit(15);
  res.render('admin/dashboard', { titulo: 'Administración', stats, ultimos });
});

router.get('/moderacion', async (req, res) => {
  const avisos = await avisosSrv.conFotos(await avisosSrv.baseQuery().where('avisos.estado', 'en_revision').orderBy('avisos.puntaje_riesgo', 'desc').orderBy('avisos.created_at', 'asc'));
  for (const a of avisos) { a.senales = parseJson(a.senales_riesgo, []); a.reportes = await db('reportes').where('aviso_id', a.id).orderBy('created_at', 'desc'); }
  res.render('admin/moderacion', { titulo: 'Moderación', avisos });
});

router.post('/aviso/:id/decidir', validar(z.object({ decision: z.enum(['aprobar', 'rechazar', 'suspender'] ), motivo: z.string().trim().max(300).default('') })), async (req, res) => {
  const aviso = await db('avisos').where('id', req.params.id).first();
  if (!aviso) return res.status(404).render('error', { titulo: 'Aviso no encontrado', mensaje: '' });
  const ahora = new Date();
  const cambios = { updated_at: ahora };
  if (req.datos.decision === 'aprobar') Object.assign(cambios, { estado: 'activo', motivo_rechazo: '', fecha_publicacion: aviso.fecha_publicacion || ahora, fecha_vencimiento: addDays(ahora, config.reglas.avisoDias), bump_at: ahora });
  else Object.assign(cambios, { estado: 'rechazado', motivo_rechazo: req.datos.motivo || 'No cumple las reglas de publicación' });
  await db('avisos').where('id', aviso.id).update(cambios);
  await db('reportes').where({ aviso_id: aviso.id, estado: 'pendiente' }).update({ estado: 'resuelto', resuelto_por: req.user.id });
  await auditoria.registrar({ actorId: req.user.id, accion: `moderar_${req.datos.decision}`, entidad: 'aviso', entidadId: aviso.id, detalle: req.datos.motivo, ip: req.ip });
  const dueno = await db('usuarios').where('id', aviso.usuario_id).first();
  if (dueno) await email.enviar({ to: dueno.email, subject: req.datos.decision === 'aprobar' ? `Tu aviso ya está publicado en ${config.siteName}` : `Tu aviso en ${config.siteName} no fue aprobado`, text: req.datos.decision === 'aprobar' ? `Tu aviso "${aviso.titulo}" ya está visible: ${config.baseUrl}/aviso/${aviso.id}/${aviso.slug}` : `Tu aviso "${aviso.titulo}" no fue aprobado. Motivo: ${cambios.motivo_rechazo}. Podés editarlo y volver a enviarlo desde Mis avisos.` });
  res.redirect(req.get('Referrer') || '/admin/moderacion');
});

router.get('/reportes', async (req, res) => {
  const reportes = await db('reportes').join('avisos', 'avisos.id', 'reportes.aviso_id').where('reportes.estado', 'pendiente')
    .select('reportes.*', 'avisos.titulo', 'avisos.slug', 'avisos.estado as aviso_estado', 'avisos.usuario_id as dueno_id').orderBy('reportes.created_at', 'desc');
  res.render('admin/reportes', { titulo: 'Reportes', reportes });
});
router.post('/reportes/:id', validar(z.object({ accion: z.enum(['descartar', 'resolver']) })), async (req, res) => {
  await db('reportes').where('id', req.params.id).update({ estado: req.datos.accion === 'descartar' ? 'descartado' : 'resuelto', resuelto_por: req.user.id, updated_at: new Date() });
  res.redirect('/admin/reportes');
});

router.get('/usuarios', async (req, res) => {
  const q = String(req.query.q || '').trim();
  let usuarios = db('usuarios').orderBy('created_at', 'desc').limit(100);
  if (q) usuarios = usuarios.where((b) => b.whereILike('email', `%${q}%`).orWhereILike('nombre', `%${q}%`).orWhereIn('id', db('telefonos').select('usuario_id').whereILike('numero_e164', `%${q.replace(/\D/g, '')}%`)));
  usuarios = await usuarios;
  const tels = usuarios.length ? await db('telefonos').whereIn('usuario_id', usuarios.map((u) => u.id)) : [];
  const empresas = usuarios.length ? await db('empresas').whereIn('usuario_id', usuarios.map((u) => u.id)) : [];
  for (const u of usuarios) { u.telefonos = tels.filter((t) => t.usuario_id === u.id); u.empresa = empresas.find((e) => e.usuario_id === u.id); }
  res.render('admin/usuarios', { titulo: 'Usuarios', usuarios, q });
});

router.post('/usuarios/:id', validar(z.object({ accion: z.enum(['suspender', 'activar', 'validar_cuit', 'hacer_moderador', 'quitar_moderador', 'plan_basico', 'plan_pro', 'plan_ninguno']), motivo: z.string().max(200).default('') })), async (req, res) => {
  const u = await db('usuarios').where('id', req.params.id).first();
  if (!u) return res.status(404).render('error', { titulo: 'Usuario no encontrado', mensaje: '' });
  const a = req.datos.accion;
  if (a === 'suspender') {
    await db('usuarios').where('id', u.id).update({ estado: 'suspendido' });
    await db('avisos').where({ usuario_id: u.id, estado: 'activo' }).update({ estado: 'pausado' });
    for (const t of await db('telefonos').where({ usuario_id: u.id })) await db('listas_negras').insert({ tipo: 'telefono', valor: t.numero_e164, motivo: req.datos.motivo || 'usuario suspendido' }).onConflict(['tipo', 'valor']).ignore();
    await db('listas_negras').insert({ tipo: 'email', valor: u.email, motivo: req.datos.motivo || 'usuario suspendido' }).onConflict(['tipo', 'valor']).ignore();
  }
  if (a === 'activar') await db('usuarios').where('id', u.id).update({ estado: 'activo' });
  if (a === 'validar_cuit') await db('empresas').where('usuario_id', u.id).update({ cuit_validado: true });
  if (a === 'hacer_moderador' && req.user.rol === 'admin') await db('usuarios').where('id', u.id).update({ rol: 'moderador' });
  if (a === 'quitar_moderador' && req.user.rol === 'admin') await db('usuarios').where('id', u.id).update({ rol: 'usuario' });
  if (a.startsWith('plan_')) await db('empresas').where('usuario_id', u.id).update({ plan: a.replace('plan_', ''), plan_vence: a === 'plan_ninguno' ? null : addDays(new Date(), 30) });
  await auditoria.registrar({ actorId: req.user.id, accion: `usuario_${a}`, entidad: 'usuario', entidadId: u.id, detalle: req.datos.motivo, ip: req.ip });
  res.redirect(`/admin/usuarios?q=${encodeURIComponent(u.email)}`);
});

router.get('/listas-negras', async (req, res) => res.render('admin/listas', { titulo: 'Listas negras', items: await db('listas_negras').orderBy('created_at', 'desc').limit(500) }));
router.post('/listas-negras', validar(z.object({ tipo: z.enum(['telefono', 'email', 'dominio_email', 'ip']), valor: z.string().trim().min(3).max(120), motivo: z.string().trim().max(200).default('') })), async (req, res) => {
  await db('listas_negras').insert(req.datos).onConflict(['tipo', 'valor']).ignore();
  res.redirect('/admin/listas-negras');
});
router.post('/listas-negras/:id/borrar', async (req, res) => { await db('listas_negras').where('id', Number(req.params.id)).del(); res.redirect('/admin/listas-negras'); });

router.get('/pagos', async (req, res) => {
  const pagos = await db('pagos').join('usuarios', 'usuarios.id', 'pagos.usuario_id').select('pagos.*', 'usuarios.email').orderBy('pagos.created_at', 'desc').limit(200);
  res.render('admin/pagos', { titulo: 'Pagos', pagos });
});

module.exports = router;
