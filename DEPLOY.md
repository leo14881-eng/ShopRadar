# ShopRadar 生产部署（Vultr + Cloudflare + SFTP）

**清空重来**：见 [`shopradar-server/从零部署.md`](shopradar-server/从零部署.md)

## 1. 本机准备

1. 编辑 `shopradar-server/.env`，替换所有 `your_*` 占位符。
2. Lemon Webhook URL：`https://<你的API域名>/api/webhook/lemon-squeezy`
3. VS Code SFTP：**只**右键 **`shopradar-server`** → **Upload Folder**（不要 Upload 整个 ShopRadar 根目录）。

`remotePath` = `/root/shopradar-backend`，`context` = `shopradar-server` → 上传后应是 `/root/shopradar-backend/server.js`（不是 `.../shopradar-server/server.js`）。

**不要**只 `scp deploy`；那只是脚本，不含 `server.js`。

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
