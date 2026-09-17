#!/usr/bin/env node
/**
 * Prueba de humo: levanta la app con una base SQLite de prueba y verifica
 *  1. las rutas principales (GET) y las cabeceras de seguridad;
 *  2. el flujo completo en modo TELEFONO_VERIFICACION=ninguna: registro -> publicar con foto y WhatsApp ->
 *     ver la ficha -> revelar el teléfono (link wa.me) -> cambiar el WhatsApp desde Mi cuenta.
 * Uso: npm test
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.OTP_PROVIDER = 'console';
process.env.TELEFONO_VERIFICACION = 'ninguna';
process.env.MODERAR_PRIMER_AVISO = 'no';
process.env.CRON_INTERNO = 'no';
process.env.STORAGE = 'local';
const fs = require('fs');
const path = require('path');
process.env.DATA_DIR = path.join(__dirname, '..', 'data');
process.env.UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads-test');
const test = path.join(process.env.DATA_DIR, 'test.sqlite');
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
for (const f of [test, test + '-wal', test + '-shm']) fs.rmSync(f, { force: true });
fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });

const sharp = require('sharp');
const db = require('../src/db');
const app = require('../src/app');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK ' : 'FALLO'} ${msg}`); if (!cond) fallos++; };

/** Cliente HTTP mínimo con cookies (una "sesión de navegador"). */
function navegador(base) {
  const jar = new Map();
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  async function pedir(ruta, opts = {}) {
    const r = await fetch(base + ruta, { redirect: 'manual', ...opts, headers: { ...(opts.headers || {}), Cookie: cookie() } });
    for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return r;
  }
  async function csrf(ruta) { const html = await (await pedir(ruta)).text(); return (html.match(/name="csrf-token" content="([^"]+)"/) || [])[1]; }
  async function form(ruta, datos, token) {
    const body = new URLSearchParams({ _csrf: token, ...datos });
    return pedir(ruta, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  }
  return { pedir, csrf, form };
}

async function main() {
  await db.migrate.latest();
  await db.seed.run();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  // ---- 1. Rutas públicas ----
  const casos = [
    ['/', 200], ['/salud', 200], ['/buscar?q=tractor', 200], ['/categoria/tractores', 200], ['/marca/kioti', 200], ['/provincia/cordoba', 200],
    ['/registrarse', 200], ['/ingresar', 200], ['/recuperar', 200], ['/terminos', 200], ['/privacidad', 200], ['/arrepentimiento', 200],
    ['/consejos-de-seguridad', 200], ['/como-publicar', 200], ['/ayuda', 200], ['/contacto', 200], ['/robots.txt', 200], ['/sitemap.xml', 200],
    ['/publicar', 302], ['/mi-cuenta', 302], ['/admin', 302], ['/aviso/no-existe', 404], ['/no-existe', 404], ['/api/marcas', 200],
    ['/static/css/app.css', 200], ['/static/js/app.js', 200],
  ];
  for (const [ruta, esperado] of casos) {
    const r = await fetch(base + ruta, { redirect: 'manual' });
    ok(r.status === esperado, `${r.status} ${ruta}${r.status === esperado ? '' : ` (esperado ${esperado})`}`);
  }
  const sinCsrf = await fetch(base + '/ingresar', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a@b.com&contrasena=x', redirect: 'manual' });
  ok(sinCsrf.status === 403, `${sinCsrf.status} POST /ingresar sin CSRF`);
  const csp = (await fetch(base + '/')).headers.get('content-security-policy') || '';
  ok(csp.includes("script-src 'self'"), 'CSP presente');

  // ---- 2. Flujo vendedor: registro -> publicar con WhatsApp ----
  const v = navegador(base);
  let t = await v.csrf('/registrarse');
  let r = await v.form('/registrarse', { nombre: 'Juan Prueba', email: 'juan@prueba.test', contrasena: 'clave-larga-de-prueba-123', tipo: 'particular', acepta: 'on' }, t);
  ok(r.status === 302 && r.headers.get('location') === '/publicar', `registro redirige a /publicar (${r.status} -> ${r.headers.get('location')})`);
  r = await v.pedir('/publicar');
  const htmlPublicar = await r.text();
  ok(r.status === 200 && htmlPublicar.includes('name="whatsapp"'), 'formulario de publicar pide el WhatsApp sin verificación por código');
  t = (htmlPublicar.match(/name="csrf-token" content="([^"]+)"/) || [])[1];

  const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 90, g: 140, b: 60 } } }).jpeg().toBuffer();
  const fd = new FormData();
  const campos = { _csrf: t, categoria_id: '1', marca_id: '', modelo: '6110J', titulo: 'Tractor John Deere 6110J 2018', descripcion: 'Tractor en muy buen estado, service al día, cubiertas nuevas, cabina con aire. Se vende por renovación de flota.', anio: '', horas_uso: '', estado_maquina: 'usado', precio: '', moneda: 'USD', provincia_id: '14', localidad: 'Río Cuarto', whatsapp: '011 15 2345 6789', acepta_whatsapp: 'on' };
  for (const [k, val] of Object.entries(campos)) fd.append(k, val);
  // Con 3 fotos el puntaje de riesgo (cuenta nueva 20 + primera publicación 15) queda debajo del umbral 50 y sale al instante.
  for (let i = 0; i < 3; i++) fd.append('fotos', new Blob([foto], { type: 'image/jpeg' }), `tractor${i}.jpg`);
  r = await v.pedir('/publicar', { method: 'POST', body: fd });
  const loc = r.headers.get('location') || '';
  ok(r.status === 302 && /^\/aviso\/[0-9a-f-]{36}\//.test(loc), `publicar con año/precio vacíos y WhatsApp redirige a la ficha (${r.status} -> ${loc})`);
  const avisoId = loc.split('/')[2];
  const aviso = await db('avisos').where('id', avisoId).first();
  ok(aviso && aviso.estado === 'activo', `aviso activo sin moderación (estado ${aviso && aviso.estado})`);
  ok(aviso && aviso.precio === null && aviso.anio === null, 'precio y año vacíos quedan como "sin dato" (no 0)');
  ok(aviso && !!aviso.acepta_whatsapp && !aviso.acepta_llamada, 'checkbox "Acepto llamadas" desmarcado se guarda como no');
  const tel = aviso && (await db('telefonos').where('id', aviso.telefono_id).first());
  ok(tel && tel.numero_e164 === '+5491123456789', `WhatsApp normalizado a E.164 (${tel && tel.numero_e164})`);
  const fotos = await db('aviso_fotos').where('aviso_id', avisoId);
  ok(fotos.length === 3 && fs.existsSync(path.join(process.env.UPLOAD_DIR, fotos[0].url.replace('/uploads/', ''))), 'fotos procesadas y guardadas en disco');

  // Un segundo aviso con una sola foto: ya no es "primera publicación" (15), así que queda en 35 (cuenta nueva 20 + pocas fotos 15) y sale activo, con la señal registrada.
  const fd2 = new FormData();
  for (const [k, val] of Object.entries({ ...campos, titulo: 'Sembradora Agrometal TX Mega 2015', descripcion: 'Sembradora de grano grueso, 16 surcos a 52 cm, con fertilización. Lista para trabajar, muy cuidada.' })) fd2.append(k, val);
  fd2.append('fotos', new Blob([foto], { type: 'image/jpeg' }), 'sembradora.jpg');
  r = await v.pedir('/publicar', { method: 'POST', body: fd2 });
  const loc2 = r.headers.get('location') || '';
  const aviso2fotos = await db('avisos').where('id', loc2.split('/')[2]).first();
  ok(aviso2fotos && aviso2fotos.estado === 'activo' && aviso2fotos.puntaje_riesgo === 35 && aviso2fotos.senales_riesgo.includes('Menos de 3 fotos'), `segundo aviso con una sola foto sale activo con la señal de riesgo registrada (puntaje ${aviso2fotos && aviso2fotos.puntaje_riesgo})`);

  // ---- 3. Comprador anónimo: ficha + revelar teléfono ----
  const c = navegador(base);
  r = await c.pedir(loc);
  const htmlFicha = await r.text();
  ok(r.status === 200 && htmlFicha.includes('Ver teléfono') && !htmlFicha.includes('+5491123456789'), 'ficha visible para anónimos y el número no viaja en el HTML');
  ok(r.status === 200 && (await c.pedir(fotos[0].url_miniatura)).status === 200, 'miniatura servida en /uploads');
  const tc = (htmlFicha.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  r = await c.pedir(`/api/aviso/${avisoId}/telefono`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': tc, Accept: 'application/json' }, body: '{}' });
  const j = await r.json();
  ok(r.status === 200 && j.whatsapp === 'https://wa.me/5491123456789?text=' + encodeURIComponent('Hola, vi tu Tractor John Deere 6110J 2018 en AgroMarket. ¿Sigue disponible?'), `revelar teléfono devuelve link de WhatsApp (${r.status} ${j.whatsapp || j.error})`);
  ok(j.llamada === null && j.verificado === false, 'sin "Acepto llamadas" no hay tel:, y el número figura como no verificado');

  // ---- 4. Cambiar el WhatsApp desde Mi cuenta actualiza el aviso ----
  t = await v.csrf('/mi-cuenta');
  r = await v.form('/mi-cuenta/telefono', { numero: '3564 123456' }, t);
  const avisoAct = await db('avisos').where('id', avisoId).first();
  const tel2 = await db('telefonos').where('id', avisoAct.telefono_id).first();
  ok(r.status === 302 && tel2.numero_e164 === '+5493564123456', `cambiar WhatsApp en Mi cuenta actualiza el aviso (${tel2.numero_e164})`);
  r = await v.pedir('/verificar-telefono');
  ok(r.status === 302 && r.headers.get('location') === '/mi-cuenta', 'la verificación por código está apagada (redirige a Mi cuenta)');

  // ---- 5. Búsqueda y edición ----
  r = await c.pedir('/buscar?q=6110J');
  ok(r.status === 200 && (await r.text()).includes('Tractor John Deere 6110J'), 'el aviso aparece en la búsqueda');
  r = await v.pedir(`/aviso/${avisoId}/editar`);
  ok(r.status === 200 && (await r.text()).includes('+5493564123456'), 'editar precarga el WhatsApp actual');

  // ---- 6. Páginas privadas del vendedor y panel de administración (renderizado de todas las vistas) ----
  for (const ruta of ['/mis-avisos', '/favoritos', '/alertas', '/pagos', '/mi-cuenta']) { r = await v.pedir(ruta); ok(r.status === 200, `${r.status} ${ruta} (vendedor)`); }
  r = await v.pedir('/admin'); ok(r.status === 403, `${r.status} /admin como usuario común`);
  const { asegurarAdmin } = require('../src/services/admin');
  await asegurarAdmin({ email: 'admin@prueba.test', password: 'clave-larga-admin-1' });
  const a = navegador(base);
  t = await a.csrf('/ingresar');
  r = await a.form('/ingresar', { email: 'admin@prueba.test', contrasena: 'clave-larga-admin-1' }, t);
  ok(r.status === 302 && r.headers.get('location') === '/mi-cuenta', `login admin (${r.status} -> ${r.headers.get('location')})`);
  for (const ruta of ['/admin', '/admin/moderacion', '/admin/reportes', '/admin/usuarios?q=juan', '/admin/listas-negras', '/admin/pagos']) { r = await a.pedir(ruta); ok(r.status === 200, `${r.status} ${ruta} (admin)`); }

  server.close();
  await db.destroy();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
