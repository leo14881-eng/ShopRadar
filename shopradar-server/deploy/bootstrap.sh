#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/shopradar-backend/shopradar-server"
REPO_DIR="/root/shopradar-backend"
WEBSITE_DIR="$REPO_DIR/shopradar-website"
DEPLOY_DIR="$APP_DIR/deploy"
DOMAIN="${SHOPRADAR_DOMAIN:-api.shopradar.uk}"
WEBSITE_DOMAIN="${SHOPRADAR_WEBSITE_DOMAIN:-shopradar.uk}"
CERT_EMAIL="${CERTBOT_EMAIL:-}"
NGINX_SITE="shopradar-api"
NGINX_WEBSITE_SITE="shopradar-website"

echo "==> ShopRadar | $APP_DIR | $DOMAIN"

test -f "$APP_DIR/server.js" || { echo "缺少 $APP_DIR/server.js，请先 Upload Project"; exit 1; }
test -f "$APP_DIR/.env" || { echo "缺少 $APP_DIR/.env"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl nginx certbot python3-certbot-nginx redis-server
systemctl enable --now redis-server

command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y -qq nodejs; }
command -v pm2 >/dev/null || npm install -g pm2

cd "$APP_DIR"
chmod +x start.sh deploy/after-upload.sh 2>/dev/null || true
# 勿上传本机 node_modules（Windows 二进制在 Linux 会报 invalid ELF header）
rm -rf node_modules
npm install --omit=dev

cp "$DEPLOY_DIR/nginx.conf" "/etc/nginx/sites-available/$NGINX_SITE"
sed -i "s/^[[:space:]]*server_name .*/    server_name $DOMAIN;/" "/etc/nginx/sites-available/$NGINX_SITE"
ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"

if [[ -d "$WEBSITE_DIR" && -f "$WEBSITE_DIR/index.html" ]]; then
  echo "==> 配置官网 $WEBSITE_DOMAIN → /var/www/shopradar-website"
  bash "$DEPLOY_DIR/sync-website.sh"
  cp "$DEPLOY_DIR/nginx-shopradar-uk.conf" "/etc/nginx/sites-available/$NGINX_WEBSITE_SITE"
  sed -i "s/shopradar.uk www.shopradar.uk/$WEBSITE_DOMAIN www.$WEBSITE_DOMAIN/" "/etc/nginx/sites-available/$NGINX_WEBSITE_SITE"
  ln -sf "/etc/nginx/sites-available/$NGINX_WEBSITE_SITE" "/etc/nginx/sites-enabled/$NGINX_WEBSITE_SITE"
else
  echo "==> 跳过官网 nginx（未找到 $WEBSITE_DIR/index.html）"
fi

rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

pm2 delete shopradar-api 2>/dev/null || true
pm2 start start.sh --name shopradar-api --interpreter bash --cwd "$APP_DIR"
pm2 save

if [[ -n "$CERT_EMAIL" ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect || true
  if [[ -f "/etc/nginx/sites-available/$NGINX_WEBSITE_SITE" ]]; then
    certbot --nginx -d "$WEBSITE_DOMAIN" -d "www.$WEBSITE_DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect || true
  fi
fi

curl -sf "http://127.0.0.1:3000/api/health" && echo " OK" || pm2 logs shopradar-api --lines 20
