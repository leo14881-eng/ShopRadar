'use strict';

/**
 * Device ID 格式校验（扩展 UUID 与测试 ID flow-* 均允许）
 * @param {unknown} deviceId
 * @returns {boolean}
 */
function isValidDeviceId(deviceId) {
  const value = String(deviceId || '').trim();
  if (value.length < 8 || value.length > 128) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

module.exports = {
  isValidDeviceId: isValidDeviceId,
};
