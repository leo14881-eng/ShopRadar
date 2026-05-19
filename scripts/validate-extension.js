#!/usr/bin/env node
/**
 * ShopRadar 扩展发布前校验（在 chrome://extensions 重新加载之前运行）
 *
 * 用法: node scripts/validate-extension.js
 * 或:   npm run check
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/** 合并进 background.js 的源文件（npm run build:sw） */
const SW_BUILD_SOURCES = [
  'shop-processor.js',
  'shop-url.js',
  'detection-cache.js',
  'store-detect.js',
  'background-jobs.js',
  'background.sw-bootstrap.js',
];

/** 禁止在 Service Worker 中 importScripts（含 DOM / 页面抓取逻辑） */
const FORBIDDEN_SW_IMPORTS = ['sfcc-fetch.js', 'popup.js', 'popup.html'];

const EXTENSION_JS_FILES = [
  'background-entry.js',
  'background.js',
  'background-jobs.js',
  'popup.js',
  'shop-processor.js',
  'shop-url.js',
  'detection-cache.js',
  'store-detect.js',
  'sfcc-fetch.js',
];

const MAX_SW_IMPORT_BYTES = 80 * 1024;

let failed = 0;

function fail(message) {
  failed += 1;
  console.error('FAIL:', message);
}

function ok(message) {
  console.log('OK:', message);
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function checkSyntax(fileName) {
  const source = readFile(fileName);
  try {
    new vm.Script(source, { filename: fileName });
    ok('语法 ' + fileName);
  } catch (error) {
    fail('语法错误 ' + fileName + ': ' + error.message);
  }
}

function checkManifest() {
  const manifestPath = path.join(ROOT, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail('manifest.json 无法解析: ' + error.message);
    return;
  }

  if (manifest.manifest_version !== 3) {
    fail('manifest_version 必须为 3');
  }
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    fail('manifest.version 须为 x.y.z 格式');
  }
  if (!manifest.background || manifest.background.service_worker !== 'background.js') {
    fail('background.service_worker 必须为 background.js（先 npm run build:sw）');
  }
  ok('manifest.json');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function parseImportScripts(backgroundSource) {
  const found = [];
  const codeOnly = stripComments(backgroundSource);
  const pattern = /importScripts\s*\(\s*([^)]+)\s*\)/g;
  let match;
  while ((match = pattern.exec(codeOnly)) !== null) {
    const chunk = match[1];
    const parts = chunk.match(/['"]([^'"]+)['"]/g);
    if (!parts) {
      continue;
    }
    parts.forEach(function (quoted) {
      found.push(quoted.replace(/['"]/g, ''));
    });
  }
  return found;
}

function parseSwAllowedImportsArray(backgroundSource) {
  const match = backgroundSource.match(
    /SHOPRADAR_SW_ALLOWED_IMPORTS\s*=\s*\[([\s\S]*?)\]/
  );
  if (match) {
    const items = [];
    const itemPattern = /['"]([^'"]+)['"]/g;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(match[1])) !== null) {
      items.push(itemMatch[1]);
    }
    return items;
  }
  if (
    backgroundSource.indexOf('sw-bundle.js') !== -1 ||
    backgroundSource.indexOf('SW_BUNDLE_FILE') !== -1
  ) {
    return ALLOWED_SW_IMPORTS.slice();
  }
  return null;
}

function checkBackgroundNoImportScripts() {
  const source = readFile('background.js');
  const codeOnly = stripComments(source);
  if (codeOnly.indexOf('importScripts(') !== -1) {
    fail('background.js 不得使用 importScripts');
    return;
  }
  if (source.indexOf('ShopRadarBackgroundJobs') === -1) {
    fail('background.js 缺少后台任务，请运行 npm run build:sw');
    return;
  }
  if (source.indexOf('openPanelOnActionClick') === -1) {
    fail('background.js 缺少侧边栏配置');
    return;
  }
  if (source.indexOf('自动生成') === -1) {
    fail('background.js 不是构建产物，请运行 npm run build:sw');
    return;
  }
  ok('background.js 完整 SW（无 importScripts）');
}

function checkBackgroundBuildFresh() {
  const outPath = path.join(ROOT, 'background.js');
  if (!fs.existsSync(outPath)) {
    fail('缺少 background.js，请运行: npm run build:sw');
    return;
  }
  const outMtime = fs.statSync(outPath).mtimeMs;
  SW_BUILD_SOURCES.forEach(function (sourceFile) {
    const sourcePath = path.join(ROOT, sourceFile);
    if (!fs.existsSync(sourcePath)) {
      fail('background 源文件不存在: ' + sourceFile);
      return;
    }
    if (fs.statSync(sourcePath).mtimeMs > outMtime) {
      fail(sourceFile + ' 比 background.js 新，请运行: npm run build:sw');
    }
  });
  if (!failed) {
    ok('background.js 已生成且为最新');
  }
}

function checkSfccInjectionPattern() {
  const jobsSource = readFile('background-jobs.js');
  if (
    jobsSource.indexOf("files: ['sfcc-fetch.js']") === -1 &&
    jobsSource.indexOf('files: ["sfcc-fetch.js"]') === -1
  ) {
    fail('background-jobs.js 中 fetchSfccProducts 应通过 files 注入 sfcc-fetch.js');
  } else {
    ok('SFCC 通过 files 注入（非 importScripts）');
  }
}

function checkPopupScripts() {
  const html = readFile('popup.html');
  const required = [
    'shop-processor.js',
    'shop-url.js',
    'detection-cache.js',
    'store-detect.js',
    'popup.js',
  ];
  required.forEach(function (script) {
    if (html.indexOf('src="' + script + '"') === -1) {
      fail('popup.html 缺少 <script src="' + script + '">');
    }
  });
  if (!failed) {
    ok('popup.html 脚本引用完整');
  }
}

function checkBackgroundSize() {
  const size = fs.statSync(path.join(ROOT, 'background.js')).size;
  if (size > MAX_SW_IMPORT_BYTES * 2) {
    fail(
      'background.js 体积 ' +
        Math.round(size / 1024) +
        'KB 过大，请精简后台依赖'
    );
    return;
  }
  ok('background.js 体积 ' + Math.round(size / 1024) + ' KB');
}

console.log('ShopRadar 扩展校验\n');

checkManifest();
EXTENSION_JS_FILES.forEach(checkSyntax);
checkBackgroundBuildFresh();
checkBackgroundNoImportScripts();
checkBackgroundSize();
checkSfccInjectionPattern();
checkPopupScripts();

console.log('');
if (failed > 0) {
  console.error('共 ' + failed + ' 项失败。修复后再到 chrome://extensions 重新加载。');
  process.exit(1);
}

console.log('全部通过。可在 chrome://extensions 重新加载 ShopRadar。');
