const config = require('../config');
/** Verifica el token de Cloudflare Turnstile. Si no está configurado, deja pasar. */
async function verificar(token, ip) {
  if (!config.turnstile.secret) return true;
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.turnstile.secret, response: token, remoteip: ip }),
  });
  const j = await r.json().catch(() => ({}));
  return !!j.success;
}
module.exports = { verificar };
