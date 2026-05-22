/**
 * ShopRadar — 非 Shopify 域名负向检测缓存（24 小时 TTL，按 hostname）
 */
var ShopRadarDetectionCache = (function () {
  var STORAGE_KEY = 'sr_negative_detection_v1';
  var POSITIVE_STORAGE_KEY = 'sr_positive_detection_v1';
  var TTL_MS = 24 * 60 * 60 * 1000;
  var POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function normalizeDomain(domain) {
    if (
      typeof ShopRadarExtensionAuth !== 'undefined' &&
      ShopRadarExtensionAuth.normalizeDomainKey
    ) {
      return ShopRadarExtensionAuth.normalizeDomainKey(domain);
    }
    return String(domain || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
  }

  function isExpired(row) {
    return !row || typeof row.at !== 'number' || Date.now() - row.at > TTL_MS;
  }

  function pruneEntries(entries) {
    var changed = false;
    var now = Date.now();
    for (var key in entries) {
      if (
        !Object.prototype.hasOwnProperty.call(entries, key) ||
        !entries[key] ||
        now - entries[key].at > TTL_MS
      ) {
        delete entries[key];
        changed = true;
      }
    }
    return changed;
  }

  /**
   * @returns {Promise<Record<string, { at: number, platform: string }>>}
   */
  function readAllEntries() {
    return chrome.storage.local.get(STORAGE_KEY).then(function (stored) {
      var entries = stored[STORAGE_KEY];
      if (!entries || typeof entries !== 'object') {
        entries = {};
      }
      if (pruneEntries(entries)) {
        return chrome.storage.local
          .set({ [STORAGE_KEY]: entries })
          .then(function () {
            return entries;
          });
      }
      return entries;
    });
  }

  /**
   * @param {string} domain
   * @returns {Promise<{ domain: string, platform: string, at: number } | null>}
   */
  function readNegative(domain) {
    var host = normalizeDomain(domain);
    if (!host) {
      return Promise.resolve(null);
    }
    return readAllEntries().then(function (entries) {
      var row = entries[host];
      if (isExpired(row)) {
        if (row) {
          delete entries[host];
          chrome.storage.local.set({ [STORAGE_KEY]: entries }).catch(function () {});
        }
        return null;
      }
      return {
        domain: host,
        platform: row.platform || '',
        at: row.at,
        tentative: Boolean(row.tentative),
      };
    });
  }

  /**
   * @param {string} domain
   * @param {string} [platform]
   * @returns {Promise<void>}
   */
  function saveNegative(domain, platform) {
    var host = normalizeDomain(domain);
    if (!host) {
      return Promise.resolve();
    }
    return readAllEntries().then(function (entries) {
      entries[host] = {
        at: Date.now(),
        platform: platform || '',
      };
      return chrome.storage.local.set({ [STORAGE_KEY]: entries });
    });
  }

  /**
   * @param {string} domain
   * @returns {Promise<void>}
   */
  function clearNegative(domain) {
    var host = normalizeDomain(domain);
    if (!host) {
      return Promise.resolve();
    }
    return readAllEntries().then(function (entries) {
      if (!entries[host]) {
        return;
      }
      delete entries[host];
      return chrome.storage.local.set({ [STORAGE_KEY]: entries });
    });
  }

  function readPositiveEntries() {
    return chrome.storage.local.get(POSITIVE_STORAGE_KEY).then(function (stored) {
      var entries = stored[POSITIVE_STORAGE_KEY];
      if (!entries || typeof entries !== 'object') {
        entries = {};
      }
      var changed = false;
      var now = Date.now();
      for (var key in entries) {
        if (
          !Object.prototype.hasOwnProperty.call(entries, key) ||
          !entries[key] ||
          now - entries[key].at > POSITIVE_TTL_MS
        ) {
          delete entries[key];
          changed = true;
        }
      }
      if (changed) {
        return chrome.storage.local
          .set({ [POSITIVE_STORAGE_KEY]: entries })
          .then(function () {
            return entries;
          });
      }
      return entries;
    });
  }

  /**
   * @param {string} domain
   * @returns {Promise<{ domain: string, storeType: string, at: number } | null>}
   */
  function readPositive(domain) {
    var host = normalizeDomain(domain);
    if (!host) {
      return Promise.resolve(null);
    }
    return readPositiveEntries().then(function (entries) {
      var row = entries[host];
      if (!row || Date.now() - row.at > POSITIVE_TTL_MS) {
        return null;
      }
      if (row.storeType !== 'shopify' && row.storeType !== 'sfcc') {
        return null;
      }
      return {
        domain: host,
        storeType: row.storeType,
        at: row.at,
      };
    });
  }

  /**
   * @param {string} domain
   * @param {'shopify'|'sfcc'} storeType
   * @returns {Promise<void>}
   */
  function savePositive(domain, storeType) {
    var host = normalizeDomain(domain);
    if (!host || (storeType !== 'shopify' && storeType !== 'sfcc')) {
      return Promise.resolve();
    }
    return readPositiveEntries().then(function (entries) {
      entries[host] = {
        at: Date.now(),
        storeType: storeType,
      };
      return chrome.storage.local.set({ [POSITIVE_STORAGE_KEY]: entries });
    });
  }

  /**
   * @param {string} domain
   * @returns {Promise<void>}
   */
  function clearPositive(domain) {
    var host = normalizeDomain(domain);
    if (!host) {
      return Promise.resolve();
    }
    return readPositiveEntries().then(function (entries) {
      if (!entries[host]) {
        return;
      }
      delete entries[host];
      return chrome.storage.local.set({ [POSITIVE_STORAGE_KEY]: entries });
    });
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    POSITIVE_STORAGE_KEY: POSITIVE_STORAGE_KEY,
    TTL_MS: TTL_MS,
    POSITIVE_TTL_MS: POSITIVE_TTL_MS,
    readNegative: readNegative,
    saveNegative: saveNegative,
    clearNegative: clearNegative,
    readPositive: readPositive,
    savePositive: savePositive,
    clearPositive: clearPositive,
  };
})();
