# Monetización

Publicar es gratis para que el catálogo crezca. Se cobra por visibilidad y por herramientas para empresas, nunca por la venta.

## Implementado

| Concepto | Qué hace | Precio (`.env`) | Dónde |
|---|---|---|---|
| Destacado 7 / 15 / 30 días | Aparece primero en listados y portada, con etiqueta y borde | `PRECIO_DESTACADO_7/15/30` | `/pagos/destacar/:avisoId` |
| Subir al inicio (bump) | Actualiza `bump_at`: vuelve arriba como recién publicado | `PRECIO_BUMP` | ídem |
| Planes empresa (básico / pro) | Quitan el cupo de avisos y marcan sello Empresa | Se asignan desde `/admin/usuarios` (cobro manual o transferencia); a futuro: suscripción MP | `empresas.plan`, `plan_vence` |

Los destacados se acumulan: si un aviso ya está destacado, el nuevo período se suma al vencimiento. Los precios se muestran en ARS con impuestos incluidos.

## Flujo de pago (Mercado Pago Checkout Pro)

1. El usuario elige el concepto → se crea un registro en `pagos` (estado `pendiente`) y una preferencia en MP con `external_reference = pagos.id` y `notification_url = BASE_URL/pagos/webhook`.
2. Redirección al checkout de MP.
3. MP notifica al webhook. La app valida la firma, consulta `/v1/payments/:id`, actualiza `pagos.estado` y, si está aprobado, aplica el beneficio y crea la factura (pendiente de emisión ARCA).
4. La vuelta al sitio (`/pagos/retorno`) solo informa; la verdad la pone el webhook.

Configuración: credenciales de producción en https://www.mercadopago.com.ar/developers → `MP_ACCESS_TOKEN`; en la sección Webhooks configurar la URL `https://tu-dominio/pagos/webhook`, evento "Pagos", y copiar la clave secreta a `MP_WEBHOOK_SECRET`. Para probar usar credenciales de prueba y tarjetas de prueba de MP.

## Cómo cambiar precios

Editar `PRECIO_*` en `.env` y reiniciar. Los pagos ya creados guardan el monto al momento de crearse.

## Ideas siguientes (no implementadas)

- **Suscripción mensual** para concesionarios con MP Suscripciones (`preapproval`): plan básico (hasta 30 avisos, sello, perfil con logo) y pro (ilimitado, 2 destacados/mes, estadísticas).
- **Leads calificados**: botón "Quiero financiación" / "Cotizar seguro" / "Cotizar flete" en la ficha que envía el contacto a un partner (banco, aseguradora, transportista) y cobra por lead.
- **Inspección técnica y tasación** a demanda con talleres asociados: comisión por servicio.
- **Publicidad de marcas** en categorías (banner por fabricante o concesionario oficial) vendida directamente, sin redes de anuncios.
- **Informe de dominio** vinculado al aviso para máquinas patentadas.

## Reglas de negocio actuales

- Cupo: 3 avisos activos el primer mes de la cuenta, 9 después, sin límite con plan.
- Duración: 60 días, renovación gratis ilimitada.
- Derecho de arrepentimiento: 10 días (ver `legal/arrepentimiento.md`); reintegro proporcional por Mercado Pago.
