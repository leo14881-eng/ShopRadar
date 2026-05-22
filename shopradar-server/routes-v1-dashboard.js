'use strict';

const { parseAcceptLanguage } = require('./i18n-messages');
const {
  verifyAccessToken,
  extractAccessTokenFromRequest,
} = require('./access-token');
const { isActiveProUser } = require('./user-pro');
const { TRENDING_CACHE_TTL_SEC } = require('./redis-client');

/**
 * Shared handler for v1 dashboard list endpoints (trending, famous-stores).
 *
 * @param {import('express').Application} app
 * @param {import('sqlite3').Database} db
 * @param {Function} dbGet
 * @param {{
 *   path: string,
 *   logLabel: string,
 *   defaultLimit: number,
 *   maxLimit: number,
 *   goldenLimit: number,
 *   getCache: () => Promise<{ items?: unknown[] } | null>,
 *   setCache: (golden: unknown) => Promise<void>,
 *   queryGolden: (db: import('sqlite3').Database, opts: { limit: number }) => Promise<unknown>,
 *   tierForViewer: (golden: unknown, opts: { isPro: boolean, limit: number, locale: string }) => object,
 * }} config
 */
function mountDashboardListRoute(app, db, dbGet, config) {
  app.get(config.path, function (req, res) {
    const deviceId = req.query.deviceId
      ? String(req.query.deviceId).trim()
      : '';
    const limit = Math.min(
      Math.max(Number(req.query.limit) || config.defaultLimit, 1),
      config.maxLimit
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
        const isPro = isActiveProUser(row);
        const locale = parseAcceptLanguage(req.headers['accept-language']);

        let golden = await config.getCache();
        let cacheHit = Boolean(
          golden && Array.isArray(golden.items) && golden.items.length > 0
        );

        if (!cacheHit) {
          golden = await config.queryGolden(db, { limit: config.goldenLimit });
          await config.setCache(golden);
        }

        const payload = config.tierForViewer(golden, {
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
        console.error(
          '[ShopRadar Server] v1 ' + config.logLabel + ' 失败:',
          error
        );
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
}

module.exports = {
  mountDashboardListRoute: mountDashboardListRoute,
};
