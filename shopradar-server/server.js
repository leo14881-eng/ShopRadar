/**
 * ShopRadar 鉴权服务
 * 技术栈：Node.js + Express + SQLite (sqlite3)
 * 规则：每设备每天免费查询 3 次；is_pro=1 或白名单无限次
 * 支付：Lemon Squeezy Webhook → POST /api/webhook/lemon-squeezy
 *       本地联调用 npm run tunnel（Quick Tunnel，仅开发）；线上用固定 HTTPS 域名，勿用 trycloudflare
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const PORT = Number(process.env.PORT) || 3000;
const FREE_DAILY_LIMIT = 3;
const DB_PATH = path.join(__dirname, 'database.sqlite');
const WHITELIST_PATH = path.join(__dirname, 'whitelist.json');

/** Lemon Squeezy 会回调的成功类事件 */
const LEMON_PRO_EVENTS = new Set([
  'order_created',
  'subscription_created',
  'subscription_payment_success',
  'subscription_payment_recovered',
]);

/** 额度用尽时的标准提示文案 */
const LIMIT_EXCEEDED_MSG =
  '您的每日 3 次免费额度已用完，请升级为 Pro 会员解锁无限次查询与 CSV 导出功能！';

const app = express();

app.use(cors());
app.use(express.json({ limit: '512kb' }));

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
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
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
  return Boolean(row && Number(row.is_pro) === 1);
}

/**
 * 从 Lemon Squeezy Webhook JSON 中提取 device_id（checkout custom / passthrough）
 * @param {object} body
 * @returns {string}
 */
function extractDeviceIdFromLemonWebhook(body) {
  if (!body || typeof body !== 'object') {
    return '';
  }

  var candidates = [];

  if (body.meta && body.meta.custom_data != null) {
    candidates.push(body.meta.custom_data);
  }

  if (body.data && body.data.attributes) {
    var attrs = body.data.attributes;
    if (attrs.custom_data != null) {
      candidates.push(attrs.custom_data);
    }
    if (attrs.first_order_item && attrs.first_order_item.custom_data != null) {
      candidates.push(attrs.first_order_item.custom_data);
    }
  }

  if (body.passthrough != null) {
    candidates.push(body.passthrough);
  }

  if (body.custom_data != null) {
    candidates.push(body.custom_data);
  }

  for (var i = 0; i < candidates.length; i++) {
    var raw = candidates[i];
    var parsed = raw;

    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        if (raw.trim()) {
          return raw.trim();
        }
        continue;
      }
    }

    if (parsed && typeof parsed === 'object') {
      var id =
        parsed.device_id ||
        parsed.deviceId ||
        parsed.deviceID ||
        parsed.sr_device_id ||
        '';
      if (id) {
        return String(id).trim();
      }
    }
  }

  return '';
}

function getLemonEventName(body) {
  if (!body || !body.meta) {
    return '';
  }
  return String(body.meta.event_name || body.meta.event || '').trim();
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
              console.log('[ShopRadar Server] SQLite 已就绪:', DB_PATH);
              resolve(db);
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
                console.log('[ShopRadar Server] SQLite 已就绪:', DB_PATH);
                resolve(db);
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
      isPro: true,
      whitelisted: true,
      whitelistBy: white.by,
      domain: domain,
    };
  }

  const today = getTodayDateString();
  const row = await dbGet(
    db,
    'SELECT device_id, count, last_query_date, is_pro FROM users WHERE device_id = ?',
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

/**
 * 处理 Lemon Squeezy Webhook
 */
async function handleLemonSqueezyWebhook(db, body) {
  const eventName = getLemonEventName(body);

  if (!LEMON_PRO_EVENTS.has(eventName)) {
    return {
      handled: false,
      reason: 'ignored_event',
      eventName: eventName,
    };
  }

  const deviceId = extractDeviceIdFromLemonWebhook(body);
  if (!deviceId) {
    return {
      handled: false,
      reason: 'missing_device_id',
      eventName: eventName,
    };
  }

  await setProForDevice(db, deviceId);

  return {
    handled: true,
    eventName: eventName,
    deviceId: deviceId,
    isPro: true,
  };
}

function startServer(db) {
  let dbWriteQueue = Promise.resolve();

  function enqueueDbWrite(task) {
    const run = dbWriteQueue.then(task);
    dbWriteQueue = run.catch(function () {});
    return run;
  }

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

    enqueueDbWrite(function () {
      return handleCheckLimit(db, req, deviceId, domain);
    })
      .then(function (result) {
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

    dbGet(
      db,
      'SELECT is_pro FROM users WHERE device_id = ?',
      [deviceId]
    )
      .then(function (row) {
        res.json({ isPro: isProRow(row), deviceId: deviceId });
      })
      .catch(function (error) {
        console.error('[ShopRadar Server] pro-status 失败:', error);
        res.status(500).json({ isPro: false, msg: '服务器内部错误' });
      });
  });

  app.post('/api/webhook/lemon-squeezy', function (req, res) {
    const body = req.body || {};
    const eventName = getLemonEventName(body);

    enqueueDbWrite(function () {
      return handleLemonSqueezyWebhook(db, body);
    })
      .then(function (result) {
        if (result.handled) {
          console.log(
            '[ShopRadar Server] Lemon Webhook ✓ Pro 已开通 | event=' +
              result.eventName +
              ' | deviceId=' +
              result.deviceId
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
    res.json({ ok: true, service: 'shopradar-server', version: '1.1.0' });
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
    console.log(
      '[ShopRadar Server] 白名单:',
      whitelistCache.ips.length,
      '个 IP,',
      whitelistCache.deviceIds.length,
      '个 deviceId'
    );
  });
}

loadWhitelist();

initDatabase()
  .then(function (db) {
    startServer(db);

    process.on('SIGINT', function () {
      db.close(function () {
        process.exit(0);
      });
    });
  })
  .catch(function (error) {
    console.error('[ShopRadar Server] 数据库初始化失败:', error);
    process.exit(1);
  });
