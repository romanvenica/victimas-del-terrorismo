#!/usr/bin/env node
/**
 * Crea (o promueve) un usuario administrador y fija su contraseña.
 * Uso: node scripts/crear-admin.js email@dominio.com "contraseña" ["Nombre"]
 * Sin consola (Render free, etc.): definir ADMIN_EMAIL y ADMIN_PASSWORD en el entorno; el servidor lo crea al arrancar.
 */
const db = require('../src/db');
const { asegurarAdmin } = require('../src/services/admin');

async function main() {
  const [email, contrasena, nombre = 'Administrador'] = process.argv.slice(2);
  if (!email || !contrasena) { console.error('Uso: node scripts/crear-admin.js email contraseña [nombre]'); process.exit(1); }
  if (contrasena.length < 10) { console.error('La contraseña debe tener al menos 10 caracteres'); process.exit(1); }
  await db.migrate.latest();
  await asegurarAdmin({ email, password: contrasena, nombre, actualizarContrasena: true });
  await db.destroy();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
