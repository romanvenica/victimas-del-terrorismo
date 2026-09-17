const app = require('./app');
const config = require('./config');
const db = require('./db');
const mantenimiento = require('./services/mantenimiento');
const { asegurarAdmin } = require('./services/admin');

async function main() {
  if (config.isProd && config.sessionSecret === 'dev-secret-cambiar') throw new Error('Definí SESSION_SECRET en producción (openssl rand -hex 32).');
  await db.migrate.latest();
  // Datos base (provincias, categorías, marcas) si la base está vacía: permite arrancar sin correr `npm run setup` a mano.
  if (!(await db('provincias').first())) { await db.seed.run(); console.log('Datos base cargados (provincias, categorías, marcas).'); }
  await asegurarAdmin(config.admin);
  if (config.cronInterno) mantenimiento.programar();
  app.listen(config.port, () => console.log(`${config.siteName} escuchando en ${config.baseUrl} (${config.env}, base ${db.client.config.client}, fotos ${config.storage.driver}, teléfono ${config.telefono.verificacion})`));
}
main().catch((e) => { console.error(e); process.exit(1); });
