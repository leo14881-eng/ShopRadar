#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/shopradar-backend/shopradar-server"
DEPLOY_DIR="$APP_DIR/deploy"
DOMAIN="${SHOPRADAR_DOMAIN:-api.shopradar.uk}"
CERT_EMAIL="${CERTBOT_EMAIL:-}"
NGINX_SITE="shopradar-api"

echo "==> ShopRadar | $APP_DIR | $DOMAIN"

test -f "$APP_DIR/server.js" || { echo "缺少 $APP_DIR/server.js，请先 Upload Project"; exit 1; }
test -f "$APP_DIR/.env" || { echo "缺少 $APP_DIR/.env"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl nginx certbot python3-certbot-nginx

command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y -qq nodejs; }
command -v pm2 >/dev/null || npm install -g pm2

cd "$APP_DIR"
# 勿上传本机 node_modules（Windows 二进制在 Linux 会报 invalid ELF header）
rm -rf node_modules
npm install --omit=dev

cp "$DEPLOY_DIR/nginx.conf" "/etc/nginx/sites-available/$NGINX_SITE"
sed -i "s/^[[:space:]]*server_name .*/    server_name $DOMAIN;/" "/etc/nginx/sites-available/$NGINX_SITE"
ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

pm2 delete shopradar-api 2>/dev/null || true
pm2 start server.js --name shopradar-api --cwd "$APP_DIR"
pm2 save

if [[ -n "$CERT_EMAIL" ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect || true
fi

curl -sf "http://127.0.0.1:3000/api/health" && echo " OK" || pm2 logs shopradar-api --lines 20
