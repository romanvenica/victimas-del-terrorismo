# Facturación electrónica (ARCA, ex AFIP)

Cada cobro aprobado debe tener factura electrónica. Hoy `src/services/facturacion.js` crea la fila en `facturas` (tipo A si el comprador es profesional, B si es consumidor final; C si el titular es monotributista) y deja `cae` vacío. Nada se pierde: los pagos sin CAE se ven en `/admin/pagos` (columna Factura) y en `/pagos` como "En emisión".

## Opción 1: proveedor con API (más rápido)

Servicios como TusFacturas, Facturante o Afipsdk exponen una API REST: se envía CUIT/DNI del comprador, concepto, importe y devuelven CAE, número y PDF. Implementación: en `emitir()` hacer el `fetch` al proveedor y guardar `cae`, `numero` y `pdf_url`. Costo: cuota mensual baja; evita manejar certificados.

## Opción 2: WSFE directo

1. Alta en ARCA: punto de venta "Web service", certificado digital (WSASS) asociado al servicio `wsfe`.
2. Autenticación WSAA: firmar un ticket (CMS con OpenSSL) y obtener token/sign válidos 12 h.
3. Llamar `FECAESolicitar` con el comprobante; guardar CAE y vencimiento.
4. Generar el PDF con código QR según RG 4291 (el QR codifica un JSON base64 con CUIT, fecha, tipo, número, importe, CAE).

Librerías Node: `afip.js` (SDK comunitario) simplifica WSAA/WSFE.

## Datos que el flujo ya guarda

- `pagos`: usuario, concepto, monto, estado, id de pago de Mercado Pago.
- `usuarios.tipo` y `empresas.cuit` / `razon_social` para facturas A.
- Para facturas B a consumidor final no hace falta DNI si el importe es menor al tope vigente; por encima hay que pedir DNI (agregar campo en el checkout).

## Contabilidad

- Mercado Pago retiene comisiones e impuestos; conciliar con el reporte de MP.
- Conservar facturas y pagos 10 años (ya se conservan aunque el usuario elimine la cuenta).
- Si se vende a inscriptos en IVA, la factura A requiere que el titular sea responsable inscripto; como monotributista se emite C.
