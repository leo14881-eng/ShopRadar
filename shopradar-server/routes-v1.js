'use strict';

/**
 * ShopRadar API v1 路由
 * - GET  /api/v1/dashboard/trending
 * - POST /api/v1/webhook/lemonsqueezy
 */

const {
  verifyAccessToken,
  extractAccessTokenFromRequest,
} = require('./access-token');
const {
  verifyLemonWebhookSignature,
  getLemonWebhookSecret,
  isLemonWebhookSecretConfigured,
} = require('./lemon-webhook');
const { handleLemonWebhookEvent } = require('./lemon-webhook-handler');
const { savePendingProClaim } = require('./pro-claim');
const { parseAcceptLanguage } = require('./i18n-messages');
const {
  queryTrendingGolden,
  tierTrendingForViewer,
} = require('./trending');
const {
  getTrendingCache,
  setTrendingCache,
  TRENDING_CACHE_TTL_SEC,
} = require('./redis-client');

const V1_WEBHOOK_PATH = '/api/v1/webhook/lemonsqueezy';

/**
 * @param {object|null} row
 */
function isActiveProRow(row) {
  if (!row || Number(row.is_pro) !== 1) {
    return false;
  }
  if (row.pro_expires_at) {
    const expiresMs = new Date(row.pro_expires_at).getTime();
    if (expiresMs && Date.now() > expiresMs) {
      return false;
    }
  }
  return true;
}

/**
 * @param {import('express').Application} app
 * @param {import('sqlite3').Database} db
 * @param {{ enqueueDbWrite: Function, dbGet: Function, dbRun: Function, getTodayDateString: Function }} deps
 */
function mountV1Routes(app, db, deps) {
  const enqueueDbWrite = deps.enqueueDbWrite;
  const dbGet = deps.dbGet;
  const dbRun = deps.dbRun;
  const getTodayDateString = deps.getTodayDateString;

  /**
   * GET /api/v1/dashboard/trending
   * 鉴权：Authorization: Bearer <token> 或 ?accessToken= / ?deviceId=
   */
  app.get('/api/v1/dashboard/trending', function (req, res) {
    const deviceId = req.query.deviceId
      ? String(req.query.deviceId).trim()
      : '';
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      100
    );
    const accessToken = extractAccessTokenFromRequest(req);

    if (!deviceId) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_DEVICE_ID',
        msg: '缺少 deviceId',
      });
    }

    if (accessToken) {
      const tokenCheck = verifyAccessToken(accessToken, deviceId);
      if (!tokenCheck.valid) {
        return res.status(401).json({
          ok: false,
          code: 'INVALID_TOKEN',
          msg: '访问令牌无效或已过期',
        });
      }
    }

    dbGet(
      db,
      'SELECT device_id, is_pro, pro_expires_at FROM users WHERE device_id = ?',
      [deviceId]
    )
      .then(async function (row) {
        const isPro = isActiveProRow(row);
        const locale = parseAcceptLanguage(req.headers['accept-language']);

        let golden = await getTrendingCache();
        let cacheHit = Boolean(golden && golden.items);

        if (!cacheHit) {
          golden = await queryTrendingGolden(db, { limit: 100 });
          await setTrendingCache(golden);
        }

        const payload = tierTrendingForViewer(golden, {
          isPro: isPro,
          limit: limit,
          locale: locale,
        });

        res.json(
          Object.assign({}, payload, {
            cache: {
              hit: cacheHit,
              ttl_sec: TRENDING_CACHE_TTL_SEC,
            },
            viewer: {
              device_id: deviceId,
              is_pro: isPro,
            },
          })
        );
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] v1 trending 失败:', error);
        if (error && error.code && String(error.code).indexOf('REDIS') === 0) {
          return res.status(503).json({
            ok: false,
            code: error.code,
            msg: 'Redis 缓存不可用',
          });
        }
        res.status(500).json({ ok: false, msg: '服务器内部错误' });
      });
  });

  /**
   * POST /api/v1/webhook/lemonsqueezy
   * 强制 HMAC 验签（生产环境不可关闭）
   */
  app.post(V1_WEBHOOK_PATH, function (req, res) {
    if (!isLemonWebhookSecretConfigured()) {
      return res.status(503).json({
        ok: false,
        msg: 'LEMON_SQUEEZY_WEBHOOK_SECRET not configured',
      });
    }

    const signatureHeader =
      (req.headers &&
        (req.headers['x-signature'] || req.headers['X-Signature'])) ||
      '';

    const secret =
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ||
      getLemonWebhookSecret();

    if (
      !req.rawBody ||
      !verifyLemonWebhookSignature(req.rawBody, signatureHeader, secret)
    ) {
      console.warn('[ShopRadar Server] v1 Lemon Webhook 验签失败 → 401');
      return res.status(401).json({
        ok: false,
        msg: 'invalid webhook signature',
      });
    }

    const body = req.body || {};

    enqueueDbWrite(function () {
      return handleLemonWebhookEvent(db, body, {
        dbGet: dbGet,
        dbRun: dbRun,
        getTodayDateString: getTodayDateString,
        savePendingProClaim: savePendingProClaim,
      });
    })
      .then(function (result) {
        if (result.handled) {
          console.log(
            '[ShopRadar Server] v1 Lemon Webhook ✓ | event=' +
              (result.eventName || '-') +
              ' | action=' +
              (result.action || '-') +
              ' | deviceId=' +
              (result.deviceId || '-')
          );
        } else {
          console.log(
            '[ShopRadar Server] v1 Lemon Webhook 忽略 | event=' +
              (result.eventName || '-') +
              ' | reason=' +
              (result.reason || '-')
          );
        }
        res.status(200).json({ ok: true, received: true, result: result });
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] v1 Lemon Webhook 处理失败:', error);
        res.status(500).json({ ok: false, msg: 'webhook handler error' });
      });
  });
}

module.exports = {
  mountV1Routes: mountV1Routes,
  V1_WEBHOOK_PATH: V1_WEBHOOK_PATH,
};
