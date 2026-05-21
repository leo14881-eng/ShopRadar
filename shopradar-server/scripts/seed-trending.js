#!/usr/bin/env node
/**
 * 写入演示用飙升榜数据（本地 / 首次部署联调）
 * Usage: node scripts/seed-trending.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const sqlite3 = require('sqlite3').verbose();
const { migrateTrendingTables, ingestProducts } = require('../trending');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const SEED_DEVICE = 'seed-script-device';

function demoImage(seed) {
  return (
    'https://picsum.photos/seed/shopradar-' +
    encodeURIComponent(String(seed)) +
    '/128/128'
  );
}

const DEMO_STORES = [
  {
    domain: 'coolbreeze-store.myshopify.com',
    currency: 'USD',
    products: [
      {
        shopifyId: 1001,
        title: 'Portable Neck Fan Pro',
        sku: 'NF-2026-X',
        productType: 'Electronics',
        price: 29.99,
        imageUrl: demoImage('portable-neck-fan'),
      },
      {
        shopifyId: 1002,
        title: 'USB-C Mini Desk Fan',
        sku: 'NF-MINI-2',
        productType: 'Electronics',
        price: 19.99,
        imageUrl: demoImage('usb-desk-fan'),
      },
    ],
  },
  {
    domain: 'autogrip-shop.myshopify.com',
    currency: 'USD',
    products: [
      {
        shopifyId: 2001,
        title: 'Magnetic Car Phone Mount',
        sku: 'CM-MAG-01',
        productType: 'Automotive',
        price: 24.5,
        imageUrl: demoImage('car-phone-mount'),
      },
    ],
  },
  {
    domain: 'walkoncloud.myshopify.com',
    currency: 'USD',
    products: [
      {
        shopifyId: 3001,
        title: 'Cloud Slides Ultra Soft',
        sku: 'CS-Ultra-3',
        productType: 'Footwear',
        price: 34.0,
        imageUrl: demoImage('cloud-slides'),
      },
    ],
  },
  {
    domain: 'ambientglow.myshopify.com',
    currency: 'USD',
    products: [
      {
        shopifyId: 4001,
        title: 'LED Sunset Lamp Projector',
        sku: 'SL-Proj-2',
        productType: 'Home Decor',
        price: 27.99,
        imageUrl: demoImage('sunset-lamp'),
      },
    ],
  },
  {
    domain: 'spinealign-pro.myshopify.com',
    currency: 'USD',
    products: [
      {
        shopifyId: 5001,
        title: 'Posture Corrector Belt X',
        sku: 'PC-Belt-X',
        productType: 'Health',
        price: 39.99,
        imageUrl: demoImage('posture-belt'),
      },
    ],
  },
];

function openDb() {
  return new Promise(function (resolve, reject) {
    const db = new sqlite3.Database(DB_PATH, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
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

async function bumpDailyStats(db) {
  const keys = await dbAll(db, 'SELECT product_key FROM product_catalog');
  const weights = [14, 11, 9, 7, 6, 4, 3];

  for (let i = 0; i < keys.length; i++) {
    const productKey = keys[i].product_key;
    for (let offset = 0; offset < weights.length; offset++) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const statDate = date.toISOString().slice(0, 10);
      const deviceId = 'seed:' + productKey + ':d' + offset;

      await dbRun(
        db,
        `
        INSERT OR IGNORE INTO daily_product_devices (product_key, stat_date, device_id)
        VALUES (?, ?, ?)
      `,
        [productKey, statDate, deviceId]
      );

      await dbRun(
        db,
        `
        INSERT INTO daily_product_stats (product_key, stat_date, sighting_count)
        VALUES (?, ?, ?)
        ON CONFLICT(product_key, stat_date) DO UPDATE SET
          sighting_count = MAX(sighting_count, excluded.sighting_count)
      `,
        [productKey, statDate, 1]
      );
    }
  }
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

async function main() {
  var redisReady = false;
  try {
    const { connectRedis } = require('../redis-client');
    await connectRedis();
    redisReady = true;
    console.log('Redis connected — cache will be refreshed after seed');
  } catch (redisErr) {
    console.warn(
      'Redis unavailable — seed will write SQLite only:',
      redisErr.message || redisErr
    );
    console.warn('Start Redis (redis-server) or set REDIS_URL in .env, then re-run seed.');
  }

  const db = await openDb();
  try {
    await migrateTrendingTables(db);

    for (const store of DEMO_STORES) {
      const result = await ingestProducts(
        db,
        SEED_DEVICE,
        store.domain,
        'shopify',
        store.currency,
        store.products
      );
      console.log('Ingested', result.ingested, 'from', store.domain);
    }

    await bumpDailyStats(db);
    console.log('Seed complete → database.sqlite product_catalog populated');

    if (redisReady) {
      const { invalidateTrendingCache, closeRedis } = require('../redis-client');
      const cleared = await invalidateTrendingCache();
      await closeRedis();
      if (cleared) {
        console.log('Trending Redis cache invalidated');
      }
    } else {
      console.warn('Skip Redis cache invalidate — restart API after Redis is up, or wait for cache TTL');
    }
  } finally {
    db.close();
  }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
