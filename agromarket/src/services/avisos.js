/** Consultas de avisos compartidas entre rutas públicas, cuenta y admin. */
const db = require('../db');
const { parseJson } = require('../utils');

const POR_PAGINA = 20;

function baseQuery() {
  return db('avisos')
    .join('categorias', 'categorias.id', 'avisos.categoria_id')
    .leftJoin('marcas', 'marcas.id', 'avisos.marca_id')
    .join('provincias', 'provincias.id', 'avisos.provincia_id')
    .join('usuarios', 'usuarios.id', 'avisos.usuario_id')
    .select('avisos.*', 'categorias.nombre as categoria', 'categorias.slug as categoria_slug', 'marcas.nombre as marca', 'marcas.slug as marca_slug',
      'provincias.nombre as provincia', 'provincias.slug as provincia_slug', 'usuarios.nombre as vendedor', 'usuarios.slug as vendedor_slug', 'usuarios.tipo as vendedor_tipo', 'usuarios.created_at as vendedor_desde');
}

async function conFotos(avisos) {
  if (!avisos.length) return avisos;
  const fotos = await db('aviso_fotos').whereIn('aviso_id', avisos.map((a) => a.id)).orderBy('orden');
  const map = {};
  for (const f of fotos) (map[f.aviso_id] ||= []).push(f);
  for (const a of avisos) { a.fotos = map[a.id] || []; a.foto = a.fotos[0] || null; a.ficha = parseJson(a.ficha_tecnica, {}); }
  return avisos;
}

/** Aplica filtros de búsqueda del querystring. */
function aplicarFiltros(q, f) {
  q.where('avisos.estado', 'activo');
  if (f.q) q.where((b) => b.whereILike('avisos.titulo', `%${f.q}%`).orWhereILike('avisos.descripcion', `%${f.q}%`).orWhereILike('avisos.modelo', `%${f.q}%`).orWhereILike('marcas.nombre', `%${f.q}%`));
  if (f.categoria) q.where('categorias.slug', f.categoria);
  if (f.marca) q.where('marcas.slug', f.marca);
  if (f.provincia) q.where('provincias.slug', f.provincia);
  if (f.estado_maquina) q.where('avisos.estado_maquina', f.estado_maquina);
  if (f.moneda) q.where('avisos.moneda', f.moneda);
  if (f.precio_min) q.where('avisos.precio', '>=', Number(f.precio_min));
  if (f.precio_max) q.where('avisos.precio', '<=', Number(f.precio_max));
  if (f.anio_min) q.where('avisos.anio', '>=', Number(f.anio_min));
  if (f.anio_max) q.where('avisos.anio', '<=', Number(f.anio_max));
  if (f.horas_max) q.where('avisos.horas_uso', '<=', Number(f.horas_max));
  if (f.verificados) q.where('usuarios.tipo', 'profesional');
  if (f.permuta) q.where('avisos.acepta_permuta', true);
  return q;
}

function ordenar(q, orden) {
  const ahora = new Date();
  // Destacados vigentes primero, luego por bump / fecha de publicación
  q.orderByRaw('CASE WHEN avisos.destacado_hasta > ? THEN 0 ELSE 1 END', [ahora]);
  if (orden === 'precio_asc') q.orderBy('avisos.precio', 'asc');
  else if (orden === 'precio_desc') q.orderBy('avisos.precio', 'desc');
  else if (orden === 'anio_desc') q.orderBy('avisos.anio', 'desc');
  else q.orderBy('avisos.bump_at', 'desc');
  return q;
}

async function buscar(f, pagina = 1) {
  const q = aplicarFiltros(baseQuery(), f);
  const countQ = aplicarFiltros(db('avisos').join('categorias', 'categorias.id', 'avisos.categoria_id').leftJoin('marcas', 'marcas.id', 'avisos.marca_id').join('provincias', 'provincias.id', 'avisos.provincia_id').join('usuarios', 'usuarios.id', 'avisos.usuario_id'), f);
  const total = Number((await countQ.count({ c: 'avisos.id' }).first()).c);
  ordenar(q, f.orden);
  const avisos = await q.limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA);
  return { avisos: await conFotos(avisos), total, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)), pagina };
}

async function porId(id) {
  const a = await baseQuery().where('avisos.id', id).first();
  if (!a) return null;
  await conFotos([a]);
  return a;
}

async function similares(aviso, n = 4) {
  const q = baseQuery().where('avisos.estado', 'activo').where('avisos.categoria_id', aviso.categoria_id).whereNot('avisos.id', aviso.id).orderBy('avisos.bump_at', 'desc').limit(n);
  return conFotos(await q);
}

module.exports = { baseQuery, conFotos, buscar, porId, similares, POR_PAGINA };
