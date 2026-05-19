#!/usr/bin/env node
/**
 * 生成 background.js = 后台依赖合并 + SW 引导（无 importScripts）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PARTS = [
  'shop-processor.js',
  'shop-url.js',
  'detection-cache.js',
  'store-detect.js',
  'background-jobs.js',
];
const BOOTSTRAP_FILE = 'background.sw-bootstrap.js';
const OUTPUT_FILE = 'background.js';

var header =
  '/* ShopRadar background.js — 自动生成，请勿手改。修改源文件后运行: npm run build:sw */\n';
var body = '';

PARTS.forEach(function (fileName) {
  var fullPath = path.join(ROOT, fileName);
  if (!fs.existsSync(fullPath)) {
    console.error('缺少文件:', fileName);
    process.exit(1);
  }
  body += '\n/* ----- ' + fileName + ' ----- */\n';
  body += fs.readFileSync(fullPath, 'utf8');
  if (!body.endsWith('\n')) {
    body += '\n';
  }
});

var bootstrapPath = path.join(ROOT, BOOTSTRAP_FILE);
if (!fs.existsSync(bootstrapPath)) {
  console.error('缺少文件:', BOOTSTRAP_FILE);
  process.exit(1);
}
body += '\n';
body += fs.readFileSync(bootstrapPath, 'utf8');

var outPath = path.join(ROOT, OUTPUT_FILE);
fs.writeFileSync(outPath, header + body, 'utf8');

console.log(
  '已生成 ' +
    OUTPUT_FILE +
    ' (' +
    Math.round(fs.statSync(outPath).size / 1024) +
    ' KB，无 importScripts）'
);
