# ShopRadar 生产部署（Vultr + Cloudflare + SFTP）

## 1. 本机准备

1. 编辑 `shopradar-server/.env`，替换所有 `your_*` 占位符。
2. Lemon Webhook URL：`https://<你的API域名>/api/webhook/lemon-squeezy`
3. VS Code SFTP：右键 `shopradar-server` → **Upload Folder**（或 Upload Project）。

`remotePath` 固定为 `/root/shopradar-backend`，仅上传后端目录。

## 2. 服务器一键并网（SSH root）

```bash
export SHOPRADAR_DOMAIN=api.yourdomain.com
export CERTBOT_EMAIL=you@yourdomain.com
bash /root/shopradar-backend/deploy/bootstrap.sh
```

## 3. 扩展指向生产 API

修改 `popup.js` 中 `AUTH_API_*` 为 `https://api.yourdomain.com/...` 后重新加载扩展。

## 4. Cloudflare

- DNS：`api` A 记录 → Vultr 公网 IP（可开代理橙云；Certbot 建议先灰云通过后再开）
- Webhook 路径需能访问 `/api/webhook/lemon-squeezy`
