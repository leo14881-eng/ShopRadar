#!/usr/bin/env bash
# 每次 SFTP 上传后执行一次（自动修 sqlite3 / invalid ELF header）
set -euo pipefail
APP_DIR="/root/shopradar-backend/shopradar-server"
cd "$APP_DIR"
chmod +x start.sh
pm2 delete shopradar-api 2>/dev/null || true
pm2 start start.sh --name shopradar-api --interpreter bash --cwd "$APP_DIR"
pm2 save
sleep 2
curl -sf "http://127.0.0.1:3000/api/health" && echo " OK" || { pm2 logs shopradar-api --lines 25; exit 1; }
