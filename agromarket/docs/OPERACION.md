# Operación

## Servicios en el VPS

| Servicio | Comando |
|---|---|
| App | `sudo systemctl status agromarket` · `sudo journalctl -u agromarket -f` |
| Cron diario (06:00) | `sudo systemctl list-timers agromarket-cron.timer` · correr a mano: `sudo systemctl start agromarket-cron` |
| Nginx | `sudo nginx -t && sudo systemctl reload nginx` |
| PostgreSQL | `sudo -u postgres psql agromarket` |
| Actualizar código | `sudo bash deploy/actualizar.sh` |

## Tareas diarias (`src/services/mantenimiento.js`)

Con `CRON_INTERNO=si` (por defecto) corren dentro del proceso de la app: 2 minutos después de arrancar y luego cada 24 h. Con `CRON_INTERNO=no`, correr `node scripts/vencer-avisos.js` desde un cron externo (el timer systemd del VPS ya lo hace).

1. Email 5 días antes del vencimiento.
2. Pasa a `vencido` los avisos con `fecha_vencimiento` pasada.
3. Envía alertas de búsqueda con avisos nuevos.
4. Borra contactos de más de 90 días, OTP vencidos y tokens viejos.

## Backups

`deploy/backup.sh` (cron root 03:00): `pg_dump` + tar de `uploads/`, ambos cifrados con AES-256 (`openssl enc`), rotación 30 días y copia opcional a un bucket con rclone (Cloudflare R2, Backblaze B2, Google Drive).

```bash
sudo tee /etc/agromarket-backup.env >/dev/null <<EOT
BACKUP_DIR=/var/backups/agromarket
BACKUP_PASS=$(openssl rand -hex 24)
EOT
sudo chmod 600 /etc/agromarket-backup.env
(sudo crontab -l 2>/dev/null; echo "0 3 * * * /opt/agromarket/deploy/backup.sh >> /var/log/agromarket-backup.log 2>&1") | sudo crontab -
```

Guardar `BACKUP_PASS` fuera del servidor. Probar la restauración una vez por trimestre (instrucción al final del script).

## Monitoreo

- Disponibilidad: UptimeRobot / Better Uptime a `https://dominio/robots.txt` cada 5 min.
- Errores: los 500 se registran en journal; opcional Sentry (`npm i @sentry/node` y `Sentry.init` en `server.js`).
- Recursos: `htop`, espacio en `uploads/` (`du -sh /opt/agromarket/uploads`), tamaño de la base.
- Entregabilidad de OTP: en el panel de Meta/Twilio, ratio enviados/entregados.

## Rutina de moderación (15 min por día)

1. `/admin/moderacion`: aprobar o rechazar (con motivo claro; el usuario lo ve por email y en Mis avisos).
2. `/admin/reportes`: descartar los sin fundamento, suspender avisos con reportes de seña/estafa, suspender usuarios reincidentes (agrega teléfono y email a lista negra).
3. `/admin/usuarios`: validar CUIT de empresas nuevas (consultar padrón ARCA).
4. `/admin`: mirar contactos y avisos de las últimas 24 h; picos anómalos suelen ser scraping o spam.

## Incidentes

| Síntoma | Qué mirar |
|---|---|
| No llegan OTP | `journalctl -u agromarket` busca errores `WhatsApp API` / `Twilio`; saldo y estado de la plantilla en Meta; probar canal SMS. |
| Pagos aprobados sin destacado | Webhook: en el panel de MP ver notificaciones fallidas; `MP_WEBHOOK_SECRET` correcto; `/admin/pagos` estado `pendiente`. Reenviar la notificación desde MP. |
| 429 para usuarios legítimos | Cloudflare delante sin IP real → todos comparten IP. Configurar `set_real_ip_from` en Nginx. |
| Fotos rotas | Permisos de `uploads/` (usuario agromarket) y `alias` en Nginx. |
| Disco lleno | Rotar backups, mover fotos a R2, `VACUUM` en PostgreSQL. |
| Fuga o sospecha de acceso indebido | Rotar `SESSION_SECRET` (cierra todas las sesiones), contraseñas de admin y credenciales de proveedores; revisar `auditoria`. |

## Escalar

1. Mover fotos a Cloudflare R2 (S3 compatible) y servirlas por CDN.
2. Redis para límites y (opcional) sesiones.
3. Varios procesos Node (`pm2 -i max` o varias unidades systemd) detrás de Nginx.
4. Índices adicionales en `avisos` según los filtros más usados; `EXPLAIN ANALYZE` en las búsquedas lentas.
