require('dotenv').config({ quiet: true });
const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => Number(env(k, d));
const si = (k, d) => !['no', 'false', '0', 'off'].includes(String(env(k, d)).toLowerCase());

const mpAccessToken = env('MP_ACCESS_TOKEN', '');
const s3PublicUrl = env('S3_PUBLIC_URL', '').replace(/\/$/, '');

module.exports = {
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  port: num('PORT', 3000),
  baseUrl: env('BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  siteName: env('SITE_NAME', 'AgroMarket'),
  sessionSecret: env('SESSION_SECRET', 'dev-secret-cambiar'),
  databaseUrl: env('DATABASE_URL', ''),
  dataDir: env('DATA_DIR', './data'),
  redisUrl: env('REDIS_URL', ''),
  // Cómo se carga el teléfono de contacto:
  //  - 'ninguna': el vendedor escribe su WhatsApp al publicar (no requiere proveedor de mensajería; es el modo inicial gratuito).
  //  - 'otp':     el vendedor tiene que confirmar el número con un código enviado por WhatsApp/SMS (requiere OTP_PROVIDER real).
  telefono: { verificacion: env('TELEFONO_VERIFICACION', 'ninguna') === 'otp' ? 'otp' : 'ninguna' },
  moderacion: { primerAviso: si('MODERAR_PRIMER_AVISO', 'si') },
  // Si están definidos, al arrancar se crea (o promueve) ese usuario como administrador. Útil en hostings sin consola (Render free).
  admin: { email: env('ADMIN_EMAIL', '').trim().toLowerCase(), password: env('ADMIN_PASSWORD', '') },
  // Tareas diarias (vencer avisos, alertas, limpieza) dentro del mismo proceso. Poner 'no' si se usa un cron externo.
  cronInterno: si('CRON_INTERNO', 'si'),
  otp: {
    provider: env('OTP_PROVIDER', 'console'),
    minutos: num('OTP_MINUTOS', 10),
    meta: { token: env('META_WA_TOKEN', ''), phoneId: env('META_WA_PHONE_ID', ''), template: env('META_WA_TEMPLATE', 'codigo_verificacion') },
    twilio: { sid: env('TWILIO_SID', ''), token: env('TWILIO_TOKEN', ''), from: env('TWILIO_FROM', '') },
  },
  email: {
    provider: env('EMAIL_PROVIDER', 'console'),
    from: env('EMAIL_FROM', 'AgroMarket <no-responder@localhost>'),
    smtp: { host: env('SMTP_HOST', ''), port: num('SMTP_PORT', 587), user: env('SMTP_USER', ''), pass: env('SMTP_PASS', '') },
  },
  turnstile: { siteKey: env('TURNSTILE_SITE_KEY', ''), secret: env('TURNSTILE_SECRET', '') },
  mp: { accessToken: mpAccessToken, webhookSecret: env('MP_WEBHOOK_SECRET', '') },
  pagosActivos: !!mpAccessToken,
  // Fotos: 'local' (carpeta UPLOAD_DIR, servida por la app o Nginx) o 's3' (Cloudflare R2, Backblaze B2, AWS S3, etc.).
  storage: {
    driver: env('STORAGE', 'local') === 's3' ? 's3' : 'local',
    s3: { endpoint: env('S3_ENDPOINT', ''), region: env('S3_REGION', 'auto'), bucket: env('S3_BUCKET', ''), accessKey: env('S3_ACCESS_KEY', ''), secretKey: env('S3_SECRET_KEY', ''), publicUrl: s3PublicUrl },
  },
  uploads: { dir: env('UPLOAD_DIR', './uploads'), maxFotos: num('MAX_FOTOS', 20), maxMb: num('MAX_FOTO_MB', 10) },
  reglas: {
    avisoDias: num('AVISO_DIAS', 60),
    avisosGratisCuentaNueva: num('AVISOS_GRATIS_CUENTA_NUEVA', 3),
    revealPorDia: num('REVEAL_POR_DIA', 20),
    riesgoUmbral: num('RIESGO_UMBRAL', 50),
  },
  precios: {
    destacado: { 7: num('PRECIO_DESTACADO_7', 8000), 15: num('PRECIO_DESTACADO_15', 14000), 30: num('PRECIO_DESTACADO_30', 24000) },
    bump: num('PRECIO_BUMP', 2000),
  },
};
