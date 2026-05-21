#!/usr/bin/env bash
# 同步官网到 /var/www（Nginx www-data 无法读 /root）
set -euo pipefail
WEBSITE_SRC="${1:-/root/shopradar-backend/shopradar-website}"
WEBSITE_DST="${2:-/var/www/shopradar-website}"

if [[ ! -f "$WEBSITE_SRC/index.html" ]]; then
  echo "跳过官网同步（无 $WEBSITE_SRC/index.html）"
  exit 0
fi

mkdir -p "$WEBSITE_DST"
rsync -a --delete "$WEBSITE_SRC/" "$WEBSITE_DST/"
echo "官网已同步 → $WEBSITE_DST"
