/**
 * Tareas diarias:
 *  1. Avisa por email 5 días antes del vencimiento.
 *  2. Pasa a "vencido" los avisos cuya fecha de vencimiento ya pasó.
 *  3. Envía las alertas de búsqueda con avisos nuevos.
 *  4. Borra registros de contacto de más de 90 días, OTP vencidos y tokens viejos.
 * Se ejecuta desde scripts/vencer-avisos.js (cron externo) o desde el propio servidor si CRON_INTERNO=si.
 */
const db = require('../db');
const config = require('../config');
const email = require('./email');
const avisosSrv = require('./avisos');
const { parseJson, addDays } = require('../utils');

async function correr() {
  const ahora = new Date();
  const proximos = await db('avisos').join('usuarios', 'usuarios.id', 'avisos.usuario_id').where('avisos.estado', 'activo')
    .whereBetween('avisos.fecha_vencimiento', [addDays(ahora, 4), addDays(ahora, 5)]).select('avisos.id', 'avisos.titulo', 'avisos.slug', 'usuarios.email');
  for (const a of proximos) await email.enviar({ to: a.email, subject: `Tu aviso "${a.titulo}" vence en 5 días`, text: `Renovalo gratis desde ${config.baseUrl}/mis-avisos para que siga visible.` });

  const vencidos = await db('avisos').where('estado', 'activo').where('fecha_vencimiento', '<', ahora).select('id');
  if (vencidos.length) await db('avisos').whereIn('id', vencidos.map((v) => v.id)).update({ estado: 'vencido', updated_at: ahora });

  const alertas = await db('alertas').join('usuarios', 'usuarios.id', 'alertas.usuario_id').where('alertas.activa', true).select('alertas.*', 'usuarios.email');
  let enviadas = 0;
  for (const al of alertas) {
    const filtros = parseJson(al.filtros, {});
    const desde = al.ultimo_envio ? new Date(al.ultimo_envio) : addDays(ahora, -1);
    const { avisos } = await avisosSrv.buscar(filtros, 1);
    const nuevos = avisos.filter((a) => a.fecha_publicacion && new Date(a.fecha_publicacion) > desde).slice(0, 10);
    if (!nuevos.length) continue;
    await email.enviar({ to: al.email, subject: `${nuevos.length} máquina(s) nueva(s) para "${al.nombre}"`, text: nuevos.map((a) => `- ${a.titulo} · ${a.provincia} · ${config.baseUrl}/aviso/${a.id}/${a.slug}`).join('\n') + `\n\nAdministrá tus alertas en ${config.baseUrl}/alertas` });
    await db('alertas').where('id', al.id).update({ ultimo_envio: ahora });
    enviadas++;
  }

  const contactos = await db('contactos').where('created_at', '<', addDays(ahora, -90)).del();
  const otps = await db('otp_codigos').where('expira', '<', addDays(ahora, -1)).del();
  const tokens = await db('tokens').where('expira', '<', addDays(ahora, -7)).del();
  const resumen = { vencidos: vencidos.length, avisados: proximos.length, alertas: enviadas, limpieza: { contactos, otps, tokens } };
  console.log(`[mantenimiento] ${JSON.stringify(resumen)}`);
  return resumen;
}

/** Programa la corrida diaria dentro del proceso (primera corrida a los 2 minutos de arrancar). */
function programar() {
  const DIA = 24 * 3600 * 1000;
  const seguro = () => correr().catch((e) => console.error('[mantenimiento]', e));
  setTimeout(seguro, 2 * 60 * 1000).unref();
  setInterval(seguro, DIA).unref();
}

module.exports = { correr, programar };
