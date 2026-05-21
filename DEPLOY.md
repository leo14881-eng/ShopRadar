# ShopRadar 发布流程（最新）

ShopRadar 由三部分组成，**发布方式不同**：

| 模块 | 目录 | 发布目标 | 方式 |
|------|------|----------|------|
| 后端 API | `shopradar-server/` | Vultr 服务器 | `.\scripts\deploy-vultr.ps1` |
| 官网 / 大屏 | `shopradar-website/` | 同上（Nginx 静态站） | 同上（脚本一并上传） |
| Chrome 扩展 | `shopradar-extension/` | Chrome Web Store | `npm run package:store` → 上传 zip |

**线上地址**

- 官网：https://shopradar.uk
- 大屏：https://shopradar.uk/#dashboard
- API：https://api.shopradar.uk
- 服务器：`root@192.248.179.25`，代码目录 `/root/shopradar-backend/`

---

## 一、官网 + API 一键发布（最常用）

### 前提

- 本机有 OpenSSH（`scp` / `ssh`），Windows 10+ 一般已自带
- SSH 密钥：`~/.ssh/id_ed25519` 能登录服务器（见 `.vscode/sftp.json`）
- **不要**上传 `node_modules/`、`database.sqlite`（已在 ignore 里排除）

### 一条命令

```powershell
cd D:\SOFT\java\ShopRadar
.\scripts\deploy-vultr.ps1
```

脚本会自动：

1. 删除本地 `shopradar-server\node_modules`（避免误传 Windows 版原生库）
2. `scp` 上传 `shopradar-server/` → `/root/shopradar-backend/shopradar-server/`
3. `scp` 上传 `shopradar-website/` → `/root/shopradar-backend/shopradar-website/`
4. SSH 远程执行 `after-upload.sh`：
   - 官网同步到 `/var/www/shopradar-website/`（Nginx 可读）
   - PM2 重启 `shopradar-api`
   - 服务器上若检测到 Windows 版 sqlite3，自动 `npm install`
   - 健康检查 `http://127.0.0.1:3000/api/health`

成功输出示例：

```text
Deploy complete.
  Website: https://shopradar.uk
  API:     https://api.shopradar.uk/api/health
```

### 改了什么就发什么

| 改了什么 | 是否跑 deploy 脚本 | 说明 |
|----------|-------------------|------|
| `shopradar-website/*` | 是 | 官网 HTML/JS/CSS |
| `shopradar-server/*.js`、路由、支付逻辑 | 是 | API 需 PM2 重启 |
| `shopradar-server/.env` | 是（或手动 SFTP 该文件） | 密钥/域名配置 |
| `shopradar-extension/*` | **否** | 走 Chrome 商店，见下文 |
| 仅本地开发配置 | **否** | `*.dev.example.js` 等不要上传 |

### 发布后自检

```powershell
curl https://api.shopradar.uk/api/health
```

浏览器打开 https://shopradar.uk ，必要时 **Ctrl+F5** 强刷缓存。

### 备选：Cursor SFTP 扩展

1. 命令面板 → **SFTP: Upload Project**（读取 `.vscode/sftp.json`）
2. 上传完成后 SSH 登录服务器，手动执行：

```bash
bash /root/shopradar-backend/shopradar-server/deploy/after-upload.sh
```

> 旧版 `deploy-vultr-upload.js`（Node + ssh2）在 Node 22+ 可能报错，已改用 `scp`/`ssh`，优先用 `deploy-vultr.ps1`。

### 只改了几个网页文件（快速）

```powershell
$key = "$env:USERPROFILE\.ssh\id_ed25519"
scp -i $key shopradar-website\index.html shopradar-website\dashboard.js `
  root@192.248.179.25:/root/shopradar-backend/shopradar-website/
ssh -i $key root@192.248.179.25 `
  "rsync -a /root/shopradar-backend/shopradar-website/ /var/www/shopradar-website/"
```

---

## 二、Chrome 扩展发布（Chrome Web Store）

扩展**不部署到 Vultr**，用户从 Chrome 商店安装/自动更新。

### 本地开发（不上架）

```powershell
cd D:\SOFT\java\ShopRadar\shopradar-extension
npm run build:sw
```

Chrome → `chrome://extensions` → **加载已解压的扩展程序** → 选 `shopradar-extension/` 文件夹。

- 未打包版本自动连 `http://localhost:3000`
- 需本地 API：`cd shopradar-server && npm start`

### 上架 / 更新商店版本

1. **改版本号**：`shopradar-extension/manifest.json` 的 `version`（必须大于已上架版本）

2. **打包前检查**（可选但推荐）：

```powershell
cd D:\SOFT\java\ShopRadar
npm run check:extension
```

3. **打商店包**：

```powershell
cd D:\SOFT\java\ShopRadar
npm run package:store
```

生成文件（在 `shopradar-extension/` 下）：

- `dist-store/` — 本地解压测试用
- `ShopRadar-chrome-store.zip` — **上传谷歌后台用这个**

4. **提交审核**：[Chrome 开发者后台](https://chrome.google.com/webstore/devconsole) → 你的商品 → Package → 上传 zip → Submit for review

5. 审核通过后 Chrome 会向已安装用户**自动推送更新**（数小时～数天）

### 扩展 API 环境说明

- 商店包：固定 `https://api.shopradar.uk`（`extension-env.production.js`）
- 本地解压：自动 `http://localhost:3000`
- **改后端 API 只需 deploy 服务器，与商店版本独立**；改扩展 UI/逻辑才需要发新版本到商店

详细说明见 [`shopradar-extension/CHROME_WEB_STORE.md`](shopradar-extension/CHROME_WEB_STORE.md)

---

## 三、完整发布清单（三件套都改了）

按顺序执行：

```powershell
# 1. 后端 + 官网
cd D:\SOFT\java\ShopRadar
.\scripts\deploy-vultr.ps1

# 2. 扩展（若也有改动）
npm run check:extension
npm run package:store
# → 手动上传 ShopRadar-chrome-store.zip 到 Chrome 开发者后台
```

---

## 四、不要上传 / 不要覆盖

| 文件/目录 | 原因 |
|-----------|------|
| `shopradar-server/node_modules/` | Windows 原生库在 Linux 会崩溃；服务器 `start.sh` 会自动 npm install |
| `shopradar-server/database.sqlite` | 生产用户/Pro 数据 |
| `.git/`、`.cursor/` | 无关 |
| `shopradar-extension/dist-store/` | 本地打包产物，不上服务器 |
| 含真实密钥的 `.env` | 可 SFTP 单独更新，**不要提交 git** |

---

## 五、服务器目录结构

```text
/root/shopradar-backend/
├── shopradar-server/          ← API 源码，PM2 运行
│   ├── server.js
│   ├── .env                   ← 生产密钥（仅服务器）
│   └── deploy/
│       ├── after-upload.sh    ← 每次上传后执行
│       └── sync-website.sh    ← 同步官网到 /var/www
└── shopradar-website/         ← 官网源码（上传源）

/var/www/shopradar-website/    ← Nginx 实际对外目录（由 sync-website 同步）
```

---

## 六、常见问题

**Q: deploy 报 `isDate is not a function`？**  
A: 旧 Node+ssh2 脚本与 Node 22 不兼容。请用新版 `.\scripts\deploy-vultr.ps1`（基于 scp/ssh）。

**Q: 官网更新了但线上没变？**  
A: 确认执行了 `after-upload.sh`（或 rsync 到 `/var/www/shopradar-website/`），并浏览器强刷。

**Q: API 502 / 起不来？**  
A: SSH 登录后 `pm2 logs shopradar-api --lines 50`；常见原因是 `.env` 缺失或 sqlite3 未在 Linux 重装。

**Q: 首次部署 / 换域名 / 重装服务器？**  
A: 见 [`shopradar-server/从零部署.md`](shopradar-server/从零部署.md)

---

## 七、Lemon Squeezy Webhook

- Webhook URL：`https://api.shopradar.uk/api/webhook/lemon-squeezy`
- 改 webhook secret 后需同步更新服务器 `shopradar-server/.env` 并 deploy
