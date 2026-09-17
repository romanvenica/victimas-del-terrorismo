# AgroMarket — marketplace de maquinaria agrícola usada (Argentina)

Clasificados de maquinaria agrícola con **contacto directo por WhatsApp**. Cada persona publica su máquina con fotos y su número; los interesados tocan "Ver teléfono / WhatsApp" y hablan directo con quien vende. La plataforma **no interviene en la compraventa**: no cobra comisión, no intermedia pagos ni entregas. Solo conecta.

Estado: aplicación completa y probada (registro, publicación con fotos, búsqueda con filtros, ficha con teléfono protegido contra robots, favoritos, alertas por email, reportes, panel de moderación, páginas legales). Los servicios que cuestan dinero (verificación por código, cobros por destacados, factura electrónica) están apagados por defecto y se activan por configuración cuando haga falta.

## Arranque en 1 minuto (desarrollo, solo Node 20+)

```bash
cp .env.example .env && npm install && npm start
```

Abrir http://localhost:3000. En desarrollo usa SQLite (`data/dev.sqlite`), carga solo los datos base (provincias, categorías, marcas) y los emails se imprimen en la consola.

Administrador: `node scripts/crear-admin.js admin@ejemplo.com "UnaContraseñaLarga"` (o definir `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env`: se crea al arrancar).

Prueba completa: `npm test` (levanta la app, registra un usuario, publica una máquina con fotos y WhatsApp, revela el teléfono como comprador y cambia el número desde Mi cuenta).

## Cómo funciona el contacto

1. El vendedor crea cuenta (email y contraseña), publica la máquina con fotos y **escribe su WhatsApp** (celular argentino, se normaliza y valida).
2. El número **no viaja en el HTML** del aviso: se muestra enmascarado (`11 23** ****`). Al tocar "Ver teléfono / WhatsApp" se pide al servidor, que registra el contacto, limita a 20 por día por IP y (si está configurado) exige el CAPTCHA invisible Turnstile. Devuelve el link `wa.me` con mensaje precargado y, si el vendedor lo aceptó, `tel:`.
3. Los compradores no necesitan cuenta para buscar ni para contactar.
4. Cualquiera puede **reportar** un aviso; con 3 reportes graves en 7 días se pausa solo. La primera publicación de cada cuenta y los avisos con señales de riesgo (fotos copiadas, precio irreal, palabras de estafa) van a revisión manual en `/admin/moderacion`.

## Modos de configuración (`.env`)

| Variable | Valores | Qué cambia |
|---|---|---|
| `TELEFONO_VERIFICACION` | `ninguna` (por defecto) · `otp` | `ninguna`: el vendedor escribe su WhatsApp al publicar, sin costo. `otp`: tiene que confirmarlo con un código por WhatsApp/SMS (requiere `OTP_PROVIDER=meta` o `twilio`, que cobran por mensaje). Los avisos muestran "Teléfono verificado" solo cuando fue verificado. |
| `MODERAR_PRIMER_AVISO` | `si` (por defecto) · `no` | Revisar a mano la primera publicación de cada cuenta. Los avisos con puntaje de riesgo alto van a revisión igual. |
| `STORAGE` | `local` (por defecto) · `s3` | Dónde se guardan las fotos: disco del servidor, o un bucket compatible S3 (Cloudflare R2 gratis). Obligatorio `s3` en hostings sin disco persistente (Render, Railway, Fly). |
| `DATABASE_URL` | vacío · `postgres://...` | En producción: PostgreSQL si está definida; si no, SQLite en `DATA_DIR/prod.sqlite`. |
| `MP_ACCESS_TOKEN` | vacío · token | Con token aparecen los botones "Destacar" y el cobro por Mercado Pago. Sin token, no hay servicios pagos visibles. |
| `CRON_INTERNO` | `si` (por defecto) · `no` | Tareas diarias (vencer avisos, alertas, limpieza) dentro del mismo proceso; `no` si usás un cron externo (`scripts/vencer-avisos.js`). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | Crea ese usuario como administrador al arrancar (para hostings sin consola). |

Lista completa en [docs/INSTALACION.md](docs/INSTALACION.md).

## Ponerla en línea

- **Gratis, hoy, sin servidor**: Render + Neon + Cloudflare R2. Paso a paso, límites y costos futuros en **[docs/HOSTING-GRATIS.md](docs/HOSTING-GRATIS.md)**. Hay un `render.yaml` con las variables.
- **Servidor propio (VPS)**, gratis en Oracle Cloud o ~US$5/mes: `sudo bash deploy/instalar-vps.sh tu-dominio.com.ar` instala Node, PostgreSQL, Nginx, HTTPS y el servicio. Detalles en [docs/INSTALACION.md](docs/INSTALACION.md).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/HOSTING-GRATIS.md](docs/HOSTING-GRATIS.md) | Cómo alojarla gratis, qué cuesta cada cosa, dominio, costos por etapa, cómo se sostiene |
| [docs/INSTALACION.md](docs/INSTALACION.md) | Requisitos, variables de entorno, desarrollo, producción (VPS y Docker), actualización |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Stack, estructura de carpetas, flujo de una petición, decisiones de diseño |
| [docs/MODELO-DATOS.md](docs/MODELO-DATOS.md) | Tablas, estados de un aviso, relaciones |
| [docs/VERIFICACION-TELEFONO.md](docs/VERIFICACION-TELEFONO.md) | Modos de teléfono, OTP, reveal protegido, puntaje de riesgo, reportes |
| [docs/SEGURIDAD.md](docs/SEGURIDAD.md) | Medidas implementadas y checklist previa a salir a producción |
| [docs/API.md](docs/API.md) | Todas las rutas HTTP (públicas, cuenta, API JSON, pagos, admin) |
| [docs/MONETIZACION.md](docs/MONETIZACION.md) | Destacados, planes, leads; cómo cambiar precios; integración Mercado Pago |
| [docs/FACTURACION.md](docs/FACTURACION.md) | Facturación electrónica ARCA: qué falta integrar y cómo |
| [docs/OPERACION.md](docs/OPERACION.md) | Backups, tareas diarias, logs, monitoreo, moderación diaria, incidentes |
| [docs/LEGAL.md](docs/LEGAL.md) | Trámites y textos legales a completar antes de lanzar |
| [legal/](legal/) | Términos, privacidad, arrepentimiento, consejos, ayuda (Markdown, se sirven como páginas) |
| [demo/index.html](demo/index.html) | Demo estática navegable (abrir en el navegador, sin servidor) para ver el diseño con datos de ejemplo |

## Estructura

```
CLAUDE.md       instrucciones para Claude Code (convenciones, comandos)
render.yaml     variables para Render (hosting gratuito)
demo/           demo estática autónoma (index.html)
src/            app Express (rutas, servicios, middlewares, vistas EJS, CSS/JS)
migrations/     esquema de base (Knex, SQLite o PostgreSQL)
seeds/          provincias, categorías con ficha técnica, marcas
scripts/        crear-admin, vencer-avisos (cron externo), smoke (npm test)
deploy/         Dockerfile, docker-compose, nginx, systemd, instalador VPS, backup
legal/          textos legales y de ayuda en Markdown
docs/           documentación técnica, operativa y de hosting
```

## Qué falta para operar (no bloquea el lanzamiento)

- **Textos legales**: completar los campos `[completar]` en `legal/` con tus datos y hacerlos revisar por un abogado (ver docs/LEGAL.md).
- **Emails reales**: `EMAIL_PROVIDER=smtp` con Brevo (300/día gratis) para que lleguen la confirmación de cuenta y la recuperación de contraseña.
- **Turnstile**: claves gratuitas de Cloudflare para frenar robots que cosechan teléfonos.
- Cuando haya volumen: verificación por código (`TELEFONO_VERIFICACION=otp` + Meta o Twilio), destacados con Mercado Pago, factura electrónica (`src/services/facturacion.js` es un stub).
- Opcionales: login con Google, verificación de DNI, app móvil.
