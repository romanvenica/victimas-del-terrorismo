# Seguridad

## Implementado

**Cabeceras y transporte** (`src/app.js`, helmet)
- CSP estricta: `script-src 'self' challenges.cloudflare.com`, sin scripts inline (todo el JS está en `/static/js/app.js`); `object-src 'none'`; `form-action` limitado a self + Mercado Pago; `frame-src` solo Turnstile y MP.
- HSTS 1 año en producción, `X-Content-Type-Options`, `Referrer-Policy strict-origin-when-cross-origin`, `X-Frame-Options SAMEORIGIN`.
- Cookie de sesión `am.sid`: httpOnly, SameSite=Lax, Secure en producción, 30 días con renovación.

**Autenticación** (`src/routes/auth.js`)
- Contraseñas con bcrypt (coste 12), mínimo 10 caracteres, rechazo de contraseñas filtradas (Have I Been Pwned, k-anonymity: solo viajan 5 caracteres del SHA-1).
- Login con respuesta en tiempo aproximadamente constante y mensaje genérico; 10 intentos por 15 minutos por IP.
- `session.regenerate` tras login, registro y cambio de contraseña (evita fijación de sesión).
- Recuperación: token aleatorio de 32 bytes, guardado como SHA-256, vence a los 30 minutos, un solo uso, invalida todas las sesiones del usuario. Respuesta idéntica exista o no el email.
- Verificación de email por token (48 h).

**Autorización**
- `requerirLogin` en rutas privadas; `requerirRol('admin','moderador')` en `/admin`. Solo `admin` puede cambiar roles.
- Cada acción sobre un aviso comprueba `usuario_id === req.user.id`.
- IDs UUID: no se pueden adivinar ni enumerar.

**Entrada**
- Validación con zod en todos los POST (`middleware/validate.js`), con coerción y límites de longitud.
- EJS escapa por defecto (`<%= %>`); solo se usa `<%- %>` para HTML generado desde Markdown propio y JSON-LD.
- CSRF con token de sesión en todos los formularios y cabecera `x-csrf-token` en la API (`middleware/csrf.js`); en multipart se verifica después de multer.
- Consultas con Knex parametrizadas (sin SQL concatenado).

**Subida de archivos** (`services/images.js`)
- Filtro por MIME y tamaño (multer), luego verificación real del formato por contenido (sharp). Se recomprime a JPEG (nunca se guarda el archivo original), se eliminan metadatos EXIF/GPS, se limita a 1600 px.
- Se guardan con nombre UUID en carpeta por aviso; `express.static` con `dotfiles: 'deny'`; Nginx sirve `/uploads` con `nosniff`.

**Abuso**
- Rate limiting por ruta (general 300/min, login, registro, recuperación, OTP, revelar teléfono, publicar, reportar), compartido vía Redis si `REDIS_URL` está definido.
- Turnstile en registro, revelar teléfono y reportar.
- Listas negras de teléfono, email, dominio e IP.

**Datos**
- IPs guardadas solo como HMAC-SHA256 con `SESSION_SECRET`.
- Códigos OTP y tokens guardados hasheados.
- Eliminación de cuenta con anonimización.
- Auditoría de acciones sensibles (registro, login, publicación, moderación, suspensiones).

**Pagos**
- El webhook de Mercado Pago valida `x-signature` (HMAC con `MP_WEBHOOK_SECRET`) y **siempre consulta el pago a la API** antes de aplicar el beneficio; es idempotente.
- No se guardan datos de tarjeta.

## Checklist antes de salir a producción

- [ ] `NODE_ENV=production` y `SESSION_SECRET` aleatorio de 64 hex (`openssl rand -hex 32`).
- [ ] HTTPS activo (Let's Encrypt) y redirección de HTTP. Verificar que el navegador reciba `Strict-Transport-Security`.
- [ ] `trust proxy` correcto: la app está detrás de Nginx (ya configurado a 1). Si además hay Cloudflare, restaurar IP real en Nginx.
- [ ] `TURNSTILE_SITE_KEY/SECRET` cargados (sin ellos, revelar teléfono y registro quedan solo con rate limit).
- [ ] `MP_WEBHOOK_SECRET` cargado (sin él, en producción el webhook debería rechazarse: cambiar `verificarFirma` para que devuelva `false` si falta el secreto).
- [ ] `EMAIL_PROVIDER=smtp` con SPF/DKIM configurados en el dominio.
- [ ] `.env` con permisos 600 y fuera del repositorio.
- [ ] PostgreSQL solo escucha en localhost; Redis sin puerto público.
- [ ] Firewall: solo 22, 80 y 443 (`sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`). SSH solo con clave.
- [ ] Backups diarios cifrados probados con una restauración (`deploy/backup.sh`).
- [ ] `npm audit` sin vulnerabilidades altas; actualizar dependencias mensualmente.
- [ ] Cuenta admin con contraseña larga y única; revisar `/admin/usuarios` para que no queden admins de prueba.
- [ ] Probar manualmente: registro, OTP real, publicación, revelar teléfono, reporte, pago de prueba en sandbox de MP.
- [ ] Monitoreo de caída (UptimeRobot o similar) apuntando a `/robots.txt`.

## Pendientes recomendados

- 2FA (TOTP) para cuentas admin/moderador (la columna `totp_secret` ya existe).
- Registro de errores centralizado (Sentry o similar).
- Escaneo de fotos con un servicio de moderación de imágenes si aparece contenido inapropiado.
