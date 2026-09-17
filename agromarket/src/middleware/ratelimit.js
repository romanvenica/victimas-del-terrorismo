/**
 * Límites de tasa. Con REDIS_URL definido se comparten entre procesos; si no, en memoria.
 */
const { rateLimit } = require('express-rate-limit');
const config = require('../config');

let store;
if (config.redisUrl) {
  const Redis = require('ioredis');
  const { RedisStore } = require('rate-limit-redis');
  const client = new Redis(config.redisUrl);
  store = () => new RedisStore({ sendCommand: (...args) => client.call(...args) });
}

const mk = (opts) => rateLimit({
  standardHeaders: 'draft-7', legacyHeaders: false,
  store: store ? store() : undefined,
  handler: (req, res) => {
    res.status(429);
    if (req.accepts('html', 'json') === 'json') return res.json({ error: 'Demasiados intentos. Esperá unos minutos.' });
    res.render('error', { titulo: 'Demasiados intentos', mensaje: 'Esperá unos minutos y volvé a intentar.' });
  },
  ...opts,
});

module.exports = {
  general: mk({ windowMs: 60000, limit: 300 }),
  login: mk({ windowMs: 15 * 60000, limit: 10 }),
  registro: mk({ windowMs: 60 * 60000, limit: 5 }),
  recuperar: mk({ windowMs: 60 * 60000, limit: 3 }),
  otp: mk({ windowMs: 60 * 60000, limit: 8 }),
  revelar: mk({ windowMs: 24 * 60 * 60000, limit: config.reglas.revealPorDia }),
  publicar: mk({ windowMs: 60 * 60000, limit: 10 }),
  reportar: mk({ windowMs: 60 * 60000, limit: 10 }),
};
