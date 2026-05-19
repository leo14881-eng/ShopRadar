/**
 * Lemon Squeezy Webhook 验签（HMAC-SHA256 hex → X-Signature）
 * @see https://docs.lemonsqueezy.com/help/webhooks/signing-requests
 *
 * 配置（与 Lemon 后台 Webhook「Signing secret」一致）：
 *   SHOPRADAR_LEMON_WEBHOOK_SECRET 或 shopradar-server/.lemon-webhook-secret
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_FILE = path.join(__dirname, '.lemon-webhook-secret');
const VERIFY_FLAG_FILE = path.join(__dirname, '.lemon-webhook-verify');
/** @see https://docs.lemonsqueezy.com/help/webhooks/signing-requests */
const LEMON_SIGNING_SECRET_MIN_LEN = 6;
const LEMON_SIGNING_SECRET_MAX_LEN = 40;

let cachedSecret = null;

function readFirstContentLine(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && line.charAt(0) !== '#') {
      return line;
    }
  }
  return '';
}

function getLemonWebhookSecret() {
  if (cachedSecret !== null) {
    return cachedSecret;
  }

  const fromEnv =
    process.env.SHOPRADAR_LEMON_WEBHOOK_SECRET ||
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (fromEnv && String(fromEnv).trim()) {
    cachedSecret = String(fromEnv).trim();
    return cachedSecret;
  }

  cachedSecret = readFirstContentLine(SECRET_FILE);
  if (
    cachedSecret &&
    (cachedSecret.length < LEMON_SIGNING_SECRET_MIN_LEN ||
      cachedSecret.length > LEMON_SIGNING_SECRET_MAX_LEN)
  ) {
    console.warn(
      '[ShopRadar Server] .lemon-webhook-secret 长度须在 ' +
        LEMON_SIGNING_SECRET_MIN_LEN +
        '-' +
        LEMON_SIGNING_SECRET_MAX_LEN +
        ' 字符（Lemon 限制），当前=' +
        cachedSecret.length
    );
  }
  return cachedSecret;
}

function isLemonWebhookSecretConfigured() {
  const secret = getLemonWebhookSecret();
  if (!secret) {
    return false;
  }
  return (
    secret.length >= LEMON_SIGNING_SECRET_MIN_LEN &&
    secret.length <= LEMON_SIGNING_SECRET_MAX_LEN
  );
}

/**
 * Lemon Signing secret：6–40 字符
 * @param {number} [length=32]
 * @returns {string}
 */
function generateLemonWebhookSecret(length) {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const len = Math.min(
    LEMON_SIGNING_SECRET_MAX_LEN,
    Math.max(LEMON_SIGNING_SECRET_MIN_LEN, Number(length) || 32)
  );
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function parseTruthyFlag(value) {
  const flag = String(value || '')
    .trim()
    .toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/** 默认关闭；开启：.lemon-webhook-verify 写 1，或 SHOPRADAR_LEMON_WEBHOOK_VERIFY=1 */
function isLemonWebhookVerifyEnabled() {
  if (process.env.SHOPRADAR_LEMON_WEBHOOK_VERIFY != null) {
    return parseTruthyFlag(process.env.SHOPRADAR_LEMON_WEBHOOK_VERIFY);
  }

  const verifyLine = readFirstContentLine(VERIFY_FLAG_FILE);
  if (verifyLine) {
    return parseTruthyFlag(verifyLine);
  }

  return false;
}

/**
 * @param {import('express').Request} req
 * @returns {{ ok: boolean, status?: number, msg?: string }}
 */
function assertLemonWebhookVerified(req) {
  if (!isLemonWebhookVerifyEnabled()) {
    return { ok: true };
  }

  if (!isLemonWebhookSecretConfigured()) {
    return {
      ok: false,
      status: 503,
      msg: 'webhook signing secret not configured',
    };
  }

  const signatureHeader =
    (req.headers && (req.headers['x-signature'] || req.headers['X-Signature'])) ||
    '';

  if (!req.rawBody || !verifyLemonWebhookSignature(req.rawBody, signatureHeader)) {
    return { ok: false, status: 401, msg: 'invalid webhook signature' };
  }

  return { ok: true };
}

/**
 * @param {Buffer|string} rawBody 原始 JSON 请求体
 * @param {string} signatureHeader 请求头 X-Signature
 * @param {string} [secret] 可选，默认读取环境/文件
 * @returns {boolean}
 */
function verifyLemonWebhookSignature(rawBody, signatureHeader, secret) {
  const signingSecret = secret != null ? String(secret).trim() : getLemonWebhookSecret();
  const signature = String(signatureHeader || '').trim();

  if (!signingSecret || !signature || rawBody == null) {
    return false;
  }

  const bodyBuf = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody), 'utf8');

  const digest = Buffer.from(
    crypto.createHmac('sha256', signingSecret).update(bodyBuf).digest('hex'),
    'utf8'
  );
  const sigBuf = Buffer.from(signature, 'utf8');

  if (digest.length !== sigBuf.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(digest, sigBuf);
  } catch (compareErr) {
    return false;
  }
}

module.exports = {
  LEMON_SIGNING_SECRET_MAX_LEN: LEMON_SIGNING_SECRET_MAX_LEN,
  generateLemonWebhookSecret: generateLemonWebhookSecret,
  getLemonWebhookSecret: getLemonWebhookSecret,
  isLemonWebhookSecretConfigured: isLemonWebhookSecretConfigured,
  isLemonWebhookVerifyEnabled: isLemonWebhookVerifyEnabled,
  verifyLemonWebhookSignature: verifyLemonWebhookSignature,
  assertLemonWebhookVerified: assertLemonWebhookVerified,
};
