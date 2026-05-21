'use strict';

/**
 * 手动将付款邮箱绑定到 Device ID 并开通 Pro（生产补救 / 客服）
 *
 * Usage:
 *   node scripts/grant-pro-by-email.js <email> <device_id> [--from-device <old_device_id>]
 *
 * Env:
 *   SHOPRADAR_DB_PATH — 默认 ../database.sqlite
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const {
  migrateProEmailRegistryTable,
  saveProEmailRegistry,
  normalizeEmail,
} = require('../pro-claim');
const { activateProForUser } = require('../lemon-webhook-handler');

const DB_PATH = process.env.SHOPRADAR_DB_PATH
  ? path.resolve(process.env.SHOPRADAR_DB_PATH)
  : path.join(__dirname, '..', 'database.sqlite');

const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from-device');
const fromDevice = fromIdx >= 0 ? String(args[fromIdx + 1] || '').trim() : '';
const positional = args.filter(function (a, i) {
  return a !== '--from-device' && (fromIdx < 0 || i !== fromIdx + 1);
});

const email = normalizeEmail(positional[0]);
const deviceId = String(positional[1] || '').trim();

if (!email || !deviceId) {
  console.error(
    'Usage: node scripts/grant-pro-by-email.js <email> <device_id> [--from-device <old_device_id>]'
  );
  process.exit(1);
}

function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function dbGet(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.get(sql, params || [], function (err, row) {
      if (err) {
        reject(err);
      } else {
        resolve(row);
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
        resolve(this);
      }
    });
  });
}

const db = new sqlite3.Database(DB_PATH);

(async function main() {
  await migrateProEmailRegistryTable(db, dbRun);

  let proExpiresAt = null;
  if (fromDevice) {
    const oldRow = await dbGet(
      db,
      'SELECT pro_expires_at FROM users WHERE device_id = ? AND is_pro = 1',
      [fromDevice]
    );
    if (oldRow && oldRow.pro_expires_at) {
      proExpiresAt = oldRow.pro_expires_at;
    }
  }
  if (!proExpiresAt) {
    const byEmail = await dbGet(
      db,
      `SELECT pro_expires_at FROM users
       WHERE account_email = ? COLLATE NOCASE AND is_pro = 1
       LIMIT 1`,
      [email]
    );
    if (byEmail && byEmail.pro_expires_at) {
      proExpiresAt = byEmail.pro_expires_at;
    }
  }
  if (!proExpiresAt) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    proExpiresAt = d.toISOString();
  }

  const result = await activateProForUser(
    db,
    dbGet,
    dbRun,
    { deviceId: deviceId, email: email },
    proExpiresAt,
    getToday()
  );

  if (!result.handled) {
    throw new Error('activateProForUser failed: ' + JSON.stringify(result));
  }

  await saveProEmailRegistry(db, dbRun, email, deviceId, result.proExpiresAt);

  if (fromDevice && fromDevice !== deviceId) {
    await dbRun(
      db,
      'UPDATE users SET is_pro = 0 WHERE device_id = ?',
      [fromDevice]
    );
    console.log('已停用旧 Device Pro:', fromDevice);
  }

  const row = await dbGet(
    db,
    'SELECT device_id, is_pro, account_email, pro_expires_at FROM users WHERE device_id = ?',
    [deviceId]
  );
  console.log('Pro 已绑定:', row);
  db.close();
})().catch(function (err) {
  console.error(err);
  db.close();
  process.exit(1);
});
