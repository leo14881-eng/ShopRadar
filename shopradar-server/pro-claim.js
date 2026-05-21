'use strict';

/**
 * 付款邮箱 ↔ Device ID 认领（Webhook 未携带 device_id 或 account_email 未写入时的补救）
 */

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

async function migratePendingProClaimsTable(db, dbRun) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS pending_pro_claims (
      email TEXT PRIMARY KEY,
      pro_expires_at TEXT,
      created_at TEXT NOT NULL
    )`
  );
}

async function migrateProEmailRegistryTable(db, dbRun) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS pro_email_registry (
      email TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      pro_expires_at TEXT,
      updated_at TEXT NOT NULL
    )`
  );
  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_pro_email_registry_device ON pro_email_registry(device_id)'
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS lemon_webhook_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT,
      device_id TEXT,
      email TEXT,
      created_at TEXT NOT NULL
    )`
  );
  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_lemon_webhook_log_email ON lemon_webhook_log(email)'
  );

  const rows = await new Promise(function (resolve, reject) {
    db.all(
      `SELECT device_id, account_email, pro_expires_at
       FROM users
       WHERE is_pro = 1 AND account_email IS NOT NULL AND TRIM(account_email) != ''`,
      [],
      function (err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result || []);
        }
      }
    );
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    await saveProEmailRegistry(
      db,
      dbRun,
      row.account_email,
      row.device_id,
      row.pro_expires_at
    );
  }
}

async function savePendingProClaim(db, dbRun, email, proExpiresAtIso) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }
  await dbRun(
    db,
    `INSERT INTO pending_pro_claims (email, pro_expires_at, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       pro_expires_at = excluded.pro_expires_at,
       created_at = excluded.created_at`,
    [normalized, proExpiresAtIso || null, new Date().toISOString()]
  );
  return true;
}

async function saveProEmailRegistry(db, dbRun, email, deviceId, proExpiresAtIso) {
  const normalized = normalizeEmail(email);
  const id = String(deviceId || '').trim();
  if (!normalized || !id) {
    return false;
  }
  await dbRun(
    db,
    `INSERT INTO pro_email_registry (email, device_id, pro_expires_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       device_id = excluded.device_id,
       pro_expires_at = excluded.pro_expires_at,
       updated_at = excluded.updated_at`,
    [normalized, id, proExpiresAtIso || null, new Date().toISOString()]
  );
  return true;
}

async function logProWebhookIdentity(db, dbRun, eventName, identity) {
  const email = normalizeEmail(identity && identity.email);
  const deviceId = identity && identity.deviceId ? String(identity.deviceId).trim() : '';
  if (!email && !deviceId) {
    return;
  }
  await dbRun(
    db,
    `INSERT INTO lemon_webhook_log (event_name, device_id, email, created_at)
     VALUES (?, ?, ?, ?)`,
    [String(eventName || ''), deviceId, email, new Date().toISOString()]
  );
}

/**
 * @param {import('sqlite3').Database} db
 * @param {Function} dbGet
 * @param {string} normalizedEmail
 */
async function findProClaimSource(db, dbGet, normalizedEmail) {
  const pending = await dbGet(
    db,
    'SELECT email, pro_expires_at FROM pending_pro_claims WHERE email = ?',
    [normalizedEmail]
  );
  if (pending) {
    return {
      source: 'pending_claim',
      proExpiresAt: pending.pro_expires_at,
      previousDeviceId: '',
    };
  }

  const registry = await dbGet(
    db,
    'SELECT device_id, pro_expires_at FROM pro_email_registry WHERE email = ?',
    [normalizedEmail]
  );
  if (registry && registry.device_id) {
    return {
      source: 'email_registry',
      proExpiresAt: registry.pro_expires_at,
      previousDeviceId: String(registry.device_id),
    };
  }

  const proByEmail = await dbGet(
    db,
    `SELECT device_id, pro_expires_at, is_pro
     FROM users
     WHERE account_email = ? COLLATE NOCASE AND is_pro = 1
     LIMIT 1`,
    [normalizedEmail]
  );
  if (proByEmail) {
    return {
      source: 'email_pro_match',
      proExpiresAt: proByEmail.pro_expires_at,
      previousDeviceId: String(proByEmail.device_id),
    };
  }

  const logRow = await dbGet(
    db,
    `SELECT device_id, email
     FROM lemon_webhook_log
     WHERE email = ? AND email != ''
     ORDER BY id DESC
     LIMIT 1`,
    [normalizedEmail]
  );
  if (logRow && logRow.device_id) {
    const proDevice = await dbGet(
      db,
      `SELECT device_id, pro_expires_at, is_pro
       FROM users
       WHERE device_id = ? AND is_pro = 1
       LIMIT 1`,
      [String(logRow.device_id)]
    );
    if (proDevice) {
      return {
        source: 'webhook_log',
        proExpiresAt: proDevice.pro_expires_at,
        previousDeviceId: String(proDevice.device_id),
      };
    }
  }

  return null;
}

/**
 * @param {import('sqlite3').Database} db
 * @param {Function} dbGet
 * @param {Function} dbRun
 * @param {Function} activateProForUser from lemon-webhook-handler
 * @param {string} deviceId
 * @param {string} email
 * @param {string} today
 * @param {Function} [isProRowActive] optional (row) => boolean
 */
async function claimProByEmail(
  db,
  dbGet,
  dbRun,
  activateProForUser,
  deviceId,
  email,
  today,
  isProRowActive
) {
  const normalizedEmail = normalizeEmail(email);
  const targetDeviceId = String(deviceId || '').trim();

  if (!targetDeviceId || !normalizedEmail) {
    return { ok: false, msg: '缺少 deviceId 或 email' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, msg: '邮箱格式无效' };
  }

  const existing = await dbGet(
    db,
    'SELECT device_id, is_pro, pro_expires_at, account_email FROM users WHERE device_id = ?',
    [targetDeviceId]
  );
  if (
    existing &&
    (typeof isProRowActive === 'function'
      ? isProRowActive(existing)
      : Number(existing.is_pro) === 1)
  ) {
    await saveProEmailRegistry(
      db,
      dbRun,
      normalizedEmail,
      targetDeviceId,
      existing.pro_expires_at
    );
    if (!existing.account_email) {
      await dbRun(
        db,
        'UPDATE users SET account_email = ? WHERE device_id = ?',
        [normalizedEmail, targetDeviceId]
      );
    }
    return {
      ok: true,
      source: 'already_pro',
      deviceId: targetDeviceId,
      msg: '此 Device ID 已是 Pro，邮箱已绑定。',
    };
  }

  const match = await findProClaimSource(db, dbGet, normalizedEmail);
  if (!match) {
    return {
      ok: false,
      msg:
        '未找到与该邮箱匹配的 Pro 记录。请确认付款邮箱与 Lemon 结账邮箱一致；若刚付款请等待 2 分钟再试。仍失败请联系支持并提供 Device ID 与付款收据邮箱。',
    };
  }

  const result = await activateProForUser(
    db,
    dbGet,
    dbRun,
    { deviceId: targetDeviceId, email: normalizedEmail },
    match.proExpiresAt,
    today
  );

  if (!result.handled) {
    return {
      ok: false,
      msg: '认领失败，请稍后重试或联系支持。',
    };
  }

  await saveProEmailRegistry(
    db,
    dbRun,
    normalizedEmail,
    targetDeviceId,
    result.proExpiresAt || match.proExpiresAt
  );

  if (match.source === 'pending_claim') {
    await dbRun(db, 'DELETE FROM pending_pro_claims WHERE email = ?', [
      normalizedEmail,
    ]);
  }

  if (
    match.previousDeviceId &&
    match.previousDeviceId !== targetDeviceId
  ) {
    await dbRun(
      db,
      'UPDATE users SET is_pro = 0 WHERE device_id = ? AND device_id != ?',
      [match.previousDeviceId, targetDeviceId]
    );
  }

  return {
    ok: true,
    source: match.source,
    deviceId: targetDeviceId,
    previousDeviceId: match.previousDeviceId || undefined,
  };
}

module.exports = {
  normalizeEmail: normalizeEmail,
  migratePendingProClaimsTable: migratePendingProClaimsTable,
  migrateProEmailRegistryTable: migrateProEmailRegistryTable,
  savePendingProClaim: savePendingProClaim,
  saveProEmailRegistry: saveProEmailRegistry,
  logProWebhookIdentity: logProWebhookIdentity,
  claimProByEmail: claimProByEmail,
};
