# Instalación

## Requisitos

- Node.js 20 o superior (probado con 22).
- Desarrollo: nada más (SQLite embebido).
- Producción: un dominio con HTTPS (la cookie de sesión solo viaja por HTTPS). PostgreSQL 14+ es opcional (sin `DATABASE_URL` usa SQLite en `DATA_DIR`); Redis opcional; Nginx o Caddy si es un VPS.
- Hosting gratuito sin servidor (Render + Neon + Cloudflare R2): ver [HOSTING-GRATIS.md](HOSTING-GRATIS.md).

## Desarrollo

```bash
cp .env.example .env
npm install
npm start          # o npm run dev (reinicia al guardar). Aplica migraciones y carga los datos base solo.
```

- Web: http://localhost:3000
- Los códigos OTP salen en la consola: `[OTP] +549... -> código 123456`.
- Los emails salen en la consola: `[EMAIL] a ... | asunto`.
- Admin: `node scripts/crear-admin.js admin@ejemplo.com "ContraseñaLarga"` y entrar por `/ingresar` → menú → Administración.

## Variables de entorno (.env)

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `development` (SQLite) o `production` (PostgreSQL). |
| `BASE_URL` | URL pública, sin barra final. Se usa en emails, sitemap y retornos de pago. |
| `SESSION_SECRET` | Clave larga aleatoria (`openssl rand -hex 32`). Firma sesiones y hashea IPs. |
| `DATABASE_URL` | Producción. Si empieza con `postgres://` usa PostgreSQL (Neon: incluir `?sslmode=require`); vacía = SQLite en `DATA_DIR/prod.sqlite`. |
| `DATA_DIR` | Carpeta de las bases SQLite (`./data`). |
| `TELEFONO_VERIFICACION` | `ninguna` (el vendedor escribe su WhatsApp, por defecto) o `otp` (código por WhatsApp/SMS, requiere proveedor). |
| `MODERAR_PRIMER_AVISO` | `si`/`no`: revisar a mano la primera publicación de cada cuenta. |
| `CRON_INTERNO` | `si`/`no`: tareas diarias dentro del proceso (por defecto sí; `no` si hay cron externo). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Si están definidos, al arrancar se crea (o promueve) ese usuario como administrador. |
| `STORAGE` | `local` (carpeta `UPLOAD_DIR`) o `s3` (bucket compatible S3: Cloudflare R2, B2, AWS). |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` | Credenciales del bucket y URL pública sin barra final (R2: `https://pub-xxxx.r2.dev`). |
| `REDIS_URL` | Opcional. Si está, los límites de tasa se comparten entre procesos. |
| `OTP_PROVIDER` | `console`, `meta` (WhatsApp Cloud API) o `twilio` (SMS). |
| `META_WA_TOKEN`, `META_WA_PHONE_ID`, `META_WA_TEMPLATE` | Credenciales de WhatsApp Cloud API y nombre de la plantilla de autenticación aprobada. |
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` | Credenciales Twilio para SMS. Si están, el canal "SMS" del formulario usa Twilio aunque `OTP_PROVIDER=meta`. |
| `EMAIL_PROVIDER` | `console` o `smtp`. |
| `SMTP_*`, `EMAIL_FROM` | Servidor SMTP (Brevo, Amazon SES, Mailgun, etc.). |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Cloudflare Turnstile. Vacío = desactivado. |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Mercado Pago (credenciales de producción y clave secreta del webhook). |
| `UPLOAD_DIR` | Carpeta de fotos con `STORAGE=local`. Nginx puede servirla directo en `/uploads/`. |
| `MAX_FOTOS`, `MAX_FOTO_MB` | Límites de subida. |
| `AVISO_DIAS` | Duración de un aviso (60). |
| `AVISOS_GRATIS_CUENTA_NUEVA` | Cupo de avisos activos el primer mes (3; luego se triplica). |
| `OTP_MINUTOS` | Vigencia del código (10). |
| `REVEAL_POR_DIA` | Teléfonos que puede revelar una IP por día (20). |
| `RIESGO_UMBRAL` | Puntaje a partir del cual un aviso va a revisión manual (50). |
| `PRECIO_DESTACADO_7/15/30`, `PRECIO_BUMP` | Precios en ARS de los servicios pagos. |

## Producción sin servidor (Render + Neon + R2, gratis)

Paso a paso en [HOSTING-GRATIS.md](HOSTING-GRATIS.md). Resumen: Web Service en Render con `npm ci` / `npm start`, `NODE_ENV=production`, `DATABASE_URL` de Neon, `STORAGE=s3` con un bucket de R2, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, health check en `/salud`. Las migraciones, los datos base y el administrador se aplican solos al arrancar; las tareas diarias corren dentro del proceso.

## Producción en VPS

Un VPS de 2 vCPU / 2 GB alcanza para los primeros miles de avisos.

```bash
git clone <repo> agromarket && cd agromarket
sudo bash deploy/instalar-vps.sh tu-dominio.com.ar
```

El script:
1. Instala Node 22, PostgreSQL, Redis, Nginx y Certbot.
2. Crea el usuario de sistema `agromarket` y copia el código a `/opt/agromarket`.
3. Crea la base y el rol de PostgreSQL con contraseña aleatoria y genera `.env` con `SESSION_SECRET` y `DATABASE_URL`.
4. Corre migraciones y seeds.
5. Instala `agromarket.service` (app) y `agromarket-cron.timer` (diario 06:00).
6. Configura Nginx (proxy + fotos estáticas) y pide el certificado Let's Encrypt.

Después:

```bash
sudo nano /opt/agromarket/.env        # OTP_PROVIDER, SMTP, TURNSTILE, MP_ACCESS_TOKEN
sudo systemctl restart agromarket
sudo -u agromarket bash -c 'cd /opt/agromarket && NODE_ENV=production node scripts/crear-admin.js admin@tu-dominio.com.ar "ContraseñaLarga"'
```

Actualizar el código: `sudo bash deploy/actualizar.sh` (rsync + `npm ci` + migraciones + restart).

Logs: `sudo journalctl -u agromarket -f`.

## Producción con Docker

```bash
cp .env.example .env   # completar SESSION_SECRET, BASE_URL, proveedores; DATABASE_URL y REDIS_URL los define el compose
cd deploy && sudo docker compose --env-file ../.env up -d --build
```

Levanta `app` (puerto 127.0.0.1:3000), `db` (PostgreSQL 16), `redis` y `cron`. Poner Nginx o Caddy delante con el `nginx.conf` incluido (las fotos quedan en el volumen `uploads`; para que Nginx las sirva directo hay que montarlo, o dejar que las sirva Node).

## Cloudflare (recomendado)

Poner el dominio detrás de Cloudflare (proxy naranja) suma CDN, protección DDoS y Turnstile. Con Cloudflare delante, en Nginx conviene restaurar la IP real (`set_real_ip_from` con los rangos de Cloudflare) para que los límites por IP funcionen.
