/**
 * 本地开发说明（可选参考）
 *
 * 自 v1.1+ 起无需手动切换 API：
 * - chrome://extensions「加载已解压的扩展程序」→ 自动连 http://localhost:3000
 * - Chrome Web Store 安装 → 自动连 https://api.shopradar.uk
 *
 * 若需覆盖 Lemon 结账链接，复制 lemon-checkout.config.example.js 为 lemon-checkout.config.js
 */
var SHOPRADAR_EXTENSION_CONFIG = {
  env: 'development',
  apiBase: 'http://localhost:3000',
  websiteUrl: 'http://localhost:8080',
  debug: true,
};
