'use strict';

/**
 * 付款邮箱 ↔ Device ID 认领（Webhook 未携带 device_id 时的补救）
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

/**
 * @param {import('sqlite3').Database} db
 * @param {Function} dbGet
 * @param {Function} dbRun
 * @param {Function} activateProForUser from lemon-webhook-handler
 * @param {string} deviceId
 * @param {string} email
 * @param {string} today
 */
async function claimProByEmail(
  db,
  dbGet,
  dbRun,
  activateProForUser,
  deviceId,
  email,
  today
) {
  const normalizedEmail = normalizeEmail(email);
  const targetDeviceId = String(deviceId || '').trim();

  if (!targetDeviceId || !normalizedEmail) {
    return { ok: false, msg: '缺少 deviceId 或 email' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, msg: '邮箱格式无效' };
  }

  const pending = await dbGet(
    db,
    'SELECT email, pro_expires_at FROM pending_pro_claims WHERE email = ?',
    [normalizedEmail]
  );

  if (pending) {
    const result = await activateProForUser(
      db,
      dbGet,
      dbRun,
      { deviceId: targetDeviceId, email: normalizedEmail },
      pending.pro_expires_at,
      today
    );
    if (result.handled) {
      await dbRun(db, 'DELETE FROM pending_pro_claims WHERE email = ?', [
        normalizedEmail,
      ]);
      return { ok: true, source: 'pending_claim', deviceId: targetDeviceId };
    }
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
    const result = await activateProForUser(
      db,
      dbGet,
      dbRun,
      { deviceId: targetDeviceId, email: normalizedEmail },
      proByEmail.pro_expires_at,
      today
    );
    if (result.handled) {
      return {
        ok: true,
        source: 'email_pro_match',
        deviceId: targetDeviceId,
        previousDeviceId: proByEmail.device_id,
      };
    }
  }

  return {
    ok: false,
    msg:
      '未找到与该邮箱匹配的 Pro 记录。请确认付款邮箱无误；若刚付款请等待 2 分钟再试，或联系支持并提供 Device ID。',
  };
}

module.exports = {
  normalizeEmail: normalizeEmail,
  migratePendingProClaimsTable: migratePendingProClaimsTable,
  savePendingProClaim: savePendingProClaim,
  claimProByEmail: claimProByEmail,
};
