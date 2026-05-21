# ShopRadar — Chrome 网上应用店上架指南

## 一、版本号与全球自动更新

`manifest.json` 中：

```json
"version": "1.0.0"
```

格式为 **三段数字** `主.次.修订`（Chrome 要求），例如：

| 变更类型 | 示例 | 说明 |
|----------|------|------|
| 小修复 | `1.0.0` → `1.0.1` | Bug、文案 |
| 功能 | `1.0.1` → `1.1.0` | 新能力 |
| 大版本 | `1.1.0` → `2.0.0` | 架构大改 |

**发布新版本流程：**

1. 改 `manifest.json` 的 `version`（必须比已上架版本**更大**）
2. 本机执行：`npm run package:store` → 得到 `ShopRadar-chrome-store.zip`
3. 打开 [Chrome 开发者后台](https://chrome.google.com/webstore/devconsole) → 你的商品 → **Package** → 上传新 zip → **Submit for review**
4. 审核通过后，Chrome 会在约 **数小时～几天** 内向已安装用户**自动推送更新**（用户无需重装）

> 扩展代码在用户本机运行；**只有**改 `shopradar-server` 才需要更新 Vultr，与商店版本独立。

---

## 二、生产 API 配置（已完成）

- `extension-config.js`：`apiBase: 'https://api.shopradar.uk'`
- `manifest.json`：`host_permissions` 含 `https://api.shopradar.uk/*`、`https://*.myshopify.com/*`；自定义域名通过 `optional_host_permissions`

本地调试：在 **`shopradar-extension/`** 下复制 `extension-config.dev.example.js` 为 `extension-config.local.js`，`debug: true`，`apiBase: http://localhost:3000`，并在 `popup.html` 临时改为引入 `extension-config.local.js`（**不要打进商店 zip**）。

---

## 三、一键打包（推荐）

```powershell
cd D:\SOFT\java\ShopRadar
npm run package:store
```

或在扩展目录：

```powershell
cd D:\SOFT\java\ShopRadar\shopradar-extension
npm run package:store
```

生成（均在 `shopradar-extension/` 下）：

- `dist-store/` — 可本地「加载已解压」自测
- `ShopRadar-chrome-store.zip` — **上传谷歌后台用这个**

### 打包包含

`manifest.json`、`icons/`、`popup.*`、`background.js`、`extension-config.js`、`extension-guard.js`、各 `*.js` 模块、`lemon-checkout.config.js`

### 打包排除（勿放进 zip）

| 排除 | 原因 |
|------|------|
| `shopradar-server/` | 后端在 Vultr，不在扩展包内 |
| `shopradar-website/` | 官网静态站，不在扩展包内 |
| `.vscode/`、`sftp.json` | 部署配置 |
| `.git/`、`node_modules/` | 开发 |
| `scripts/`、`DEPLOY.md` | 文档与脚本 |
| `README.md`、`CHROME_WEB_STORE.md` | 文档 |
| `extension-config.local.js` | 本地调试 |
| `lemon-checkout.config.example.js` | 示例 |

---

## 四、注册开发者账号（$5）

1. 使用 **Google 账号** 登录：https://chrome.google.com/webstore/devconsole  
2. 首次会要求支付 **一次性 $5 USD** 开发者注册费  
3. **柬埔寨 ABA 卡**：若卡面有 **Visa / Mastercard** 标识且已开通**境外网上支付**，在 Google 付款页选对应卡组织，填卡号、有效期、CVV 即可。  
   - 若无境外支付：ABA App → 卡片管理 → 开通在线/跨境支付，或换一张支持国际支付的卡  
   - 付款走 **Google Payments**，账单地区选你 Google 账号所在国家/地区  
4. 付款成功后账号永久有效（无需每年 $5）

---

## 五、首次提交必填项

### 1. Store listing（商店信息）

- **名称**：ShopRadar  
- **简短说明**（132 字内）：一句话价值  
- **详细说明**：检测 Shopify/SFCC、商品列表、Pro 导出等  
- **类别**：Shopping 或 Productivity  
- **语言**：中文 / 英文  

### 2. 图形资源

- **图标**：128×128（已含在 `icons/icon128.png`）  
- **截图**：至少 **1 张**，推荐 **1280×800** 或 **640×400**（侧边栏打开、检测到 Shopify、商品列表）  
- **宣传图**（可选）：440×280  

### 3. Privacy（隐私）

- **隐私政策 URL**（必填）：部署后端后使用  
  **`https://api.shopradar.uk/privacy`**  
  （源码在 `shopradar-server/public/privacy.html`，随 API 一起 SFTP 上传）  
- 根路径 `https://api.shopradar.uk/` 会自动跳转到 `/privacy`  

修改文案：编辑 `shopradar-server/public/privacy.html` 后重新上传并 `pm2 restart shopradar-api`。

### 4. Permissions justification（权限说明）

| 权限 | 审核说明（英文或中文） |
|------|------------------------|
| `activeTab` / `scripting` | 在当前店铺页检测 Shopify/SFCC 并读取商品数据 |
| `storage` | 缓存检测结果与设备 ID |
| `sidePanel` | 侧边栏展示选品界面 |
| `<all_urls>` | 用户访问的独立站域名各不相同，需读取页面与 products.json |
| `api.shopradar.uk` | 免费额度与 Pro 鉴权 API |

### 5. Package

上传 **`ShopRadar-chrome-store.zip`**（不要用整仓 Upload Project 的 zip）。

### 6. Distribution

- 选 **Public**（公开）或 **Unlisted**（仅链接安装，仍走审核）  

---

## 六、上架前自检

```powershell
npm run check:extension
npm run package:store
```

1. `chrome://extensions` → 加载 `dist-store` 文件夹  
2. 打开任意 Shopify 店，确认能连 `https://api.shopradar.uk/api/health`  
3. 确认无红色「错误」堆积（`chrome://extensions` → ShopRadar → 错误 → 清除）  

---

## 七、审核常见拒因

- 隐私政策链接 404  
- 权限说明过于笼统  
- 截图与真实功能不符  
- 包内仍有 `localhost` / 测试地址（应用 `npm run package:store` 可避免）  
- 缺少 icons  

---

## 八、发布后

- **后端**：只改 Vultr + `pm2 restart`，与商店版本无关  
- **扩展**：改代码 → 升 `version` → `npm run package:store` → 后台上传 → 等自动更新  
