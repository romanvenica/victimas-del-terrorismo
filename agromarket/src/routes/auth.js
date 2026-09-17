const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const limites = require('../middleware/ratelimit');
const validar = require('../middleware/validate');
const { requerirLogin } = require('../middleware/auth');
const { uuid, slugify, randomToken, sha256, hashIp } = require('../utils');
const otp = require('../services/otp');
const email = require('../services/email');
const turnstile = require('../services/turnstile');
const auditoria = require('../services/auditoria');

const router = express.Router();

const esqRegistro = z.object({
  nombre: z.string().trim().min(2, 'Ingresá tu nombre').max(80),
  email: z.string().trim().toLowerCase().email('Email inválido').max(120),
  contrasena: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(200),
  tipo: z.enum(['particular', 'profesional']).default('particular'),
  acepta: z.string().optional(),
  'cf-turnstile-response': z.string().optional(),
});

/** Chequea contraseñas filtradas con la API k-anonymity de Have I Been Pwned (sin enviar la contraseña). */
async function contrasenaFiltrada(pw) {
  try {
    const h = require('crypto').createHash('sha1').update(pw).digest('hex').toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return false;
    return (await r.text()).split('\n').some((l) => l.startsWith(h.slice(5)));
  } catch { return false; }
}

router.get('/registrarse', (req, res) => res.render('auth/registro', { titulo: 'Crear cuenta', valores: {} }));
router.post('/registrarse', limites.registro, validar(esqRegistro), async (req, res) => {
  const d = req.datos;
  if (d.acepta !== 'on') { req.flash('error', 'Tenés que aceptar los términos y condiciones.'); return res.redirect('/registrarse'); }
  if (!(await turnstile.verificar(d['cf-turnstile-response'], req.ip))) { req.flash('error', 'No pudimos verificar que no sos un robot.'); return res.redirect('/registrarse'); }
  const dominio = d.email.split('@')[1];
  if (await db('listas_negras').where((b) => b.where({ tipo: 'email', valor: d.email }).orWhere({ tipo: 'dominio_email', valor: dominio }).orWhere({ tipo: 'ip', valor: hashIp(req.ip) })).first()) {
    req.flash('error', 'No es posible crear la cuenta con esos datos.'); return res.redirect('/registrarse');
  }
  if (await db('usuarios').where('email', d.email).first()) { req.flash('error', 'Ya existe una cuenta con ese email. Ingresá o recuperá la contraseña.'); return res.redirect('/ingresar'); }
  if (await contrasenaFiltrada(d.contrasena)) { req.flash('error', 'Esa contraseña apareció en filtraciones de datos. Elegí otra.'); return res.redirect('/registrarse'); }

  const id = uuid();
  let slug = slugify(d.nombre) || 'vendedor';
  if (await db('usuarios').where('slug', slug).first()) slug += '-' + id.slice(0, 6);
  await db('usuarios').insert({ id, email: d.email, hash_contrasena: await bcrypt.hash(d.contrasena, 12), nombre: d.nombre, tipo: d.tipo, slug, ultimo_login: new Date() });

  const token = randomToken();
  await db('tokens').insert({ id: uuid(), usuario_id: id, tipo: 'email', token_hash: sha256(token), expira: new Date(Date.now() + 2 * 86400000) });
  await email.enviar({ to: d.email, subject: `Confirmá tu email en ${config.siteName}`, text: `Hola ${d.nombre}. Confirmá tu email entrando a: ${config.baseUrl}/verificar-email/${token}\n\nSi no creaste una cuenta, ignorá este mensaje.` });

  await auditoria.registrar({ actorId: id, accion: 'registro', entidad: 'usuario', entidadId: id, ip: req.ip });
  const volverA = req.session.volverA; // leer antes de regenerar: la sesión nueva arranca vacía
  const destino = volverA || (otp.requiereOtp() ? '/verificar-telefono' : '/publicar');
  req.session.regenerate(() => { req.session.usuarioId = id; req.flash('exito', 'Cuenta creada. Te enviamos un email para confirmarlo.'); res.redirect(destino); });
});

router.get('/verificar-email/:token', async (req, res) => {
  const t = await db('tokens').where({ token_hash: sha256(req.params.token), tipo: 'email', usado: false }).where('expira', '>', new Date()).first();
  if (!t) return res.render('error', { titulo: 'Enlace inválido', mensaje: 'El enlace venció o ya fue usado.' });
  await db('tokens').where('id', t.id).update({ usado: true });
  await db('usuarios').where('id', t.usuario_id).update({ email_verificado: true });
  req.flash('exito', 'Email confirmado.');
  res.redirect('/mi-cuenta');
});

router.get('/ingresar', (req, res) => { if (req.user) return res.redirect('/mi-cuenta'); res.render('auth/login', { titulo: 'Ingresar' }); });
router.post('/ingresar', limites.login, validar(z.object({ email: z.string().trim().toLowerCase().email(), contrasena: z.string().min(1) })), async (req, res) => {
  const u = await db('usuarios').where('email', req.datos.email).first();
  const ok = u && u.estado === 'activo' && (await bcrypt.compare(req.datos.contrasena, u.hash_contrasena));
  if (!ok) {
    if (u) await bcrypt.compare('x', u.hash_contrasena); // tiempo constante aproximado
    req.flash('error', 'Email o contraseña incorrectos.');
    return res.redirect('/ingresar');
  }
  await db('usuarios').where('id', u.id).update({ ultimo_login: new Date() });
  await auditoria.registrar({ actorId: u.id, accion: 'login', entidad: 'usuario', entidadId: u.id, ip: req.ip });
  const volverA = req.session.volverA;
  req.session.regenerate(() => { req.session.usuarioId = u.id; res.redirect(volverA && volverA.startsWith('/') ? volverA : '/mi-cuenta'); });
});

router.post('/salir', (req, res) => req.session.destroy(() => res.redirect('/')));

router.get('/recuperar', (req, res) => res.render('auth/recuperar', { titulo: 'Recuperar contraseña' }));
router.post('/recuperar', limites.recuperar, validar(z.object({ email: z.string().trim().toLowerCase().email() })), async (req, res) => {
  const u = await db('usuarios').where({ email: req.datos.email, estado: 'activo' }).first();
  if (u) {
    const token = randomToken();
    await db('tokens').insert({ id: uuid(), usuario_id: u.id, tipo: 'reset', token_hash: sha256(token), expira: new Date(Date.now() + 30 * 60000) });
    await email.enviar({ to: u.email, subject: `Restablecer contraseña en ${config.siteName}`, text: `Para elegir una contraseña nueva entrá a: ${config.baseUrl}/restablecer/${token}\n\nEl enlace vence en 30 minutos. Si no lo pediste, ignorá este mensaje.` });
  }
  req.flash('info', 'Si el email está registrado, te enviamos un enlace para restablecer la contraseña.');
  res.redirect('/ingresar');
});

router.get('/restablecer/:token', async (req, res) => {
  const t = await db('tokens').where({ token_hash: sha256(req.params.token), tipo: 'reset', usado: false }).where('expira', '>', new Date()).first();
  if (!t) return res.render('error', { titulo: 'Enlace inválido', mensaje: 'El enlace venció o ya fue usado. Pedí uno nuevo.' });
  res.render('auth/restablecer', { titulo: 'Nueva contraseña', token: req.params.token });
});
router.post('/restablecer/:token', limites.recuperar, validar(z.object({ contrasena: z.string().min(10, 'Mínimo 10 caracteres') })), async (req, res) => {
  const t = await db('tokens').where({ token_hash: sha256(req.params.token), tipo: 'reset', usado: false }).where('expira', '>', new Date()).first();
  if (!t) return res.render('error', { titulo: 'Enlace inválido', mensaje: 'El enlace venció o ya fue usado.' });
  await db('tokens').where('id', t.id).update({ usado: true });
  await db('usuarios').where('id', t.usuario_id).update({ hash_contrasena: await bcrypt.hash(req.datos.contrasena, 12) });
  await db('sessions').whereILike('sess', `%"usuarioId":"${t.usuario_id}"%`).del(); // cierra todas las sesiones
  await auditoria.registrar({ actorId: t.usuario_id, accion: 'reset_contrasena', entidad: 'usuario', entidadId: t.usuario_id, ip: req.ip });
  req.flash('exito', 'Contraseña actualizada. Ingresá con la nueva.');
  res.redirect('/ingresar');
});

// ---- Verificación de teléfono (OTP). Solo en modo TELEFONO_VERIFICACION=otp; si no, el WhatsApp se carga en Mi cuenta / Publicar ----
const soloConOtp = (req, res, next) => (otp.requiereOtp() ? next() : res.redirect('/mi-cuenta'));
router.get('/verificar-telefono', requerirLogin, soloConOtp, async (req, res) => {
  const telefonos = await db('telefonos').where({ usuario_id: req.user.id, activo: true });
  res.render('auth/verificar', { titulo: 'Verificar teléfono', telefonos, pendiente: req.session.otpNumero || null, volverA: req.query.volver || '' });
});
router.post('/verificar-telefono/enviar', requerirLogin, soloConOtp, limites.otp, validar(z.object({ numero: z.string().trim().min(8).max(25), canal: z.enum(['whatsapp', 'sms']).default('whatsapp') })), async (req, res) => {
  const numero = otp.normalizar(req.datos.numero);
  if (!numero) { req.flash('error', 'Ingresá un celular argentino válido, con código de área (ej: 11 2345 6789).'); return res.redirect('/verificar-telefono'); }
  try {
    await otp.enviarCodigo({ usuarioId: req.user.id, numero, canal: req.datos.canal, ip: req.ip });
    req.session.otpNumero = numero; req.session.otpCanal = req.datos.canal;
    req.flash('info', `Te enviamos un código de 6 dígitos por ${req.datos.canal === 'sms' ? 'SMS' : 'WhatsApp'} al ${numero}.`);
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/verificar-telefono');
});
router.post('/verificar-telefono/confirmar', requerirLogin, soloConOtp, limites.otp, validar(z.object({ codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos') })), async (req, res) => {
  const numero = req.session.otpNumero;
  if (!numero) { req.flash('error', 'Primero pedí un código.'); return res.redirect('/verificar-telefono'); }
  const r = await otp.verificarCodigo({ usuarioId: req.user.id, numero, codigo: req.datos.codigo, canal: req.session.otpCanal });
  if (!r.ok) { req.flash('error', r.error); return res.redirect('/verificar-telefono'); }
  delete req.session.otpNumero; delete req.session.otpCanal;
  await auditoria.registrar({ actorId: req.user.id, accion: 'telefono_verificado', entidad: 'telefono', entidadId: r.telefonoId, ip: req.ip });
  req.flash('exito', 'Teléfono verificado. Ya podés publicar.');
  const volverA = req.session.volverA; delete req.session.volverA;
  res.redirect(volverA || '/publicar');
});
router.post('/verificar-telefono/quitar', requerirLogin, async (req, res) => {
  await db('telefonos').where({ id: String(req.body.id || ''), usuario_id: req.user.id }).update({ activo: false, principal: false });
  await db('avisos').where({ telefono_id: String(req.body.id || ''), usuario_id: req.user.id, estado: 'activo' }).update({ estado: 'pausado' });
  req.flash('info', 'Teléfono quitado. Los avisos que lo usaban quedaron pausados hasta que elijas otro.');
  res.redirect('/verificar-telefono');
});

module.exports = router;
