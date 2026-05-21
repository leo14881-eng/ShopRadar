#!/usr/bin/env node
'use strict';

/**
 * ShopRadar v1 API 冒烟测试
 * Usage: node scripts/test-v1-api.js [baseUrl]
 */

const crypto = require('crypto');

const BASE = (process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/, '');
const FREE_DEVICE = 'test-free-' + Date.now();
const PRO_DEVICE = 'test-pro-' + Date.now();

let passed = 0;
let failed = 0;

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

async function json(path, options) {
  const res = await fetch(BASE + path, options);
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  return { status: res.status, body: body };
}

async function run() {
  console.log('\nShopRadar v1 API 测试 →', BASE, '\n');

  // 1. Health
  {
    const { status, body } = await json('/api/health');
    if (status === 200 && body && body.version) {
      ok('GET /api/health → version ' + body.version);
    } else {
      fail('GET /api/health', 'status=' + status);
    }
  }

  // 2. v1 trending missing deviceId
  {
    const { status } = await json('/api/v1/dashboard/trending');
    if (status === 400) {
      ok('v1 trending 缺少 deviceId → 400');
    } else {
      fail('v1 trending 缺少 deviceId', 'expected 400, got ' + status);
    }
  }

  // 3. Grant pro to test device (via direct DB script output simulation - use grant-pro via shell)
  // We'll use a known approach: call ingest + use grant-pro in separate step
  // For free user test first
  {
    const { status, body } = await json(
      '/api/v1/dashboard/trending?deviceId=' + encodeURIComponent(FREE_DEVICE) + '&limit=3'
    );
    if (status !== 200 || !body || !body.items || !body.items.length) {
      fail('Free 用户 v1 trending', 'status=' + status + ' items=' + (body && body.items && body.items.length));
    } else {
      const item = body.items[0];
      const redacted =
        item.shop_domain === 'Hidden' &&
        item.est_daily_rev === 'Hidden' &&
        item.locked === true &&
        item.locked_message === 'Upgrade to Unlock';
      if (redacted && body.is_pro === false) {
        ok('Free 用户脱敏正确（英文 Hidden / Upgrade to Unlock）');
      } else {
        fail('Free 用户脱敏', JSON.stringify(item));
      }
      if (body.updated_at && body.updated_at.endsWith('Z')) {
        ok('updated_at 为 UTC ISO 字符串');
      } else {
        fail('updated_at UTC ISO', body.updated_at);
      }
      if (body.next_update_at && body.next_update_at.endsWith('Z')) {
        ok('next_update_at 为 UTC ISO 字符串');
      } else {
        fail('next_update_at UTC ISO', body.next_update_at);
      }
      if (body.cache && typeof body.cache.hit === 'boolean') {
        ok('Redis 缓存字段存在 cache.hit=' + body.cache.hit);
      } else {
        fail('缓存 metadata 缺失');
      }
    }
  }

  // 3b. Accept-Language zh
  {
    const { status, body } = await json(
      '/api/v1/dashboard/trending?deviceId=' + encodeURIComponent(FREE_DEVICE) + '&limit=1',
      { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } }
    );
    const item = body && body.items && body.items[0];
    if (
      status === 200 &&
      body.locale === 'zh' &&
      item &&
      item.locked_message === '升级 Pro 解锁'
    ) {
      ok('Accept-Language zh → 升级 Pro 解锁');
    } else {
      fail('Accept-Language zh', JSON.stringify({ locale: body && body.locale, item: item }));
    }
  }

  // 4. Pro user via grant-pro - run subprocess
  const { execSync } = require('child_process');
  try {
    execSync('node scripts/grant-pro.js ' + PRO_DEVICE, {
      cwd: require('path').join(__dirname, '..'),
      stdio: 'pipe',
    });
    ok('grant-pro ' + PRO_DEVICE);
  } catch (e) {
    fail('grant-pro', e.message);
  }

  {
    const { status, body } = await json(
      '/api/v1/dashboard/trending?deviceId=' + encodeURIComponent(PRO_DEVICE) + '&limit=2'
    );
    if (status !== 200) {
      fail('Pro 用户 v1 trending', 'status=' + status);
    } else {
      const item = body.items && body.items[0];
      if (
        body.is_pro === true &&
        item &&
        item.shop_domain &&
        item.product_url &&
        item.est_daily_rev != null
      ) {
        ok('Pro 用户完整数据（shop_domain/product_url/rev 可见）');
      } else {
        fail('Pro 用户完整数据', JSON.stringify({ is_pro: body.is_pro, item: item }));
      }
    }
  }

  // 5. Cache hit on second request
  {
    const first = await json(
      '/api/v1/dashboard/trending?deviceId=' + encodeURIComponent(PRO_DEVICE) + '&limit=5'
    );
    const second = await json(
      '/api/v1/dashboard/trending?deviceId=' + encodeURIComponent(PRO_DEVICE) + '&limit=5'
    );
    if (
      second.body &&
      second.body.cache &&
      second.body.cache.hit === true
    ) {
      ok('第二次请求 Redis cache.hit=true');
    } else {
      fail(
        'Redis 缓存命中',
        'first=' + JSON.stringify(first.body && first.body.cache) +
          ' second=' + JSON.stringify(second.body && second.body.cache)
      );
    }
  }

  // 6. Invalid token
  {
    const { status, body } = await json(
      '/api/v1/dashboard/trending?deviceId=' +
        encodeURIComponent(FREE_DEVICE) +
        '&accessToken=invalid.token.here',
      { headers: { Authorization: 'Bearer invalid.token.here' } }
    );
    if (status === 401) {
      ok('无效 Token → 401');
    } else {
      fail('无效 Token', 'status=' + status + ' ' + JSON.stringify(body));
    }
  }

  // 7. Ingest
  {
    const { status, body } = await json('/api/ingest/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: FREE_DEVICE,
        domain: 'qa-test.myshopify.com',
        storeType: 'shopify',
        currency: 'USD',
        products: [
          {
            shopifyId: 99901,
            title: 'QA Test Widget',
            sku: 'QA-001',
            price: 24.99,
            productType: 'Gadgets',
          },
        ],
      }),
    });
    if (status === 200 && body && body.ok && body.ingested >= 1) {
      ok('POST /api/ingest/products → ingested=' + body.ingested);
    } else {
      fail('ingest', 'status=' + status + ' ' + JSON.stringify(body));
    }
  }

  // 8. Legacy trending still works
  {
    const { status, body } = await json(
      '/api/trending?deviceId=' + encodeURIComponent(FREE_DEVICE) + '&limit=2'
    );
    if (status === 200 && body && body.items) {
      ok('Legacy GET /api/trending 仍可用');
    } else {
      fail('Legacy trending', 'status=' + status);
    }
  }

  // 9. Webhook bad signature → 401
  {
    const { status, body } = await json('/api/v1/webhook/lemonsqueezy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': 'deadbeef',
      },
      body: JSON.stringify({ meta: { event_name: 'order_created' } }),
    });
    if (status === 401) {
      ok('Webhook 错误签名 → 401');
    } else if (status === 503 && body && body.msg && body.msg.indexOf('SECRET') !== -1) {
      ok('Webhook 未配置 SECRET → 503（本地可接受）');
    } else {
      fail('Webhook 错误签名', 'status=' + status + ' ' + JSON.stringify(body));
    }
  }

  // 10. Webhook valid signature (if secret available)
  {
    const fs = require('fs');
    const path = require('path');
    const secretFile = path.join(__dirname, '..', '.lemon-webhook-secret');
    let secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || process.env.SHOPRADAR_LEMON_WEBHOOK_SECRET || '';
    if (!secret && fs.existsSync(secretFile)) {
      secret = fs.readFileSync(secretFile, 'utf8').split(/\r?\n/).find(function (l) {
        return l.trim() && l.trim().charAt(0) !== '#';
      });
      if (secret) secret = secret.trim();
    }

    if (!secret) {
      console.log('  ~ Webhook 有效签名测试跳过（未配置 secret）');
    } else {
      const payload = JSON.stringify({
        meta: {
          event_name: 'order_created',
          custom_data: { device_id: PRO_DEVICE },
        },
        data: { attributes: { renews_at: new Date(Date.now() + 86400000 * 30).toISOString() } },
      });
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const { status, body } = await json('/api/v1/webhook/lemonsqueezy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': sig,
        },
        body: payload,
      });
      if (status === 200 && body && body.result && body.result.handled) {
        ok('Webhook 有效签名 order_created → Pro 开通');
      } else {
        fail('Webhook 有效签名', 'status=' + status + ' ' + JSON.stringify(body));
      }

      // 11. pro-status confirms
      const proCheck = await json(
        '/api/pro-status?deviceId=' + encodeURIComponent(PRO_DEVICE)
      );
      if (proCheck.body && proCheck.body.isPro === true) {
        ok('pro-status 确认 isPro=true');
      } else {
        fail('pro-status', JSON.stringify(proCheck.body));
      }

      // 12. subscription_cancelled
      const cancelPayload = JSON.stringify({
        meta: {
          event_name: 'subscription_cancelled',
          custom_data: { device_id: PRO_DEVICE },
        },
      });
      const cancelSig = crypto.createHmac('sha256', secret).update(cancelPayload).digest('hex');
      const cancelRes = await json('/api/v1/webhook/lemonsqueezy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': cancelSig,
        },
        body: cancelPayload,
      });
      if (cancelRes.status === 200 && cancelRes.body && cancelRes.body.result && cancelRes.body.result.action === 'pro_deactivated') {
        ok('Webhook subscription_cancelled → Pro 关闭');
      } else {
        fail('subscription_cancelled', JSON.stringify(cancelRes.body));
      }

      const proCheck2 = await json(
        '/api/pro-status?deviceId=' + encodeURIComponent(PRO_DEVICE)
      );
      if (proCheck2.body && proCheck2.body.isPro === false) {
        ok('取消后 pro-status isPro=false');
      } else {
        fail('取消后 pro-status', JSON.stringify(proCheck2.body));
      }
    }
  }

  console.log('\n结果:', passed, '通过,', failed, '失败\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function (err) {
  console.error('测试崩溃:', err);
  process.exit(1);
});
