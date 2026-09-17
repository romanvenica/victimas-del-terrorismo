/**
 * Facturación electrónica ARCA (ex AFIP).
 * Punto de integración: reemplazar `emitir` por la llamada real al web service WSFE
 * (o a un proveedor con API). Ver docs/FACTURACION.md. Por ahora deja constancia
 * de que la factura está pendiente de emisión para que nunca se pierda un cobro sin facturar.
 */
const db = require('../db');
const { uuid } = require('../utils');

async function emitir({ pago, usuario }) {
  const tipo = usuario && usuario.tipo === 'profesional' ? 'A' : 'B';
  const id = uuid();
  await db('facturas').insert({ id, pago_id: pago.id, tipo, cae: '', numero: '', pdf_url: '' });
  await db('pagos').where('id', pago.id).update({ factura_id: id });
  console.log(`[FACTURA] pendiente de emisión ARCA: pago ${pago.id}, tipo ${tipo}, monto ${pago.monto}`);
  return id;
}

module.exports = { emitir };
