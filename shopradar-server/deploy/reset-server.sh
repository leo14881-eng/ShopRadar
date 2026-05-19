#!/usr/bin/env bash
# 清空 Vultr 上的 ShopRadar 后端（慎用）。SSH root 执行：
#   bash /root/shopradar-backend/deploy/reset-server.sh
# 若目录已删，可直接复制 deploy/reset-server.sh 内容运行，或使用「从零部署.md」里的内联命令块。
set -euo pipefail

echo "==> 停止 PM2..."
pm2 delete shopradar-api 2>/dev/null || true
pm2 save 2>/dev/null || true

echo "==> 移除 Nginx 站点 shopradar-api..."
rm -f /etc/nginx/sites-enabled/shopradar-api
rm -f /etc/nginx/sites-available/shopradar-api
if command -v nginx >/dev/null 2>&1; then
  nginx -t && systemctl reload nginx
fi

echo "==> 删除应用目录 /root/shopradar-backend ..."
rm -rf /root/shopradar-backend

mkdir -p /root/shopradar-backend
chmod 700 /root/shopradar-backend

echo "==> 完成。目录已清空，请在本机对 shopradar-server 执行 SFTP: Upload Folder。"
