#!/bin/bash
# Backup diario cifrado de la base y las fotos. Uso (cron root, 03:00):
#   0 3 * * * /opt/agromarket/deploy/backup.sh >> /var/log/agromarket-backup.log 2>&1
# Requiere: BACKUP_DIR, BACKUP_PASS (en /etc/agromarket-backup.env) y opcionalmente rclone configurado.
set -euo pipefail
source /etc/agromarket-backup.env   # BACKUP_DIR=/var/backups/agromarket  BACKUP_PASS=...  RCLONE_REMOTE=r2:agromarket-backups (opcional)
FECHA=$(date +%F)
mkdir -p "$BACKUP_DIR"
sudo -u postgres pg_dump -Fc agromarket | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASS -out "$BACKUP_DIR/db-$FECHA.dump.enc"
tar -C /opt/agromarket -czf - uploads | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASS -out "$BACKUP_DIR/uploads-$FECHA.tgz.enc"
find "$BACKUP_DIR" -name '*.enc' -mtime +30 -delete
[ -n "${RCLONE_REMOTE:-}" ] && rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --max-age 2d
echo "$(date) backup OK"
# Restaurar: openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASS -in db-FECHA.dump.enc | sudo -u postgres pg_restore -d agromarket --clean
