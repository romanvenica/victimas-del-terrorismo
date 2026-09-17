const db = require('../db');
const { hashIp } = require('../utils');
async function registrar({ actorId, accion, entidad, entidadId, detalle, ip }) {
  await db('auditoria').insert({ actor_id: actorId || null, accion, entidad, entidad_id: String(entidadId || ''), detalle: typeof detalle === 'string' ? detalle : JSON.stringify(detalle || {}), ip_hash: hashIp(ip) });
}
module.exports = { registrar };
