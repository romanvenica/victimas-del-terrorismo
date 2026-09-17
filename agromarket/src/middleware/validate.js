/** Valida req.body con un esquema zod; deja el resultado en req.datos. */
module.exports = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body);
  if (r.success) { req.datos = r.data; return next(); }
  const errores = r.error.issues.map((i) => `${i.path.join('.') || 'campo'}: ${i.message}`);
  req.erroresValidacion = errores;
  if (req.accepts('html', 'json') === 'json') return res.status(400).json({ error: errores.join(' | ') });
  req.flash('error', errores.join(' | '));
  res.redirect('back' === req.get('Referrer') ? '/' : (req.get('Referrer') || '/'));
};
