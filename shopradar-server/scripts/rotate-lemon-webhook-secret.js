/**
 * 生成符合 Lemon 限制的 Signing secret（6–40 字符）并写入 .lemon-webhook-secret
 * 用法: node scripts/rotate-lemon-webhook-secret.js
 */
const fs = require('fs');
const path = require('path');
const { generateLemonWebhookSecret } = require('../lemon-webhook');

const outPath = path.join(__dirname, '..', '.lemon-webhook-secret');
const secret = generateLemonWebhookSecret(32);

fs.writeFileSync(outPath, secret + '\n', { encoding: 'utf8', mode: 0o600 });

console.log('[ShopRadar] 已写入 .lemon-webhook-secret（' + secret.length + ' 字符）');
console.log('[ShopRadar] 请把下面整行复制到 Lemon Webhook → Signing secret：');
console.log('');
console.log(secret);
console.log('');
