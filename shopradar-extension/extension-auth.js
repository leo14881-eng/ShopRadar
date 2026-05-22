/**
 * ShopRadar 扩展 — 共享 storage keys、Device ID、access token、Pro 缓存
 * popup / background(SW) / content script 共用（无 ES modules，全局 IIFE）
 */
var ShopRadarExtensionAuth = (function () {
  'use strict';

  var KEYS = {
    DEVICE_ID: 'sr_device_id',
    IS_PRO: 'sr_is_pro',
    ACCESS_TOKEN: 'sr_access_token',
    TOKEN_EXPIRES: 'sr_token_expires_at',
    PAYMENT_PENDING: 'sr_payment_pending_at',
  };

  /** 与 shopradar-server/trending.js MAX_INGEST_PRODUCTS 保持一致 */
  var MAX_INGEST_PRODUCTS = 50;

  function getApiBase() {
    if (typeof ShopRadarEnv !== 'undefined' && ShopRadarEnv.getApiBase) {
      return ShopRadarEnv.getApiBase();
    }
    if (
      typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
      SHOPRADAR_EXTENSION_CONFIG.apiBase
    ) {
      return String(SHOPRADAR_EXTENSION_CONFIG.apiBase).replace(/\/$/, '');
    }
    return 'https://api.shopradar.uk';
  }

  /** 与 shopradar-server/quota.js normalizeDomainKey 对齐 */
  function normalizeDomainKey(domain) {
    return String(domain || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
  }

  function generateDeviceUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
      var rand = (Math.random() * 16) | 0;
      var value = char === 'x' ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function tokenExpiresAt(payload) {
    if (!payload) {
      return 0;
    }
    if (payload.tokenExpiresAt != null) {
      return Number(payload.tokenExpiresAt) || 0;
    }
    if (payload.tokenExpiresIn != null) {
      return Date.now() + Number(payload.tokenExpiresIn) * 1000;
    }
    return 0;
  }

  async function saveAccessTokenFromPayload(payload) {
    if (!payload || !payload.accessToken || !chrome.storage || !chrome.storage.session) {
      return;
    }
    var exp = tokenExpiresAt(payload);
    try {
      var patch = {};
      patch[KEYS.ACCESS_TOKEN] = String(payload.accessToken);
      patch[KEYS.TOKEN_EXPIRES] = exp || 0;
      await chrome.storage.session.set(patch);
    } catch (tokenErr) {
      /* ignore */
    }
  }

  async function getStoredAccessToken() {
    if (!chrome.storage || !chrome.storage.session) {
      return '';
    }
    try {
      var stored = await chrome.storage.session.get([
        KEYS.ACCESS_TOKEN,
        KEYS.TOKEN_EXPIRES,
      ]);
      var token = stored[KEYS.ACCESS_TOKEN];
      var expiresAt = Number(stored[KEYS.TOKEN_EXPIRES] || 0);
      if (!token) {
        return '';
      }
      if (expiresAt && expiresAt < Date.now()) {
        await clearStoredAccessToken();
        return '';
      }
      return String(token);
    } catch (readErr) {
      return '';
    }
  }

  async function clearStoredAccessToken() {
    if (!chrome.storage || !chrome.storage.session) {
      return;
    }
    try {
      await chrome.storage.session.remove([KEYS.ACCESS_TOKEN, KEYS.TOKEN_EXPIRES]);
    } catch (clearErr) {
      /* ignore */
    }
  }

  async function getDeviceId() {
    if (!chrome.storage || !chrome.storage.local) {
      return '';
    }
    try {
      var stored = await chrome.storage.local.get([KEYS.DEVICE_ID]);
      return stored[KEYS.DEVICE_ID] ? String(stored[KEYS.DEVICE_ID]) : '';
    } catch (readErr) {
      return '';
    }
  }

  async function getOrCreateDeviceId() {
    var existing = await getDeviceId();
    if (existing) {
      return existing;
    }
    var deviceId = generateDeviceUuid();
    if (!chrome.storage || !chrome.storage.local) {
      return deviceId;
    }
    try {
      var patch = {};
      patch[KEYS.DEVICE_ID] = deviceId;
      await chrome.storage.local.set(patch);
    } catch (writeErr) {
      /* ignore */
    }
    return deviceId;
  }

  async function isPersistedPro() {
    if (!chrome.storage || !chrome.storage.local) {
      return false;
    }
    try {
      var stored = await chrome.storage.local.get([KEYS.IS_PRO]);
      return stored[KEYS.IS_PRO] === true;
    } catch (readErr) {
      return false;
    }
  }

  async function persistProFlag(isPro) {
    if (!chrome.storage || !chrome.storage.local) {
      return;
    }
    try {
      if (isPro) {
        var patch = {};
        patch[KEYS.IS_PRO] = true;
        await chrome.storage.local.set(patch);
      } else {
        await chrome.storage.local.remove(KEYS.IS_PRO);
        await clearStoredAccessToken();
      }
    } catch (persistErr) {
      /* ignore */
    }
  }

  async function saveProFromPayload(payload) {
    if (!payload || !payload.isPro) {
      return;
    }
    await persistProFlag(true);
    await saveAccessTokenFromPayload(payload);
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * @param {() => Promise<boolean>} tryOnce
   * @param {{ timeoutMs?: number, intervalMs?: number, onWaiting?: function }} [options]
   */
  async function pollUntil(tryOnce, options) {
    var opts = options || {};
    var deadline = Date.now() + (opts.timeoutMs || 28000);
    var intervalMs = opts.intervalMs || 2000;
    while (Date.now() < deadline) {
      if (await tryOnce()) {
        return true;
      }
      if (opts.onWaiting) {
        opts.onWaiting();
      }
      await delay(intervalMs);
    }
    return false;
  }

  /**
   * @param {string} deviceId
   * @param {{
   *   checkoutBase: string,
   *   source?: string,
   *   redirectUrl?: string,
   *   websiteBase?: string,
   * }} options
   * @returns {string|null}
   */
  function buildLemonCheckoutUrl(deviceId, options) {
    var opts = options || {};
    var base = String(opts.checkoutBase || '').trim();
    if (
      !base ||
      base.indexOf('your-store') !== -1 ||
      base.indexOf('xxxxxxxx') !== -1 ||
      !/^https:\/\/[^/]+\.lemonsqueezy\.com\//i.test(base)
    ) {
      return null;
    }

    var source = opts.source || 'shopradar_extension';
    var redirectUrl =
      opts.redirectUrl ||
      String(opts.websiteBase || 'https://shopradar.uk').replace(/\/$/, '') +
        '/success.html?deviceId=' +
        encodeURIComponent(deviceId);

    try {
      var url = new URL(base);
      url.searchParams.set('checkout[custom][device_id]', deviceId);
      url.searchParams.set('checkout[custom][source]', source);
      url.searchParams.set('checkout[redirect_url]', redirectUrl);
      return url.toString();
    } catch (urlError) {
      var sep = base.indexOf('?') >= 0 ? '&' : '?';
      return (
        base +
        sep +
        'checkout%5Bcustom%5D%5Bdevice_id%5D=' +
        encodeURIComponent(deviceId) +
        '&checkout%5Bcustom%5D%5Bsource%5D=' +
        encodeURIComponent(source) +
        '&checkout%5Bredirect_url%5D=' +
        encodeURIComponent(redirectUrl)
      );
    }
  }

  return {
    KEYS: KEYS,
    MAX_INGEST_PRODUCTS: MAX_INGEST_PRODUCTS,
    getApiBase: getApiBase,
    normalizeDomainKey: normalizeDomainKey,
    generateDeviceUuid: generateDeviceUuid,
    tokenExpiresAt: tokenExpiresAt,
    saveAccessTokenFromPayload: saveAccessTokenFromPayload,
    getStoredAccessToken: getStoredAccessToken,
    clearStoredAccessToken: clearStoredAccessToken,
    getDeviceId: getDeviceId,
    getOrCreateDeviceId: getOrCreateDeviceId,
    isPersistedPro: isPersistedPro,
    persistProFlag: persistProFlag,
    saveProFromPayload: saveProFromPayload,
    delay: delay,
    pollUntil: pollUntil,
    buildLemonCheckoutUrl: buildLemonCheckoutUrl,
  };
})();
