'use strict';

/**
 * ShopRadar API v1 路由
 * - GET  /api/v1/dashboard/trending
 * - GET  /api/v1/dashboard/trending/famous-stores
 * - POST /api/v1/webhook/lemonsqueezy
 */

const {
  verifyLemonWebhookSignature,
  getLemonWebhookSecret,
  isLemonWebhookSecretConfigured,
} = require('./lemon-webhook');
const { handleLemonWebhookEvent } = require('./lemon-webhook-handler');
const { savePendingProClaim, saveProEmailRegistry, logProWebhookIdentity } = require('./pro-claim');
const {
  queryTrendingGolden,
  tierTrendingForViewer,
  queryFamousStoresGolden,
  tierFamousStoresForViewer,
} = require('./trending');
const {
  getTrendingCache,
  setTrendingCache,
  getFamousStoresCache,
  setFamousStoresCache,
} = require('./redis-client');
const { mountDashboardListRoute } = require('./routes-v1-dashboard');

const V1_WEBHOOK_PATH = '/api/v1/webhook/lemonsqueezy';

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

  mountDashboardListRoute(app, db, dbGet, {
    path: '/api/v1/dashboard/trending',
    logLabel: 'trending',
    defaultLimit: 100,
    maxLimit: 100,
    goldenLimit: 100,
    getCache: getTrendingCache,
    setCache: setTrendingCache,
    queryGolden: queryTrendingGolden,
    tierForViewer: tierTrendingForViewer,
  });

  mountDashboardListRoute(app, db, dbGet, {
    path: '/api/v1/dashboard/trending/famous-stores',
    logLabel: 'famous-stores',
    defaultLimit: 25,
    maxLimit: 50,
    goldenLimit: 50,
    getCache: getFamousStoresCache,
    setCache: setFamousStoresCache,
    queryGolden: queryFamousStoresGolden,
    tierForViewer: tierFamousStoresForViewer,
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
        saveProEmailRegistry: saveProEmailRegistry,
        logProWebhookIdentity: logProWebhookIdentity,
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
