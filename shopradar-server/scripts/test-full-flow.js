#!/usr/bin/env node
'use strict';

/**
 * ShopRadar 全链路功能测试
 *
 * 覆盖：免费额度 → 支付/Webhook 开通 Pro → pro-status / token → 导出鉴权
 *       → 邮箱恢复 claim-pro → 重装迁移 → v1 trending → ingest → 取消订阅
 *
 * Usage:
 *   node scripts/test-full-flow.js [baseUrl]
 *   node scripts/test-full-flow.js --spawn          # 临时 DB + 自动启动服务（需 Redis）
 *   node scripts/test-full-flow.js --spawn --keep-db
 *
 * 默认 baseUrl: http://127.0.0.1:3000
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const SERVER_DIR = path.join(__dirname, '..');
const DEFAULT_BASE = 'http://127.0.0.1:3000';
const SPAWN_PORT = Number(process.env.SHOPRADAR_TEST_PORT) || 3098;

const argv = process.argv.slice(2);
const SPAWN_MODE = argv.includes('--spawn');
const KEEP_DB = argv.includes('--keep-db');
const BASE = (
  argv.find(function (a) {
    return a.indexOf('http') === 0;
  }) ||
  (SPAWN_MODE ? 'http://127.0.0.1:' + SPAWN_PORT : DEFAULT_BASE)
).replace(/\/$/, '');

const RUN_ID = Date.now();
const IDS = {
  free: 'flow-free-' + RUN_ID,
  paid: 'flow-paid-' + RUN_ID,
  oldDevice: 'flow-old-' + RUN_ID,
  newDevice: 'flow-new-' + RUN_ID,
  pending: 'flow-pending-' + RUN_ID,
};
const TEST_EMAIL = 'flow+' + RUN_ID + '@shopradar.test';
const TEST_DOMAIN = 'flow-test.myshopify.com';
const TEST_DOMAIN_B = 'flow-test-b.myshopify.com';

let passed = 0;
let failed = 0;
let skipped = 0;
let serverChild = null;
let tempDbPath = '';

function section(title) {
  console.log('\n── ' + title + ' ──');
}

function ok(name) {
  passed += 1;
  console.log('  ✓', name);
}

function fail(name, detail) {
  failed += 1;
  console.log('  ✗', name);
  if (detail) {
    console.log('    ', detail);
  }
}

function skip(name, reason) {
  skipped += 1;
  console.log('  ~', name, '—', reason || 'skipped');
}

function assert(name, condition, detail) {
  if (condition) {
    ok(name);
    return true;
  }
  fail(name, detail);
  return false;
}

async function request(apiPath, options) {
  const opts = options || {};
  const url = BASE + apiPath;
  const init = {
    method: opts.method || 'GET',
    headers: Object.assign({}, opts.headers || {}),
  };
  if (opts.body != null) {
    init.headers['Content-Type'] =
      init.headers['Content-Type'] || 'application/json';
    init.body =
      typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(url, init);
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (parseErr) {
      body = { _raw: text };
    }
  }
  return { status: res.status, body: body, headers: res.headers };
}

function dbPathForTests() {
  if (tempDbPath) {
    return tempDbPath;
  }
  if (process.env.SHOPRADAR_DB_PATH) {
    return path.resolve(process.env.SHOPRADAR_DB_PATH);
  }
  return path.join(SERVER_DIR, 'database.sqlite');
}

function dbGet(sql, params) {
  return new Promise(function (resolve, reject) {
    const db = new sqlite3.Database(dbPathForTests());
    db.get(sql, params || [], function (err, row) {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function dbRun(sql, params) {
  return new Promise(function (resolve, reject) {
    const db = new sqlite3.Database(dbPathForTests());
    db.run(sql, params || [], function (err) {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function todayStr() {
  const now = new Date();
  return (
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0')
  );
}

async function grantProDirect(deviceId, email) {
  const today = todayStr();
  const row = await dbGet('SELECT device_id FROM users WHERE device_id = ?', [
    deviceId,
  ]);
  if (row) {
    await dbRun(
      'UPDATE users SET is_pro = 1, account_email = COALESCE(?, account_email) WHERE device_id = ?',
      [email || null, deviceId]
    );
  } else {
    await dbRun(
      'INSERT INTO users (device_id, count, last_query_date, is_pro, account_email) VALUES (?, 0, ?, 1, ?)',
      [deviceId, today, email || null]
    );
  }
}

async function resetDevice(deviceId) {
  await dbRun(
    'UPDATE users SET is_pro = 0, count = 0, last_query_date = ? WHERE device_id = ?',
    [todayStr(), deviceId]
  );
}

async function savePendingClaimDirect(email, expiresIso) {
  await dbRun(
    `INSERT INTO pending_pro_claims (email, pro_expires_at, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET pro_expires_at = excluded.pro_expires_at`,
    [email.toLowerCase(), expiresIso || null, new Date().toISOString()]
  );
}

function readWebhookSecret() {
  let secret =
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ||
    process.env.SHOPRADAR_LEMON_WEBHOOK_SECRET ||
    '';
  if (secret) {
    return secret.trim();
  }
  const secretFile = path.join(SERVER_DIR, '.lemon-webhook-secret');
  if (!fs.existsSync(secretFile)) {
    return '';
  }
  const line = fs
    .readFileSync(secretFile, 'utf8')
    .split(/\r?\n/)
    .find(function (l) {
      return l.trim() && l.trim().charAt(0) !== '#';
    });
  return line ? line.trim() : '';
}

function signWebhookPayload(payloadStr, secret) {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

async function postWebhook(pathname, payloadObj, secret) {
  const payloadStr = JSON.stringify(payloadObj);
  const sig = signWebhookPayload(payloadStr, secret);
  return request(pathname, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': sig,
    },
    body: payloadStr,
  });
}

function waitMs(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  while (Date.now() < deadline) {
    try {
      const res = await request('/api/health');
      if (res.status === 200 || res.status === 503) {
        return true;
      }
    } catch (waitErr) {
      /* retry */
    }
    await waitMs(400);
  }
  return false;
}

async function spawnTestServer() {
  tempDbPath = path.join(
    os.tmpdir(),
    'shopradar-flow-test-' + RUN_ID + '.sqlite'
  );
  const port = new URL(BASE).port || String(SPAWN_PORT);

  serverChild = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env: Object.assign({}, process.env, {
      PORT: port,
      SHOPRADAR_DB_PATH: tempDbPath,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverChild.stdout.on('data', function (chunk) {
    const line = String(chunk);
    if (line.indexOf('ShopRadar Server') !== -1) {
      process.stdout.write('[server] ' + line);
    }
  });
  serverChild.stderr.on('data', function (chunk) {
    process.stderr.write('[server-err] ' + chunk);
  });

  const ready = await waitForServer(25000);
  if (!ready) {
    throw new Error('测试服务启动超时: ' + BASE);
  }
  console.log('已启动隔离测试服务 →', BASE, '| DB:', tempDbPath);
}

async function seedTrendingViaIngest(deviceId) {
  const products = [];
  for (let i = 0; i < 5; i++) {
    products.push({
      shopifyId: 880000 + RUN_ID + i,
      title: 'Flow Test Product ' + i,
      sku: 'FLOW-' + i,
      price: 19.99 + i,
      productType: 'Test',
    });
  }
  const res = await request('/api/ingest/products', {
    method: 'POST',
    body: {
      deviceId: deviceId,
      domain: 'seed-' + RUN_ID + '.myshopify.com',
      storeType: 'shopify',
      currency: 'USD',
      products: products,
    },
  });
  return res.status === 200 && res.body && res.body.ok;
}

async function checkLimit(deviceId, domain, accessToken) {
  const body = { deviceId: deviceId, domain: domain || TEST_DOMAIN };
  if (accessToken) {
    body.accessToken = accessToken;
  }
  return request('/api/check-limit', { method: 'POST', body: body });
}

async function testInfrastructure() {
  section('基础设施');

  const health = await request('/api/health');
  assert(
    'GET /api/health 可达',
    health.status === 200 || health.status === 503,
    'status=' + health.status
  );
  if (health.body && health.body.version) {
    ok('health.version=' + health.body.version);
  }
  if (health.status === 503 && health.body && health.body.redis === false) {
    skip('Redis 在线', 'health 503 — trending 相关用例可能失败');
  } else if (health.body && health.body.redis === true) {
    ok('Redis 在线');
  }

  const ip = await request('/api/my-ip');
  assert('GET /api/my-ip → 200', ip.status === 200 && ip.body && ip.body.ip);
}

async function testFreeQuotaFlow() {
  section('免费额度流程 (check-limit)');

  const missing = await request('/api/check-limit', {
    method: 'POST',
    body: { domain: TEST_DOMAIN },
  });
  assert('缺少 deviceId → 400', missing.status === 400);

  await resetDevice(IDS.free);

  const r1 = await checkLimit(IDS.free, TEST_DOMAIN);
  assert(
    '第 1 次查询 allowed=true',
    r1.status === 200 && r1.body && r1.body.allowed === true && r1.body.isPro === false,
    JSON.stringify(r1.body)
  );
  assert(
    '第 1 次 remaining=2',
    r1.body && r1.body.remaining === 2,
    'remaining=' + (r1.body && r1.body.remaining)
  );

  const token1 = r1.body && r1.body.accessToken;
  assert('第 1 次返回 accessToken', Boolean(token1));

  const r2same = await checkLimit(IDS.free, TEST_DOMAIN, token1);
  assert(
    '同域 + token 会话续期不重复扣次',
    r2same.body &&
      r2same.body.allowed === true &&
      r2same.body.sessionRenewed === true &&
      r2same.body.remaining === 2,
    JSON.stringify(r2same.body)
  );

  const r2 = await checkLimit(IDS.free, TEST_DOMAIN_B);
  assert(
    '第 2 次新域 remaining=1',
    r2.body && r2.body.allowed === true && r2.body.remaining === 1,
    JSON.stringify(r2.body)
  );

  const r3 = await checkLimit(IDS.free, TEST_DOMAIN + '-c');
  assert(
    '第 3 次 remaining=0',
    r3.body && r3.body.allowed === true && r3.body.remaining === 0,
    JSON.stringify(r3.body)
  );

  const r4 = await checkLimit(IDS.free, TEST_DOMAIN + '-d');
  assert(
    '第 4 次额度用尽 allowed=false',
    r4.body && r4.body.allowed === false && r4.body.remaining === 0,
    JSON.stringify(r4.body)
  );

  const st = await request(
    '/api/pro-status?deviceId=' + encodeURIComponent(IDS.free)
  );
  assert(
    '免费用户 pro-status isPro=false',
    st.status === 200 && st.body && st.body.isPro === false,
    JSON.stringify(st.body)
  );
}

async function testProActivationAndExport() {
  section('Pro 开通 + pro-status + verify-export');

  await grantProDirect(IDS.paid, TEST_EMAIL);

  const st = await request(
    '/api/pro-status?deviceId=' + encodeURIComponent(IDS.paid)
  );
  assert(
    'Pro 用户 pro-status isPro=true',
    st.status === 200 && st.body && st.body.isPro === true,
    JSON.stringify(st.body)
  );
  assert(
    'pro-status 返回 accessToken',
    Boolean(st.body && st.body.accessToken),
    JSON.stringify(st.body)
  );

  const validToken = st.body.accessToken;

  const stale = await request(
    '/api/pro-status?deviceId=' +
      encodeURIComponent(IDS.paid) +
      '&accessToken=invalid.token.here'
  );
  assert(
    '过期/无效 token 仍查 DB（非 401）',
    stale.status === 200 && stale.body && stale.body.isPro === true,
    'status=' + stale.status + ' ' + JSON.stringify(stale.body)
  );
  assert(
    '无效 token 标记 tokenValid=false',
    stale.body && stale.body.tokenValid === false,
    JSON.stringify(stale.body)
  );
  assert(
    '无效 token 仍签发新 accessToken',
    Boolean(stale.body && stale.body.accessToken),
    JSON.stringify(stale.body)
  );

  const freshToken = stale.body.accessToken;

  const lim = await checkLimit(IDS.paid, TEST_DOMAIN, freshToken);
  assert(
    'Pro 用户 check-limit allowed + isPro',
    lim.body && lim.body.allowed === true && lim.body.isPro === true,
    JSON.stringify(lim.body)
  );

  const noTok = await request('/api/verify-export', {
    method: 'POST',
    body: { deviceId: IDS.paid },
  });
  assert('verify-export 无 token → 401', noTok.status === 401);

  const badTok = await request('/api/verify-export', {
    method: 'POST',
    body: { deviceId: IDS.paid, accessToken: 'bad.token' },
  });
  assert('verify-export 无效 token → 401', badTok.status === 401);

  const exp = await request('/api/verify-export', {
    method: 'POST',
    body: { deviceId: IDS.paid, accessToken: freshToken },
  });
  assert(
    'verify-export 有效 token → exportAllowed=true',
    exp.status === 200 && exp.body && exp.body.exportAllowed === true,
    JSON.stringify(exp.body)
  );
}

async function testEmailClaimFlow() {
  section('邮箱恢复 Pro (claim-pro)');

  const missing = await request('/api/claim-pro', {
    method: 'POST',
    body: { deviceId: IDS.newDevice },
  });
  assert('claim-pro 缺 email → 400', missing.status === 400);

  const badEmail = await request('/api/claim-pro', {
    method: 'POST',
    body: { deviceId: IDS.newDevice, email: 'not-an-email' },
  });
  assert(
    'claim-pro 无效邮箱 → 404',
    badEmail.status === 404 && badEmail.body && badEmail.body.ok === false,
    JSON.stringify(badEmail.body)
  );

  const unknown = await request('/api/claim-pro', {
    method: 'POST',
    body: { deviceId: IDS.newDevice, email: 'unknown+' + RUN_ID + '@shopradar.test' },
  });
  assert(
    'claim-pro 未知邮箱 → 404',
    unknown.status === 404,
    JSON.stringify(unknown.body)
  );

  await grantProDirect(IDS.oldDevice, TEST_EMAIL);

  const claim = await request('/api/claim-pro', {
    method: 'POST',
    body: { deviceId: IDS.newDevice, email: TEST_EMAIL },
  });
  assert(
    'claim-pro 已付邮箱 → isPro=true',
    claim.status === 200 && claim.body && claim.body.isPro === true && claim.body.ok === true,
    JSON.stringify(claim.body)
  );
  assert(
    'claim-pro 返回 accessToken',
    Boolean(claim.body && claim.body.accessToken),
    JSON.stringify(claim.body)
  );

  const newStatus = await request(
    '/api/pro-status?deviceId=' + encodeURIComponent(IDS.newDevice)
  );
  assert(
    '新 Device ID pro-status isPro=true',
    newStatus.body && newStatus.body.isPro === true,
    JSON.stringify(newStatus.body)
  );

  const exp = await request('/api/verify-export', {
    method: 'POST',
    body: {
      deviceId: IDS.newDevice,
      accessToken: claim.body.accessToken,
    },
  });
  assert(
    '恢复后 verify-export 通过',
    exp.status === 200 && exp.body && exp.body.exportAllowed === true,
    JSON.stringify(exp.body)
  );
}

async function testPendingEmailClaim() {
  section('Pending 邮箱认领（Webhook 无 device_id 模拟）');

  const pendingEmail = 'pending+' + RUN_ID + '@shopradar.test';
  const expires = new Date(Date.now() + 86400000 * 30).toISOString();

  try {
    await savePendingClaimDirect(pendingEmail, expires);
  } catch (dbErr) {
    skip('pending_pro_claims 表', String(dbErr.message));
    return;
  }

  const claim = await request('/api/claim-pro', {
    method: 'POST',
    body: { deviceId: IDS.pending, email: pendingEmail },
  });
  assert(
    'pending 邮箱 claim-pro 成功',
    claim.status === 200 && claim.body && claim.body.isPro === true,
    JSON.stringify(claim.body)
  );

  const row = await dbGet(
    'SELECT email FROM pending_pro_claims WHERE email = ?',
    [pendingEmail.toLowerCase()]
  );
  assert(
    'pending 记录已删除',
    !row,
    row ? 'still exists' : undefined
  );
}

async function testWebhookFlows(secret) {
  section('Lemon Webhook 支付流程');

  if (!secret) {
    skip('Webhook 全流程', '未配置 .lemon-webhook-secret');
    return;
  }

  const webhookDevice = 'flow-wh-' + RUN_ID;
  const webhookEmail = 'wh+' + RUN_ID + '@shopradar.test';
  const orderPayload = {
    meta: {
      event_name: 'order_created',
      custom_data: {
        device_id: webhookDevice,
        email: webhookEmail,
        source: 'shopradar_test',
      },
    },
    data: {
      attributes: {
        user_email: webhookEmail,
        renews_at: new Date(Date.now() + 86400000 * 30).toISOString(),
      },
    },
  };

  const orderRes = await postWebhook('/api/v1/webhook/lemonsqueezy', orderPayload, secret);
  assert(
    'Webhook order_created → handled',
    orderRes.status === 200 &&
      orderRes.body &&
      orderRes.body.result &&
      orderRes.body.result.handled === true,
    JSON.stringify(orderRes.body)
  );

  const whStatus = await request(
    '/api/pro-status?deviceId=' + encodeURIComponent(webhookDevice)
  );
  assert(
    'Webhook 后 pro-status isPro=true',
    whStatus.body && whStatus.body.isPro === true,
    JSON.stringify(whStatus.body)
  );

  const pendingEmail = 'wh-pending+' + RUN_ID + '@shopradar.test';
  const pendingPayload = {
    meta: { event_name: 'order_created' },
    data: {
      attributes: {
        user_email: pendingEmail,
        renews_at: new Date(Date.now() + 86400000 * 30).toISOString(),
      },
    },
  };
  const pendingRes = await postWebhook(
    '/api/v1/webhook/lemonsqueezy',
    pendingPayload,
    secret
  );
  assert(
    'Webhook 无 device_id → pro_pending_email',
    pendingRes.body &&
      pendingRes.body.result &&
      pendingRes.body.result.action === 'pro_pending_email',
    JSON.stringify(pendingRes.body)
  );

  const pendingClaimDevice = 'flow-wh-pending-' + RUN_ID;
  const pendingClaim = await request('/api/claim-pro', {
    method: 'POST',
    body: { deviceId: pendingClaimDevice, email: pendingEmail },
  });
  assert(
    'Webhook pending 邮箱可被 claim',
    pendingClaim.status === 200 && pendingClaim.body && pendingClaim.body.isPro === true,
    JSON.stringify(pendingClaim.body)
  );

  const cancelPayload = JSON.stringify({
    meta: {
      event_name: 'subscription_cancelled',
      custom_data: { device_id: webhookDevice },
    },
  });
  const cancelRes = await request('/api/v1/webhook/lemonsqueezy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': signWebhookPayload(cancelPayload, secret),
    },
    body: cancelPayload,
  });
  assert(
    'subscription_cancelled → pro_deactivated',
    cancelRes.body &&
      cancelRes.body.result &&
      cancelRes.body.result.action === 'pro_deactivated',
    JSON.stringify(cancelRes.body)
  );

  const afterCancel = await request(
    '/api/pro-status?deviceId=' + encodeURIComponent(webhookDevice)
  );
  assert(
    '取消后 pro-status isPro=false',
    afterCancel.body && afterCancel.body.isPro === false,
    JSON.stringify(afterCancel.body)
  );

  const badSig = await request('/api/v1/webhook/lemonsqueezy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': 'deadbeef',
    },
    body: JSON.stringify({ meta: { event_name: 'order_created' } }),
  });
  assert('Webhook 错误签名 → 401', badSig.status === 401);
}

async function testTrendingAndIngest() {
  section('Trending + Ingest');

  const seeded = await seedTrendingViaIngest(IDS.free);
  assert('ingest 写入商品', seeded);

  const ingestBad = await request('/api/ingest/products', {
    method: 'POST',
    body: { domain: 'x.com' },
  });
  assert('ingest 缺 deviceId → 400', ingestBad.status === 400);

  const legacy = await request(
    '/api/trending?deviceId=' + encodeURIComponent(IDS.free) + '&limit=3'
  );
  assert(
    'Legacy GET /api/trending',
    legacy.status === 200 && legacy.body && Array.isArray(legacy.body.items),
    'status=' + legacy.status
  );

  const v1Missing = await request('/api/v1/dashboard/trending');
  assert('v1 trending 缺 deviceId → 400', v1Missing.status === 400);

  const v1Free = await request(
    '/api/v1/dashboard/trending?deviceId=' +
      encodeURIComponent(IDS.free) +
      '&limit=3'
  );
  if (v1Free.status === 503) {
    skip('v1 trending Free 脱敏', 'Redis 不可用');
  } else {
    assert('v1 trending Free → 200', v1Free.status === 200, JSON.stringify(v1Free.body));
    const item = v1Free.body && v1Free.body.items && v1Free.body.items[0];
    if (item) {
      assert(
        'Free 用户字段脱敏',
        item.shop_domain === 'Hidden' && item.locked === true,
        JSON.stringify(item)
      );
    } else {
      skip('Free 用户字段脱敏', '榜单暂无数据');
    }
    const v1Zh = await request(
      '/api/v1/dashboard/trending?deviceId=' +
        encodeURIComponent(IDS.free) +
        '&limit=1',
      { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } }
    );
    const zhItem = v1Zh.body && v1Zh.body.items && v1Zh.body.items[0];
    if (zhItem && v1Zh.body.locale === 'zh') {
      assert(
        'Accept-Language zh 解锁文案',
        zhItem.locked_message === '升级 Pro 解锁',
        JSON.stringify(zhItem)
      );
    }
  }

  await grantProDirect(IDS.paid, TEST_EMAIL);
  const v1Pro = await request(
    '/api/v1/dashboard/trending?deviceId=' +
      encodeURIComponent(IDS.paid) +
      '&limit=2'
  );
  if (v1Pro.status === 503) {
    skip('v1 trending Pro 完整数据', 'Redis 不可用');
  } else {
    const proItem = v1Pro.body && v1Pro.body.items && v1Pro.body.items[0];
    assert(
      'Pro 用户 is_pro=true',
      v1Pro.body && v1Pro.body.is_pro === true,
      JSON.stringify(v1Pro.body)
    );
    if (proItem) {
      assert(
        'Pro 用户可见 shop_domain',
        Boolean(proItem.shop_domain && proItem.shop_domain !== 'Hidden'),
        JSON.stringify(proItem)
      );
    }
  }

  const v1BadToken = await request(
    '/api/v1/dashboard/trending?deviceId=' +
      encodeURIComponent(IDS.free) +
      '&accessToken=invalid.token.here'
  );
  assert('v1 trending 无效 token → 401', v1BadToken.status === 401);
}

async function testEndToEndUserJourney(secret) {
  section('端到端用户旅程（扩展/官网模拟）');

  const userDevice = 'flow-e2e-' + RUN_ID;
  const userEmail = 'e2e+' + RUN_ID + '@shopradar.test';
  const shopDomain = 'e2e-store.myshopify.com';

  await resetDevice(userDevice);

  const step1 = await checkLimit(userDevice, shopDomain);
  assert('① 新用户首次查店', step1.body && step1.body.allowed === true);

  if (secret) {
    const payPayload = {
      meta: {
        event_name: 'order_created',
        custom_data: { device_id: userDevice, email: userEmail },
      },
      data: {
        attributes: {
          user_email: userEmail,
          renews_at: new Date(Date.now() + 86400000 * 30).toISOString(),
        },
      },
    };
    const payRes = await postWebhook('/api/v1/webhook/lemonsqueezy', payPayload, secret);
    assert('② Lemon 付款 Webhook', payRes.body && payRes.body.result && payRes.body.result.handled);
  } else {
    await grantProDirect(userDevice, userEmail);
    ok('② 模拟 Webhook grant-pro（无 secret）');
  }

  let proConfirmed = false;
  for (let i = 0; i < 8; i++) {
    const poll = await request(
      '/api/pro-status?deviceId=' + encodeURIComponent(userDevice)
    );
    if (poll.body && poll.body.isPro && poll.body.accessToken) {
      proConfirmed = true;
      const token = poll.body.accessToken;

      const step3 = await checkLimit(userDevice, shopDomain, token);
      assert('③ 付款后 check-limit Pro 放行', step3.body && step3.body.isPro === true);

      const step4 = await request('/api/verify-export', {
        method: 'POST',
        body: { deviceId: userDevice, accessToken: token },
      });
      assert(
        '④ 导出鉴权通过',
        step4.body && step4.body.exportAllowed === true,
        JSON.stringify(step4.body)
      );
      break;
    }
    await waitMs(300);
  }
  assert('②③ pro-status 轮询确认 Pro', proConfirmed);

  const reinstalled = 'flow-e2e-new-' + RUN_ID;
  const reclaim = await request('/api/claim-pro', {
    method: 'POST',
    body: { deviceId: reinstalled, email: userEmail },
  });
  assert(
    '⑤ 重装后用邮箱恢复',
    reclaim.status === 200 && reclaim.body && reclaim.body.isPro === true,
    JSON.stringify(reclaim.body)
  );

  const step6 = await request('/api/verify-export', {
    method: 'POST',
    body: {
      deviceId: reinstalled,
      accessToken: reclaim.body.accessToken,
    },
  });
  assert(
    '⑥ 恢复后导出仍可用',
    step6.body && step6.body.exportAllowed === true,
    JSON.stringify(step6.body)
  );
}

async function cleanup() {
  if (serverChild) {
    serverChild.kill('SIGTERM');
    await waitMs(500);
    if (!KEEP_DB && tempDbPath) {
      try {
        fs.unlinkSync(tempDbPath);
        fs.unlinkSync(tempDbPath + '-wal');
        fs.unlinkSync(tempDbPath + '-shm');
      } catch (unlinkErr) {
        /* ignore */
      }
    } else if (tempDbPath) {
      console.log('\n保留测试 DB:', tempDbPath);
    }
  }
}

async function main() {
  console.log('\nShopRadar 全链路功能测试');
  console.log('目标:', BASE);
  console.log('Run ID:', RUN_ID);

  if (SPAWN_MODE) {
    try {
      await spawnTestServer();
    } catch (spawnErr) {
      console.error('\n无法启动测试服务:', spawnErr.message);
      console.error('请确认 Redis 已运行，或使用: node scripts/test-full-flow.js http://127.0.0.1:3000');
      process.exit(1);
    }
  } else {
    const up = await waitForServer(3000);
    if (!up) {
      console.error('\n服务未运行:', BASE);
      console.error('请先 npm start，或加 --spawn 自动启动（需 Redis）');
      process.exit(1);
    }
  }

  const secret = readWebhookSecret();

  try {
    await testInfrastructure();
    await testFreeQuotaFlow();
    await testProActivationAndExport();
    await testEmailClaimFlow();
    await testPendingEmailClaim();
    await testWebhookFlows(secret);
    await testTrendingAndIngest();
    await testEndToEndUserJourney(secret);
  } catch (crashErr) {
    console.error('\n测试崩溃:', crashErr);
    failed += 1;
  } finally {
    await cleanup();
  }

  console.log(
    '\n结果:',
    passed,
    '通过,',
    failed,
    '失败,',
    skipped,
    '跳过\n'
  );
  process.exit(failed > 0 ? 1 : 0);
}

main();
