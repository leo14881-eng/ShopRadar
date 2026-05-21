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
  'shop-permissions.js',
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
  'shop-export.js',
  'shop-permissions.js',
  'detection-cache.js',
  'store-detect.js',
  'sfcc-fetch.js',
  'product-ingest.js',
];

const FORBIDDEN_HOST_PERMISSIONS = ['<all_urls>', '*://*/*', 'http://*/*'];
const FORBIDDEN_CODE_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
];
const FORBIDDEN_STORE_TERMS = /\b(shopify\s*spy|data\s*scraper|web\s*scraper)\b/i;

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

  var hosts = []
    .concat(manifest.host_permissions || [])
    .concat(manifest.optional_host_permissions || []);
  hosts.forEach(function (pattern) {
    FORBIDDEN_HOST_PERMISSIONS.forEach(function (bad) {
      if (pattern === bad) {
        fail('manifest 禁止使用 host 权限: ' + bad);
      }
    });
  });

  var desc = String(manifest.description || '');
  if (FORBIDDEN_STORE_TERMS.test(desc)) {
    fail('manifest.description 含商店拒审敏感词 (spy/scraper)');
  }

  if (!manifest.default_locale) {
    fail('manifest 建议设置 default_locale（Chrome Web Store i18n）');
  }

  ok('manifest.json');
}

function checkExtensionCodeSafety() {
  EXTENSION_JS_FILES.forEach(function (fileName) {
    if (!fs.existsSync(path.join(ROOT, fileName))) {
      return;
    }
    var source = readFile(fileName);
    FORBIDDEN_CODE_PATTERNS.forEach(function (pattern) {
      if (pattern.test(source)) {
        fail(fileName + ' 含禁止模式: ' + pattern);
      }
    });
  });
  if (!failed) {
    ok('扩展 JS 无 eval / new Function');
  }
}

function checkPopupNoRemoteScripts() {
  var html = readFile('popup.html');
  if (/src\s*=\s*["']https?:\/\//i.test(html)) {
    fail('popup.html 不得引用远程 JS（Chrome 远程代码政策）');
    return;
  }
  ok('popup.html 无远程 script');
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
  if (source.indexOf('ShopRadarPermissions') === -1) {
    fail('background.js 缺少 ShopRadarPermissions，请运行 npm run build:sw');
    return;
  }
  if (source.indexOf('不在后台静默扫描') === -1) {
    fail('background.js 缺少隐私合规注释块');
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
    jobsSource.indexOf('tabs.onUpdated.addListener') !== -1 &&
    jobsSource.indexOf('不在后台静默扫描') === -1
  ) {
    fail('background-jobs.js 不得被动监听全站 tabs.onUpdated');
  } else {
    ok('background-jobs 无被动全站扫描');
  }

  if (
    jobsSource.indexOf("files: ['sfcc-fetch.js']") === -1 &&
    jobsSource.indexOf('files: ["sfcc-fetch.js"]') === -1
  ) {
    fail('background-jobs.js 中 fetchSfccProducts 应通过 files 注入 sfcc-fetch.js');
  } else {
    ok('SFCC 通过 files 注入（非 importScripts）');
  }
}

function checkManifestIcons() {
  const manifest = JSON.parse(readFile('manifest.json'));
  if (!manifest.icons || !manifest.icons['128']) {
    fail('manifest.json 缺少 icons（Chrome 商店必需）');
    return;
  }
  ['16', '48', '128'].forEach(function (size) {
    const rel = manifest.icons[size];
    if (!rel || !fs.existsSync(path.join(ROOT, rel))) {
      fail('缺少图标文件: ' + rel);
    }
  });
  if (!failed) {
    ok('manifest icons 完整');
  }
}

function checkPopupScripts() {
  const html = readFile('popup.html');
  const required = [
    'shop-processor.js',
    'shop-url.js',
    'shop-export.js',
    'shop-permissions.js',
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

function checkLocaleCsvHeaders() {
  const localesDir = path.join(ROOT, '_locales');
  if (!fs.existsSync(localesDir)) {
    fail('_locales 目录不存在');
    return;
  }
  const requiredKeys = [
    'csvHeaderTitle',
    'csvHeaderSku',
    'csvHeaderPrice',
    'csvHeaderCompareAtPrice',
    'csvHeaderVendor',
    'csvHeaderImageUrl',
    'csvHeaderCreatedAt',
  ];
  const locales = fs
    .readdirSync(localesDir, { withFileTypes: true })
    .filter(function (d) {
      return d.isDirectory();
    })
    .map(function (d) {
      return d.name;
    });
  if (!locales.length) {
    fail('_locales 下无语言目录');
    return;
  }
  locales.forEach(function (locale) {
    const filePath = path.join(localesDir, locale, 'messages.json');
    if (!fs.existsSync(filePath)) {
      fail('_locales/' + locale + '/messages.json 缺失');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (parseErr) {
      fail('_locales/' + locale + '/messages.json JSON 无效');
      return;
    }
    requiredKeys.forEach(function (key) {
      if (!parsed[key] || !parsed[key].message) {
        fail('_locales/' + locale + ' 缺少 ' + key);
      }
    });
  });
  if (!failed) {
    ok(
      'CSV 表头 i18n 完整（' +
        locales.length +
        ' 种语言: ' +
        locales.join(', ') +
        '）'
    );
  }
}

console.log('ShopRadar 扩展校验\n');

checkManifest();
checkManifestIcons();
checkExtensionCodeSafety();
checkPopupNoRemoteScripts();
EXTENSION_JS_FILES.forEach(checkSyntax);
checkBackgroundBuildFresh();
checkBackgroundNoImportScripts();
checkBackgroundSize();
checkSfccInjectionPattern();
checkPopupScripts();
checkLocaleCsvHeaders();
if (failed > 0) {
  console.error('共 ' + failed + ' 项失败。修复后再到 chrome://extensions 重新加载。');
  process.exit(1);
}

console.log('全部通过。可在 chrome://extensions 重新加载 ShopRadar。');
