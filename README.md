# ShopRadar

Chrome 侧边栏扩展：检测 Shopify / SFCC 店铺、抓取商品列表、每日免费额度与 Pro（Lemon Squeezy）订阅。

## 加载扩展

1. 打开 `chrome://extensions`，开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择本仓库根目录（含 `manifest.json` 的文件夹）
3. 运行 `npm run build:sw` 后若修改了 `background-*.js`，需重新加载扩展

## 本地鉴权服务

```bash
cd shopradar-server
npm install
npm start
```

默认 `http://localhost:3000`。扩展内鉴权 API 指向该地址（上线前需改 `popup.js` 中的 `AUTH_API_*`）。

## 配置

- 复制 `lemon-checkout.config.example.js` 为 `lemon-checkout.config.js`，填入 Lemon Checkout 链接
- 白名单：复制 `shopradar-server/whitelist.example.json` 为 `whitelist.json`

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run build:sw` | 合并生成 `background.js` |
| `npm run check` | 构建并校验扩展 |
| `npm start` | 启动 `shopradar-server` |
| `npm run tunnel` | Cloudflare 隧道（本地 Webhook 联调） |

## 仓库

https://github.com/leo14881-eng/ShopRadar
