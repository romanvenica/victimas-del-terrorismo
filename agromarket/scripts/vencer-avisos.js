#!/usr/bin/env node
/**
 * Tarea programada (cron diario): vence avisos, avisa por email, envía alertas y limpia registros viejos.
 * Uso: node scripts/vencer-avisos.js   (ver docs/OPERACION.md). Si CRON_INTERNO=si (por defecto) el servidor ya lo corre solo.
 */
const db = require('../src/db');
const mantenimiento = require('../src/services/mantenimiento');

mantenimiento.correr().then(async () => { await db.destroy(); }).catch((e) => { console.error(e); process.exit(1); });
