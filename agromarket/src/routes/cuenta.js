const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const limites = require('../middleware/ratelimit');
const validar = require('../middleware/validate');
const upload = require('../middleware/upload');
const csrf = require('../middleware/csrf');
const { requerirLogin } = require('../middleware/auth');
const { uuid, slugify, addDays, parseJson } = require('../utils');
const otp = require('../services/otp');
const images = require('../services/images');
const riesgo = require('../services/riesgo');
const avisosSrv = require('../services/avisos');
const auditoria = require('../services/auditoria');
const email = require('../services/email');

const router = express.Router();
router.use(['/mi-cuenta', '/mi-empresa', '/mis-avisos', '/publicar', '/aviso/:id/editar', '/aviso/:id/estado', '/favoritos', '/alertas', '/pagos'], requerirLogin);

// ---------- Mi cuenta ----------
router.get('/mi-cuenta', async (req, res) => {
  const [telefonos, provincias, empresa] = await Promise.all([
    otp.telefonosVigentes(req.user.id), db('provincias').orderBy('nombre'), db('empresas').where('usuario_id', req.user.id).first(),
  ]);
  const stats = {
    activos: Number((await db('avisos').where({ usuario_id: req.user.id, estado: 'activo' }).count({ c: '*' }).first()).c),
    contactos: Number((await db('avisos').where({ usuario_id: req.user.id }).sum({ s: 'contactos' }).first()).s || 0),
  };
  res.render('cuenta/index', { titulo: 'Mi cuenta', telefonos, provincias, empresa, stats, requiereOtp: otp.requiereOtp() });
});

// Modo 'ninguna': cargar o cambiar el WhatsApp sin código. (En modo 'otp' se usa /verificar-telefono.)
router.post('/mi-cuenta/telefono', validar(z.object({ numero: z.string().trim().min(6).max(25) })), async (req, res) => {
  if (otp.requiereOtp()) return res.redirect('/verificar-telefono');
  const numero = otp.normalizar(req.datos.numero);
  if (!numero) { req.flash('error', 'Ingresá un celular argentino válido, con código de área y sin 0 ni 15 (ej: 11 2345 6789).'); return res.redirect('/mi-cuenta'); }
  try {
    const tel = await otp.guardarSinVerificar({ usuarioId: req.user.id, numero });
    await db('telefonos').where('usuario_id', req.user.id).whereNot('id', tel.id).update({ principal: false });
    await db('telefonos').where('id', tel.id).update({ principal: true });
    // Los avisos activos pasan a usar el número nuevo (es "mi WhatsApp", no una lista de números).
    await db('avisos').where('usuario_id', req.user.id).whereNot('telefono_id', tel.id).update({ telefono_id: tel.id, updated_at: new Date() });
    await db('telefonos').where('usuario_id', req.user.id).whereNot('id', tel.id).update({ activo: false });
    await auditoria.registrar({ actorId: req.user.id, accion: 'telefono_cargado', entidad: 'telefono', entidadId: tel.id, ip: req.ip });
    req.flash('exito', `Listo: tus avisos muestran el ${numero}.`);
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/mi-cuenta');
});

router.post('/mi-cuenta', validar(z.object({ nombre: z.string().trim().min(2).max(80), provincia_id: z.coerce.number().int().optional(), localidad: z.string().trim().max(80).default('') })), async (req, res) => {
  await db('usuarios').where('id', req.user.id).update({ nombre: req.datos.nombre, provincia_id: req.datos.provincia_id || null, localidad: req.datos.localidad, updated_at: new Date() });
  req.flash('exito', 'Datos guardados.');
  res.redirect('/mi-cuenta');
});

router.post('/mi-cuenta/contrasena', limites.login, validar(z.object({ actual: z.string().min(1), nueva: z.string().min(10, 'Mínimo 10 caracteres') })), async (req, res) => {
  if (!(await bcrypt.compare(req.datos.actual, req.user.hash_contrasena))) { req.flash('error', 'La contraseña actual no es correcta.'); return res.redirect('/mi-cuenta'); }
  await db('usuarios').where('id', req.user.id).update({ hash_contrasena: await bcrypt.hash(req.datos.nueva, 12) });
  await email.enviar({ to: req.user.email, subject: `Cambiaste tu contraseña en ${config.siteName}`, text: 'Si no fuiste vos, recuperá la cuenta desde el enlace de "Olvidé mi contraseña".' });
  const id = req.user.id;
  req.session.regenerate(() => { req.session.usuarioId = id; req.flash('exito', 'Contraseña actualizada.'); res.redirect('/mi-cuenta'); });
});

router.post('/mi-cuenta/eliminar', validar(z.object({ contrasena: z.string().min(1) })), async (req, res) => {
  if (!(await bcrypt.compare(req.datos.contrasena, req.user.hash_contrasena))) { req.flash('error', 'Contraseña incorrecta.'); return res.redirect('/mi-cuenta'); }
  // Anonimiza datos personales; conserva pagos/facturas por obligación contable.
  await db('avisos').where('usuario_id', req.user.id).update({ estado: 'vendido' });
  await db('telefonos').where('usuario_id', req.user.id).update({ activo: false, verificado: false, numero_e164: 'eliminado' });
  await db('usuarios').where('id', req.user.id).update({ email: `eliminado-${req.user.id}@invalido`, nombre: 'Usuario eliminado', estado: 'eliminado', hash_contrasena: 'x', slug: null });
  await auditoria.registrar({ actorId: req.user.id, accion: 'eliminar_cuenta', entidad: 'usuario', entidadId: req.user.id, ip: req.ip });
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Empresa (vendedor profesional) ----------
router.post('/mi-empresa', validar(z.object({ razon_social: z.string().trim().min(3).max(120), cuit: z.string().trim().regex(/^\d{11}$/, 'CUIT de 11 dígitos sin guiones'), nombre_fantasia: z.string().trim().max(80).default(''), descripcion: z.string().trim().max(1000).default(''), direccion: z.string().trim().max(160).default('') })), async (req, res) => {
  const existe = await db('empresas').where('usuario_id', req.user.id).first();
  const datos = { ...req.datos, updated_at: new Date() };
  if (existe) await db('empresas').where('id', existe.id).update({ ...datos, cuit_validado: existe.cuit === req.datos.cuit ? existe.cuit_validado : false });
  else await db('empresas').insert({ id: uuid(), usuario_id: req.user.id, ...datos });
  await db('usuarios').where('id', req.user.id).update({ tipo: 'profesional' });
  req.flash('exito', 'Datos de la empresa guardados. La validación del CUIT la hace el equipo de moderación.');
  res.redirect('/mi-cuenta');
});

// ---------- Mis avisos ----------
router.get('/mis-avisos', async (req, res) => {
  const avisos = await avisosSrv.conFotos(await avisosSrv.baseQuery().where('avisos.usuario_id', req.user.id).orderBy('avisos.created_at', 'desc'));
  res.render('cuenta/mis-avisos', { titulo: 'Mis avisos', avisos });
});

// ---------- Publicar / editar ----------
// Un campo numérico vacío del formulario llega como '' y z.coerce lo convertiría en 0 (año 0 = error, precio 0 = "$ 0").
// Con esto, vacío = sin dato.
const numOpcional = (schema) => z.preprocess((v) => (v === '' || v === undefined || v === null ? undefined : v), schema.optional());
const esqAviso = z.object({
  categoria_id: z.coerce.number().int().positive('Elegí una categoría'),
  marca_id: numOpcional(z.coerce.number().int().min(0)),
  modelo: z.string().trim().max(60).default(''),
  titulo: z.string().trim().min(8, 'El título debe tener al menos 8 caracteres').max(90),
  descripcion: z.string().trim().min(30, 'Contá un poco más sobre la máquina (mínimo 30 caracteres)').max(4000),
  anio: numOpcional(z.coerce.number().int().min(1950, 'Año inválido').max(new Date().getFullYear() + 1, 'Año inválido')),
  horas_uso: numOpcional(z.coerce.number().int().min(0).max(200000)),
  estado_maquina: z.enum(['nuevo', 'usado']).default('usado'),
  precio: numOpcional(z.coerce.number().min(0).max(1e10)),
  moneda: z.enum(['ARS', 'USD']).default('USD'),
  precio_mas_iva: z.string().optional(),
  acepta_permuta: z.string().optional(),
  acepta_financiacion: z.string().optional(),
  provincia_id: z.coerce.number().int().positive('Elegí una provincia'),
  localidad: z.string().trim().max(80).default(''),
  telefono_id: z.string().max(36).optional(),       // modo 'otp': teléfono ya verificado
  whatsapp: z.string().trim().max(25).optional(),   // modo 'ninguna': el número escrito en el formulario
  acepta_whatsapp: z.string().optional(),
  acepta_llamada: z.string().optional(),
  ficha: z.record(z.string(), z.string().max(80)).optional(),
});

/**
 * Determina el teléfono de contacto del aviso.
 *  - Modo 'otp': tiene que ser un teléfono verificado y activo de la cuenta.
 *  - Modo 'ninguna': se acepta el número escrito (normalizado a celular argentino) o uno ya cargado en la cuenta.
 * Devuelve la fila de `telefonos` o lanza un Error con mensaje para el usuario.
 */
async function resolverTelefono(req) {
  const d = req.datos;
  if (otp.requiereOtp()) {
    const tel = d.telefono_id ? await db('telefonos').where({ id: d.telefono_id, usuario_id: req.user.id, verificado: true, activo: true }).first() : null;
    if (!tel) throw new Error('Elegí un teléfono verificado.');
    return tel;
  }
  if (d.whatsapp) {
    const numero = otp.normalizar(d.whatsapp);
    if (!numero) throw new Error('Ingresá un celular argentino válido, con código de área y sin 0 ni 15 (ej: 11 2345 6789 o 3564 123456).');
    return otp.guardarSinVerificar({ usuarioId: req.user.id, numero });
  }
  const tel = d.telefono_id ? await db('telefonos').where({ id: d.telefono_id, usuario_id: req.user.id, activo: true }).first() : null;
  if (!tel) throw new Error('Ingresá el WhatsApp con el que te van a contactar.');
  return tel;
}
const marcado = (v) => v === 'on' || v === '1' || v === 'true';

/** Normaliza los campos ficha[x] (multer ya los anida; otros parsers los dejan planos) en req.body.ficha. */
function agruparFicha(req, res, next) {
  const ficha = req.body && req.body.ficha && typeof req.body.ficha === 'object' ? { ...req.body.ficha } : {};
  for (const [k, v] of Object.entries(req.body || {})) { const m = k.match(/^ficha\[(.+)\]$/); if (m) { ficha[m[1]] = String(v).slice(0, 80); delete req.body[k]; } }
  req.body.ficha = ficha;
  next();
}

async function datosFormulario(req) {
  const [telefonos, marcas, provincias] = await Promise.all([otp.telefonosVigentes(req.user.id), db('marcas').orderBy('nombre'), db('provincias').orderBy('nombre')]);
  return { telefonos, marcas, provincias, requiereOtp: otp.requiereOtp() };
}

router.get('/publicar', async (req, res) => {
  const d = await datosFormulario(req);
  if (d.requiereOtp && !d.telefonos.length) { req.session.volverA = '/publicar'; req.flash('info', 'Para publicar necesitás un teléfono verificado. Es un paso de 1 minuto.'); return res.redirect('/verificar-telefono'); }
  res.render('cuenta/publicar', { titulo: 'Publicar máquina', aviso: null, valores: {}, ...d });
});

router.post('/publicar', limites.publicar, upload.array('fotos', config.uploads.maxFotos), csrf.verificar, agruparFicha, validar(esqAviso), async (req, res) => {
  const d = req.datos;
  let tel;
  try { tel = await resolverTelefono(req); } catch (e) { req.flash('error', e.message); return res.redirect('/publicar'); }
  const files = req.files || [];
  if (files.length < 1) { req.flash('error', 'Subí al menos una foto de la máquina.'); return res.redirect('/publicar'); }

  // Cupo de avisos para cuentas nuevas (particulares)
  const empresa = await db('empresas').where('usuario_id', req.user.id).first();
  const sinPlan = !empresa || empresa.plan === 'ninguno';
  if (sinPlan) {
    const activos = Number((await db('avisos').where('usuario_id', req.user.id).whereIn('estado', ['activo', 'en_revision', 'pausado']).count({ c: '*' }).first()).c);
    const diasCuenta = (Date.now() - new Date(req.user.created_at)) / 86400000;
    const cupo = diasCuenta < 30 ? config.reglas.avisosGratisCuentaNueva : config.reglas.avisosGratisCuentaNueva * 3;
    if (activos >= cupo) { req.flash('error', `Alcanzaste el cupo de ${cupo} avisos activos. Marcá como vendido alguno anterior o pasate a un plan para empresas.`); return res.redirect('/mis-avisos'); }
  }

  const id = uuid();
  const fotos = [];
  try { for (const f of files) fotos.push(await images.procesar(f.buffer, id)); }
  catch (e) { await images.borrarAviso(id); req.flash('error', e.message); return res.redirect('/publicar'); }

  const aviso = {
    id, usuario_id: req.user.id, empresa_id: empresa ? empresa.id : null, categoria_id: d.categoria_id, marca_id: d.marca_id || null, modelo: d.modelo,
    titulo: d.titulo, slug: slugify(d.titulo), descripcion: d.descripcion, anio: d.anio || null, horas_uso: d.horas_uso ?? null, estado_maquina: d.estado_maquina,
    precio: d.precio ?? null, moneda: d.moneda, precio_mas_iva: marcado(d.precio_mas_iva), acepta_permuta: marcado(d.acepta_permuta), acepta_financiacion: marcado(d.acepta_financiacion),
    provincia_id: d.provincia_id, localidad: d.localidad, telefono_id: tel.id, acepta_whatsapp: marcado(d.acepta_whatsapp), acepta_llamada: marcado(d.acepta_llamada),
    ficha_tecnica: JSON.stringify(d.ficha || {}),
  };
  if (!aviso.acepta_whatsapp && !aviso.acepta_llamada) aviso.acepta_whatsapp = true; // siempre queda al menos un canal de contacto
  const { puntaje, senales } = await riesgo.evaluar({ usuario: req.user, aviso, fotos });
  const requiereRevision = (config.moderacion.primerAviso && req.user.avisos_publicados === 0) || puntaje >= config.reglas.riesgoUmbral;
  const ahora = new Date();
  Object.assign(aviso, {
    puntaje_riesgo: puntaje, senales_riesgo: JSON.stringify(senales),
    estado: requiereRevision ? 'en_revision' : 'activo',
    fecha_publicacion: requiereRevision ? null : ahora, fecha_vencimiento: requiereRevision ? null : addDays(ahora, config.reglas.avisoDias), bump_at: ahora,
  });
  await db.transaction(async (trx) => {
    await trx('avisos').insert(aviso);
    await trx('aviso_fotos').insert(fotos.map((f, i) => ({ ...f, aviso_id: id, orden: i })));
    await trx('usuarios').where('id', req.user.id).increment('avisos_publicados', 1);
  });
  await auditoria.registrar({ actorId: req.user.id, accion: 'publicar', entidad: 'aviso', entidadId: id, detalle: { puntaje, senales }, ip: req.ip });
  req.flash('exito', requiereRevision ? 'Aviso enviado. Lo revisamos y lo publicamos en menos de 24 horas.' : 'Aviso publicado.');
  res.redirect(`/aviso/${id}/${aviso.slug}`);
});

async function avisoPropio(req, res) {
  const a = await avisosSrv.porId(req.params.id);
  if (!a || a.usuario_id !== req.user.id) { res.status(404).render('error', { titulo: 'Aviso no encontrado', mensaje: '' }); return null; }
  return a;
}

router.get('/aviso/:id/editar', async (req, res) => {
  const aviso = await avisoPropio(req, res); if (!aviso) return;
  const d = await datosFormulario(req);
  res.render('cuenta/publicar', { titulo: 'Editar aviso', aviso, valores: aviso, ...d });
});

router.post('/aviso/:id/editar', limites.publicar, upload.array('fotos', config.uploads.maxFotos), csrf.verificar, agruparFicha, validar(esqAviso), async (req, res) => {
  const aviso = await avisoPropio(req, res); if (!aviso) return;
  const d = req.datos;
  let tel;
  try { tel = await resolverTelefono(req); } catch (e) { req.flash('error', e.message); return res.redirect(`/aviso/${aviso.id}/editar`); }
  const nuevas = [];
  for (const f of req.files || []) { try { nuevas.push(await images.procesar(f.buffer, aviso.id)); } catch (e) { req.flash('error', e.message); } }
  const borrar = [].concat(req.body.borrar_foto || []).map(String);
  const fotosABorrar = borrar.length ? await db('aviso_fotos').whereIn('id', borrar).where('aviso_id', aviso.id) : [];
  const aceptaWhatsapp = marcado(d.acepta_whatsapp) || !marcado(d.acepta_llamada); // siempre queda al menos un canal
  await db.transaction(async (trx) => {
    if (fotosABorrar.length) await trx('aviso_fotos').whereIn('id', fotosABorrar.map((f) => f.id)).del();
    if (nuevas.length) await trx('aviso_fotos').insert(nuevas.map((f, i) => ({ ...f, aviso_id: aviso.id, orden: 100 + i })));
    await trx('avisos').where('id', aviso.id).update({
      categoria_id: d.categoria_id, marca_id: d.marca_id || null, modelo: d.modelo, titulo: d.titulo, slug: slugify(d.titulo), descripcion: d.descripcion,
      anio: d.anio || null, horas_uso: d.horas_uso ?? null, estado_maquina: d.estado_maquina, precio: d.precio ?? null, moneda: d.moneda,
      precio_mas_iva: marcado(d.precio_mas_iva), acepta_permuta: marcado(d.acepta_permuta), acepta_financiacion: marcado(d.acepta_financiacion),
      provincia_id: d.provincia_id, localidad: d.localidad, telefono_id: tel.id, acepta_whatsapp: aceptaWhatsapp, acepta_llamada: marcado(d.acepta_llamada),
      ficha_tecnica: JSON.stringify(d.ficha || {}), updated_at: new Date(),
    });
  });
  if (fotosABorrar.length) images.borrarFotos(fotosABorrar).catch((e) => console.error('[fotos]', e.message));
  const restantes = Number((await db('aviso_fotos').where('aviso_id', aviso.id).count({ c: '*' }).first()).c);
  if (restantes === 0) req.flash('error', 'El aviso quedó sin fotos. Agregá al menos una.');
  await auditoria.registrar({ actorId: req.user.id, accion: 'editar', entidad: 'aviso', entidadId: aviso.id, ip: req.ip });
  req.flash('exito', 'Cambios guardados.');
  res.redirect(`/aviso/${aviso.id}/${slugify(d.titulo)}`);
});

router.post('/aviso/:id/estado', validar(z.object({ accion: z.enum(['pausar', 'activar', 'vendido', 'renovar', 'eliminar']) })), async (req, res) => {
  const aviso = await avisoPropio(req, res); if (!aviso) return;
  const ahora = new Date(); const acc = req.datos.accion;
  const cambios = { updated_at: ahora };
  if (acc === 'pausar' && aviso.estado === 'activo') cambios.estado = 'pausado';
  if (acc === 'activar' && ['pausado', 'vencido'].includes(aviso.estado)) Object.assign(cambios, { estado: 'activo', fecha_vencimiento: addDays(ahora, config.reglas.avisoDias) });
  if (acc === 'renovar' && ['activo', 'vencido'].includes(aviso.estado)) Object.assign(cambios, { estado: 'activo', fecha_vencimiento: addDays(ahora, config.reglas.avisoDias), bump_at: ahora });
  if (acc === 'vendido') cambios.estado = 'vendido';
  if (acc === 'eliminar') { await db('avisos').where('id', aviso.id).del(); await images.borrarAviso(aviso.id); req.flash('info', 'Aviso eliminado.'); return res.redirect('/mis-avisos'); }
  await db('avisos').where('id', aviso.id).update(cambios);
  await auditoria.registrar({ actorId: req.user.id, accion: `aviso_${acc}`, entidad: 'aviso', entidadId: aviso.id, ip: req.ip });
  req.flash('exito', 'Listo.');
  res.redirect('/mis-avisos');
});

// ---------- Favoritos y alertas ----------
router.get('/favoritos', async (req, res) => {
  const ids = (await db('favoritos').where('usuario_id', req.user.id).orderBy('created_at', 'desc')).map((f) => f.aviso_id);
  const avisos = ids.length ? await avisosSrv.conFotos(await avisosSrv.baseQuery().whereIn('avisos.id', ids)) : [];
  res.render('cuenta/favoritos', { titulo: 'Favoritos', avisos });
});

router.get('/alertas', async (req, res) => {
  const alertas = (await db('alertas').where('usuario_id', req.user.id).orderBy('created_at', 'desc')).map((a) => ({ ...a, filtros: parseJson(a.filtros, {}) }));
  res.render('cuenta/alertas', { titulo: 'Alertas de búsqueda', alertas });
});
router.post('/alertas', validar(z.object({ nombre: z.string().trim().min(2).max(80), filtros: z.string().max(2000) })), async (req, res) => {
  const n = Number((await db('alertas').where('usuario_id', req.user.id).count({ c: '*' }).first()).c);
  if (n >= 10) { req.flash('error', 'Podés tener hasta 10 alertas.'); return res.redirect('/alertas'); }
  await db('alertas').insert({ id: uuid(), usuario_id: req.user.id, nombre: req.datos.nombre, filtros: JSON.stringify(parseJson(req.datos.filtros, {})) });
  req.flash('exito', 'Alerta creada. Te avisamos por email cuando aparezca algo nuevo.');
  res.redirect('/alertas');
});
router.post('/alertas/:id/borrar', async (req, res) => { await db('alertas').where({ id: req.params.id, usuario_id: req.user.id }).del(); res.redirect('/alertas'); });

// ---------- Pagos ----------
router.get('/pagos', async (req, res) => {
  const pagos = await db('pagos').leftJoin('avisos', 'avisos.id', 'pagos.aviso_id').leftJoin('facturas', 'facturas.id', 'pagos.factura_id')
    .where('pagos.usuario_id', req.user.id).orderBy('pagos.created_at', 'desc').select('pagos.*', 'avisos.titulo as aviso_titulo', 'facturas.numero as factura_numero', 'facturas.pdf_url as factura_pdf');
  res.render('cuenta/pagos', { titulo: 'Mis pagos', pagos });
});

module.exports = router;
