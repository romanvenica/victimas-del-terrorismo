/** Creación del administrador inicial (desde variables de entorno o desde scripts/crear-admin.js). */
const bcrypt = require('bcryptjs');
const db = require('../db');
const { uuid, slugify } = require('../utils');

/**
 * Crea el usuario `email` como admin, o lo promueve si ya existe. Si `actualizarContrasena` es true
 * (script manual) también cambia la contraseña; desde el arranque automático no se toca la de un usuario existente.
 */
async function asegurarAdmin({ email, password, nombre = 'Administrador', actualizarContrasena = false }) {
  if (!email || !password) return null;
  if (password.length < 10) { console.warn('[admin] ADMIN_PASSWORD debe tener al menos 10 caracteres; no se creó el administrador.'); return null; }
  const existe = await db('usuarios').where('email', email.toLowerCase()).first();
  if (existe) {
    const cambios = { rol: 'admin', estado: 'activo' };
    if (actualizarContrasena) cambios.hash_contrasena = await bcrypt.hash(password, 12);
    if (existe.rol !== 'admin' || existe.estado !== 'activo' || actualizarContrasena) { await db('usuarios').where('id', existe.id).update(cambios); console.log(`[admin] ${email} es administrador.`); }
    return existe.id;
  }
  const id = uuid();
  await db('usuarios').insert({ id, email: email.toLowerCase(), hash_contrasena: await bcrypt.hash(password, 12), nombre, rol: 'admin', email_verificado: true, slug: slugify(nombre) + '-' + id.slice(0, 6) });
  console.log(`[admin] Administrador ${email} creado.`);
  return id;
}

module.exports = { asegurarAdmin };
