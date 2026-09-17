require('dotenv').config({ quiet: true });
const path = require('path');
const base = {
  migrations: { directory: path.join(__dirname, 'migrations') },
  seeds: { directory: path.join(__dirname, 'seeds') },
};
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const sqlite = (archivo) => ({
  ...base,
  client: 'better-sqlite3',
  connection: { filename: path.join(dataDir, archivo) },
  useNullAsDefault: true,
  pool: { afterCreate: (conn, done) => { conn.pragma('foreign_keys = ON'); conn.pragma('journal_mode = WAL'); done(); } },
});
const usaPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || '');

module.exports = {
  development: sqlite('dev.sqlite'),
  test: sqlite('test.sqlite'),
  // Producción: PostgreSQL si DATABASE_URL apunta a uno (Neon, Supabase, Render, VPS propio);
  // si no, SQLite en DATA_DIR/prod.sqlite (sirve para un VPS chico con disco persistente).
  production: usaPostgres
    ? { ...base, client: 'pg', connection: process.env.DATABASE_URL, pool: { min: 0, max: 8 } }
    : sqlite('prod.sqlite'),
};
