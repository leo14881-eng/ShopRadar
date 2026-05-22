'use strict';

const { getMessages, getNextHourUtcIso } = require('./i18n-messages');
const { invalidateTrendingCache } = require('./redis-client');

const MAX_INGEST_PRODUCTS = 50;
const MAX_INGEST_PER_DEVICE_DAY = 40;
/** 展示层：同一店铺在 Top N 中最多出现几条 */
const MAX_ITEMS_PER_STORE = 2;
/** 多样性截断前先多拉候选行 */
const TRENDING_FETCH_MULTIPLIER = 5;

const AD_SIGNALS = ['Meta Active', 'TikTok Viral', 'Google Ads'];

const TRENDING_RANK_SQL = `
    SELECT
      pc.product_key,
      pc.store_domain,
      pc.title,
      pc.sku,
      pc.category,
      pc.image_url,
      pc.price,
      pc.currency,
      pc.total_sightings,
      COALESCE(today_stats.today_devices, 0) AS today_count,
      COALESCE(week_stats.week_total, 0) AS week_total,
      COALESCE(prev_week_stats.prev_week_total, 0) AS prev_week_total
    FROM product_catalog pc
    LEFT JOIN (
      SELECT product_key, COUNT(DISTINCT device_id) AS today_devices
      FROM daily_product_devices
      WHERE stat_date = ?
      GROUP BY product_key
    ) today_stats ON today_stats.product_key = pc.product_key
    LEFT JOIN (
      SELECT product_key, COUNT(DISTINCT device_id) AS week_total
      FROM daily_product_devices
      WHERE stat_date >= date(?, '-6 day') AND stat_date <= ?
      GROUP BY product_key
    ) week_stats ON week_stats.product_key = pc.product_key
    LEFT JOIN (
      SELECT product_key, COUNT(DISTINCT device_id) AS prev_week_total
      FROM daily_product_devices
      WHERE stat_date >= date(?, '-13 day') AND stat_date < date(?, '-6 day')
      GROUP BY product_key
    ) prev_week_stats ON prev_week_stats.product_key = pc.product_key
    WHERE COALESCE(today_stats.today_devices, 0) + COALESCE(week_stats.week_total, 0) > 0
    ORDER BY
      (COALESCE(today_stats.today_devices, 0) * 100 + COALESCE(week_stats.week_total, 0)) DESC,
      pc.last_seen_at DESC
    LIMIT ?
  `;

function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function slugifyTitle(title) {
  return String(title || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function makeProductKey(storeDomain, shopifyId, title) {
  const domain = normalizeDomain(storeDomain);
  if (shopifyId != null && String(shopifyId).trim()) {
    return domain + '::id::' + String(shopifyId).trim();
  }
  return domain + '::title::' + slugifyTitle(title);
}

function hashString(input) {
  let hash = 0;
  const str = String(input || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickAdSignal(productKey) {
  return AD_SIGNALS[hashString(productKey) % AD_SIGNALS.length];
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
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

/**
 * @param {import('sqlite3').Database} db
 */
async function migrateTrendingTables(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS product_catalog (
      product_key TEXT PRIMARY KEY,
      store_domain TEXT NOT NULL,
      title TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      image_url TEXT,
      price REAL,
      currency TEXT,
      vendor TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      total_sightings INTEGER NOT NULL DEFAULT 1
    );
  `
  );

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS daily_product_stats (
      product_key TEXT NOT NULL,
      stat_date TEXT NOT NULL,
      sighting_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (product_key, stat_date)
    );
  `
  );

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS ingest_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      store_domain TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      product_count INTEGER NOT NULL DEFAULT 0
    );
  `
  );

  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_product_catalog_store ON product_catalog(store_domain)'
  );
  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_product_stats(stat_date)'
  );
  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_ingest_log_device_date ON ingest_log(device_id, ingested_at)'
  );

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS daily_store_devices (
      store_domain TEXT NOT NULL,
      stat_date TEXT NOT NULL,
      device_id TEXT NOT NULL,
      PRIMARY KEY (store_domain, stat_date, device_id)
    );
  `
  );

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS daily_product_devices (
      product_key TEXT NOT NULL,
      stat_date TEXT NOT NULL,
      device_id TEXT NOT NULL,
      PRIMARY KEY (product_key, stat_date, device_id)
    );
  `
  );

  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_daily_product_devices_date ON daily_product_devices(stat_date)'
  );
  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_daily_store_devices_date ON daily_store_devices(stat_date)'
  );
  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_daily_product_devices_key ON daily_product_devices(product_key)'
  );

  await backfillTrendingDeviceTables(db);
}

/**
 * 一次性：旧 sighting_count 数据 → 每商品每天最多 1 个 legacy device（避免历史刷量）
 * @param {import('sqlite3').Database} db
 */
async function backfillTrendingDeviceTables(db) {
  const row = await dbGet(
    db,
    'SELECT COUNT(*) AS cnt FROM daily_product_devices'
  );
  if (Number(row && row.cnt ? row.cnt : 0) > 0) {
    return;
  }

  const stats = await dbAll(
    db,
    `
    SELECT product_key, stat_date
    FROM daily_product_stats
    WHERE sighting_count > 0
  `
  );

  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i];
    await dbRun(
      db,
      `
      INSERT OR IGNORE INTO daily_product_devices (product_key, stat_date, device_id)
      VALUES (?, ?, ?)
    `,
      [
        stat.product_key,
        stat.stat_date,
        'legacy:' + stat.product_key + ':' + stat.stat_date,
      ]
    );
  }

  const ingests = await dbAll(
    db,
    `
    SELECT DISTINCT device_id, store_domain, substr(ingested_at, 1, 10) AS stat_date
    FROM ingest_log
  `
  );

  for (let j = 0; j < ingests.length; j++) {
    const ing = ingests[j];
    await markStoreScoredToday(
      db,
      normalizeDomain(ing.store_domain),
      ing.stat_date,
      ing.device_id
    );
  }
}

/**
 * @param {import('sqlite3').Database} db
 */
async function countIngestsToday(db, deviceId) {
  const today = getTodayDateString();
  const row = await dbGet(
    db,
    `
    SELECT COUNT(*) AS cnt
    FROM ingest_log
    WHERE device_id = ? AND substr(ingested_at, 1, 10) = ?
  `,
    [deviceId, today]
  );
  return Number(row && row.cnt ? row.cnt : 0);
}

/**
 * @param {import('sqlite3').Database} db
 */
async function getStoresTrackedCount(db) {
  const row = await dbGet(
    db,
    'SELECT COUNT(DISTINCT store_domain) AS cnt FROM product_catalog'
  );
  return Number(row && row.cnt ? row.cnt : 0);
}

/**
 * @param {import('sqlite3').Database} db
 */
async function hasStoreScoredToday(db, deviceId, storeDomain, statDate) {
  const row = await dbGet(
    db,
    `
    SELECT 1 AS hit
    FROM daily_store_devices
    WHERE store_domain = ? AND stat_date = ? AND device_id = ?
  `,
    [storeDomain, statDate, deviceId]
  );
  return Boolean(row && row.hit);
}

/**
 * @param {import('sqlite3').Database} db
 * @returns {Promise<boolean>} true when this device is newly counted for the product today
 */
function recordUniqueProductDevice(db, productKey, statDate, deviceId) {
  return new Promise(function (resolve, reject) {
    db.run(
      `
      INSERT OR IGNORE INTO daily_product_devices (product_key, stat_date, device_id)
      VALUES (?, ?, ?)
    `,
      [productKey, statDate, deviceId],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      }
    );
  });
}

/**
 * @param {import('sqlite3').Database} db
 */
async function bumpDailyProductStat(db, productKey, statDate) {
  const dailyRow = await dbGet(
    db,
    'SELECT sighting_count FROM daily_product_stats WHERE product_key = ? AND stat_date = ?',
    [productKey, statDate]
  );

  if (dailyRow) {
    await dbRun(
      db,
      'UPDATE daily_product_stats SET sighting_count = sighting_count + 1 WHERE product_key = ? AND stat_date = ?',
      [productKey, statDate]
    );
    return;
  }

  await dbRun(
    db,
    'INSERT INTO daily_product_stats (product_key, stat_date, sighting_count) VALUES (?, ?, 1)',
    [productKey, statDate]
  );
}

/**
 * @param {import('sqlite3').Database} db
 */
async function markStoreScoredToday(db, storeDomain, statDate, deviceId) {
  await dbRun(
    db,
    `
    INSERT OR IGNORE INTO daily_store_devices (store_domain, stat_date, device_id)
    VALUES (?, ?, ?)
  `,
    [storeDomain, statDate, deviceId]
  );
}

/**
 * 展示层：Top N 每店最多 MAX_ITEMS_PER_STORE 条
 * @param {Array<object>} items
 * @param {number} limit
 */
function applyStoreDiversityCap(items, limit) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const out = [];
  const perStore = Object.create(null);

  for (let i = 0; i < items.length && out.length < cap; i++) {
    const item = items[i];
    const store = normalizeDomain(item.shop_domain || item.sourceStore || '');
    const used = perStore[store] || 0;
    if (used >= MAX_ITEMS_PER_STORE) {
      continue;
    }
    perStore[store] = used + 1;
    out.push(item);
  }

  return out.map(function (item, index) {
    const next = Object.assign({}, item);
    next.rank = index + 1;
    return next;
  });
}

/**
 * @param {import('sqlite3').Database} db
 * @param {string} today
 * @param {number} fetchLimit
 */
async function fetchTrendingRankedRows(db, today, fetchLimit) {
  return dbAll(db, TRENDING_RANK_SQL, [
    today,
    today,
    today,
    today,
    today,
    fetchLimit,
  ]);
}

/**
 * @param {import('sqlite3').Database} db
 * @param {string} deviceId
 * @param {string} domain
 * @param {string} storeType
 * @param {string} currency
 * @param {Array<object>} products
 */
async function ingestProducts(db, deviceId, domain, storeType, currency, products) {
  const storeDomain = normalizeDomain(domain);
  if (!deviceId || !storeDomain) {
    throw new Error('missing deviceId or domain');
  }

  const list = Array.isArray(products) ? products.slice(0, MAX_INGEST_PRODUCTS) : [];
  if (!list.length) {
    return { ok: true, ingested: 0, reason: 'empty_payload' };
  }

  const ingestCountToday = await countIngestsToday(db, deviceId);
  if (ingestCountToday >= MAX_INGEST_PER_DEVICE_DAY) {
    return {
      ok: false,
      ingested: 0,
      reason: 'daily_ingest_limit',
      limit: MAX_INGEST_PER_DEVICE_DAY,
    };
  }

  const nowIso = new Date().toISOString();
  const today = getTodayDateString();
  const scoreHeat = !(await hasStoreScoredToday(db, deviceId, storeDomain, today));
  let ingested = 0;
  let heatRecorded = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const title = String(item.title || '').trim();
    if (!title) {
      continue;
    }

    const productKey = makeProductKey(storeDomain, item.shopifyId, title);
    const sku = item.sku ? String(item.sku).trim() : '';
    const category = String(
      item.productType || item.category || item.vendor || 'General'
    ).trim();
    const imageUrl = item.imageUrl ? String(item.imageUrl).trim() : '';
    const price =
      item.price != null && !Number.isNaN(Number(item.price))
        ? roundMoney(item.price)
        : null;
    const vendor = item.vendor ? String(item.vendor).trim() : '';

    const existing = await dbGet(
      db,
      'SELECT product_key, total_sightings FROM product_catalog WHERE product_key = ?',
      [productKey]
    );

    if (existing) {
      await dbRun(
        db,
        `
        UPDATE product_catalog
        SET title = ?, sku = ?, category = ?, image_url = COALESCE(NULLIF(?, ''), image_url), price = ?, currency = ?,
            vendor = ?, last_seen_at = ?
        WHERE product_key = ?
      `,
        [
          title,
          sku,
          category,
          imageUrl,
          price,
          currency || 'USD',
          vendor,
          nowIso,
          productKey,
        ]
      );
    } else {
      await dbRun(
        db,
        `
        INSERT INTO product_catalog (
          product_key, store_domain, title, sku, category, image_url, price, currency,
          vendor, first_seen_at, last_seen_at, total_sightings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `,
        [
          productKey,
          storeDomain,
          title,
          sku,
          category,
          imageUrl,
          price,
          currency || 'USD',
          vendor,
          nowIso,
          nowIso,
        ]
      );
    }

    if (scoreHeat) {
      const added = await recordUniqueProductDevice(db, productKey, today, deviceId);
      if (added) {
        await bumpDailyProductStat(db, productKey, today);
        await dbRun(
          db,
          'UPDATE product_catalog SET total_sightings = total_sightings + 1 WHERE product_key = ?',
          [productKey]
        );
        heatRecorded += 1;
      }
    }

    ingested += 1;
  }

  if (scoreHeat && ingested > 0) {
    await markStoreScoredToday(db, storeDomain, today, deviceId);
  }

  if (ingested > 0) {
    await dbRun(
      db,
      'INSERT INTO ingest_log (device_id, store_domain, ingested_at, product_count) VALUES (?, ?, ?, ?)',
      [deviceId, storeDomain, nowIso, ingested]
    );

    try {
      await invalidateTrendingCache();
    } catch (cacheErr) {
      console.warn(
        '[ShopRadar Server] trending 缓存失效失败（已写入 DB）:',
        cacheErr.message
      );
    }
  }

  return {
    ok: true,
    ingested: ingested,
    heat_scored: scoreHeat,
    heat_recorded: heatRecorded,
    storeDomain: storeDomain,
    storeType: storeType || 'shopify',
  };
}

function computeGrowth7d(todayCount, weekTotal, prevWeekTotal) {
  const current = Number(weekTotal || 0);
  const previous = Number(prevWeekTotal || 0);
  if (previous <= 0) {
    return current > 0 ? 1.5 : 0;
  }
  return (current - previous) / previous;
}

function estimateDailyRev(price, todayUniqueDevices, weekUniqueDevices) {
  const unit = Number(price || 0);
  const todayDevices = Number(todayUniqueDevices || 0);
  const weekDevices = Number(weekUniqueDevices || 0);
  if (unit <= 0) {
    return roundMoney((todayDevices + 1) * 42.5);
  }
  const velocity = todayDevices * 18 + weekDevices * 0.35;
  return roundMoney(unit * Math.max(velocity, 12));
}

function buildProductUrl(storeDomain, title) {
  const domain = normalizeDomain(storeDomain);
  const slug = slugifyTitle(title);
  return 'https://' + domain + '/products/' + slug;
}

function mapGoldenRow(row, index) {
  const growthRatio = computeGrowth7d(
    row.today_count,
    row.week_total,
    row.prev_week_total
  );
  const growthPct = Math.round(growthRatio * 100);

  return {
    rank: index + 1,
    title: row.title,
    sku: row.sku || '',
    category: row.category || 'General',
    est_daily_rev: estimateDailyRev(
      row.price,
      row.today_count,
      row.week_total
    ),
    growth_7d: growthPct,
    shop_domain: row.store_domain,
    product_url: buildProductUrl(row.store_domain, row.title),
    ad_signal: pickAdSignal(row.product_key),
    image_url: row.image_url || '',
    currency: row.currency || 'USD',
  };
}

function tierGoldenItem(item, isPro, locale) {
  if (isPro) {
    return item;
  }
  const msg = getMessages(locale || 'en');
  return {
    rank: item.rank,
    title: item.title,
    sku: item.sku ? item.sku.slice(0, 3) + '***' : msg.hidden_value,
    category: item.category,
    est_daily_rev: msg.hidden_value,
    growth_7d: msg.hidden_value,
    shop_domain: msg.hidden_domain,
    product_url: msg.hidden_url,
    ad_signal: msg.hidden_value,
    image_url: item.image_url,
    locked: true,
    locked_message: msg.upgrade_unlock,
  };
}

/**
 * 查询完整黄金数据（供 Redis 缓存，不做权限脱敏）
 * @param {import('sqlite3').Database} db
 * @param {{ limit?: number }} opts
 */
async function queryTrendingGolden(db, opts) {
  const limit = Math.min(Math.max(Number(opts && opts.limit) || 100, 1), 100);
  const today = getTodayDateString();
  const fetchLimit = Math.min(limit * TRENDING_FETCH_MULTIPLIER, 500);

  const rows = await fetchTrendingRankedRows(db, today, fetchLimit);
  const storesTracked = await getStoresTrackedCount(db);
  const items = applyStoreDiversityCap(rows.map(mapGoldenRow), limit);
  const nowUtc = new Date().toISOString();

  return {
    ok: true,
    version: 'v1',
    updated_at: nowUtc,
    next_update_at: getNextHourUtcIso(),
    stores_tracked: storesTracked,
    items: items,
  };
}

/**
 * 按观众权限分级返回
 * @param {object} golden
 * @param {{ isPro?: boolean, limit?: number }} opts
 */
function tierTrendingForViewer(golden, opts) {
  const isPro = Boolean(opts && opts.isPro);
  const locale = (opts && opts.locale) || 'en';
  const limit = Math.min(
    Math.max(Number(opts && opts.limit) || 100, 1),
    100
  );
  const msg = getMessages(locale);
  const sourceItems = (golden && golden.items) || [];
  const sliced = sourceItems.slice(0, limit).map(function (item) {
    return tierGoldenItem(item, isPro, locale);
  });

  return {
    ok: true,
    version: 'v1',
    updated_at: (golden && golden.updated_at) || new Date().toISOString(),
    next_update_at: (golden && golden.next_update_at) || getNextHourUtcIso(),
    stores_tracked: golden && golden.stores_tracked,
    is_pro: isPro,
    locale: locale,
    paywall_hint: isPro ? null : msg.paywall_hint,
    items: sliced,
  };
}

function redactTrendingItem(item, isPro) {
  if (isPro) {
    return item;
  }
  return {
    rank: item.rank,
    title: item.title,
    sku: item.sku ? item.sku.slice(0, 3) + '***' : null,
    category: item.category,
    estDailyRev: null,
    growth7d: null,
    sourceStore: null,
    adSignal: null,
    imageUrl: item.imageUrl,
    locked: true,
  };
}

/**
 * @param {import('sqlite3').Database} db
 * @param {{ limit?: number, isPro?: boolean }} opts
 */
async function queryTrending(db, opts) {
  const limit = Math.min(Math.max(Number(opts && opts.limit) || 20, 1), 100);
  const isPro = Boolean(opts && opts.isPro);
  const today = getTodayDateString();
  const fetchLimit = Math.min(limit * TRENDING_FETCH_MULTIPLIER, 500);

  const rows = await fetchTrendingRankedRows(db, today, fetchLimit);
  const storesTracked = await getStoresTrackedCount(db);

  const ranked = applyStoreDiversityCap(
    rows.map(function (row, index) {
      const growthRatio = computeGrowth7d(
        row.today_count,
        row.week_total,
        row.prev_week_total
      );
      const growthPct = Math.round(growthRatio * 100);

      return {
        rank: index + 1,
        title: row.title,
        sku: row.sku || '',
        category: row.category || 'General',
        estDailyRev: estimateDailyRev(row.price, row.today_count, row.week_total),
        growth7d: growthPct,
        sourceStore: row.store_domain,
        adSignal: pickAdSignal(row.product_key),
        imageUrl: row.image_url || '',
      };
    }),
    limit
  );

  const items = ranked.map(function (item) {
    return redactTrendingItem(item, isPro);
  });

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    dateLabel: today + ' · UTC',
    storesTracked: storesTracked,
    isPro: isPro,
    items: items,
  };
}

module.exports = {
  migrateTrendingTables,
  ingestProducts,
  queryTrending,
  queryTrendingGolden,
  tierTrendingForViewer,
  getStoresTrackedCount,
  applyStoreDiversityCap,
  computeGrowth7d,
  MAX_INGEST_PRODUCTS,
  MAX_ITEMS_PER_STORE,
};
