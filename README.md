# ShopRadar Monorepo

| 目录 | 说明 |
|------|------|
| [`shopradar-extension/`](shopradar-extension/) | Chrome 侧边栏扩展（Shopify / SFCC 店铺洞察） |
| [`shopradar-website/`](shopradar-website/) | 官网与爆品大盘 |
| [`shopradar-server/`](shopradar-server/) | 后端 API（鉴权、趋势榜、Lemon Webhook） |

## 加载 Chrome 扩展

1. 打开 `chrome://extensions`，开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择 **`shopradar-extension/`** 文件夹（含 `manifest.json`）
3. 修改后台源文件后运行 `npm run build:sw`，再在扩展页点击重新加载

**环境自动切换（无需手动改配置）：**

| 场景 | API 地址 |
|------|----------|
| 解压加载扩展（本地开发） | `http://localhost:3000` |
| Chrome Web Store 安装 | `https://api.shopradar.uk` |
| 官网 `localhost:8080` | `http://localhost:3000` |
| 官网 `shopradar.uk` | `https://api.shopradar.uk` |

本地开发时侧边栏底部会显示黄色 `API: http://localhost:3000` 提示。

## 本地后端

```bash
cd shopradar-server
npm install
npm start
```

默认 `http://localhost:3000`。扩展与官网会根据运行环境**自动**选择 API，见上表；实现见 `shopradar-extension/extension-env.js` 与 `shopradar-website/website-config.js`。

**本地密钥** — 在 `shopradar-server/` 下（已 gitignore）：

```bash
cd shopradar-server
npm run setup-secrets
npm start
```

## 常用命令（仓库根目录）

| 命令 | 说明 |
|------|------|
| `npm run build:sw` | 合并生成 `shopradar-extension/background.js` |
| `npm run check` | 构建并校验扩展 |
| `npm run package:store` | 打包 Chrome Web Store zip |
| `npm start` | 启动 `shopradar-server` |
| `npm run tunnel` | Cloudflare 隧道（Webhook 联调） |

扩展配置：复制 `shopradar-extension/lemon-checkout.config.example.js` 为 `lemon-checkout.config.js`。

Chrome 商店发布说明见 [`shopradar-extension/CHROME_WEB_STORE.md`](shopradar-extension/CHROME_WEB_STORE.md)。

## 仓库

https://github.com/leo14881-eng/ShopRadar
