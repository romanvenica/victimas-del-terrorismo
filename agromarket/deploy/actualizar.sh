#!/bin/bash
# Actualiza el código en /opt/agromarket desde este directorio y reinicia. Uso: sudo bash deploy/actualizar.sh
set -euo pipefail
ORIGEN="$(cd "$(dirname "$0")/.." && pwd)"; DESTINO=/opt/agromarket
rsync -a --exclude node_modules --exclude data --exclude .env --exclude uploads "$ORIGEN/" "$DESTINO/"
chown -R agromarket:agromarket $DESTINO
sudo -u agromarket bash -c "cd $DESTINO && npm ci --omit=dev && NODE_ENV=production npx knex migrate:latest"
systemctl restart agromarket && systemctl --no-pager status agromarket | head -5
