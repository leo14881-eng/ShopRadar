/**
 * ShopRadar 鉴权服务
 * 技术栈：Node.js + Express + SQLite (sqlite3)
 * 规则：每设备每天免费查询 3 次；is_pro=1 或白名单无限次
 * 支付：Lemon Squeezy Webhook → POST /api/webhook/lemon-squeezy
 *       本地联调用 npm run tunnel（Quick Tunnel，仅开发）；线上用固定 HTTPS 域名，勿用 trycloudflare
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const {
  verifyAccessToken,
  extractAccessTokenFromRequest,
  attachAccessTokenToResult,
} = require('./access-token');
const {
  migrateTrendingTables,
  ingestProducts,
  queryTrending,
  MAX_INGEST_PRODUCTS,
} = require('./trending');
const {
  isLemonWebhookSecretConfigured,
  isLemonWebhookVerifyEnabled,
  assertLemonWebhookVerified,
} = require('./lemon-webhook');
const { handleLemonWebhookEvent, activateProForUser } = require('./lemon-webhook-handler');
const {
  migratePendingProClaimsTable,
  migrateProEmailRegistryTable,
  savePendingProClaim,
  saveProEmailRegistry,
  logProWebhookIdentity,
  claimProByEmail,
} = require('./pro-claim');
const { mountV1Routes, V1_WEBHOOK_PATH } = require('./routes-v1');
const { connectRedis, closeRedis, pingRedis } = require('./redis-client');

const LEMON_WEBHOOK_PATH = '/api/webhook/lemon-squeezy';
const LEMON_WEBHOOK_PATHS = new Set([LEMON_WEBHOOK_PATH, V1_WEBHOOK_PATH]);

const PORT = Number(process.env.PORT) || 3000;
const FREE_DAILY_LIMIT = 3;
const DB_PATH = process.env.SHOPRADAR_DB_PATH
  ? path.resolve(process.env.SHOPRADAR_DB_PATH)
  : path.join(__dirname, 'database.sqlite');
const WHITELIST_PATH = path.join(__dirname, 'whitelist.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const WEBSITE_URL = String(process.env.SHOPRADAR_WEBSITE_URL || 'https://shopradar.uk').replace(
  /\/$/,
  ''
);

/** 额度用尽时的标准提示文案 */
const LIMIT_EXCEEDED_MSG =
  '您的每日 3 次免费额度已用完，请升级为 Pro 会员解锁无限次查询与 CSV 导出功能！';

const app = express();

app.use(cors());
app.use(
  express.json({
    limit: '512kb',
    verify: function (req, _res, buf) {
      const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
      if (LEMON_WEBHOOK_PATHS.has(pathOnly)) {
        req.rawBody = buf;
      }
    },
  })
);

/** 内存中的白名单（修改 whitelist.json 后每次请求重读） */
let whitelistCache = { ips: [], deviceIds: [] };

function loadWhitelist() {
  try {
    if (fs.existsSync(WHITELIST_PATH)) {
      const raw = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'));
      whitelistCache = {
        ips: Array.isArray(raw.ips) ? raw.ips.map(String) : [],
        deviceIds: Array.isArray(raw.deviceIds) ? raw.deviceIds.map(String) : [],
      };
    }
  } catch (error) {
    console.warn('[ShopRadar Server] 读取 whitelist.json 失败:', error.message);
  }
  return whitelistCache;
}

function normalizeIp(ip) {
  const value = (ip || '').trim();
  if (value.startsWith('::ffff:')) {
    return value.slice(7);
  }
  return value;
}

function isLoopbackIp(ip) {
  const n = normalizeIp(ip);
  return n === '127.0.0.1' || n === '::1' || n === 'localhost';
}

function ipMatchesWhitelist(clientIp, whitelistIp) {
  const client = normalizeIp(clientIp);
  const rule = normalizeIp(whitelistIp);
  if (!client || !rule) {
    return false;
  }
  if (client === rule) {
    return true;
  }
  if (isLoopbackIp(client) && isLoopbackIp(rule)) {
    return true;
  }
  return false;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '';
}

function isWhitelisted(req, deviceId) {
  const list = whitelistCache;
  const clientIp = getClientIp(req);

  if (
    clientIp &&
    list.ips.some(function (ruleIp) {
      return ipMatchesWhitelist(clientIp, ruleIp);
    })
  ) {
    return { hit: true, by: 'ip', clientIp: normalizeIp(clientIp) };
  }

  if (deviceId && list.deviceIds.indexOf(deviceId) !== -1) {
    return { hit: true, by: 'deviceId', clientIp: normalizeIp(clientIp) };
  }

  return { hit: false, by: '', clientIp: normalizeIp(clientIp) };
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function dbGet(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.get(sql, params, function (err, row) {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function dbAll(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.all(sql, params || [], function (err, rows) {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function dbRun(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function isProRow(row) {
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

function ensureUsersColumn(db, columnName, ddl) {
  return new Promise(function (resolve, reject) {
    db.all('PRAGMA table_info(users)', function (pragmaErr, columns) {
      if (pragmaErr) {
        reject(pragmaErr);
        return;
      }
      const exists = (columns || []).some(function (col) {
        return col && col.name === columnName;
      });
      if (exists) {
        resolve(false);
        return;
      }
      db.run(ddl, function (alterErr) {
        if (alterErr) {
          reject(alterErr);
          return;
        }
        console.log('[ShopRadar Server] 已迁移 users.' + columnName);
        resolve(true);
      });
    });
  });
}

async function migrateUsersTable(db) {
  await ensureUsersColumn(
    db,
    'pro_expires_at',
    'ALTER TABLE users ADD COLUMN pro_expires_at TEXT'
  );
  await ensureUsersColumn(
    db,
    'account_email',
    'ALTER TABLE users ADD COLUMN account_email TEXT'
  );
}

function normalizeDomainKey(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function computeFreeRemaining(row, today) {
  if (!row || row.last_query_date !== today) {
    return FREE_DAILY_LIMIT;
  }
  return Math.max(0, FREE_DAILY_LIMIT - Number(row.count || 0));
}

/**
 * 持有有效短期 token 时：刷新会话、不重复扣当日免费次数；isPro 仍以数据库为准
 */
async function handleCheckLimitFromSession(db, req, deviceId, domain) {
  const white = isWhitelisted(req, deviceId);
  if (white.hit) {
    return {
      allowed: true,
      remaining: 999,
      isPro: false,
      whitelisted: true,
      whitelistBy: white.by,
      domain: domain,
      sessionRenewed: true,
    };
  }

  const today = getTodayDateString();
  const row = await dbGet(
    db,
    'SELECT device_id, count, last_query_date, is_pro, pro_expires_at FROM users WHERE device_id = ?',
    [deviceId]
  );

  if (row && isProRow(row)) {
    return {
      allowed: true,
      remaining: 999,
      isPro: true,
      domain: domain,
      sessionRenewed: true,
    };
  }

  if (row && row.last_query_date === today && Number(row.count) >= FREE_DAILY_LIMIT) {
    return {
      allowed: false,
      isPro: false,
      remaining: 0,
      msg: LIMIT_EXCEEDED_MSG,
      domain: domain,
    };
  }

  return {
    allowed: true,
    remaining: computeFreeRemaining(row, today),
    isPro: false,
    domain: domain,
    sessionRenewed: true,
  };
}

/**
 * 处理 Lemon Squeezy Webhook（legacy 路径，兼容旧配置）
 */
async function handleLemonSqueezyWebhook(db, body) {
  return handleLemonWebhookEvent(db, body, {
    dbGet: dbGet,
    dbRun: dbRun,
    getTodayDateString: getTodayDateString,
    savePendingProClaim: savePendingProClaim,
    saveProEmailRegistry: saveProEmailRegistry,
    logProWebhookIdentity: logProWebhookIdentity,
  });
}

function initDatabase() {
  return new Promise(function (resolve, reject) {
    const db = new sqlite3.Database(DB_PATH, function (err) {
      if (err) {
        reject(err);
        return;
      }

      db.exec(
        `
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 10000;
        CREATE TABLE IF NOT EXISTS users (
          device_id TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          last_query_date TEXT NOT NULL,
          is_pro INTEGER NOT NULL DEFAULT 0
        );
      `,
        function (execErr) {
          if (execErr) {
            reject(execErr);
            return;
          }

          db.all("PRAGMA table_info(users)", function (pragmaErr, columns) {
            if (pragmaErr) {
              reject(pragmaErr);
              return;
            }

            var hasIsPro = (columns || []).some(function (col) {
              return col && col.name === 'is_pro';
            });

            if (hasIsPro) {
              migrateUsersTable(db)
                .then(function () {
                  return migratePendingProClaimsTable(db, dbRun);
                })
                .then(function () {
                  return migrateProEmailRegistryTable(db, dbRun);
                })
                .then(function () {
                  return migrateTrendingTables(db);
                })
                .then(function () {
                  console.log('[ShopRadar Server] SQLite 已就绪:', DB_PATH);
                  resolve(db);
                })
                .catch(reject);
              return;
            }

            db.run(
              'ALTER TABLE users ADD COLUMN is_pro INTEGER NOT NULL DEFAULT 0',
              function (alterErr) {
                if (alterErr) {
                  reject(alterErr);
                  return;
                }
                console.log('[ShopRadar Server] 已迁移 users.is_pro 字段');
                migrateUsersTable(db)
                  .then(function () {
                    return migratePendingProClaimsTable(db, dbRun);
                  })
                  .then(function () {
                    return migrateProEmailRegistryTable(db, dbRun);
                  })
                  .then(function () {
                    return migrateTrendingTables(db);
                  })
                  .then(function () {
                    console.log('[ShopRadar Server] SQLite 已就绪:', DB_PATH);
                    resolve(db);
                  })
                  .catch(reject);
              }
            );
          });
        }
      );
    });
  });
}

/**
 * 将设备标记为 Pro（不存在则插入）
 */
async function setProForDevice(db, deviceId) {
  const today = getTodayDateString();
  const row = await dbGet(
    db,
    'SELECT device_id FROM users WHERE device_id = ?',
    [deviceId]
  );

  if (row) {
    await dbRun(db, 'UPDATE users SET is_pro = 1 WHERE device_id = ?', [
      deviceId,
    ]);
  } else {
    await dbRun(
      db,
      'INSERT INTO users (device_id, count, last_query_date, is_pro) VALUES (?, 0, ?, 1)',
      [deviceId, today]
    );
  }
}

/**
 * 【POST /api/check-limit】核心鉴权逻辑
 */
async function handleCheckLimit(db, req, deviceId, domain) {
  const white = isWhitelisted(req, deviceId);
  if (white.hit) {
    return {
      allowed: true,
      remaining: 999,
      /** 白名单仅免额度，不等于已付费 Pro（导出仍须 is_pro=1） */
      isPro: false,
      whitelisted: true,
      whitelistBy: white.by,
      domain: domain,
    };
  }

  const today = getTodayDateString();
  const row = await dbGet(
    db,
    'SELECT device_id, count, last_query_date, is_pro, pro_expires_at FROM users WHERE device_id = ?',
    [deviceId]
  );

  if (row && isProRow(row)) {
    return {
      allowed: true,
      remaining: 999,
      isPro: true,
      domain: domain,
    };
  }

  if (!row) {
    await dbRun(
      db,
      'INSERT INTO users (device_id, count, last_query_date, is_pro) VALUES (?, 1, ?, 0)',
      [deviceId, today]
    );
    return {
      allowed: true,
      remaining: FREE_DAILY_LIMIT - 1,
      isPro: false,
      domain: domain,
    };
  }

  if (row.last_query_date !== today) {
    await dbRun(
      db,
      'UPDATE users SET count = ?, last_query_date = ? WHERE device_id = ?',
      [1, today, deviceId]
    );
    return {
      allowed: true,
      remaining: FREE_DAILY_LIMIT - 1,
      isPro: false,
      domain: domain,
    };
  }

  if (row.count >= FREE_DAILY_LIMIT) {
    return {
      allowed: false,
      isPro: false,
      msg: LIMIT_EXCEEDED_MSG,
      remaining: 0,
      domain: domain,
    };
  }

  const newCount = row.count + 1;
  await dbRun(db, 'UPDATE users SET count = ? WHERE device_id = ?', [
    newCount,
    deviceId,
  ]);

  return {
    allowed: true,
    remaining: FREE_DAILY_LIMIT - newCount,
    isPro: false,
    domain: domain,
  };
}

function startServer(db) {
  let dbWriteQueue = Promise.resolve();

  function enqueueDbWrite(task) {
    const run = dbWriteQueue.then(task);
    dbWriteQueue = run.catch(function () {});
    return run;
  }

  app.get('/privacy', function (req, res) {
    var lang = req.query.lang ? String(req.query.lang).trim() : '';
    var dest = WEBSITE_URL + '/privacy.html';
    if (lang) {
      dest += '?lang=' + encodeURIComponent(lang);
    }
    res.redirect(302, dest);
  });

  app.get('/terms', function (req, res) {
    var lang = req.query.lang ? String(req.query.lang).trim() : '';
    var dest = WEBSITE_URL + '/terms.html';
    if (lang) {
      dest += '?lang=' + encodeURIComponent(lang);
    }
    res.redirect(302, dest);
  });

  app.get('/', function (_req, res) {
    res.redirect(302, WEBSITE_URL + '/privacy.html');
  });

  app.post('/api/check-limit', function (req, res) {
    const deviceId =
      req.body && req.body.deviceId ? String(req.body.deviceId).trim() : '';
    const domain =
      req.body && req.body.domain ? String(req.body.domain).trim() : '';

    if (!deviceId) {
      return res.status(400).json({
        allowed: false,
        msg: '缺少 deviceId 参数',
      });
    }

    loadWhitelist();
    const clientIp = getClientIp(req);

    const accessToken = extractAccessTokenFromRequest(req);
    const tokenCheck = accessToken
      ? verifyAccessToken(accessToken, deviceId)
      : { valid: false };
    const tokenDomain =
      tokenCheck.valid && tokenCheck.payload
        ? normalizeDomainKey(tokenCheck.payload.domain)
        : '';
    const requestDomain = normalizeDomainKey(domain);
    const tokenSessionReuse =
      tokenCheck.valid &&
      tokenDomain &&
      requestDomain &&
      tokenDomain === requestDomain;

    enqueueDbWrite(function () {
      if (tokenSessionReuse) {
        return handleCheckLimitFromSession(db, req, deviceId, domain);
      }
      return handleCheckLimit(db, req, deviceId, domain);
    })
      .then(function (result) {
        attachAccessTokenToResult(result, deviceId, domain);
        if (result.isPro) {
          console.log(
            '[ShopRadar Server] ✓ Pro 会员放行 | deviceId=' + deviceId
          );
        } else if (result.whitelisted) {
          console.log(
            '[ShopRadar Server] ✓ 白名单放行 | 实际IP=' +
              normalizeIp(clientIp) +
              ' | 命中=' +
              result.whitelistBy +
              ' | deviceId=' +
              deviceId
          );
        } else {
          console.log(
            '[ShopRadar Server] check-limit | deviceId=' +
              deviceId +
              ' | domain=' +
              (domain || '-') +
              ' | allowed=' +
              result.allowed +
              ' | remaining=' +
              (result.remaining != null ? result.remaining : '-') +
              ' | isPro=' +
              Boolean(result.isPro)
          );
        }
        res.json(result);
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] 鉴权失败:', error);
        const isBusy =
          error &&
          (error.code === 'SQLITE_BUSY' ||
            String(error.message).indexOf('BUSY') !== -1);
        res.status(500).json({
          allowed: false,
          msg: isBusy ? '数据库繁忙，请稍后重试' : '服务器内部错误',
          code: error && error.code ? error.code : 'INTERNAL',
        });
      });
  });

  app.get('/api/pro-status', function (req, res) {
    const deviceId = req.query.deviceId
      ? String(req.query.deviceId).trim()
      : '';

    if (!deviceId) {
      return res.status(400).json({ isPro: false, msg: '缺少 deviceId' });
    }

    const accessToken = extractAccessTokenFromRequest(req);
    let tokenValid;
    if (accessToken) {
      const check = verifyAccessToken(accessToken, deviceId);
      tokenValid = check.valid;
    }

    dbGet(
      db,
      'SELECT is_pro, pro_expires_at FROM users WHERE device_id = ?',
      [deviceId]
    )
      .then(function (row) {
        const isPro = isProRow(row);
        const payload = { isPro: isPro, deviceId: deviceId };
        if (row && row.pro_expires_at) {
          payload.proExpiresAt = row.pro_expires_at;
        }
        if (accessToken) {
          payload.tokenValid = tokenValid === true;
        }
        if (isPro) {
          const enriched = attachAccessTokenToResult(
            { allowed: true, isPro: true },
            deviceId,
            ''
          );
          payload.accessToken = enriched.accessToken;
          payload.tokenExpiresIn = enriched.tokenExpiresIn;
          payload.tokenExpiresAt = enriched.tokenExpiresAt;
        }
        res.json(payload);
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] pro-status 失败:', error);
        res.status(500).json({ isPro: false, msg: '服务器内部错误' });
      });
  });

  app.post('/api/claim-pro', function (req, res) {
    const deviceId =
      req.body && req.body.deviceId ? String(req.body.deviceId).trim() : '';
    const email =
      req.body && req.body.email ? String(req.body.email).trim() : '';

    if (!deviceId || !email) {
      return res.status(400).json({
        ok: false,
        isPro: false,
        msg: '缺少 deviceId 或 email',
      });
    }

    enqueueDbWrite(function () {
      return claimProByEmail(
        db,
        dbGet,
        dbRun,
        activateProForUser,
        deviceId,
        email,
        getTodayDateString(),
        isProRow
      );
    })
      .then(function (result) {
        if (!result.ok) {
          return res.status(404).json(
            Object.assign({ isPro: false }, result)
          );
        }
        const enriched = attachAccessTokenToResult(
          { allowed: true, isPro: true },
          deviceId,
          ''
        );
        res.json(
          Object.assign(
            {
              ok: true,
              isPro: true,
              deviceId: deviceId,
              accessToken: enriched.accessToken,
              tokenExpiresIn: enriched.tokenExpiresIn,
              tokenExpiresAt: enriched.tokenExpiresAt,
            },
            result
          )
        );
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] claim-pro 失败:', error);
        res.status(500).json({
          ok: false,
          isPro: false,
          msg: '服务器内部错误',
        });
      });
  });

  app.post('/api/verify-export', function (req, res) {
    const deviceId =
      req.body && req.body.deviceId ? String(req.body.deviceId).trim() : '';
    const accessToken = extractAccessTokenFromRequest(req);

    if (!deviceId) {
      return res.status(400).json({
        exportAllowed: false,
        msg: '缺少 deviceId',
      });
    }

    if (!accessToken) {
      return res.status(401).json({
        exportAllowed: false,
        msg: '缺少 accessToken',
      });
    }

    const check = verifyAccessToken(accessToken, deviceId);
    if (!check.valid) {
      return res.status(401).json({
        exportAllowed: false,
        msg: '访问令牌无效或已过期',
      });
    }

    dbGet(
      db,
      'SELECT is_pro, pro_expires_at FROM users WHERE device_id = ?',
      [deviceId]
    )
      .then(function (row) {
        const isPro = isProRow(row);
        if (!isPro) {
          return res.status(403).json({
            exportAllowed: false,
            isPro: false,
            msg: '需要 Pro 会员',
          });
        }
        const enriched = attachAccessTokenToResult(
          { allowed: true, isPro: true },
          deviceId,
          ''
        );
        res.json({
          exportAllowed: true,
          isPro: true,
          accessToken: enriched.accessToken,
          tokenExpiresIn: enriched.tokenExpiresIn,
        });
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] verify-export 失败:', error);
        res.status(500).json({ exportAllowed: false, msg: '服务器内部错误' });
      });
  });

  app.post('/api/ingest/products', function (req, res) {
    const deviceId =
      req.body && req.body.deviceId ? String(req.body.deviceId).trim() : '';
    const domain =
      req.body && req.body.domain ? String(req.body.domain).trim() : '';
    const storeType =
      req.body && req.body.storeType
        ? String(req.body.storeType).trim()
        : 'shopify';
    const currency =
      req.body && req.body.currency
        ? String(req.body.currency).trim()
        : 'USD';
    const products = req.body && Array.isArray(req.body.products)
      ? req.body.products
      : [];

    if (!deviceId) {
      return res.status(400).json({ ok: false, msg: '缺少 deviceId' });
    }
    if (!domain) {
      return res.status(400).json({ ok: false, msg: '缺少 domain' });
    }
    if (!products.length) {
      return res.status(400).json({ ok: false, msg: '缺少 products' });
    }
    if (products.length > MAX_INGEST_PRODUCTS) {
      return res.status(400).json({
        ok: false,
        msg: '单次最多上报 ' + MAX_INGEST_PRODUCTS + ' 个商品',
      });
    }

    enqueueDbWrite(function () {
      return ingestProducts(db, deviceId, domain, storeType, currency, products);
    })
      .then(function (result) {
        if (result && result.ok) {
          console.log(
            '[ShopRadar Server] ingest ✓ | deviceId=' +
              deviceId +
              ' | domain=' +
              domain +
              ' | count=' +
              result.ingested
          );
          return res.json(result);
        }
        res.status(429).json(result || { ok: false, msg: 'ingest rejected' });
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] ingest 失败:', error);
        res.status(500).json({ ok: false, msg: '服务器内部错误' });
      });
  });

  app.get('/api/trending', function (req, res) {
    const deviceId = req.query.deviceId
      ? String(req.query.deviceId).trim()
      : '';
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    if (!deviceId) {
      return res.status(400).json({ ok: false, msg: '缺少 deviceId' });
    }

    dbGet(
      db,
      'SELECT is_pro, pro_expires_at FROM users WHERE device_id = ?',
      [deviceId]
    )
      .then(function (row) {
        const isPro = isProRow(row);
        return queryTrending(db, { limit: limit, isPro: isPro });
      })
      .then(function (payload) {
        res.json(payload);
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] trending 失败:', error);
        res.status(500).json({ ok: false, msg: '服务器内部错误' });
      });
  });

  app.post('/api/webhook/lemon-squeezy', function (req, res) {
    const verifyResult = assertLemonWebhookVerified(req);
    if (!verifyResult.ok) {
      if (verifyResult.status === 401) {
        console.warn('[ShopRadar Server] Lemon Webhook 验签失败');
      } else {
        console.error('[ShopRadar Server] Lemon Webhook 验签未就绪:', verifyResult.msg);
      }
      return res.status(verifyResult.status || 401).json({
        ok: false,
        msg: verifyResult.msg || 'webhook verification failed',
      });
    }

    const body = req.body || {};

    enqueueDbWrite(function () {
      return handleLemonSqueezyWebhook(db, body);
    })
      .then(function (result) {
        if (result.handled) {
          console.log(
            '[ShopRadar Server] Lemon Webhook ✓ | event=' +
              (result.eventName || '-') +
              ' | action=' +
              (result.action || '-') +
              ' | deviceId=' +
              (result.deviceId || '-')
          );
        } else {
          console.log(
            '[ShopRadar Server] Lemon Webhook 忽略 | event=' +
              (result.eventName || '-') +
              ' | reason=' +
              (result.reason || '-')
          );
        }
        res.status(200).json({ ok: true, received: true, result: result });
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] Lemon Webhook 处理失败:', error);
        res.status(500).json({ ok: false, msg: 'webhook handler error' });
      });
  });

  app.get('/api/health', function (_req, res) {
    pingRedis()
      .then(function () {
        res.json({
          ok: true,
          service: 'shopradar-server',
          version: '1.5.0',
          redis: true,
        });
      })
      .catch(function () {
        res.status(503).json({
          ok: false,
          service: 'shopradar-server',
          version: '1.5.0',
          redis: false,
          msg: 'Redis unavailable',
        });
      });
  });

  mountV1Routes(app, db, {
    enqueueDbWrite: enqueueDbWrite,
    dbGet: dbGet,
    dbRun: dbRun,
    getTodayDateString: getTodayDateString,
  });

  app.get('/api/my-ip', function (req, res) {
    res.json({
      ip: normalizeIp(getClientIp(req)),
      hint: '将上述 ip 加入 whitelist.json 的 ips 数组',
    });
  });

  app.listen(PORT, function () {
    console.log('[ShopRadar Server] http://localhost:' + PORT);
    console.log('[ShopRadar Server] POST /api/check-limit');
    console.log('[ShopRadar Server] POST /api/webhook/lemon-squeezy');
    console.log('[ShopRadar Server] GET  /api/pro-status?deviceId=...');
    console.log('[ShopRadar Server] POST /api/verify-export');
    console.log('[ShopRadar Server] POST /api/ingest/products');
    console.log('[ShopRadar Server] GET  /api/trending?deviceId=...');
    console.log('[ShopRadar Server] GET  /api/v1/dashboard/trending');
    console.log('[ShopRadar Server] POST /api/v1/webhook/lemonsqueezy');
    console.log(
      '[ShopRadar Server] 白名单:',
      whitelistCache.ips.length,
      '个 IP,',
      whitelistCache.deviceIds.length,
      '个 deviceId'
    );
    if (isLemonWebhookVerifyEnabled()) {
      if (isLemonWebhookSecretConfigured()) {
        console.log('[ShopRadar Server] Lemon Webhook 验签: 已启用');
      } else {
        console.warn(
          '[ShopRadar Server] Lemon Webhook 验签: 已开启但未配置 SHOPRADAR_LEMON_WEBHOOK_SECRET'
        );
      }
    } else {
      console.warn(
        '[ShopRadar Server] Lemon Webhook 验签: 已关闭。启用请将 .lemon-webhook-verify 改为 1'
      );
    }
  });
}

loadWhitelist();

initDatabase()
  .then(function (db) {
    return connectRedis().then(function () {
      return db;
    });
  })
  .then(function (db) {
    startServer(db);

    process.on('SIGINT', function () {
      closeRedis()
        .catch(function () {})
        .then(function () {
          db.close(function () {
            process.exit(0);
          });
        });
    });
  })
  .catch(function (error) {
    console.error('[ShopRadar Server] 启动失败:', error.message || error);
    process.exit(1);
  });

