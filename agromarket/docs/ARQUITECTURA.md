# Arquitectura

## Stack

| Capa | Elección | Motivo |
|---|---|---|
| Runtime | Node.js 22, JavaScript CommonJS | Sin paso de compilación; un `npm start` y anda. |
| Web | Express 5 + EJS (server-side rendering) | HTML plano indexable por Google, rápido en móviles con datos limitados, sin framework front. |
| Base de datos | Knex: SQLite (dev) / PostgreSQL (prod) | Mismo código y migraciones para ambas. En SQLite las fechas se guardan como texto UTC uniforme (ver `src/db.js`). |
| Sesiones | express-session + connect-session-knex | Cookie `am.sid` httpOnly, SameSite=Lax, Secure en prod; sesiones en la base (tabla `sessions`). |
| Seguridad | helmet (CSP estricta), CSRF propio, express-rate-limit (+ Redis), bcrypt, zod | Ver SEGURIDAD.md. |
| Imágenes | multer (memoria) + sharp + `services/storage.js` | Validación por contenido, recompresión, sin EXIF, miniaturas, hash perceptual. Guardado en disco local o en un bucket S3 (Cloudflare R2) según `STORAGE`. |
| Mensajería | WhatsApp Cloud API / Twilio / consola | Abstracción en `services/messaging.js`. |
| Email | nodemailer (SMTP) / consola | `services/email.js`. |
| Pagos | Mercado Pago Checkout Pro (REST vía fetch) | Sin SDK; webhook firmado. |
| Front | CSS propio (tokens) + JS vanilla | Sin build. Fuente Barlow. Mobile-first; barra de contacto fija en móvil. |

## Estructura

```
src/
  app.js              configuración de Express: seguridad, sesión, CSRF, locals, rutas, errores
  server.js           arranque (migra y escucha)
  config.js           lectura de .env con defaults
  db.js               instancia de Knex (+ adaptación de fechas para SQLite)
  utils.js            uuid, slug, hash de IP, formato de precio, máscara de teléfono
  middleware/
    auth.js           cargarUsuario, requerirLogin, requerirRol
    csrf.js           token por sesión; verificación post-multer para multipart
    ratelimit.js      límites por ruta (general, login, registro, otp, revelar, publicar, reportar)
    upload.js         multer en memoria con filtro de tipo y tamaño
    validate.js       validación zod → req.datos
    flash.js          mensajes de un solo uso
  services/
    otp.js            normalización AR, envío con límites, verificación, un número por cuenta
    messaging.js      proveedores de envío de OTP
    email.js          envío de emails
    images.js         procesamiento de fotos y dHash
    storage.js        dónde se guardan las fotos: disco local o bucket S3/R2
    mantenimiento.js  tareas diarias (vencer, alertas, limpieza); cron interno o externo
    admin.js          creación del administrador inicial
    riesgo.js         puntaje de riesgo de una publicación
    avisos.js         consultas de búsqueda/listado compartidas
    turnstile.js      verificación del CAPTCHA
    mercadopago.js    preferencia, firma del webhook, consulta de pago
    facturacion.js    punto de integración ARCA (stub)
    auditoria.js      registro de acciones
  routes/
    publico.js        home, búsqueda, ficha, vendedor, páginas legales, robots, sitemap
    auth.js           registro, login, recuperación, verificación de email y teléfono
    cuenta.js         mi cuenta, empresa, mis avisos, publicar/editar, favoritos, alertas, pagos
    api.js            JSON: revelar teléfono, reportar, favorito, marcas
    pagos.js          destacar/bump → Mercado Pago; retorno
    webhook.js        notificaciones de Mercado Pago (sin sesión/CSRF)
    admin.js          dashboard, moderación, reportes, usuarios, listas negras, pagos
  views/              EJS (partials/head+foot+card, home, buscar, aviso, vendedor, auth/, cuenta/, admin/, legal/)
  public/             css/app.css, js/app.js, img/favicon.svg
```

## Flujo de una petición

1. Nginx termina TLS, sirve `/uploads` y `/static` directo, y pasa el resto a Node con `X-Forwarded-*` (`trust proxy` activado).
2. `helmet` agrega cabeceras y la CSP (`script-src 'self' challenges.cloudflare.com`; no hay scripts inline).
3. `/pagos/webhook` se monta antes de la sesión: no usa cookies ni CSRF, valida la firma de Mercado Pago.
4. Parseo de body → sesión → locals (categorías, formateadores, config pública) → rate limit general → flash → usuario → CSRF.
5. Routers por orden: `auth`, `cuenta` (rutas privadas, antes que las públicas para que `/aviso/:id/editar` gane a `/aviso/:id/:slug`), `publico`, `/api`, `/pagos`, `/admin`.
6. 404 y manejador de errores (mensajes genéricos en producción; JSON si el cliente pide JSON).

## Decisiones de diseño

- **El teléfono nunca viaja en el HTML.** La ficha muestra una máscara; `POST /api/aviso/:id/telefono` lo devuelve tras Turnstile + límite diario y registra el contacto (ver VERIFICACION-TELEFONO.md).
- **IDs UUID como texto** en todas las tablas de usuario: no se pueden enumerar desde la URL.
- **Fechas en UTC.** SQLite guarda texto `YYYY-MM-DD HH:MM:SS.mmm`; PostgreSQL `timestamp`. Las vistas formatean con `toLocaleDateString('es-AR')`.
- **Estados del aviso** (ver MODELO-DATOS.md) y **moderación previa** solo cuando hace falta: primera publicación de la cuenta o puntaje de riesgo ≥ umbral; el resto sale al instante.
- **Sin dependencia de JS para lo esencial.** Buscar, ver avisos, registrarse y publicar funcionan sin JS; el JS agrega la revelación del teléfono, galería, favoritos, reportes y ficha dinámica.
- **Fotos** en `UPLOAD_DIR/avisos/<avisoId>/` (`STORAGE=local`) o en un bucket S3/R2 con la misma clave (`STORAGE=s3`, necesario en hostings sin disco). `services/storage.js` es el único punto que sabe dónde están.
- **Teléfono de contacto** en dos modos (`TELEFONO_VERIFICACION`): sin código (el vendedor lo escribe) o con OTP. Ver VERIFICACION-TELEFONO.md.
- **Escalado:** varios procesos Node detrás de Nginx comparten sesiones (base) y límites (Redis). Las fotos en un bucket permiten varios servidores.
