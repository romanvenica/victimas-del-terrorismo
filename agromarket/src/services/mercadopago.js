/**
 * Integración con Mercado Pago Checkout Pro.
 *  - crearPreferencia: genera el link de pago.
 *  - verificarFirma: valida el webhook con MP_WEBHOOK_SECRET (cabecera x-signature).
 *  - obtenerPago: consulta el estado real del pago (nunca confiar solo en la redirección del navegador).
 */
const crypto = require('crypto');
const config = require('../config');

async function crearPreferencia({ titulo, monto, pagoId, email }) {
  if (!config.mp.accessToken) throw new Error('MP_ACCESS_TOKEN no configurado');
  const body = {
    items: [{ title: titulo, quantity: 1, unit_price: Number(monto), currency_id: 'ARS' }],
    payer: { email },
    external_reference: pagoId,
    back_urls: { success: `${config.baseUrl}/pagos/retorno?estado=ok`, failure: `${config.baseUrl}/pagos/retorno?estado=error`, pending: `${config.baseUrl}/pagos/retorno?estado=pendiente` },
    auto_return: 'approved',
    notification_url: `${config.baseUrl}/pagos/webhook`,
    statement_descriptor: config.siteName.toUpperCase().slice(0, 22),
  };
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST', headers: { Authorization: `Bearer ${config.mp.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { id: j.id, init_point: j.init_point, sandbox_init_point: j.sandbox_init_point };
}

function verificarFirma(req) {
  if (!config.mp.webhookSecret) return true; // en dev sin secreto se acepta (documentado)
  const sig = req.get('x-signature') || '';
  const reqId = req.get('x-request-id') || '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=')));
  const dataId = req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || '';
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${reqId};ts:${parts.ts};`;
  const hmac = crypto.createHmac('sha256', config.mp.webhookSecret).update(manifest).digest('hex');
  return !!parts.v1 && crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(parts.v1));
}

async function obtenerPago(id) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${config.mp.accessToken}` } });
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}`);
  return r.json();
}

module.exports = { crearPreferencia, verificarFirma, obtenerPago };
