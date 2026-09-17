/**
 * Envío del código OTP. Proveedores:
 *  - console: imprime el código en la consola (desarrollo).
 *  - meta: WhatsApp Cloud API con plantilla de autenticación.
 *  - twilio: SMS.
 * Para cambiar de proveedor solo se modifica OTP_PROVIDER en .env.
 */
const config = require('../config');

async function sendConsole(numero, codigo) {
  console.log(`[OTP] ${numero} -> código ${codigo}`);
  return { ok: true, canal: 'console' };
}

async function sendMeta(numero, codigo) {
  const { token, phoneId, template } = config.otp.meta;
  if (!token || !phoneId) throw new Error('Faltan META_WA_TOKEN / META_WA_PHONE_ID');
  const body = {
    messaging_product: 'whatsapp',
    to: numero.replace('+', ''),
    type: 'template',
    template: {
      name: template,
      language: { code: 'es_AR' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: codigo }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
      ],
    },
  };
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`WhatsApp API ${r.status}: ${await r.text()}`);
  return { ok: true, canal: 'whatsapp' };
}

async function sendTwilio(numero, codigo) {
  const { sid, token, from } = config.otp.twilio;
  if (!sid || !token || !from) throw new Error('Faltan credenciales de Twilio');
  const params = new URLSearchParams({ To: numero, From: from, Body: `${config.siteName}: tu código de verificación es ${codigo}. Vence en ${config.otp.minutos} minutos.` });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
  return { ok: true, canal: 'sms' };
}

async function enviarOtp(numero, codigo, canal) {
  const p = canal === 'sms' && config.otp.twilio.sid ? 'twilio' : config.otp.provider;
  if (p === 'meta') return sendMeta(numero, codigo);
  if (p === 'twilio') return sendTwilio(numero, codigo);
  return sendConsole(numero, codigo);
}

module.exports = { enviarOtp };
