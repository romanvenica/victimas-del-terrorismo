#!/bin/bash
# Instalación en un VPS Ubuntu 22.04/24.04 limpio, con Node 22, PostgreSQL, Redis, Nginx y systemd.
# Uso: sudo bash deploy/instalar-vps.sh tu-dominio.com.ar
# Después: editar /opt/agromarket/.env (proveedor OTP, SMTP, Turnstile, Mercado Pago) y correr:
#   sudo systemctl restart agromarket && sudo -u agromarket bash -c 'cd /opt/agromarket && node scripts/crear-admin.js admin@tu-dominio.com.ar "ContraseñaLarga"'
set -euo pipefail
DOMINIO="${1:?Uso: sudo bash deploy/instalar-vps.sh tu-dominio.com.ar}"
ORIGEN="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO=/opt/agromarket
PGPASS="$(openssl rand -hex 16)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y curl ca-certificates gnupg nginx postgresql redis-server certbot python3-certbot-nginx rsync build-essential python3
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
fi

id -u agromarket >/dev/null 2>&1 || useradd -r -m -d $DESTINO -s /usr/sbin/nologin agromarket
mkdir -p $DESTINO && rsync -a --exclude node_modules --exclude data --exclude .env --exclude uploads "$ORIGEN/" "$DESTINO/"
mkdir -p $DESTINO/uploads $DESTINO/data

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='agromarket'" | grep -q 1 || sudo -u postgres psql -c "CREATE ROLE agromarket LOGIN PASSWORD '$PGPASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='agromarket'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE agromarket OWNER agromarket;"

if [ ! -f $DESTINO/.env ]; then
  cp $DESTINO/.env.example $DESTINO/.env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|; s|^BASE_URL=.*|BASE_URL=https://$DOMINIO|; s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|; s|^DATABASE_URL=.*|DATABASE_URL=postgres://agromarket:$PGPASS@localhost:5432/agromarket|; s|^# REDIS_URL=.*|REDIS_URL=redis://localhost:6379|; s|^UPLOAD_DIR=.*|UPLOAD_DIR=$DESTINO/uploads|" $DESTINO/.env
  chmod 600 $DESTINO/.env
fi
chown -R agromarket:agromarket $DESTINO
sudo -u agromarket bash -c "cd $DESTINO && npm ci --omit=dev && NODE_ENV=production npx knex migrate:latest && NODE_ENV=production npx knex seed:run"

cp $DESTINO/deploy/agromarket.service $DESTINO/deploy/agromarket-cron.service $DESTINO/deploy/agromarket-cron.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now agromarket agromarket-cron.timer

sed "s/tu-dominio.com.ar/$DOMINIO/g" $DESTINO/deploy/nginx.conf > /etc/nginx/sites-available/agromarket
sed -i 's|^\s*ssl_certificate.*||; s|listen 443 ssl http2;|listen 443 ssl http2; ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem; ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;|' /etc/nginx/sites-available/agromarket
ln -sf /etc/nginx/sites-available/agromarket /etc/nginx/sites-enabled/agromarket && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo "Certbot falló (¿el DNS ya apunta acá?). Reintentar: sudo certbot --nginx -d $DOMINIO"

echo
echo "Listo. App en https://$DOMINIO (estado: systemctl status agromarket)"
echo "Siguiente: sudo nano $DESTINO/.env  (OTP_PROVIDER, SMTP, TURNSTILE, MP_ACCESS_TOKEN) y sudo systemctl restart agromarket"
echo "Crear admin: sudo -u agromarket bash -c 'cd $DESTINO && NODE_ENV=production node scripts/crear-admin.js admin@$DOMINIO \"ContraseñaLarga\"'"
