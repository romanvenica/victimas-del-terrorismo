const express = require('express');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const db = require('../db');
const config = require('../config');
const avisosSrv = require('../services/avisos');

const router = express.Router();

router.get('/', async (req, res) => {
  const ahora = new Date();
  const destacados = await avisosSrv.conFotos(await avisosSrv.baseQuery().where('avisos.estado', 'activo').where('avisos.destacado_hasta', '>', ahora).orderBy('avisos.bump_at', 'desc').limit(8));
  const recientes = await avisosSrv.conFotos(await avisosSrv.baseQuery().where('avisos.estado', 'activo').orderBy('avisos.fecha_publicacion', 'desc').limit(12));
  const total = Number((await db('avisos').where('estado', 'activo').count({ c: '*' }).first()).c);
  const porCategoria = await db('avisos').where('estado', 'activo').groupBy('categoria_id').select('categoria_id').count({ c: '*' });
  const conteo = Object.fromEntries(porCategoria.map((r) => [r.categoria_id, Number(r.c)]));
  const provincias = await db('provincias').orderBy('nombre');
  res.render('home', { destacados, recientes, total, conteo, provincias });
});

async function renderBusqueda(req, res, filtrosFijos = {}) {
  const f = { ...req.query, ...filtrosFijos };
  const pagina = Math.max(1, parseInt(req.query.pagina || '1', 10) || 1);
  const resultado = await avisosSrv.buscar(f, pagina);
  const [marcas, provincias] = await Promise.all([db('marcas').orderBy('nombre'), db('provincias').orderBy('nombre')]);
  const categoriaActual = f.categoria ? res.locals.categorias.find((c) => c.slug === f.categoria) : null;
  const marcaActual = f.marca ? marcas.find((m) => m.slug === f.marca) : null;
  let titulo = 'Buscar maquinaria';
  if (categoriaActual && marcaActual) titulo = `${categoriaActual.nombre} ${marcaActual.nombre}`;
  else if (categoriaActual) titulo = categoriaActual.nombre;
  else if (marcaActual) titulo = `Maquinaria ${marcaActual.nombre}`;
  if (f.provincia) { const p = provincias.find((x) => x.slug === f.provincia); if (p) titulo += ` en ${p.nombre}`; }
  res.render('buscar', { ...resultado, filtros: f, marcas, provincias, titulo, categoriaActual, marcaActual });
}

router.get('/buscar', (req, res) => renderBusqueda(req, res));
router.get('/categoria/:slug', (req, res) => renderBusqueda(req, res, { categoria: req.params.slug }));
router.get('/marca/:slug', (req, res) => renderBusqueda(req, res, { marca: req.params.slug }));
router.get('/provincia/:slug', (req, res) => renderBusqueda(req, res, { provincia: req.params.slug }));

router.get('/aviso/:id{/:slug}', async (req, res) => {
  const aviso = await avisosSrv.porId(req.params.id);
  const esDueno = req.user && aviso && aviso.usuario_id === req.user.id;
  const esStaff = req.user && ['admin', 'moderador'].includes(req.user.rol);
  if (!aviso || (aviso.estado !== 'activo' && !esDueno && !esStaff)) return res.status(404).render('error', { titulo: 'Aviso no disponible', mensaje: 'Este aviso ya no está publicado.' });
  if (aviso.estado === 'activo' && !esDueno) db('avisos').where('id', aviso.id).increment('visitas', 1).catch(() => {});
  const telefono = await db('telefonos').where('id', aviso.telefono_id).first();
  const stats = await db('avisos').where({ usuario_id: aviso.usuario_id, estado: 'activo' }).count({ c: '*' }).first();
  const esFavorito = req.user ? !!(await db('favoritos').where({ usuario_id: req.user.id, aviso_id: aviso.id }).first()) : false;
  const similares = await avisosSrv.similares(aviso);
  const categoria = res.locals.categorias.find((c) => c.id === aviso.categoria_id);
  res.render('aviso', {
    aviso, telefonoMask: telefono ? res.locals.maskPhone(telefono.numero_e164) : '', telefonoVerificado: !!(telefono && telefono.verificado), similares, esDueno, esFavorito,
    avisosVendedor: Number(stats.c), camposFicha: JSON.parse(categoria.campos_ficha || '[]'),
    titulo: aviso.titulo, descripcionMeta: aviso.descripcion.slice(0, 155),
  });
});

router.get('/vendedor/:slug', async (req, res) => {
  const v = await db('usuarios').where({ slug: req.params.slug, estado: 'activo' }).first();
  if (!v) return res.status(404).render('error', { titulo: 'Vendedor no encontrado', mensaje: '' });
  const empresa = await db('empresas').where('usuario_id', v.id).first();
  const avisos = await avisosSrv.conFotos(await avisosSrv.baseQuery().where({ 'avisos.usuario_id': v.id, 'avisos.estado': 'activo' }).orderBy('avisos.bump_at', 'desc'));
  res.render('vendedor', { vendedor: v, empresa, avisos, titulo: empresa ? empresa.nombre_fantasia || empresa.razon_social : v.nombre });
});

// Páginas legales y de ayuda desde archivos Markdown en /legal
const LEGAL = { terminos: 'Términos y condiciones', privacidad: 'Política de privacidad', arrepentimiento: 'Botón de arrepentimiento', 'consejos-de-seguridad': 'Consejos de seguridad', 'como-publicar': 'Cómo publicar', ayuda: 'Ayuda', contacto: 'Contacto' };
for (const [slug, tituloPagina] of Object.entries(LEGAL)) {
  router.get(`/${slug}`, (req, res) => {
    const file = path.join(__dirname, '..', '..', 'legal', `${slug}.md`);
    const md = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# ${tituloPagina}\n\nContenido pendiente.`;
    res.render('legal/pagina', { titulo: tituloPagina, html: marked.parse(md.replaceAll('{{SITE}}', config.siteName).replaceAll('{{URL}}', config.baseUrl)) });
  });
}

router.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /mi-cuenta\nDisallow: /api\nSitemap: ${config.baseUrl}/sitemap.xml\n`));
router.get('/sitemap.xml', async (req, res) => {
  const avisos = await db('avisos').where('estado', 'activo').select('id', 'slug', 'updated_at').orderBy('updated_at', 'desc').limit(5000);
  const urls = [`${config.baseUrl}/`, ...res.locals.categorias.map((c) => `${config.baseUrl}/categoria/${c.slug}`), ...avisos.map((a) => `${config.baseUrl}/aviso/${a.id}/${a.slug}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`);
});

module.exports = router;
