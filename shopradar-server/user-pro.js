'use strict';

/**
 * 用户 Pro 状态判定（users 表行）
 * @param {object|null} row
 * @returns {boolean}
 */
function isActiveProUser(row) {
  if (!row || Number(row.is_pro) !== 1) {
    return false;
  }
  if (row.pro_expires_at) {
    const expiresMs = new Date(row.pro_expires_at).getTime();
    if (Number.isNaN(expiresMs)) {
      return false;
    }
    if (Date.now() > expiresMs) {
      return false;
    }
  }
  return true;
}

module.exports = {
  isActiveProUser: isActiveProUser,
  /** @deprecated 使用 isActiveProUser */
  isProRow: isActiveProUser,
};
