/**
 * ShopRadar website — shared device ID, access token, Pro status, Lemon checkout
 * Used by dashboard.js and success.html
 */
(function (global) {
  'use strict';

  var STORAGE_DEVICE_ID = 'sr_device_id';
  var STORAGE_ACCESS_TOKEN = 'sr_access_token';
  var STORAGE_TOKEN_EXPIRES = 'sr_token_expires_at';
  var STORAGE_IS_PRO = 'sr_is_pro';

  function getConfig() {
    return global.SHOPRADAR_WEBSITE_CONFIG || {};
  }

  function getApiBase() {
    return String(getConfig().apiBase || '').replace(/\/$/, '');
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

  function readQueryDeviceId() {
    try {
      var params = new URLSearchParams(global.location.search);
      var fromQuery = params.get('deviceId') || params.get('device_id');
      return fromQuery ? String(fromQuery).trim() : '';
    } catch (e) {
      return '';
    }
  }

  function getOrCreateDeviceId(options) {
    var opts = options || {};
    var fromQuery = readQueryDeviceId();
    if (fromQuery) {
      try {
        localStorage.setItem(STORAGE_DEVICE_ID, fromQuery);
      } catch (storageErr) {
        /* ignore */
      }
      return fromQuery;
    }

    try {
      var stored = localStorage.getItem(STORAGE_DEVICE_ID);
      if (stored) {
        return String(stored);
      }
    } catch (e) {
      /* ignore */
    }

    if (opts.deferCreate) {
      return '';
    }

    var deviceId = generateDeviceUuid();
    try {
      localStorage.setItem(STORAGE_DEVICE_ID, deviceId);
    } catch (e2) {
      /* ignore */
    }
    return deviceId;
  }

  function getStoredAccessToken() {
    try {
      var token = sessionStorage.getItem(STORAGE_ACCESS_TOKEN);
      var expires = Number(sessionStorage.getItem(STORAGE_TOKEN_EXPIRES) || 0);
      if (!token || !expires || Date.now() >= expires - 5000) {
        return '';
      }
      return token;
    } catch (e) {
      return '';
    }
  }

  function saveAccessTokenFromPayload(data) {
    if (!data || !data.accessToken) {
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_ACCESS_TOKEN, String(data.accessToken));
      if (data.tokenExpiresAt) {
        sessionStorage.setItem(STORAGE_TOKEN_EXPIRES, String(data.tokenExpiresAt));
      } else if (data.tokenExpiresIn) {
        sessionStorage.setItem(
          STORAGE_TOKEN_EXPIRES,
          String(Date.now() + Number(data.tokenExpiresIn) * 1000)
        );
      }
    } catch (e) {
      /* ignore */
    }
  }

  function clearStoredAccessToken() {
    try {
      sessionStorage.removeItem(STORAGE_ACCESS_TOKEN);
      sessionStorage.removeItem(STORAGE_TOKEN_EXPIRES);
    } catch (e) {
      /* ignore */
    }
  }

  function persistProFlag(pro) {
    try {
      if (pro) {
        localStorage.setItem(STORAGE_IS_PRO, '1');
      } else {
        localStorage.removeItem(STORAGE_IS_PRO);
        clearStoredAccessToken();
      }
    } catch (e) {
      /* ignore */
    }
  }

  function loadProFlagFromStorage() {
    try {
      return localStorage.getItem(STORAGE_IS_PRO) === '1';
    } catch (e) {
      return false;
    }
  }

  function buildWebsiteOrigin() {
    return String(global.location.origin || getConfig().websiteUrl || '').replace(
      /\/$/,
      ''
    );
  }

  function buildLemonCheckoutUrl(deviceId) {
    var CFG = getConfig();
    var base = String(CFG.lemonCheckoutUrl || '').trim();
    if (
      !base ||
      base.indexOf('your-store') !== -1 ||
      base.indexOf('xxxxxxxx') !== -1 ||
      !/^https:\/\/[^/]+\.lemonsqueezy\.com\//i.test(base)
    ) {
      return null;
    }

    var successPath = CFG.paymentSuccessPath || '/success.html';
    var redirectUrl = buildWebsiteOrigin() + successPath;

    try {
      var url = new URL(base);
      url.searchParams.set('checkout[custom][device_id]', deviceId);
      url.searchParams.set('checkout[custom][source]', 'shopradar_website');
      url.searchParams.set('checkout[redirect_url]', redirectUrl);
      return url.toString();
    } catch (urlError) {
      var sep = base.indexOf('?') >= 0 ? '&' : '?';
      return (
        base +
        sep +
        'checkout%5Bcustom%5D%5Bdevice_id%5D=' +
        encodeURIComponent(deviceId) +
        '&checkout%5Bcustom%5D%5Bsource%5D=shopradar_website' +
        '&checkout%5Bredirect_url%5D=' +
        encodeURIComponent(redirectUrl)
      );
    }
  }

  function buildPaymentSuccessTarget(deviceId) {
    return (
      buildWebsiteOrigin() +
      '/index.html?paid=1&deviceId=' +
      encodeURIComponent(deviceId) +
      '#dashboard'
    );
  }

  function parseProStatusPayload(data) {
    return {
      isPro: Boolean(data && data.isPro),
      proExpiresAt: data && data.proExpiresAt ? String(data.proExpiresAt) : '',
    };
  }

  function fetchProStatusOnce(deviceId, token) {
    var url =
      getApiBase() + '/api/pro-status?deviceId=' + encodeURIComponent(deviceId);
    if (token) {
      url += '&accessToken=' + encodeURIComponent(token);
    }
    return fetch(url);
  }

  function fetchProStatus(deviceId, options) {
    var opts = options || {};
    var token = getStoredAccessToken();
    return fetchProStatusOnce(deviceId, token)
      .then(function (response) {
        if (response.status === 401 && token) {
          clearStoredAccessToken();
          return fetchProStatusOnce(deviceId, '');
        }
        return response;
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return { isPro: false };
          })
          .then(function (data) {
            saveAccessTokenFromPayload(data);
            return parseProStatusPayload(data);
          });
      })
      .catch(function () {
        if (typeof opts.onNetworkError === 'function') {
          return opts.onNetworkError();
        }
        return {
          isPro: loadProFlagFromStorage(),
          proExpiresAt: '',
        };
      });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function pollUntilProActivated(deviceId, options) {
    var opts = options || {};
    return pollUntil(
      function () {
        return fetchProStatus(deviceId).then(function (status) {
          if (status.isPro) {
            persistProFlag(true);
            return true;
          }
          return false;
        });
      },
      {
        timeoutMs: opts.timeoutMs || 30000,
        intervalMs: opts.intervalMs || 2000,
        onWaiting: opts.onWaiting,
      }
    );
  }

  function pollUntil(tryOnce, options) {
    var opts = options || {};
    var deadline = Date.now() + (opts.timeoutMs || 28000);
    var intervalMs = opts.intervalMs || 2000;

    function tick() {
      if (Date.now() >= deadline) {
        return Promise.resolve(false);
      }
      return Promise.resolve()
        .then(tryOnce)
        .then(function (ok) {
          if (ok) {
            return true;
          }
          if (opts.onWaiting) {
            opts.onWaiting();
          }
          return delay(intervalMs).then(tick);
        });
    }

    return tick();
  }

  global.ShopRadarAuth = {
    STORAGE_DEVICE_ID: STORAGE_DEVICE_ID,
    STORAGE_ACCESS_TOKEN: STORAGE_ACCESS_TOKEN,
    STORAGE_TOKEN_EXPIRES: STORAGE_TOKEN_EXPIRES,
    STORAGE_IS_PRO: STORAGE_IS_PRO,
    getConfig: getConfig,
    getApiBase: getApiBase,
    generateDeviceUuid: generateDeviceUuid,
    readQueryDeviceId: readQueryDeviceId,
    getOrCreateDeviceId: getOrCreateDeviceId,
    getStoredAccessToken: getStoredAccessToken,
    saveAccessTokenFromPayload: saveAccessTokenFromPayload,
    clearStoredAccessToken: clearStoredAccessToken,
    persistProFlag: persistProFlag,
    loadProFlagFromStorage: loadProFlagFromStorage,
    buildWebsiteOrigin: buildWebsiteOrigin,
    buildLemonCheckoutUrl: buildLemonCheckoutUrl,
    buildPaymentSuccessTarget: buildPaymentSuccessTarget,
    parseProStatusPayload: parseProStatusPayload,
    fetchProStatusOnce: fetchProStatusOnce,
    fetchProStatus: fetchProStatus,
    delay: delay,
    pollUntil: pollUntil,
    pollUntilProActivated: pollUntilProActivated,
  };
})(typeof window !== 'undefined' ? window : self);
