'use strict';

/**
 * Lemon Squeezy Webhook 业务处理（v1 +  legacy 共用）
 */

const LEMON_PRO_EVENTS = new Set([
  'order_created',
  'subscription_created',
  'subscription_payment_success',
  'subscription_payment_recovered',
]);

const LEMON_CANCEL_EVENTS = new Set([
  'subscription_cancelled',
  'subscription_expired',
  'subscription_payment_failed',
]);

function getLemonEventName(body) {
  if (!body || !body.meta) {
    return '';
  }
  return String(body.meta.event_name || body.meta.event || '').trim();
}

function parseCustomData(raw) {
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'object') {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      return null;
    }
  }
  return null;
}

function collectCustomDataCandidates(body) {
  const candidates = [];
  if (!body || typeof body !== 'object') {
    return candidates;
  }

  if (body.meta && body.meta.custom_data != null) {
    candidates.push(body.meta.custom_data);
  }
  if (body.data && body.data.attributes) {
    const attrs = body.data.attributes;
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
  return candidates;
}

/**
 * 从 Webhook 解析用户标识：优先 device_id / user_id（ShopRadar 扩展 Device ID）
 * @param {object} body
 * @returns {{ deviceId: string, email: string, source: string }}
 */
function extractUserIdentityFromWebhook(body) {
  const candidates = collectCustomDataCandidates(body);
  let deviceId = '';
  let email = '';
  let source = '';

  for (let i = 0; i < candidates.length; i++) {
    const parsed = parseCustomData(candidates[i]);
    if (!parsed || typeof parsed !== 'object') {
      if (typeof candidates[i] === 'string' && candidates[i].trim() && !deviceId) {
        deviceId = candidates[i].trim();
        source = 'custom_data_string';
      }
      continue;
    }

    if (!deviceId) {
      deviceId = String(
        parsed.device_id ||
          parsed.deviceId ||
          parsed.user_id ||
          parsed.userId ||
          parsed.sr_device_id ||
          ''
      ).trim();
      if (deviceId) {
        source = 'custom_data';
      }
    }

    if (!email) {
      email = String(parsed.email || parsed.user_email || '').trim();
    }
  }

  if (!email && body && body.data && body.data.attributes) {
    const attrs = body.data.attributes;
    email = String(
      attrs.user_email || attrs.customer_email || attrs.email || ''
    ).trim();
    if (email && !source) {
      source = 'attributes.email';
    }
  }

  return { deviceId: deviceId, email: email, source: source };
}

/**
 * @param {object} body
 * @returns {string|null} ISO8601
 */
function extractProExpiresAt(body) {
  if (!body || !body.data || !body.data.attributes) {
    return null;
  }

  const attrs = body.data.attributes;
  const candidates = [
    attrs.renews_at,
    attrs.ends_at,
    attrs.trial_ends_at,
    attrs.updated_at,
  ];

  for (let i = 0; i < candidates.length; i++) {
    const value = candidates[i];
    if (!value) {
      continue;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

function defaultProExpiresAtIso() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * @param {import('sqlite3').Database} db
 * @param {Function} dbGet
 * @param {Function} dbRun
 * @param {string} today
 * @param {{ preferRegistryDevice?: boolean }} [options]
 */
async function activateProForUser(
  db,
  dbGet,
  dbRun,
  identity,
  expiresAtIso,
  today,
  options
) {
  const checkoutDeviceId = identity.deviceId
    ? String(identity.deviceId).trim()
    : '';
  const email = identity.email;
  const normalizedEmail = email ? normalizeEmail(email) : '';
  const preferRegistryDevice = !options || options.preferRegistryDevice !== false;
  const expiresAt = expiresAtIso || defaultProExpiresAtIso();
  const todayStr = today || new Date().toISOString().slice(0, 10);

  if (!checkoutDeviceId && !normalizedEmail) {
    return {
      handled: false,
      reason: 'missing_user_identity',
    };
  }

  let targetDeviceId = checkoutDeviceId;

  if (normalizedEmail && preferRegistryDevice) {
    const registry = await dbGet(
      db,
      'SELECT device_id FROM pro_email_registry WHERE email = ?',
      [normalizedEmail]
    );
    if (registry && registry.device_id) {
      targetDeviceId = String(registry.device_id).trim();
    }
  }

  if (!targetDeviceId && normalizedEmail) {
    const byEmail = await dbGet(
      db,
      `SELECT device_id FROM users
       WHERE account_email = ? COLLATE NOCASE AND is_pro = 1
       ORDER BY pro_expires_at DESC
       LIMIT 1`,
      [normalizedEmail]
    );
    if (byEmail && byEmail.device_id) {
      targetDeviceId = byEmail.device_id;
    }
  }

  if (!targetDeviceId) {
    return {
      handled: false,
      reason: 'missing_device_id',
      email: normalizedEmail || undefined,
      proExpiresAt: expiresAt,
    };
  }

  const row = await dbGet(
    db,
    'SELECT device_id FROM users WHERE device_id = ?',
    [targetDeviceId]
  );

  if (row) {
    await dbRun(
      db,
      `UPDATE users
       SET is_pro = 1, pro_expires_at = ?, account_email = CASE
         WHEN ? IS NOT NULL AND ? != '' THEN ?
         ELSE account_email
       END
       WHERE device_id = ?`,
      [
        expiresAt,
        normalizedEmail || null,
        normalizedEmail || null,
        normalizedEmail || null,
        targetDeviceId,
      ]
    );
  } else {
    await dbRun(
      db,
      `INSERT INTO users (device_id, count, last_query_date, is_pro, pro_expires_at, account_email)
       VALUES (?, 0, ?, 1, ?, ?)`,
      [targetDeviceId, todayStr, expiresAt, normalizedEmail || null]
    );
  }

  const nowIso = new Date().toISOString();
  if (normalizedEmail) {
    await dbRun(
      db,
      `UPDATE users SET is_pro = 0, pro_expires_at = ?
       WHERE account_email = ? COLLATE NOCASE AND device_id != ? AND is_pro = 1`,
      [nowIso, normalizedEmail, targetDeviceId]
    );
  }
  if (checkoutDeviceId && checkoutDeviceId !== targetDeviceId) {
    await dbRun(
      db,
      'UPDATE users SET is_pro = 0, pro_expires_at = ? WHERE device_id = ? AND is_pro = 1',
      [nowIso, checkoutDeviceId]
    );
  }

  return {
    handled: true,
    action: 'pro_activated',
    deviceId: targetDeviceId,
    email: normalizedEmail || undefined,
    proExpiresAt: expiresAt,
    isPro: true,
  };
}

/**
 * @param {import('sqlite3').Database} db
 */
async function deactivateProForUser(db, dbGet, dbRun, identity) {
  const deviceId = identity.deviceId;
  const email = identity.email;

  let targetDeviceId = deviceId;

  if (!targetDeviceId && email) {
    const byEmail = await dbGet(
      db,
      'SELECT device_id FROM users WHERE account_email = ? COLLATE NOCASE',
      [email]
    );
    if (byEmail && byEmail.device_id) {
      targetDeviceId = byEmail.device_id;
    }
  }

  if (!targetDeviceId) {
    return {
      handled: false,
      reason: 'missing_user_identity',
    };
  }

  const nowIso = new Date().toISOString();
  await dbRun(
    db,
    'UPDATE users SET is_pro = 0, pro_expires_at = ? WHERE device_id = ?',
    [nowIso, targetDeviceId]
  );

  return {
    handled: true,
    action: 'pro_deactivated',
    deviceId: targetDeviceId,
    isPro: false,
    proExpiresAt: nowIso,
  };
}

/**
 * @param {import('sqlite3').Database} db
 * @param {object} body
 * @param {{ dbGet: Function, dbRun: Function, getTodayDateString: Function }} helpers
 */
async function handleLemonWebhookEvent(db, body, helpers) {
  const eventName = getLemonEventName(body);
  const identity = extractUserIdentityFromWebhook(body);
  const today = helpers.getTodayDateString();

  if (LEMON_PRO_EVENTS.has(eventName)) {
    if (helpers.logProWebhookIdentity) {
      await helpers.logProWebhookIdentity(db, helpers.dbRun, eventName, identity);
    }

    const expiresAt =
      extractProExpiresAt(body) ||
      (eventName === 'order_created' ? defaultProExpiresAtIso() : null);

    const result = await activateProForUser(
      db,
      helpers.dbGet,
      helpers.dbRun,
      identity,
      expiresAt,
      today
    );

    if (result.handled && identity.email && helpers.saveProEmailRegistry) {
      await helpers.saveProEmailRegistry(
        db,
        helpers.dbRun,
        identity.email,
        result.deviceId,
        result.proExpiresAt
      );
    }

    if (
      !result.handled &&
      result.reason === 'missing_device_id' &&
      identity.email &&
      helpers.savePendingProClaim
    ) {
      await helpers.savePendingProClaim(
        db,
        helpers.dbRun,
        identity.email,
        result.proExpiresAt || expiresAt
      );
      return Object.assign(
        {
          eventName: eventName,
          handled: true,
          action: 'pro_pending_email',
          email: identity.email,
        },
        result
      );
    }

    return Object.assign({ eventName: eventName }, result);
  }

  if (LEMON_CANCEL_EVENTS.has(eventName)) {
    const result = await deactivateProForUser(
      db,
      helpers.dbGet,
      helpers.dbRun,
      identity
    );
    return Object.assign({ eventName: eventName }, result);
  }

  return {
    handled: false,
    reason: 'ignored_event',
    eventName: eventName,
  };
}

module.exports = {
  LEMON_PRO_EVENTS: LEMON_PRO_EVENTS,
  LEMON_CANCEL_EVENTS: LEMON_CANCEL_EVENTS,
  getLemonEventName: getLemonEventName,
  extractUserIdentityFromWebhook: extractUserIdentityFromWebhook,
  handleLemonWebhookEvent: handleLemonWebhookEvent,
  activateProForUser: activateProForUser,
};
