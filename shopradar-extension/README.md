# ShopRadar Chrome Extension

Chrome 侧边栏扩展：Shopify / SFCC 店铺公开目录洞察、Pro 订阅与趋势榜上报。

## 开发

```bash
# 在本目录 shopradar-extension/
npm run dev       # 监听后台源文件，自动 npm run build:sw（另开终端）
npm run check     # 构建 + 合规校验（改代码后建议跑一次）
```

### 改代码后如何避免扩展报错

Chrome 扩展**不会**像网页那样热更新，改文件后必须手动刷新扩展；侧边栏若仍开着，还会报 `Extension context invalidated`。

**推荐流程（每次改完代码）：**

1. 若改了 `background-jobs.js`、`shop-permissions.js`、`background.sw-bootstrap.js` 等后台相关文件  
   → 先 `npm run build:sw`（或开着 `npm run dev` 自动构建）
2. 打开 `chrome://extensions` → ShopRadar → 点 **重新加载**（🔄）
3. **关掉侧边栏**，再在店铺页 **重新点击扩展图标**（不要复用旧侧边栏）

| 改了什么 | 需要 build:sw | 需要重载扩展 |
|----------|---------------|--------------|
| `popup.js` / `popup.html` | 否 | 是 |
| `background-jobs.js` 等后台源文件 | **是** | 是 |
| 直接改 `background.js` | 否（会被下次 build 覆盖） | 是 |

**加载扩展：** `chrome://extensions` → 开发者模式 → 加载已解压 → 选择 **本文件夹**（`shopradar-extension/`）。

## 发布

```bash
npm run package:store
```

产出：`ShopRadar-chrome-store.zip`（上传 [Chrome Web Store](https://chrome.google.com/webstore/devconsole)）。

详见 [CHROME_WEB_STORE.md](./CHROME_WEB_STORE.md)。
