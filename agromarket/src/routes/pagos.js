const express = require('express');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const validar = require('../middleware/validate');
const { requerirLogin } = require('../middleware/auth');
const { uuid } = require('../utils');
const mp = require('../services/mercadopago');

const router = express.Router();

const CONCEPTOS = () => ({
  destacado_7: { titulo: 'Aviso destacado 7 días', monto: config.precios.destacado[7], dias: 7 },
  destacado_15: { titulo: 'Aviso destacado 15 días', monto: config.precios.destacado[15], dias: 15 },
  destacado_30: { titulo: 'Aviso destacado 30 días', monto: config.precios.destacado[30], dias: 30 },
  bump: { titulo: 'Subir aviso al inicio', monto: config.precios.bump, dias: 0 },
});

router.get('/destacar/:avisoId', requerirLogin, async (req, res) => {
  const aviso = await db('avisos').where({ id: req.params.avisoId, usuario_id: req.user.id }).first();
  if (!aviso) return res.status(404).render('error', { titulo: 'Aviso no encontrado', mensaje: '' });
  res.render('cuenta/destacar', { titulo: 'Destacar aviso', aviso, conceptos: CONCEPTOS(), mpConfigurado: !!config.mp.accessToken });
});

router.post('/destacar/:avisoId', requerirLogin, validar(z.object({ concepto: z.enum(['destacado_7', 'destacado_15', 'destacado_30', 'bump']) })), async (req, res) => {
  const aviso = await db('avisos').where({ id: req.params.avisoId, usuario_id: req.user.id }).first();
  if (!aviso) return res.status(404).render('error', { titulo: 'Aviso no encontrado', mensaje: '' });
  const c = CONCEPTOS()[req.datos.concepto];
  const pagoId = uuid();
  await db('pagos').insert({ id: pagoId, usuario_id: req.user.id, aviso_id: aviso.id, concepto: req.datos.concepto, monto: c.monto, moneda: 'ARS' });
  try {
    const pref = await mp.crearPreferencia({ titulo: `${c.titulo}: ${aviso.titulo}`, monto: c.monto, pagoId, email: req.user.email });
    await db('pagos').where('id', pagoId).update({ id_externo: `pref:${pref.id}` });
    res.redirect(pref.init_point);
  } catch (e) {
    await db('pagos').where('id', pagoId).update({ estado: 'rechazado' });
    req.flash('error', config.mp.accessToken ? 'No pudimos iniciar el pago. Probá de nuevo.' : 'Los pagos todavía no están habilitados (falta MP_ACCESS_TOKEN).');
    res.redirect(`/pagos/destacar/${aviso.id}`);
  }
});

router.get('/retorno', requerirLogin, (req, res) => {
  const e = req.query.estado;
  req.flash(e === 'ok' ? 'exito' : 'info', e === 'ok' ? 'Pago recibido. El destacado se activa apenas Mercado Pago lo confirma (segundos).' : e === 'pendiente' ? 'El pago quedó pendiente. Te avisamos cuando se acredite.' : 'El pago no se completó.');
  res.redirect('/pagos');
});

module.exports = router;
