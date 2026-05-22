#!/usr/bin/env node
/**
 * 开发模式：监听后台源文件变更，自动重建 background.js
 *
 * 用法: npm run dev
 * 改 popup.js / popup.html 等仍须在 chrome://extensions 点一次「重新加载」
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BUILD_SCRIPT = path.join(__dirname, 'build-sw-bundle.js');

const WATCH_FILES = [
  'extension-config.js',
  'extension-env.js',
  'extension-env.production.js',
  'extension-guard.js',
  'extension-auth.js',
  'shop-permissions.js',
  'shop-processor.js',
  'shop-url.js',
  'detection-cache.js',
  'store-detect.js',
  'product-ingest.js',
  'lemon-payment-return.js',
  'background-jobs.js',
  'background.sw-bootstrap.js',
];

let timer = null;

function runBuild() {
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(function () {
    timer = null;
    const child = spawn(process.execPath, [BUILD_SCRIPT], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('close', function (code) {
      if (code === 0) {
        console.log(
          '[ShopRadar dev] background.js 已更新 → 请到 chrome://extensions 重新加载扩展\n'
        );
      }
    });
  }, 200);
}

console.log('[ShopRadar dev] 监听后台源文件，变更后自动 build:sw');
console.log('[ShopRadar dev] 监听:', WATCH_FILES.join(', '));
console.log('[ShopRadar dev] 按 Ctrl+C 停止\n');

runBuild();

WATCH_FILES.forEach(function (fileName) {
  const fullPath = path.join(ROOT, fileName);
  if (!fs.existsSync(fullPath)) {
    console.warn('[ShopRadar dev] 跳过不存在的文件:', fileName);
    return;
  }
  fs.watch(fullPath, { persistent: true }, function (eventType) {
    console.log('[ShopRadar dev]', eventType, fileName);
    runBuild();
  });
});
