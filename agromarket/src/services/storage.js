/**
 * Dónde se guardan las fotos.
 *  - local: carpeta UPLOAD_DIR (servida por la app en /uploads o por Nginx). Requiere disco persistente.
 *  - s3:    cualquier bucket compatible con S3 (Cloudflare R2 tiene 10 GB gratis y sin costo de salida;
 *           también Backblaze B2, AWS S3, Supabase Storage). Necesario en hostings sin disco persistente (Render, Railway, Fly).
 * Variables: STORAGE=s3, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL (y S3_REGION, 'auto' para R2).
 */
const path = require('path');
const fs = require('fs/promises');
const config = require('../config');

const esS3 = () => config.storage.driver === 's3';
let cliente = null;
function s3() {
  if (cliente) return cliente;
  const { S3Client } = require('@aws-sdk/client-s3');
  const c = config.storage.s3;
  if (!c.bucket || !c.accessKey || !c.secretKey || !c.publicUrl) throw new Error('STORAGE=s3 requiere S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY y S3_PUBLIC_URL');
  cliente = new S3Client({ region: c.region || 'auto', endpoint: c.endpoint || undefined, forcePathStyle: !!c.endpoint, credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey } });
  return cliente;
}
const urlPublica = (clave) => `${config.storage.s3.publicUrl}/${clave}`;
const claveDeUrl = (url) => (esS3() ? String(url).replace(`${config.storage.s3.publicUrl}/`, '') : String(url).replace(/^\/uploads\//, ''));

/** Guarda un archivo bajo `clave` (ej. avisos/<id>/<foto>.jpg) y devuelve la URL con la que se muestra. */
async function guardar(clave, buffer, contentType = 'image/jpeg') {
  if (esS3()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3().send(new PutObjectCommand({ Bucket: config.storage.s3.bucket, Key: clave, Body: buffer, ContentType: contentType, CacheControl: 'public, max-age=2592000, immutable' }));
    return urlPublica(clave);
  }
  const destino = path.join(path.resolve(config.uploads.dir), clave);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, buffer);
  return `/uploads/${clave}`;
}

/** Borra archivos por URL (las que devolvió `guardar`). */
async function borrar(urls) {
  const claves = [].concat(urls || []).filter(Boolean).map(claveDeUrl);
  if (!claves.length) return;
  if (esS3()) {
    const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');
    for (let i = 0; i < claves.length; i += 1000) {
      await s3().send(new DeleteObjectsCommand({ Bucket: config.storage.s3.bucket, Delete: { Objects: claves.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
    }
    return;
  }
  for (const k of claves) await fs.rm(path.join(path.resolve(config.uploads.dir), k), { force: true });
}

/** Borra todo lo que hay bajo un prefijo (ej. avisos/<id>/). */
async function borrarPrefijo(prefijo) {
  if (esS3()) {
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    let token;
    do {
      const r = await s3().send(new ListObjectsV2Command({ Bucket: config.storage.s3.bucket, Prefix: prefijo, ContinuationToken: token }));
      await borrar((r.Contents || []).map((o) => urlPublica(o.Key)));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return;
  }
  await fs.rm(path.join(path.resolve(config.uploads.dir), prefijo), { recursive: true, force: true });
}

module.exports = { guardar, borrar, borrarPrefijo, esS3 };
