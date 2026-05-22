'use strict';

const FREE_DAILY_LIMIT = 3;
const LIMIT_EXCEEDED_MSG =
  '您的每日 3 次免费额度已用完，请升级为 Pro 会员解锁无限次查询与 CSV 导出功能！';

function normalizeDomainKey(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function computeFreeRemaining(row, today) {
  if (!row || row.last_query_date !== today) {
    return FREE_DAILY_LIMIT;
  }
  return Math.max(0, FREE_DAILY_LIMIT - Number(row.count || 0));
}

/**
 * 免费额度评估（Pro / 白名单由调用方先行处理）
 * @param {{
 *   db: import('sqlite3').Database,
 *   dbRun: Function,
 *   row: object|null,
 *   deviceId: string,
 *   domain: string,
 *   today: string,
 *   consumeCount: boolean,
 *   sessionRenewed?: boolean,
 * }} params
 */
async function evaluateFreeQuota(params) {
  const db = params.db;
  const dbRun = params.dbRun;
  const row = params.row;
  const deviceId = params.deviceId;
  const domain = params.domain;
  const today = params.today;
  const consumeCount = params.consumeCount;
  const sessionRenewed = Boolean(params.sessionRenewed);

  if (
    row &&
    row.last_query_date === today &&
    Number(row.count) >= FREE_DAILY_LIMIT
  ) {
    return {
      allowed: false,
      isPro: false,
      remaining: 0,
      msg: LIMIT_EXCEEDED_MSG,
      domain: domain,
      sessionRenewed: sessionRenewed,
    };
  }

  if (!row) {
    await dbRun(
      db,
      'INSERT INTO users (device_id, count, last_query_date, is_pro) VALUES (?, 1, ?, 0)',
      [deviceId, today]
    );
    return {
      allowed: true,
      remaining: FREE_DAILY_LIMIT - 1,
      isPro: false,
      domain: domain,
      sessionRenewed: sessionRenewed,
    };
  }

  if (row.last_query_date !== today) {
    await dbRun(
      db,
      'UPDATE users SET count = ?, last_query_date = ? WHERE device_id = ?',
      [1, today, deviceId]
    );
    return {
      allowed: true,
      remaining: FREE_DAILY_LIMIT - 1,
      isPro: false,
      domain: domain,
      sessionRenewed: sessionRenewed,
    };
  }

  if (consumeCount) {
    const newCount = Number(row.count || 0) + 1;
    await dbRun(db, 'UPDATE users SET count = ? WHERE device_id = ?', [
      newCount,
      deviceId,
    ]);
    return {
      allowed: true,
      remaining: FREE_DAILY_LIMIT - newCount,
      isPro: false,
      domain: domain,
      sessionRenewed: sessionRenewed,
    };
  }

  return {
    allowed: true,
    remaining: computeFreeRemaining(row, today),
    isPro: false,
    domain: domain,
    sessionRenewed: sessionRenewed,
  };
}

module.exports = {
  FREE_DAILY_LIMIT: FREE_DAILY_LIMIT,
  LIMIT_EXCEEDED_MSG: LIMIT_EXCEEDED_MSG,
  normalizeDomainKey: normalizeDomainKey,
  computeFreeRemaining: computeFreeRemaining,
  evaluateFreeQuota: evaluateFreeQuota,
};
