'use strict';

const { getMessages, getNextHourUtcIso } = require('./i18n-messages');
const { invalidateTrendingCache } = require('./redis-client');

const MAX_INGEST_PRODUCTS = 50;
const MAX_INGEST_PER_DEVICE_DAY = 40;

const AD_SIGNALS = ['Meta Active', 'TikTok Viral', 'Google Ads'];

function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
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
  let ingested = 0;

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
            vendor = ?, last_seen_at = ?, total_sightings = total_sightings + 1
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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

    const dailyRow = await dbGet(
      db,
      'SELECT sighting_count FROM daily_product_stats WHERE product_key = ? AND stat_date = ?',
      [productKey, today]
    );

    if (dailyRow) {
      await dbRun(
        db,
        'UPDATE daily_product_stats SET sighting_count = sighting_count + 1 WHERE product_key = ? AND stat_date = ?',
        [productKey, today]
      );
    } else {
      await dbRun(
        db,
        'INSERT INTO daily_product_stats (product_key, stat_date, sighting_count) VALUES (?, ?, 1)',
        [productKey, today]
      );
    }

    ingested += 1;
  }

  await dbRun(
    db,
    'INSERT INTO ingest_log (device_id, store_domain, ingested_at, product_count) VALUES (?, ?, ?, ?)',
    [deviceId, storeDomain, nowIso, ingested]
  );

  await invalidateTrendingCache();

  return {
    ok: true,
    ingested: ingested,
    storeDomain: storeDomain,
    storeType: storeType || 'shopify',
  };
}

function computeGrowth7d(todayCount, weekTotal, prevWeekTotal) {
  const current = Number(todayCount || 0) + Number(weekTotal || 0);
  const previous = Number(prevWeekTotal || 0);
  if (previous <= 0) {
    return current > 0 ? 1.5 : 0;
  }
  return (current - previous) / previous;
}

function estimateDailyRev(price, todayCount, totalSightings) {
  const unit = Number(price || 0);
  if (unit <= 0) {
    return roundMoney((Number(todayCount || 0) + 1) * 42.5);
  }
  const velocity = Number(todayCount || 0) * 18 + Number(totalSightings || 0) * 0.35;
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
      row.total_sightings
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

  const rows = await dbAll(
    db,
    `
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
      COALESCE(today_stats.sighting_count, 0) AS today_count,
      COALESCE(week_stats.week_total, 0) AS week_total,
      COALESCE(prev_week_stats.prev_week_total, 0) AS prev_week_total
    FROM product_catalog pc
    LEFT JOIN daily_product_stats today_stats
      ON today_stats.product_key = pc.product_key AND today_stats.stat_date = ?
    LEFT JOIN (
      SELECT product_key, SUM(sighting_count) AS week_total
      FROM daily_product_stats
      WHERE stat_date >= date(?, '-6 day') AND stat_date <= ?
      GROUP BY product_key
    ) week_stats ON week_stats.product_key = pc.product_key
    LEFT JOIN (
      SELECT product_key, SUM(sighting_count) AS prev_week_total
      FROM daily_product_stats
      WHERE stat_date >= date(?, '-13 day') AND stat_date < date(?, '-6 day')
      GROUP BY product_key
    ) prev_week_stats ON prev_week_stats.product_key = pc.product_key
    ORDER BY
      (COALESCE(today_stats.sighting_count, 0) * 100 + COALESCE(week_stats.week_total, 0)) DESC,
      pc.last_seen_at DESC
    LIMIT ?
  `,
    [today, today, today, today, today, limit]
  );

  const storesTracked = await getStoresTrackedCount(db);
  const items = rows.map(mapGoldenRow);
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

  const rows = await dbAll(
    db,
    `
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
      COALESCE(today_stats.sighting_count, 0) AS today_count,
      COALESCE(week_stats.week_total, 0) AS week_total,
      COALESCE(prev_week_stats.prev_week_total, 0) AS prev_week_total
    FROM product_catalog pc
    LEFT JOIN daily_product_stats today_stats
      ON today_stats.product_key = pc.product_key AND today_stats.stat_date = ?
    LEFT JOIN (
      SELECT product_key, SUM(sighting_count) AS week_total
      FROM daily_product_stats
      WHERE stat_date >= date(?, '-6 day') AND stat_date <= ?
      GROUP BY product_key
    ) week_stats ON week_stats.product_key = pc.product_key
    LEFT JOIN (
      SELECT product_key, SUM(sighting_count) AS prev_week_total
      FROM daily_product_stats
      WHERE stat_date >= date(?, '-13 day') AND stat_date < date(?, '-6 day')
      GROUP BY product_key
    ) prev_week_stats ON prev_week_stats.product_key = pc.product_key
    ORDER BY
      (COALESCE(today_stats.sighting_count, 0) * 100 + COALESCE(week_stats.week_total, 0)) DESC,
      pc.last_seen_at DESC
    LIMIT ?
  `,
    [today, today, today, today, today, limit]
  );

  const storesTracked = await getStoresTrackedCount(db);

  const items = rows.map(function (row, index) {
    const growthRatio = computeGrowth7d(
      row.today_count,
      row.week_total,
      row.prev_week_total
    );
    const growthPct = Math.round(growthRatio * 100);

    const fullItem = {
      rank: index + 1,
      title: row.title,
      sku: row.sku || '',
      category: row.category || 'General',
      estDailyRev: estimateDailyRev(row.price, row.today_count, row.total_sightings),
      growth7d: growthPct,
      sourceStore: row.store_domain,
      adSignal: pickAdSignal(row.product_key),
      imageUrl: row.image_url || '',
    };

    return redactTrendingItem(fullItem, isPro);
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
  MAX_INGEST_PRODUCTS,
};
