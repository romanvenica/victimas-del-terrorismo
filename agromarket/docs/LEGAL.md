# Trámites y textos legales antes de lanzar

Los textos en `legal/` son modelos base con marcadores `[completar]`. Requieren revisión de un abogado. Este es el checklist:

## Estructura jurídica y fiscal
- [ ] Definir titular: persona física (monotributo) o sociedad (SAS es lo habitual para una plataforma). Inscripción en ARCA con actividad de servicios de internet/publicidad.
- [ ] Alta de punto de venta electrónico y certificado para facturación (ver FACTURACION.md).
- [ ] Ingresos Brutos en la jurisdicción del titular (y Convenio Multilateral si hay clientes en varias provincias).

## Protección de datos (Ley 25.326)
- [ ] Inscribir la base de datos en el Registro Nacional de Bases de Datos (AAIP, trámite gratuito en línea).
- [ ] Completar responsable, domicilio y email en `legal/privacidad.md`.
- [ ] Incluir en el pie el leyenda obligatoria de la AAIP (ya está en privacidad.md).
- [ ] Designar quién responde pedidos de acceso/supresión (plazo legal: 10 días hábiles para acceso, 5 para rectificación/supresión).

## Defensa del consumidor (Ley 24.240)
- [ ] Botón de arrepentimiento visible (Res. 424/2020): ya está en el pie y en `/arrepentimiento`; completar el email.
- [ ] Precios finales con impuestos incluidos en pesos (ya se muestran así).
- [ ] Link a "Defensa del consumidor" (https://www.argentina.gob.ar/produccion/defensadelconsumidor) recomendable en el pie.
- [ ] Datos del titular (razón social, CUIT, domicilio) visibles en Contacto.

## Términos y condiciones
- [ ] Completar jurisdicción, email legal y datos del titular en `legal/terminos.md`.
- [ ] Revisar con abogado la cláusula de no intermediación y limitación de responsabilidad (marketplaces de clasificados: jurisprudencia sobre responsabilidad del intermediario).
- [ ] Política de contenidos prohibidos (ya incluida) y de sanciones.

## Marca y dominio
- [ ] Registrar el nombre en INPI (clase 35 servicios de publicidad/comercio electrónico y 42 software).
- [ ] Dominio `.com.ar` en NIC Argentina a nombre del titular.

## Mensajería
- [ ] Cuenta de WhatsApp Business (Meta) verificada; plantilla de autenticación aprobada. Solo se envía OTP y notificaciones del servicio: no marketing sin consentimiento.
- [ ] Emails: dominio con SPF, DKIM y DMARC; enlace de baja en alertas (ya incluido).

## Pagos
- [ ] Cuenta de Mercado Pago a nombre del titular; credenciales de producción.
- [ ] Términos de MP para marketplaces no aplican (no se cobra por cuenta de terceros).

## Otros
- [ ] Aviso de cookies: solo se usan cookies técnicas, no hace falta banner de consentimiento, pero está informado en privacidad.
- [ ] Menores: el registro exige declarar mayoría de edad.
- [ ] Guardar copia fechada de cada versión de los textos legales publicados.
