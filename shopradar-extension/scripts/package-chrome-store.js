#!/usr/bin/env node
/**
 * 打包 Chrome Web Store 上传用 zip（仅扩展运行文件）
 * 用法: npm run package:store
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-store');
const ZIP_PATH = path.join(ROOT, 'ShopRadar-chrome-store.zip');

const INCLUDE_FILES = [
  'manifest.json',
  'extension-config.js',
  'local-dev-config.js',
  'extension-guard.js',
  'shop-permissions.js',
  'popup.html',
  'popup.js',
  'background.js',
  'shop-processor.js',
  'shop-url.js',
  'shop-export.js',
  'detection-cache.js',
  'store-detect.js',
  'sfcc-fetch.js',
  'lemon-payment-return.js',
  'lemon-checkout.config.js',
  'product-ingest.js',
];

const INCLUDE_DIRS = ['icons', '_locales'];

const FORBIDDEN_SNIPPETS = [
  'localhost:3000',
  '__SHOPRADAR_LOCAL_DEV__ = true',
  'ngrok',
  'trycloudflare',
  'USE_PROD_API',
  '<all_urls>',
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, name);
    const d = path.join(destDir, name);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function main() {
  execSync('npm run build:sw', { cwd: ROOT, stdio: 'inherit' });

  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const file of INCLUDE_FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) {
      console.error('缺少文件:', file);
      process.exit(1);
    }
    copyFile(src, path.join(OUT_DIR, file));
  }

  for (const dir of INCLUDE_DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) {
      console.error('缺少目录:', dir);
      process.exit(1);
    }
    copyDir(src, path.join(OUT_DIR, dir));
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8')
  );
  if (!manifest.icons || !manifest.icons['128']) {
    console.error('manifest 缺少 icons');
    process.exit(1);
  }

  for (const file of INCLUDE_FILES) {
    if (!file.endsWith('.js')) {
      continue;
    }
    const text = fs.readFileSync(path.join(OUT_DIR, file), 'utf8');
    for (const bad of FORBIDDEN_SNIPPETS) {
      if (text.indexOf(bad) !== -1) {
        console.error('生产包仍含开发标记:', bad, 'in', file);
        process.exit(1);
      }
    }
  }

  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  if (process.platform === 'win32') {
    execSync(
      'powershell -NoProfile -Command "Compress-Archive -Path \'' +
        OUT_DIR.replace(/'/g, "''") +
        '\\*\' -DestinationPath \'' +
        ZIP_PATH.replace(/'/g, "''") +
        '\' -Force"',
      { stdio: 'inherit' }
    );
  } else {
    execSync('zip -r "' + ZIP_PATH + '" .', { cwd: OUT_DIR, stdio: 'inherit' });
  }

  const sizeKb = Math.round(fs.statSync(ZIP_PATH).size / 1024);
  console.log('');
  console.log('已生成:', ZIP_PATH, '(' + sizeKb + ' KB)');
  console.log('上传到: Chrome Web Store Developer Dashboard → Package');
}

main();
