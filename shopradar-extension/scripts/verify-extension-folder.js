#!/usr/bin/env node
/**
 * 检查「加载已解压扩展程序」所选目录是否正确
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

var required = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'shop-permissions.js',
  'shop-processor.js',
  'shop-url.js',
  'shop-export.js',
  'detection-cache.js',
  'store-detect.js',
  'sfcc-fetch.js',
];

var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
var sw = manifest.background && manifest.background.service_worker;

console.log('ShopRadar 扩展目录检查\n');
console.log('路径:', ROOT);
console.log('manifest.version:', manifest.version);
console.log('service_worker:', sw, '\n');

var ok = true;
required.forEach(function (file) {
  var full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    console.log('缺少:', file);
    ok = false;
  } else {
    console.log('OK  ', file);
  }
});

if (sw !== 'background.js') {
  console.log('FAIL manifest.service_worker 应为 background.js，当前:', sw);
  ok = false;
}

var bgPath = path.join(ROOT, 'background.js');
if (fs.existsSync(bgPath)) {
  var bg = fs.readFileSync(bgPath, 'utf8');
  var bgCode = bg.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (bgCode.indexOf('importScripts(') !== -1) {
    console.log('FAIL background.js 含 importScripts');
    ok = false;
  } else if (bg.indexOf('ShopRadarBackgroundJobs') === -1) {
    console.log('FAIL background.js 不完整，请 npm run build:sw');
    ok = false;
  } else {
    console.log('OK   background.js 含完整后台任务');
  }
}

console.log('');
if (ok) {
  console.log('目录正确。请在 chrome://extensions 加载 shopradar-extension/ 文件夹。');
  process.exit(0);
}
console.log('目录不完整或 manifest 配置错误。');
process.exit(1);
