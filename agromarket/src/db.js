const knex = require('knex');
const knexfile = require('../knexfile');
const config = require('./config');

const cfg = knexfile[config.env] || knexfile.development;

// En SQLite las fechas se guardan como texto 'YYYY-MM-DD HH:MM:SS.mmm' (UTC), el mismo
// formato que CURRENT_TIMESTAMP, para que las comparaciones y el orden sean consistentes.
// Al leer, esas cadenas se convierten de vuelta a Date. En PostgreSQL no hace falta.
const RE_FECHA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;
const fmtSqlite = (d) => d.toISOString().replace('T', ' ').replace('Z', '');
if (cfg.client === 'better-sqlite3') {
  cfg.postProcessResponse = (result) => {
    const fix = (row) => { if (row && typeof row === 'object') for (const k in row) if (typeof row[k] === 'string' && RE_FECHA.test(row[k])) row[k] = new Date(row[k].replace(' ', 'T') + 'Z'); return row; };
    return Array.isArray(result) ? result.map(fix) : fix(result);
  };
}
const db = knex(cfg);
if (cfg.client === 'better-sqlite3') {
  const original = db.client._formatBindings.bind(db.client);
  db.client._formatBindings = (bindings) => original((bindings || []).map((b) => (b instanceof Date ? fmtSqlite(b) : b)));
}
module.exports = db;
