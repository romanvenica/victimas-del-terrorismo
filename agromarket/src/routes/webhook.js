/**
 * Webhook de Mercado Pago. Se monta antes de la sesión y del CSRF.
 * Flujo: validar firma -> consultar el pago a la API de MP -> aplicar el beneficio una sola vez (idempotente).
 */
const express = require('express');
const db = require('../db');
const config = require('../config');
const mp = require('../services/mercadopago');
const facturacion = require('../services/facturacion');
const { addDays } = require('../utils');

const router = express.Router();

async function aplicarBeneficio(pago) {
  const ahora = new Date();
  if (pago.concepto.startsWith('destacado_')) {
    const dias = Number(pago.concepto.split('_')[1]);
    const aviso = await db('avisos').where('id', pago.aviso_id).first();
    const desde = aviso && aviso.destacado_hasta && new Date(aviso.destacado_hasta) > ahora ? new Date(aviso.destacado_hasta) : ahora;
    await db('avisos').where('id', pago.aviso_id).update({ destacado_hasta: addDays(desde, dias), bump_at: ahora });
  } else if (pago.concepto === 'bump') {
    await db('avisos').where('id', pago.aviso_id).update({ bump_at: ahora });
  }
}

router.post('/', async (req, res) => {
  if (!mp.verificarFirma(req)) return res.status(401).send('firma inválida');
  const tipo = req.query.type || req.query.topic || (req.body && req.body.type);
  const dataId = req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || req.query.id;
  res.status(200).send('ok'); // responder rápido; el procesamiento sigue abajo
  if (tipo !== 'payment' || !dataId) return;
  try {
    const p = await mp.obtenerPago(dataId);
    const pago = await db('pagos').where('id', p.external_reference).first();
    if (!pago) return;
    const estado = p.status === 'approved' ? 'aprobado' : p.status === 'refunded' || p.status === 'charged_back' ? 'reembolsado' : p.status === 'rejected' || p.status === 'cancelled' ? 'rechazado' : 'pendiente';
    if (pago.estado === 'aprobado' && estado === 'aprobado') return; // idempotencia
    await db('pagos').where('id', pago.id).update({ estado, id_externo: String(p.id), updated_at: new Date() });
    if (estado === 'aprobado') {
      await aplicarBeneficio(pago);
      const usuario = await db('usuarios').where('id', pago.usuario_id).first();
      await facturacion.emitir({ pago: { ...pago, estado }, usuario });
    }
  } catch (e) { console.error('[webhook MP]', e.message); }
});

module.exports = router;
