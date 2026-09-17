/** Mensajes flash simples guardados en sesión (un solo ciclo de petición). */
module.exports = (req, res, next) => {
  req.flash = (tipo, msg) => { if (!req.session.flash) req.session.flash = []; req.session.flash.push({ tipo, msg }); };
  res.locals.flash = req.session.flash || [];
  delete req.session.flash;
  next();
};
