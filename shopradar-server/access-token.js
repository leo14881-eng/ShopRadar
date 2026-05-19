/**
 * ShopRadar 短期访问令牌（HMAC-SHA256，无第三方 JWT 依赖）
 * 方案 B：shopradar-server/.token-secret 单行密钥
 * 或环境变量 SHOPRADAR_TOKEN_SECRET；均未配置时首次启动自动生成 .token-secret
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_VERSION = 2;
const TOKEN_TTL_MS = Number(process.env.SHOPRADAR_TOKEN_TTL_MS) || 20 * 60 * 1000;
const SECRET_FILE = path.join(__dirname, '.token-secret');

let cachedSecret = null;

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

function getTokenSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }

  const fromEnv =
    process.env.SHOPRADAR_TOKEN_SECRET || process.env.JWT_SECRET;
  if (fromEnv && String(fromEnv).trim()) {
    cachedSecret = String(fromEnv).trim();
    return cachedSecret;
  }

  if (fs.existsSync(SECRET_FILE)) {
    const lines = fs.readFileSync(SECRET_FILE, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.charAt(0) !== '#') {
        cachedSecret = line;
        return cachedSecret;
      }
    }
  }

  cachedSecret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, cachedSecret, { encoding: 'utf8', mode: 0o600 });
  console.warn(
    '[ShopRadar Server] 已生成 .token-secret（开发用）；生产请设置 SHOPRADAR_TOKEN_SECRET'
  );
  return cachedSecret;
}

/**
 * @param {{ deviceId: string, isPro?: boolean, domain?: string, ttlMs?: number }} opts
 * @returns {{ token: string, expiresAt: number, expiresIn: number }}
 */
function signAccessToken(opts) {
  const deviceId = String(opts.deviceId || '').trim();
  if (!deviceId) {
    throw new Error('deviceId required for access token');
  }

  const ttlMs = opts.ttlMs != null ? Number(opts.ttlMs) : TOKEN_TTL_MS;
  const expiresAt = Date.now() + ttlMs;
  const domain = opts.domain ? String(opts.domain).trim().toLowerCase() : '';
  const payload = {
    v: TOKEN_VERSION,
    deviceId: deviceId,
    isPro: Boolean(opts.isPro),
    domain: domain,
    exp: expiresAt,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(Buffer.from(payloadJson, 'utf8'));
  const sig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(payloadB64)
    .digest();
  const token = payloadB64 + '.' + base64UrlEncode(sig);

  return {
    token: token,
    expiresAt: expiresAt,
    expiresIn: Math.max(1, Math.floor(ttlMs / 1000)),
  };
}

/**
 * @param {string} token
 * @param {string} expectedDeviceId
 * @returns {{ valid: boolean, payload?: object, reason?: string }}
 */
function verifyAccessToken(token, expectedDeviceId) {
  const raw = String(token || '').trim();
  if (!raw) {
    return { valid: false, reason: 'missing_token' };
  }

  const parts = raw.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'malformed_token' };
  }

  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(payloadB64)
    .digest();

  let actualSig;
  try {
    actualSig = base64UrlDecode(sigB64);
  } catch (decodeErr) {
    return { valid: false, reason: 'invalid_signature_encoding' };
  }

  if (
    actualSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(actualSig, expectedSig)
  ) {
    return { valid: false, reason: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch (parseErr) {
    return { valid: false, reason: 'invalid_payload' };
  }

  if (!payload || payload.v !== TOKEN_VERSION) {
    return { valid: false, reason: 'unsupported_version' };
  }

  if (String(payload.deviceId || '') !== String(expectedDeviceId || '').trim()) {
    return { valid: false, reason: 'device_mismatch' };
  }

  if (!payload.exp || Number(payload.exp) < Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload: payload };
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function extractAccessTokenFromRequest(req) {
  const auth = req.headers && req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }

  if (req.body && req.body.accessToken) {
    return String(req.body.accessToken).trim();
  }

  if (req.query && req.query.accessToken) {
    return String(req.query.accessToken).trim();
  }

  return '';
}

/**
 * 在 allowed / isPro 响应上附加短期令牌
 * @param {object} result
 * @param {string} deviceId
 * @returns {object}
 */
function attachAccessTokenToResult(result, deviceId, domain) {
  if (!result || (!result.allowed && !result.isPro)) {
    return result;
  }

  try {
    const signed = signAccessToken({
      deviceId: deviceId,
      isPro: Boolean(result.isPro),
      domain: domain || (result.domain ? String(result.domain) : ''),
    });
    result.accessToken = signed.token;
    result.tokenExpiresAt = signed.expiresAt;
    result.tokenExpiresIn = signed.expiresIn;
  } catch (signErr) {
    console.warn('[ShopRadar Server] 签发 accessToken 失败:', signErr.message);
  }

  return result;
}

module.exports = {
  TOKEN_TTL_MS: TOKEN_TTL_MS,
  signAccessToken: signAccessToken,
  verifyAccessToken: verifyAccessToken,
  extractAccessTokenFromRequest: extractAccessTokenFromRequest,
  attachAccessTokenToResult: attachAccessTokenToResult,
};
