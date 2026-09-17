/**
 * Protección CSRF con token por sesión (patrón synchronizer token).
 * El token va en un campo oculto `_csrf` de cada formulario o en la cabecera `x-csrf-token`.
 * Los formularios multipart (fotos) se verifican después de multer con `csrf.verificar`.
 */
const crypto = require('crypto');

function fallo(req, res) {
  res.status(403);
  if (req.accepts('html', 'json') === 'json') return res.json({ error: 'Token CSRF inválido. Recargá la página.' });
  res.render('error', { titulo: 'Formulario vencido', mensaje: 'Recargá la página y volvé a intentar.' });
}

function tokenValido(req) {
  const enviado = (req.body && req.body._csrf) || req.get('x-csrf-token');
  return !!enviado && typeof enviado === 'string' && enviado.length === req.session.csrf.length && crypto.timingSafeEqual(Buffer.from(enviado), Buffer.from(req.session.csrf));
}

function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.is('multipart/form-data')) return next(); // se verifica en la ruta, después de multer
  if (tokenValido(req)) return next();
  fallo(req, res);
}

csrf.verificar = (req, res, next) => (tokenValido(req) ? next() : fallo(req, res));

module.exports = csrf;
