#!/usr/bin/env bash
# ShopRadar 生产并网脚本（Vultr / Ubuntu）
# 用法（SSH 登录 root 后）：
#   export SHOPRADAR_DOMAIN=api.yourdomain.com
#   export CERTBOT_EMAIL=you@yourdomain.com
#   bash /root/shopradar-backend/deploy/bootstrap.sh
set -euo pipefail

APP_DIR="/root/shopradar-backend"
NGINX_SITE="shopradar-api"
DOMAIN="${SHOPRADAR_DOMAIN:-api.yourdomain.com}"
CERT_EMAIL="${CERTBOT_EMAIL:-}"

echo "==> ShopRadar bootstrap | dir=$APP_DIR | domain=$DOMAIN"

if [[ ! -f "$APP_DIR/server.js" ]]; then
  echo "ERROR: $APP_DIR/server.js 不存在，请先 SFTP 上传 shopradar-server 到该目录"
  exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "ERROR: 缺少 $APP_DIR/.env ，请在本机填好密钥后上传"
  exit 1
fi

if grep -q 'your_live_webhook_secret\|your_production_jwt_secret' "$APP_DIR/.env"; then
  echo "ERROR: .env 仍为占位符，请先填入真实生产密钥"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

cd "$APP_DIR"
npm install --omit=dev

cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$NGINX_SITE"
sed -i "s/api.yourdomain.com/$DOMAIN/g" "/etc/nginx/sites-available/$NGINX_SITE"
ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

pm2 delete shopradar-api 2>/dev/null || true
pm2 start "$APP_DIR/server.js" --name shopradar-api --cwd "$APP_DIR"
pm2 save
pm2 startup systemd -u root --hp /root | bash || true

if [[ -n "$CERT_EMAIL" && "$DOMAIN" != "api.yourdomain.com" ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect
  systemctl reload nginx
  echo "==> HTTPS 已申请: https://$DOMAIN"
else
  echo "==> 跳过 Certbot（请设置 SHOPRADAR_DOMAIN 与 CERTBOT_EMAIL 后重新运行 certbot）"
  echo "    certbot --nginx -d $DOMAIN -m your@email.com --agree-tos"
fi

echo "==> 完成。健康检查: curl -s http://127.0.0.1:3000/api/health"
curl -sf "http://127.0.0.1:3000/api/health" && echo "" || echo "WARN: 本地 3000 未响应，请 pm2 logs shopradar-api"
