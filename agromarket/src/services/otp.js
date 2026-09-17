const bcrypt = require('bcryptjs');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const db = require('../db');
const config = require('../config');
const { uuid, otpCode, hashIp } = require('../utils');
const { enviarOtp } = require('./messaging');

/** Normaliza un número argentino a E.164 con el 9 de celular. Devuelve null si no es válido. */
function normalizar(input) {
  const p = parsePhoneNumberFromString(String(input || ''), 'AR');
  if (!p || !p.isValid() || p.country !== 'AR') return null;
  // Celulares argentinos en E.164: +54 9 + código de área + número (10 dígitos en total sin el 9).
  let nacional = String(p.nationalNumber);
  if (nacional.length === 11 && nacional.startsWith('9')) nacional = nacional.slice(1);
  if (nacional.length !== 10) return null;
  return '+549' + nacional;
}

async function enListaNegra(numero) {
  return !!(await db('listas_negras').where({ tipo: 'telefono', valor: numero }).first());
}

/** Envía un código. Aplica límites: 3 por número por hora, 5 por IP por hora. */
async function enviarCodigo({ usuarioId, numero, canal, ip }) {
  const hace1h = new Date(Date.now() - 3600000);
  const porNumero = await db('otp_codigos').where('numero_e164', numero).where('created_at', '>', hace1h).count({ c: '*' }).first();
  if (Number(porNumero.c) >= 3) throw new Error('Demasiados envíos a ese número. Probá de nuevo en una hora.');
  const porIp = await db('otp_codigos').where('ip_hash', hashIp(ip)).where('created_at', '>', hace1h).count({ c: '*' }).first();
  if (Number(porIp.c) >= 5) throw new Error('Demasiados envíos desde esta conexión. Probá de nuevo en una hora.');
  if (await enListaNegra(numero)) throw new Error('Ese número no puede usarse en la plataforma.');

  // Un número solo puede estar verificado en una cuenta activa a la vez.
  const enOtra = await db('telefonos').where({ numero_e164: numero, verificado: true, activo: true }).whereNot('usuario_id', usuarioId).first();
  if (enOtra) throw new Error('Ese número ya está verificado en otra cuenta.');

  const codigo = otpCode();
  await db('otp_codigos').insert({
    id: uuid(), usuario_id: usuarioId, numero_e164: numero, codigo_hash: await bcrypt.hash(codigo, 8),
    expira: new Date(Date.now() + config.otp.minutos * 60000), ip_hash: hashIp(ip),
  });
  return enviarOtp(numero, codigo, canal);
}

/** Verifica el código. Máximo 3 intentos por código. */
async function verificarCodigo({ usuarioId, numero, codigo, canal }) {
  const otp = await db('otp_codigos').where({ usuario_id: usuarioId, numero_e164: numero, usado: false }).orderBy('created_at', 'desc').first();
  if (!otp) return { ok: false, error: 'No hay un código pendiente. Pedí uno nuevo.' };
  if (new Date(otp.expira) < new Date()) return { ok: false, error: 'El código venció. Pedí uno nuevo.' };
  if (otp.intentos >= 3) return { ok: false, error: 'Demasiados intentos. Pedí un código nuevo.' };
  const coincide = await bcrypt.compare(String(codigo).trim(), otp.codigo_hash);
  if (!coincide) {
    await db('otp_codigos').where('id', otp.id).increment('intentos', 1);
    return { ok: false, error: 'Código incorrecto.' };
  }
  await db('otp_codigos').where('id', otp.id).update({ usado: true });
  const existente = await db('telefonos').where({ usuario_id: usuarioId, numero_e164: numero }).first();
  const tieneOtros = await db('telefonos').where({ usuario_id: usuarioId, verificado: true, activo: true }).first();
  const datos = { verificado: true, fecha_verificacion: new Date(), canal: canal || 'whatsapp', activo: true, principal: !tieneOtros, updated_at: new Date() };
  let telefonoId;
  if (existente) { await db('telefonos').where('id', existente.id).update(datos); telefonoId = existente.id; }
  else { telefonoId = uuid(); await db('telefonos').insert({ id: telefonoId, usuario_id: usuarioId, numero_e164: numero, ...datos }); }
  return { ok: true, telefonoId };
}

const requiereOtp = () => config.telefono.verificacion === 'otp';

/**
 * Teléfonos que el usuario puede usar en un aviso.
 *  - Modo 'otp': solo verificados y vigentes (reverificación cada 180 días).
 *  - Modo 'ninguna': todos los activos de la cuenta (el usuario los carga sin código).
 */
async function telefonosVigentes(usuarioId) {
  const q = db('telefonos').where({ usuario_id: usuarioId, activo: true }).orderBy('principal', 'desc').orderBy('created_at', 'desc');
  if (requiereOtp()) q.where('verificado', true).where('fecha_verificacion', '>', new Date(Date.now() - 180 * 86400000));
  return q;
}

/**
 * Modo 'ninguna': guarda (o reactiva) un número de WhatsApp sin código de verificación.
 * Sigue aplicando la lista negra y "un número activo por cuenta". Devuelve la fila de `telefonos`.
 */
async function guardarSinVerificar({ usuarioId, numero }) {
  if (requiereOtp()) throw new Error('Este sitio requiere verificar el teléfono con un código.');
  if (await enListaNegra(numero)) throw new Error('Ese número no puede usarse en la plataforma.');
  const enOtra = await db('telefonos').where({ numero_e164: numero, activo: true }).whereNot('usuario_id', usuarioId).first();
  if (enOtra) throw new Error('Ese número ya está cargado en otra cuenta. Si es tuyo, escribinos desde Contacto.');
  const ahora = new Date();
  const existente = await db('telefonos').where({ usuario_id: usuarioId, numero_e164: numero }).first();
  const tieneOtros = await db('telefonos').where({ usuario_id: usuarioId, activo: true }).whereNot('id', existente ? existente.id : '').first();
  if (existente) {
    await db('telefonos').where('id', existente.id).update({ activo: true, principal: existente.principal || !tieneOtros, canal: 'whatsapp', updated_at: ahora });
    return db('telefonos').where('id', existente.id).first();
  }
  const id = uuid();
  await db('telefonos').insert({ id, usuario_id: usuarioId, numero_e164: numero, verificado: false, canal: 'whatsapp', principal: !tieneOtros, activo: true });
  return db('telefonos').where('id', id).first();
}

module.exports = { normalizar, enviarCodigo, verificarCodigo, telefonosVigentes, guardarSinVerificar, requiereOtp };
