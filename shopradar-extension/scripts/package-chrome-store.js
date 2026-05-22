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
  'console-shield.js',
  'extension-config.js',
  'extension-env.js',
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
  'website-device-sync.js',
];

const INCLUDE_DIRS = ['icons', '_locales'];

const FORBIDDEN_SNIPPETS = [
  'localhost:3000',
  'localhost:8080',
  'isUnpackedExtensionLoad',
  'shopradar_env === \'production\'',
  'ngrok',
  'trycloudflare',
  'USE_PROD_API',
  'console.error(',
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

/** 商店包移除 localhost / 127.0.0.1（Chrome 审核友好） */
function sanitizeProductionManifest(manifest) {
  function isLocalDevHostPermission(entry) {
    return (
      /^http:\/\/localhost(\:\d+)?\/\*$/.test(entry) ||
      /^http:\/\/127\.0\.0\.1(\:\d+)?\/\*$/.test(entry)
    );
  }

  function isLocalDevMatch(entry) {
    return (
      String(entry).indexOf('localhost') !== -1 ||
      String(entry).indexOf('127.0.0.1') !== -1
    );
  }

  if (Array.isArray(manifest.host_permissions)) {
    manifest.host_permissions = manifest.host_permissions.filter(function (entry) {
      return !isLocalDevHostPermission(entry);
    });
  }

  if (Array.isArray(manifest.content_scripts)) {
    manifest.content_scripts = manifest.content_scripts.map(function (script) {
      if (!script || !Array.isArray(script.matches)) {
        return script;
      }
      return Object.assign({}, script, {
        matches: script.matches.filter(function (match) {
          return !isLocalDevMatch(match);
        }),
      });
    });
  }

  return manifest;
}

function assertProductionManifestClean(manifestPath) {
  const text = fs.readFileSync(manifestPath, 'utf8');
  if (text.indexOf('localhost') !== -1 || text.indexOf('127.0.0.1') !== -1) {
    console.error('生产 manifest 仍含 localhost / 127.0.0.1:', manifestPath);
    process.exit(1);
  }
}

function main() {
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const file of INCLUDE_FILES) {
    if (file === 'background.js') {
      continue;
    }
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) {
      console.error('缺少文件:', file);
      process.exit(1);
    }
    copyFile(src, path.join(OUT_DIR, file));
  }

  execSync(
    'node scripts/build-sw-bundle.js --production --out "' +
      path.join(OUT_DIR, 'background.js').replace(/\\/g, '/') +
      '"',
    { cwd: ROOT, stdio: 'inherit' }
  );

  // 商店包固定线上环境（覆盖开发版 extension-env.js）
  const prodEnv = path.join(ROOT, 'extension-env.production.js');
  if (!fs.existsSync(prodEnv)) {
    console.error('缺少文件: extension-env.production.js');
    process.exit(1);
  }
  copyFile(prodEnv, path.join(OUT_DIR, 'extension-env.js'));

  for (const dir of INCLUDE_DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) {
      console.error('缺少目录:', dir);
      process.exit(1);
    }
    copyDir(src, path.join(OUT_DIR, dir));
  }

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const manifest = sanitizeProductionManifest(
    JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  );
  manifest.shopradar_env = 'production';
  if (!manifest.icons || !manifest.icons['128']) {
    console.error('manifest 缺少 icons');
    process.exit(1);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  assertProductionManifestClean(manifestPath);
  console.log('已清理商店 manifest（无 localhost）');

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
