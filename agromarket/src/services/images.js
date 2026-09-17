/**
 * Procesamiento de fotos: verifica el tipo real por contenido, recomprime,
 * elimina metadatos (EXIF con GPS), genera miniatura y calcula un hash
 * perceptual (dHash) para detectar fotos copiadas de otros avisos.
 */
const sharp = require('sharp');
const { uuid } = require('../utils');
const storage = require('./storage');

const FORMATOS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif']);

async function dHash(buffer) {
  const { data } = await sharp(buffer).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] < data[y * 9 + x + 1] ? '1' : '0';
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

function distanciaHamming(a, b) {
  const x = BigInt('0x' + a) ^ BigInt('0x' + b);
  return x.toString(2).split('').filter((c) => c === '1').length;
}

async function procesar(buffer, avisoId) {
  const meta = await sharp(buffer).metadata();
  if (!FORMATOS.has(meta.format)) throw new Error('Formato de imagen no permitido (usar JPG, PNG o WebP).');
  if ((meta.width || 0) < 400 || (meta.height || 0) < 300) throw new Error('La foto es muy chica (mínimo 400x300).');
  const id = uuid();
  const base = sharp(buffer).rotate(); // aplica orientación EXIF y luego descarta metadatos
  const grande = await base.clone().resize(1600, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const mini = await base.clone().resize(480, 360, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer();
  const url = await storage.guardar(`avisos/${avisoId}/${id}.jpg`, grande.data);
  const url_miniatura = await storage.guardar(`avisos/${avisoId}/${id}_m.jpg`, mini);
  return { id, url, url_miniatura, ancho: grande.info.width, alto: grande.info.height, hash_perceptual: await dHash(buffer) };
}

/** Borra los archivos de una lista de fotos (filas de aviso_fotos). */
async function borrarFotos(fotos) {
  await storage.borrar(fotos.flatMap((f) => [f.url, f.url_miniatura]));
}

async function borrarAviso(avisoId) {
  await storage.borrarPrefijo(`avisos/${avisoId}/`);
}

module.exports = { procesar, dHash, distanciaHamming, borrarFotos, borrarAviso };
