#!/usr/bin/env node
/**
 * 切换扩展 API：本地 localhost:3000 ↔ 线上 api.shopradar.uk
 * 用法: node scripts/toggle-local-config.js local|prod
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'local-dev-config.js');

const LOCAL_BODY = `'use strict';
/** 本地 API — npm run dev:prod 可恢复线上 */
(function shopRadarLocalDevConfig(global) {
  if (!global) {
    return;
  }
  global.__SHOPRADAR_LOCAL_DEV__ = true;
  global.SHOPRADAR_EXTENSION_CONFIG = {
    apiBase: 'http://localhost:3000',
    websiteUrl: 'http://localhost:8080',
    debug: true,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
`;

const PROD_BODY = `'use strict';
/** 本地 API 覆盖 — 运行 \`npm run dev:local\` 启用，\`npm run dev:prod\` 恢复线上。 */
(function shopRadarLocalDevConfig(global) {
  if (!global || global.__SHOPRADAR_LOCAL_DEV__) {
    return;
  }
  /* dev:local 会在此写入 SHOPRADAR_EXTENSION_CONFIG 覆盖 */
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
`;

const mode = (process.argv[2] || '').toLowerCase();
if (mode !== 'local' && mode !== 'prod') {
  console.error('用法: node scripts/toggle-local-config.js local|prod');
  process.exit(1);
}

fs.writeFileSync(OUT, mode === 'local' ? LOCAL_BODY : PROD_BODY, 'utf8');

try {
  execSync('node scripts/build-sw-bundle.js', { cwd: ROOT, stdio: 'inherit' });
} catch (buildErr) {
  process.exit(buildErr.status || 1);
}

if (mode === 'local') {
  console.log('[ShopRadar] 已切换为本地 API: http://localhost:3000');
  console.log('请在 chrome://extensions 重新加载扩展。');
} else {
  console.log('[ShopRadar] 已恢复线上 API: https://api.shopradar.uk');
  console.log('请在 chrome://extensions 重新加载扩展。');
}
