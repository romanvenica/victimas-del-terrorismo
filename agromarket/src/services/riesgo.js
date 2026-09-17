/**
 * Puntaje de riesgo automático de una publicación.
 * Por encima de config.reglas.riesgoUmbral el aviso queda en revisión manual.
 */
const db = require('../db');
const { distanciaHamming } = require('./images');

const PALABRAS = ['seña', 'sena ', 'transferencia previa', 'reserva con', 'exterior', 'western union', 'anticipo', 'deposito previo', 'depósito previo', 'urgente', 'liquido', 'liquidación por viaje'];

async function evaluar({ usuario, aviso, fotos }) {
  const senales = [];
  let puntaje = 0;

  const diasCuenta = (Date.now() - new Date(usuario.created_at).getTime()) / 86400000;
  if (diasCuenta < 7) { puntaje += 20; senales.push('Cuenta con menos de 7 días'); }
  if (usuario.avisos_publicados === 0) { puntaje += 15; senales.push('Primera publicación'); }

  if (fotos.length < 3) { puntaje += 15; senales.push('Menos de 3 fotos'); }
  if ((aviso.descripcion || '').length < 80) { puntaje += 10; senales.push('Descripción muy corta'); }

  const texto = `${aviso.titulo} ${aviso.descripcion}`.toLowerCase();
  const hit = PALABRAS.filter((p) => texto.includes(p));
  if (hit.length) { puntaje += 25; senales.push(`Palabras sospechosas: ${hit.join(', ')}`); }

  // Precio muy por debajo de la mediana de avisos activos del mismo modelo / marca
  if (aviso.precio && aviso.marca_id) {
    const q = db('avisos').where({ estado: 'activo', marca_id: aviso.marca_id, moneda: aviso.moneda }).whereNotNull('precio');
    if (aviso.modelo) q.where('modelo', aviso.modelo);
    const precios = (await q.select('precio')).map((r) => Number(r.precio)).sort((a, b) => a - b);
    if (precios.length >= 3) {
      const mediana = precios[Math.floor(precios.length / 2)];
      if (Number(aviso.precio) < mediana * 0.5) { puntaje += 30; senales.push(`Precio menor al 50% de la mediana (${mediana})`); }
    }
  }

  // Fotos ya usadas en avisos de otros usuarios (hash perceptual con tolerancia)
  if (fotos.length) {
    const otras = await db('aviso_fotos').join('avisos', 'avisos.id', 'aviso_fotos.aviso_id')
      .whereNot('avisos.usuario_id', usuario.id).whereNot('aviso_fotos.hash_perceptual', '')
      .select('aviso_fotos.hash_perceptual', 'avisos.id as aviso_id').limit(5000);
    let dup = 0;
    for (const f of fotos) for (const o of otras) if (distanciaHamming(f.hash_perceptual, o.hash_perceptual) <= 6) { dup++; break; }
    if (dup) { puntaje += 40; senales.push(`${dup} foto(s) coinciden con avisos de otros usuarios`); }
  }

  // Prefijo del teléfono distinto a la provincia (señal débil)
  return { puntaje, senales };
}

module.exports = { evaluar };
