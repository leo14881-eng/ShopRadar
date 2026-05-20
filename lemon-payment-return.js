/**
 * Lemon 支付完成后自动回到付款前的店铺标签页
 */
var ShopRadarLemonReturn = (function () {
  'use strict';

  var RETURN_TAB_KEY = 'sr_lemon_return_tab_id';
  var RETURN_URL_KEY = 'sr_lemon_return_url';
  var CHECKOUT_TAB_KEY = 'sr_lemon_checkout_tab_id';

  var backgroundPollTimer = null;
  var backgroundPollActive = false;

  function isRestrictedUrl(url) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isRestrictedUrl) {
      return ShopRadarGuard.isRestrictedUrl(url);
    }
    if (!url) {
      return true;
    }
    var u = String(url).trim().toLowerCase();
    return (
      u.indexOf('chrome://') === 0 ||
      u.indexOf('chrome-extension://') === 0 ||
      u.indexOf('edge://') === 0 ||
      u.indexOf('about:') === 0
    );
  }

  function isLemonHostUrl(url) {
    try {
      var host = new URL(url).hostname.toLowerCase();
      return host === 'lemonsqueezy.com' || host.endsWith('.lemonsqueezy.com');
    } catch (e) {
      return false;
    }
  }

  /** Lemon 结账成功 / 感谢页 URL 特征 */
  function isLemonSuccessUrl(url) {
    if (!url || !isLemonHostUrl(url)) {
      return false;
    }
    try {
      var u = new URL(url);
      var path = u.pathname.toLowerCase();
      if (path.indexOf('/success') !== -1 || path.indexOf('/thank') !== -1) {
        return true;
      }
      if (u.searchParams.get('checkout') === 'success') {
        return true;
      }
    } catch (e2) {
      return false;
    }
    return false;
  }

  function getApiBase() {
    if (
      typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
      SHOPRADAR_EXTENSION_CONFIG.apiBase
    ) {
      return String(SHOPRADAR_EXTENSION_CONFIG.apiBase).replace(/\/$/, '');
    }
    return 'https://api.shopradar.uk';
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function saveReturnContext(tabId, url) {
    if (!chrome.storage || !chrome.storage.session || tabId == null) {
      return;
    }
    try {
      await chrome.storage.session.set({
        [RETURN_TAB_KEY]: tabId,
        [RETURN_URL_KEY]: url ? String(url) : '',
      });
    } catch (err) {
      console.warn('[ShopRadar] 记录付款前标签页失败:', err);
    }
  }

  async function setCheckoutTabId(tabId) {
    if (!chrome.storage || !chrome.storage.session || tabId == null) {
      return;
    }
    try {
      await chrome.storage.session.set({ [CHECKOUT_TAB_KEY]: tabId });
    } catch (err) {
      console.warn('[ShopRadar] 记录结账标签页失败:', err);
    }
  }

  async function clearReturnSession() {
    if (!chrome.storage || !chrome.storage.session) {
      return;
    }
    try {
      await chrome.storage.session.remove([
        RETURN_TAB_KEY,
        RETURN_URL_KEY,
        CHECKOUT_TAB_KEY,
      ]);
    } catch (err) {
      /* ignore */
    }
  }

  async function fetchProStatusFromServer() {
    if (!chrome.storage || !chrome.storage.local) {
      return false;
    }
    try {
      var stored = await chrome.storage.local.get(['sr_device_id', 'sr_access_token']);
      var deviceId = stored.sr_device_id;
      if (!deviceId) {
        return false;
      }
      var url =
        getApiBase() +
        '/api/pro-status?deviceId=' +
        encodeURIComponent(String(deviceId));
      if (stored.sr_access_token) {
        url +=
          '&accessToken=' + encodeURIComponent(String(stored.sr_access_token));
      }
      var response = await fetch(url);
      if (!response.ok) {
        return false;
      }
      var data = await response.json();
      return Boolean(data && data.isPro);
    } catch (err) {
      return false;
    }
  }

  /**
   * 激活付款前标签页并关闭 Lemon 结账标签
   * @returns {Promise<boolean>}
   */
  async function returnToShopAfterPayment() {
    if (!chrome.tabs) {
      return false;
    }

    var sess = {};
    if (chrome.storage && chrome.storage.session) {
      try {
        sess = await chrome.storage.session.get([
          RETURN_TAB_KEY,
          RETURN_URL_KEY,
          CHECKOUT_TAB_KEY,
        ]);
      } catch (e) {
        sess = {};
      }
    }

    var returnTabId = sess[RETURN_TAB_KEY];
    var returnUrl = sess[RETURN_URL_KEY] || '';
    var checkoutTabId = sess[CHECKOUT_TAB_KEY];

    await clearReturnSession();

    var switched = false;

    if (returnTabId != null) {
      try {
        var tab = await chrome.tabs.get(returnTabId);
        if (tab && tab.id != null) {
          await chrome.tabs.update(returnTabId, { active: true });
          switched = true;
        }
      } catch (tabErr) {
        /* 标签已关闭 */
      }
    }

    if (!switched && returnUrl && !isRestrictedUrl(returnUrl)) {
      try {
        await chrome.tabs.create({ url: returnUrl, active: true });
        switched = true;
      } catch (openErr) {
        console.warn('[ShopRadar] 无法重新打开付款前页面:', openErr);
      }
    }

    if (checkoutTabId != null) {
      try {
        await chrome.tabs.remove(checkoutTabId);
      } catch (closeErr) {
        /* 可能已被用户关闭 */
      }
    }

    try {
      chrome.runtime.sendMessage({ type: 'SR_PRO_ACTIVATED' }).catch(function () {});
    } catch (msgErr) {
      /* popup 未打开 */
    }

    return switched;
  }

  function scheduleBackgroundProPoll() {
    if (backgroundPollActive) {
      return;
    }
    if (backgroundPollTimer) {
      clearTimeout(backgroundPollTimer);
    }
    backgroundPollTimer = setTimeout(function () {
      backgroundPollTimer = null;
      runBackgroundProPoll();
    }, 400);
  }

  async function runBackgroundProPoll() {
    if (backgroundPollActive) {
      return;
    }
    backgroundPollActive = true;
    var deadline = Date.now() + 26000;
    try {
      while (Date.now() < deadline) {
        if (await fetchProStatusFromServer()) {
          await returnToShopAfterPayment();
          return;
        }
        await delay(2000);
      }
    } finally {
      backgroundPollActive = false;
    }
  }

  function installBackgroundListener() {
    if (!chrome.tabs || !chrome.tabs.onUpdated) {
      return;
    }

    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
      var url = changeInfo.url || (tab && tab.url);
      if (!url || !isLemonHostUrl(url)) {
        return;
      }

      chrome.storage.session
        .get([CHECKOUT_TAB_KEY])
        .then(function (sess) {
          var checkoutId = sess[CHECKOUT_TAB_KEY];
          var isCheckoutTab = checkoutId != null && checkoutId === tabId;
          if (!isCheckoutTab && !isLemonSuccessUrl(url)) {
            return;
          }
          if (isLemonSuccessUrl(url) || changeInfo.status === 'complete') {
            scheduleBackgroundProPoll();
          }
        })
        .catch(function () {});
    });
  }

  return {
    saveReturnContext: saveReturnContext,
    setCheckoutTabId: setCheckoutTabId,
    isLemonSuccessUrl: isLemonSuccessUrl,
    returnToShopAfterPayment: returnToShopAfterPayment,
    fetchProStatusFromServer: fetchProStatusFromServer,
    installBackgroundListener: installBackgroundListener,
  };
})();
