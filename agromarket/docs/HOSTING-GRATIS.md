# Cómo poner la web en línea gratis (y qué cuesta después)

Esta guía es para arrancar con **costo cero** y ver la página funcionando con gente real, y para saber qué vas a pagar cuando crezca. Los límites de los planes gratuitos cambian seguido: los valores de acá son orientativos a septiembre de 2026, verificá en cada proveedor antes de decidir.

## 1. Qué necesita la app para funcionar

| Pieza | Para qué sirve | Opción gratis recomendada | Límite del plan gratis | Cuando crezca |
|---|---|---|---|---|
| Servidor Node | Corre la aplicación (páginas, formularios, fotos) | **Render** (Web Service, plan Free) | Se "duerme" tras 15 min sin visitas y tarda ~30-60 s en despertar; 750 h/mes (alcanza para un servicio) | Render Starter (~US$7/mes) o un VPS (~US$5/mes) |
| Base de datos | Usuarios, avisos, contactos | **Neon** (PostgreSQL) | ~0,5 GB; se suspende sin uso y arranca sola en menos de 1 s | Plan pago de Neon o PostgreSQL en tu VPS |
| Fotos | Imágenes de los avisos | **Cloudflare R2** (compatible S3) | 10 GB de almacenamiento y descarga gratis (puede pedir tarjeta; no cobra dentro del límite) | US$0,015 por GB extra por mes |
| Dominio | `tumarca.com.ar` | Ninguno serio: al principio usás `tu-app.onrender.com` | | `.com.ar` en nic.ar (unos miles de pesos por año) o `.com` (~US$10/año) |
| Email transaccional | Confirmar cuenta, recuperar contraseña, alertas | **Brevo** (SMTP) | 300 emails por día | Planes desde ~US$9/mes |
| Anti-bots | Frena robots que cosechan teléfonos | **Cloudflare Turnstile** | Gratis | Gratis |
| Monitoreo | Avisa si se cae y evita que Render se duerma | **UptimeRobot** | 50 monitores, cada 5 min | Gratis |
| Verificación por código (opcional) | Confirmar el WhatsApp del vendedor con un código | No hay gratis. Meta WhatsApp Cloud API cobra por mensaje (del orden de US$0,03-0,04 por código en Argentina) | | Se activa con `TELEFONO_VERIFICACION=otp` cuando quieras |
| Cobros (opcional) | Avisos destacados | Mercado Pago (comisión por cobro, sin abono) | | Se activa con `MP_ACCESS_TOKEN` |

**Total para arrancar: US$0.** Lo único que vale la pena pagar pronto es el dominio.

## 2. Opción A (recomendada para empezar hoy): Render + Neon + R2

Sin administrar servidores. En una hora está en línea. Todo se configura desde páginas web.

### Paso 1. El código en GitHub
Ya está en tu repositorio. Si la app está dentro de una carpeta (por ejemplo `agromarket/`), en Render vas a indicar esa carpeta como *Root Directory*.

### Paso 2. Base de datos en Neon
1. Entrá a neon.tech, creá una cuenta y un proyecto (región más cercana: `São Paulo` / `sa-east-1`).
2. Copiá la *connection string* (empieza con `postgresql://` y termina con `?sslmode=require`). Esa es tu `DATABASE_URL`.

### Paso 3. Fotos en Cloudflare R2
1. Cuenta en cloudflare.com → menú **R2** → **Create bucket** (nombre: `agromarket-fotos`).
2. En el bucket → **Settings** → **Public access** → habilitá **R2.dev subdomain**. Anotá la URL (`https://pub-xxxxxxxx.r2.dev`): es tu `S3_PUBLIC_URL`.
3. En **R2** → **Manage R2 API Tokens** → **Create API token** con permiso *Object Read & Write* sobre ese bucket. Anotá **Access Key ID** (`S3_ACCESS_KEY`), **Secret Access Key** (`S3_SECRET_KEY`) y el **endpoint** `https://<id-de-cuenta>.r2.cloudflarestorage.com` (`S3_ENDPOINT`).

### Paso 4. La app en Render
1. Cuenta en render.com → **New** → **Web Service** → conectá tu repositorio de GitHub.
2. Completá:
   - **Root Directory**: `agromarket` (si la app está en esa carpeta; si está en la raíz, dejalo vacío).
   - **Runtime**: Node. **Build Command**: `npm ci`. **Start Command**: `npm start`.
   - **Instance Type**: Free.
   - **Health Check Path** (en *Advanced*): `/salud`.
3. **Environment Variables** (en *Advanced* → *Add Environment Variable*):

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `BASE_URL` | `https://<nombre-que-elegiste>.onrender.com` (la URL que Render te muestra; sin barra final) |
   | `SITE_NAME` | El nombre de tu sitio |
   | `SESSION_SECRET` | 64 caracteres al azar (en Render: botón *Generate*; en tu PC: `openssl rand -hex 32`) |
   | `DATABASE_URL` | La de Neon |
   | `TELEFONO_VERIFICACION` | `ninguna` |
   | `STORAGE` | `s3` |
   | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` | Los de R2 |
   | `S3_REGION` | `auto` |
   | `MAX_FOTOS` | `12` (el plan Free tiene 512 MB de RAM; con 20 fotos grandes por aviso puede quedarse corto) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Tu email y una contraseña larga: al arrancar crea tu usuario administrador |
   | `EMAIL_PROVIDER` | `console` hasta configurar Brevo (los emails se ven en *Logs*); después `smtp` con `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |

   El archivo `render.yaml` de este repositorio tiene la misma lista; si movés la app a un repositorio propio, Render lo lee solo (*Blueprint*).
4. **Deploy**. El primer arranque crea las tablas, carga provincias, categorías y marcas y crea el administrador. En **Logs** tiene que aparecer `escuchando en ... (production, base pg, fotos s3, teléfono ninguna)`.

### Paso 5. Que no se duerma
En uptimerobot.com creá un monitor HTTP a `https://tu-app.onrender.com/salud` cada 5 minutos. Además de avisarte si se cae, mantiene la app despierta durante el día.

### Paso 6. Probar como si fueras un usuario
1. Entrá a la URL, **Crear cuenta**, publicá una máquina con 3 fotos y tu WhatsApp.
2. Desde otro navegador (o en incógnito) abrí el aviso, tocá **Ver teléfono / WhatsApp** y verificá que abre el chat.
3. Entrá con tu usuario administrador → menú → **Administración**: ahí ves los avisos en revisión, los reportes y los usuarios.

### Limitaciones de esta opción (y cómo se resuelven)
- **Arranque lento después de inactividad** (plan Free). El monitor de UptimeRobot lo mitiga. Se elimina pasando a Render Starter (~US$7/mes) o a un VPS.
- **Sin consola**: por eso el administrador se crea con `ADMIN_EMAIL`/`ADMIN_PASSWORD` y las tareas diarias corren dentro de la app (`CRON_INTERNO=si`, por defecto).
- **Sin disco**: por eso las fotos van a R2 y la base a Neon. No uses `STORAGE=local` en Render: las fotos se borran en cada deploy.

## 3. Opción B: un servidor propio (VPS)

Todo en una sola máquina: Node, PostgreSQL, Nginx, HTTPS y las fotos en disco. Sin "sueño", sin límites de RAM tan justos, y el script `deploy/instalar-vps.sh` hace la instalación completa. Es la opción para cuando haya tráfico o quieras control total. Requiere saber entrar por SSH y seguir instrucciones de terminal (con Claude Code al lado alcanza).

- **Gratis**: Oracle Cloud *Always Free* (máquina ARM con hasta 4 núcleos y 24 GB de RAM, 200 GB de disco, gratis sin vencimiento). Contras: el alta pide tarjeta para verificar identidad (no cobra), a veces rechaza el registro, y en la región de San Pablo suele no haber capacidad ARM disponible (hay que reintentar). Si conseguís la máquina, es la mejor relación costo/beneficio.
- **Pago barato**: Hetzner (~€4-5/mes), DigitalOcean (~US$6/mes), Contabo (~€5/mes) o proveedores argentinos que cobran en pesos (DonWeb, Ferozo). Con 2 GB de RAM alcanza para miles de avisos.

Pasos (Ubuntu 22.04 o 24.04):
1. Creá la máquina y abrí los puertos 80 y 443 en el firewall del proveedor.
2. Apuntá un dominio a la IP. **Hace falta HTTPS** (la cookie de sesión en producción solo viaja por HTTPS): si todavía no tenés dominio, usá un nombre gratuito que apunte a tu IP, por ejemplo `1-2-3-4.nip.io` (reemplazando por tu IP) o un subdominio de DuckDNS. Let's Encrypt les da certificado igual.
3. Entrá por SSH, cloná el repositorio y corré:
   ```bash
   cd agromarket
   sudo bash deploy/instalar-vps.sh tu-dominio.com.ar
   ```
   Instala Node 22, PostgreSQL, Redis, Nginx, el certificado y el servicio. Después: `sudo nano /opt/agromarket/.env` (poné `TELEFONO_VERIFICACION=ninguna`, `SITE_NAME`, y más adelante email, Turnstile, etc.) y `sudo systemctl restart agromarket`.
4. Administrador: `sudo -u agromarket bash -c 'cd /opt/agromarket && NODE_ENV=production node scripts/crear-admin.js tu@email.com "ContraseñaLarga"'`.
5. Backups: `deploy/backup.sh` (ver docs/OPERACION.md). En un VPS los datos son tuyos y tu responsabilidad.

Variante mínima sin PostgreSQL: dejar `DATABASE_URL` vacía y la app usa SQLite en `DATA_DIR/prod.sqlite`. Funciona bien hasta varios miles de avisos y simplifica el backup (es un archivo).

## 4. Dominio: el único gasto que conviene hacer temprano

- **`.com.ar`**: se registra en nic.ar con CUIL/CUIT y clave fiscal (trámite en línea, "Trámites a Distancia"). Se paga por año en pesos. Da confianza local.
- **`.com`**: Cloudflare Registrar (~US$10/año, precio de costo) o Namecheap.
- En los dos casos, administrá el DNS en **Cloudflare** (gratis): CDN, protección contra ataques, y es donde después activás Turnstile. En Render: *Settings* → *Custom Domains* → agregás el dominio y creás el registro CNAME que te indica. Cambiá `BASE_URL` al dominio nuevo.

## 5. Qué está apagado por defecto y cuánto cuesta prenderlo

| Función | Estado inicial | Qué hace falta | Costo |
|---|---|---|---|
| Verificación del WhatsApp por código | Apagada (`TELEFONO_VERIFICACION=ninguna`): el vendedor escribe su número | Cuenta de WhatsApp Business en Meta con plantilla de autenticación aprobada, o Twilio para SMS | Por mensaje: Meta ~US$0,03-0,04; Twilio SMS ~US$0,07-0,10 (Argentina, orientativo) |
| Avisos destacados (cobro) | Apagados (sin `MP_ACCESS_TOKEN` no se muestran los botones) | Cuenta de Mercado Pago a tu nombre y credenciales de producción; monotributo para facturar | Comisión de MP por cobro (sin abono) |
| Factura electrónica | Pendiente (deja la factura como "pendiente de emisión") | Integrar WSFE de ARCA o un proveedor (ver docs/FACTURACION.md) | Proveedores desde ~US$5-10/mes |
| Emails reales | Consola (se ven en los logs) | Cuenta en Brevo y dominio con SPF/DKIM | Gratis hasta 300/día |
| CAPTCHA invisible | Apagado | Claves de Turnstile en Cloudflare | Gratis |
| Revisión manual del primer aviso | Encendida (`MODERAR_PRIMER_AVISO=si`) | Entrar a `/admin/moderacion` una vez por día | Tu tiempo (15 min/día) |

## 6. Cómo se sostiene económicamente

Publicar y contactar es gratis para que el catálogo crezca; la plataforma no cobra comisión por la venta. Lo que ya está construido y se activa con configuración:

1. **Avisos destacados y "subir al inicio"** (Mercado Pago). Precios en `.env`. Es la fuente más simple: quien quiere vender rápido paga por visibilidad.
2. **Planes para concesionarios y empresas**: hoy se asignan a mano desde `/admin/usuarios` (cobro por transferencia); quitan el cupo de avisos y dan el sello "Empresa".

Ideas siguientes sin desarrollar (ver docs/MONETIZACION.md): banners de marcas o concesionarios por categoría, leads a bancos/aseguradoras/transportistas, inspección técnica con talleres asociados.

Orden sugerido: primero conseguir avisos y contactos reales con todo gratis; recién cuando haya demanda, activar destacados. Cobrar antes de tener catálogo espanta a los primeros vendedores.

## 7. Costos por etapa (mensual, orientativo)

| Etapa | Infraestructura | Servicios | Total |
|---|---|---|---|
| Lanzamiento (hoy) | Render Free + Neon Free + R2 Free | Brevo Free, Turnstile, UptimeRobot | **US$0** (+ dominio ~US$1/mes prorrateado) |
| Primeros cientos de avisos | Render Starter (US$7) o VPS (US$5-6) | igual | **US$5-8** |
| Con verificación por código | igual | Meta WhatsApp: ~US$0,035 × códigos enviados (1.000 vendedores nuevos ≈ US$35) | **US$10-50** según altas |
| Miles de avisos y visitas diarias | VPS de 4 GB (US$12-20) + R2 de pago + Neon de pago o PostgreSQL propio | Email pago, Sentry | **US$40-80** |

## 8. Lista de control antes de compartir el link

- [ ] `SESSION_SECRET` aleatorio y `NODE_ENV=production` (la app no arranca sin secreto en producción).
- [ ] `BASE_URL` correcta (aparece en los emails y en el sitemap).
- [ ] `STORAGE=s3` en Render (fotos persistentes) y `MAX_FOTOS=12`.
- [ ] Administrador creado y probado (`/admin`).
- [ ] Un aviso de prueba publicado y borrado, con el botón de WhatsApp probado desde otro celular.
- [ ] Textos de `legal/` con tus datos reales (los campos `[completar]`).
- [ ] UptimeRobot activo.
- [ ] Copia de seguridad: en Neon y R2 los datos quedan en sus servidores; para dormir tranquilo, exportá la base una vez por semana (`pg_dump` desde tu PC con la `DATABASE_URL`).
