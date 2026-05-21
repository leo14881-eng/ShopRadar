#!/usr/bin/env node
'use strict';

/**
 * 清除自动化测试 / 联调写入的脏数据
 *
 * Usage:
 *   node scripts/clean-test-data.js
 *   node scripts/clean-test-data.js --dry-run
 *
 * 会清理：
 * - product_catalog / daily_product_stats：Flow Test、seed-*.myshopify.com、qa-test 等
 * - ingest_log：测试 device / 测试店铺
 * - users：flow-* / test-free-* / test-pro-* / seed-script-device 等测试账号
 * - pending_pro_claims：*@shopradar.test
 * - Redis 飙升榜缓存
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const sqlite3 = require('sqlite3').verbose();
const { invalidateTrendingCache, connectRedis, closeRedis } = require('../redis-client');

const DB_PATH = process.env.SHOPRADAR_DB_PATH
  ? path.resolve(process.env.SHOPRADAR_DB_PATH)
  : path.join(__dirname, '..', 'database.sqlite');

const DRY_RUN = process.argv.includes('--dry-run');

const TEST_STORE_PATTERNS = [
  "store_domain LIKE 'seed-%'",
  "store_domain = 'qa-test.myshopify.com'",
];

const TEST_PRODUCT_PATTERNS = [
  "title LIKE 'Flow Test Product%'",
  "title = 'QA Test Widget'",
  "sku LIKE 'FLOW-%'",
  "sku = 'QA-001'",
];

const TEST_DEVICE_PATTERNS = [
  "device_id LIKE 'flow-%'",
  "device_id LIKE 'test-free-%'",
  "device_id LIKE 'test-pro-%'",
  "device_id = 'seed-script-device'",
];

function dbAll(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.all(sql, params || [], function (err, rows) {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

function dbRun(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.run(sql, params || [], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ changes: this.changes });
      }
    });
  });
}

function whereOr(clauses) {
  return '(' + clauses.join(' OR ') + ')';
}

async function countRows(db, table, whereSql) {
  const row = await dbAll(db, 'SELECT COUNT(*) AS cnt FROM ' + table + ' WHERE ' + whereSql);
  return Number(row[0] && row[0].cnt ? row[0].cnt : 0);
}

async function main() {
  console.log('\nShopRadar 清理测试数据 →', DB_PATH);
  if (DRY_RUN) {
    console.log('（dry-run，不写入）\n');
  } else {
    console.log('');
  }

  const db = await new Promise(function (resolve, reject) {
    const instance = new sqlite3.Database(DB_PATH, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(instance);
      }
    });
  });

  const productWhere = whereOr(
    TEST_STORE_PATTERNS.concat(TEST_PRODUCT_PATTERNS)
  );
  const ingestWhere = whereOr(
    TEST_STORE_PATTERNS.map(function (p) {
      return p.replace('store_domain', 'store_domain');
    }).concat(TEST_DEVICE_PATTERNS)
  );
  const userWhere = whereOr(TEST_DEVICE_PATTERNS);
  const pendingWhere = "email LIKE '%@shopradar.test'";

  const keys = await dbAll(
    db,
    'SELECT product_key, store_domain, title FROM product_catalog WHERE ' + productWhere
  );
  const ingestCnt = await countRows(db, 'ingest_log', ingestWhere);
  const userCnt = await countRows(db, 'users', userWhere);
  const pendingCnt = await countRows(db, 'pending_pro_claims', pendingWhere);

  console.log('待删商品:', keys.length);
  keys.slice(0, 10).forEach(function (row) {
    console.log('  -', row.title, '|', row.store_domain);
  });
  if (keys.length > 10) {
    console.log('  ... 另有', keys.length - 10, '条');
  }
  console.log('待删 ingest_log:', ingestCnt);
  console.log('待删 users 测试行:', userCnt);
  console.log('待删 pending_pro_claims:', pendingCnt);

  if (DRY_RUN) {
    db.close();
    return;
  }

  if (keys.length) {
    const keyList = keys.map(function (r) {
      return r.product_key;
    });
    const placeholders = keyList.map(function () {
      return '?';
    }).join(',');
    await dbRun(
      db,
      'DELETE FROM daily_product_stats WHERE product_key IN (' + placeholders + ')',
      keyList
    );
    await dbRun(
      db,
      'DELETE FROM daily_product_devices WHERE product_key IN (' + placeholders + ')',
      keyList
    );
    await dbRun(
      db,
      'DELETE FROM product_catalog WHERE product_key IN (' + placeholders + ')',
      keyList
    );
  }

  await dbRun(
    db,
    "DELETE FROM daily_store_devices WHERE device_id LIKE 'seed-%' OR device_id LIKE 'flow-%' OR device_id LIKE 'qa-%'"
  );
  await dbRun(
    db,
    "DELETE FROM daily_product_devices WHERE device_id LIKE 'seed-%' OR device_id LIKE 'flow-%' OR device_id LIKE 'legacy:%'"
  );
  await dbRun(db, 'DELETE FROM ingest_log WHERE ' + ingestWhere);
  await dbRun(db, 'DELETE FROM users WHERE ' + userWhere);
  await dbRun(db, 'DELETE FROM pending_pro_claims WHERE ' + pendingWhere);

  db.close();

  try {
    await connectRedis();
    await invalidateTrendingCache();
    await closeRedis();
    console.log('已清空 Redis 飙升榜缓存');
  } catch (redisErr) {
    console.warn('Redis 缓存未清（可忽略）:', redisErr.message);
  }

  console.log('\n清理完成。刷新 http://localhost:8080/index.html#dashboard 查看。\n');
}

main().catch(function (err) {
  console.error('清理失败:', err);
  process.exit(1);
});
