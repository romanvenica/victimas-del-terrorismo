const express = require('express');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const limites = require('../middleware/ratelimit');
const validar = require('../middleware/validate');
const { uuid, hashIp } = require('../utils');
const turnstile = require('../services/turnstile');
const otp = require('../services/otp');

const router = express.Router();

/**
 * Revelar teléfono. El número nunca viaja en el HTML: se pide acá con
 * CAPTCHA (Turnstile), límite diario por IP y registro del contacto.
 */
router.post('/aviso/:id/telefono', limites.revelar, async (req, res) => {
  if (!(await turnstile.verificar(req.body['cf-turnstile-response'], req.ip))) return res.status(400).json({ error: 'No pudimos verificar que sos una persona. Recargá la página.' });
  const aviso = await db('avisos').where({ id: req.params.id, estado: 'activo' }).first();
  if (!aviso) return res.status(404).json({ error: 'Aviso no disponible.' });
  const tel = await db('telefonos').where({ id: aviso.telefono_id, activo: true }).modify((q) => { if (otp.requiereOtp()) q.where('verificado', true); }).first();
  if (!tel) return res.status(410).json({ error: 'El vendedor está actualizando su teléfono. Probá más tarde.' });

  const ipHash = hashIp(req.ip);
  const hoy = new Date(Date.now() - 86400000);
  const hechos = Number((await db('contactos').where('ip_hash', ipHash).where('created_at', '>', hoy).count({ c: '*' }).first()).c);
  if (hechos >= config.reglas.revealPorDia) return res.status(429).json({ error: 'Alcanzaste el máximo de teléfonos por día.' });

  const yaVisto = await db('contactos').where({ aviso_id: aviso.id, ip_hash: ipHash }).where('created_at', '>', hoy).first();
  if (!yaVisto) {
    await db('contactos').insert({ id: uuid(), aviso_id: aviso.id, usuario_id: req.user ? req.user.id : null, ip_hash: ipHash, tipo: req.body.tipo === 'whatsapp' ? 'whatsapp' : 'ver_telefono' });
    await db('avisos').where('id', aviso.id).increment('contactos', 1);
  }
  const nacional = tel.numero_e164.replace(/^\+549/, '');
  const msg = encodeURIComponent(`Hola, vi tu ${aviso.titulo} en ${config.siteName}. ¿Sigue disponible?`);
  res.json({
    telefono: tel.numero_e164, mostrar: `${nacional.slice(0, nacional.length - 8)} ${nacional.slice(-8, -4)}-${nacional.slice(-4)}`,
    verificado: !!tel.verificado,
    whatsapp: aviso.acepta_whatsapp ? `https://wa.me/${tel.numero_e164.replace('+', '')}?text=${msg}` : null,
    llamada: aviso.acepta_llamada ? `tel:${tel.numero_e164}` : null,
    aviso_seguridad: 'Nunca envíes dinero ni señas antes de ver la máquina en persona.',
  });
});

router.post('/aviso/:id/reportar', limites.reportar, validar(z.object({
  motivo: z.enum(['telefono_no_responde', 'no_es_el_vendedor', 'pide_sena', 'fotos_falsas', 'ya_vendido', 'precio_enganoso', 'otro']),
  comentario: z.string().trim().max(500).default(''),
  'cf-turnstile-response': z.string().optional(),
})), async (req, res) => {
  if (!(await turnstile.verificar(req.datos['cf-turnstile-response'], req.ip))) return res.status(400).json({ error: 'No pudimos verificar que sos una persona.' });
  const aviso = await db('avisos').where('id', req.params.id).first();
  if (!aviso) return res.status(404).json({ error: 'Aviso no encontrado.' });
  const ipHash = hashIp(req.ip);
  const repetido = await db('reportes').where({ aviso_id: aviso.id, ip_hash: ipHash }).first();
  if (repetido) return res.json({ ok: true, mensaje: 'Ya recibimos tu reporte de este aviso.' });
  await db('reportes').insert({ id: uuid(), aviso_id: aviso.id, usuario_id: req.user ? req.user.id : null, motivo: req.datos.motivo, comentario: req.datos.comentario, ip_hash: ipHash });
  // Pausa automática ante 3 reportes distintos de teléfono/estafa en 7 días
  const graves = Number((await db('reportes').where('aviso_id', aviso.id).whereIn('motivo', ['telefono_no_responde', 'no_es_el_vendedor', 'pide_sena', 'fotos_falsas']).where('created_at', '>', new Date(Date.now() - 7 * 86400000)).count({ c: '*' }).first()).c);
  if (graves >= 3 && aviso.estado === 'activo') await db('avisos').where('id', aviso.id).update({ estado: 'en_revision', motivo_rechazo: 'Pausado automáticamente por reportes' });
  res.json({ ok: true, mensaje: 'Gracias. El equipo de moderación lo revisa a la brevedad.' });
});

router.post('/aviso/:id/favorito', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Ingresá para guardar favoritos.', login: '/ingresar' });
  const existe = await db('favoritos').where({ usuario_id: req.user.id, aviso_id: req.params.id }).first();
  if (existe) { await db('favoritos').where({ usuario_id: req.user.id, aviso_id: req.params.id }).del(); return res.json({ favorito: false }); }
  if (!(await db('avisos').where('id', req.params.id).first())) return res.status(404).json({ error: 'Aviso no encontrado.' });
  await db('favoritos').insert({ usuario_id: req.user.id, aviso_id: req.params.id });
  res.json({ favorito: true });
});

router.get('/marcas', async (req, res) => res.json(await db('marcas').orderBy('nombre').select('id', 'nombre', 'slug')));

module.exports = router;
