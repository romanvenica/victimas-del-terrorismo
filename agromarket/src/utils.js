const crypto = require('crypto');
const config = require('./config');

const uuid = () => crypto.randomUUID();

const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'aviso';

// Las IPs no se guardan en claro: se hashean con la clave de sesión como sal.
const hashIp = (ip) => crypto.createHmac('sha256', config.sessionSecret).update(String(ip || '')).digest('hex').slice(0, 32);

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const otpCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const maskPhone = (e164) => {
  // +5491123456789 -> 11 23** ****
  const nat = String(e164).replace(/^\+549?/, '');
  return nat.slice(0, 2) + ' ' + nat.slice(2, 4) + '** ****';
};

const fmtPrecio = (precio, moneda) => {
  if (precio === null || precio === undefined) return 'Consultar';
  const n = Number(precio);
  const s = n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  return moneda === 'USD' ? `US$ ${s}` : `$ ${s}`;
};

const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);

const parseJson = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

module.exports = { uuid, slugify, hashIp, sha256, randomToken, otpCode, maskPhone, fmtPrecio, addDays, parseJson };
