#!/usr/bin/env bash
# 始终在 Linux 上启动；若 sqlite3 不是 Linux 原生库则自动重装 node_modules
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

NATIVE_SO="$APP_DIR/node_modules/sqlite3/build/Release/node_sqlite3.node"

needs_rebuild=0
if [ ! -f "$NATIVE_SO" ]; then
  needs_rebuild=1
elif command -v file >/dev/null 2>&1; then
  if ! file "$NATIVE_SO" | grep -q 'ELF'; then
    needs_rebuild=1
  fi
else
  # 无 file 命令时：尝试加载 node，失败则重装
  if ! node -e "require('sqlite3')" 2>/dev/null; then
    needs_rebuild=1
  fi
fi

if [ "$needs_rebuild" -eq 1 ]; then
  echo "[ShopRadar] 检测到 Windows 版 node_modules，正在 Linux 上重新 npm install ..."
  rm -rf node_modules
  npm install --omit=dev
fi

exec node server.js
