const db = require('../db');

/** Carga el usuario de la sesión en req.user y res.locals.user */
async function cargarUsuario(req, res, next) {
  req.user = null;
  if (req.session && req.session.usuarioId) {
    const u = await db('usuarios').where('id', req.session.usuarioId).first();
    if (u && u.estado === 'activo') req.user = u;
    else req.session.destroy(() => {});
  }
  res.locals.user = req.user;
  next();
}

function requerirLogin(req, res, next) {
  if (req.user) return next();
  req.session.volverA = req.originalUrl;
  req.flash('info', 'Ingresá para continuar.');
  res.redirect('/ingresar');
}

function requerirRol(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.rol)) return next();
    res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'No tenés permiso para ver esta página.' });
  };
}

module.exports = { cargarUsuario, requerirLogin, requerirRol };
