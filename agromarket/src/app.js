const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const { ConnectSessionKnexStore } = require('connect-session-knex');
const config = require('./config');
const db = require('./db');
const { cargarUsuario } = require('./middleware/auth');
const csrf = require('./middleware/csrf');
const flash = require('./middleware/flash');
const limites = require('./middleware/ratelimit');
const { fmtPrecio, maskPhone, parseJson } = require('./utils');

const app = express();
app.set('trust proxy', 1); // detrás de Nginx / Cloudflare
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

// ---- Cabeceras de seguridad (CSP estricta, sin scripts inline) ----
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', ...(config.storage.driver === 's3' ? [new URL(config.storage.s3.publicUrl).origin] : [])],
      frameSrc: ['https://challenges.cloudflare.com', 'https://www.mercadopago.com.ar'],
      connectSrc: ["'self'"],
      formAction: ["'self'", 'https://www.mercadopago.com.ar', 'https://www.mercadopago.com'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// ---- Estáticos ----
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '7d' : 0 }));
if (config.storage.driver === 'local') app.use('/uploads', express.static(path.resolve(config.uploads.dir), { maxAge: '30d', index: false, dotfiles: 'deny' }));

// ---- Chequeo de salud (monitoreo / hosting) ----
app.get('/salud', (req, res) => res.type('text/plain').send('ok'));

// ---- Webhook de Mercado Pago: sin sesión ni CSRF, body JSON crudo ----
app.use('/pagos/webhook', express.json({ limit: '100kb' }), require('./routes/webhook'));

// ---- Parseo, sesión, CSRF, flash, usuario ----
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(session({
  name: 'am.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: new ConnectSessionKnexStore({ knex: db, tableName: 'sessions', createTable: true, cleanupInterval: 15 * 60000 }),
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 30 * 86400000 },
}));
// ---- Variables para todas las vistas ----
app.use(async (req, res, next) => {
  res.locals.config = {
    siteName: config.siteName, baseUrl: config.baseUrl, turnstileSiteKey: config.turnstile.siteKey, precios: config.precios, isProd: config.isProd,
    telefonoVerificacion: config.telefono.verificacion, pagosActivos: config.pagosActivos, moderarPrimerAviso: config.moderacion.primerAviso,
    maxFotos: config.uploads.maxFotos, maxFotoMb: config.uploads.maxMb, avisoDias: config.reglas.avisoDias,
  };
  res.locals.fmtPrecio = fmtPrecio;
  res.locals.maskPhone = maskPhone;
  res.locals.parseJson = parseJson;
  res.locals.path = req.path;
  res.locals.titulo = null;
  res.locals.descripcionMeta = 'Compra y venta de maquinaria agrícola en Argentina con contacto directo y teléfono verificado.';
  if (!app.locals.categorias) app.locals.categorias = await db('categorias').orderBy('orden');
  res.locals.categorias = app.locals.categorias;
  next();
});

app.use(limites.general);
app.use(flash);
app.use(cargarUsuario);
app.use(csrf);


// ---- Rutas ----
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/cuenta')); // antes que publico: /aviso/:id/editar debe ganar a /aviso/:id/:slug
app.use('/', require('./routes/publico'));
app.use('/api', require('./routes/api'));
app.use('/pagos', require('./routes/pagos'));
app.use('/admin', require('./routes/admin'));

// ---- 404 y errores ----
app.use((req, res) => res.status(404).render('error', { titulo: 'Página no encontrada', mensaje: 'La dirección no existe o el aviso fue dado de baja.' }));
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') { req.flash('error', `Cada foto puede pesar hasta ${config.uploads.maxMb} MB.`); return res.redirect(req.get('Referrer') || '/publicar'); }
  console.error(err);
  res.status(err.status || 500);
  if (req.accepts('html', 'json') === 'json') return res.json({ error: config.isProd ? 'Error interno' : err.message });
  res.render('error', { titulo: 'Algo salió mal', mensaje: config.isProd ? 'Error interno. Ya quedó registrado.' : err.message });
});

module.exports = app;
