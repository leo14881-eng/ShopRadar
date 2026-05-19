/**
 * ShopRadar — 后台任务（由 build:sw 合并进 background.js）
 * 依赖：shop-processor.js, shop-url.js, detection-cache.js, store-detect.js
 */
var ShopRadarBackgroundJobs = (function () {
  var REFRESH_COOLDOWN_MS = 60 * 1000;
  var SHOPRADAR_MAX_PRODUCTS = 50;
  var MSG_REFRESH_SHOP_TAB = 'REFRESH_SHOP_TAB';

  var refreshingDomains = new Set();
  var lastRefreshAtByDomain = {};
  var listenersInstalled = false;
  var sfccInjectedTabs = new Set();

  function extractDomain(url) {
    if (!url) {
      return '';
    }
    try {
      return new URL(url).hostname;
    } catch (e) {
      return '';
    }
  }

  function isRestrictedUrl(url) {
    if (!url) {
      return true;
    }
    return (
      url.indexOf('chrome://') === 0 ||
      url.indexOf('chrome-extension://') === 0 ||
      url.indexOf('edge://') === 0 ||
      url.indexOf('about:') === 0
    );
  }

  function readActiveCurrencyFromPage() {
    var currentCurrency = 'USD';
    if (
      window.Shopify &&
      window.Shopify.currency &&
      window.Shopify.currency.active
    ) {
      currentCurrency = window.Shopify.currency.active;
    }
    return String(currentCurrency).trim().toUpperCase();
  }

  async function executeInMainWorld(tabId, func, args) {
    var results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: func,
      args: args || [],
    });
    return results[0] && results[0].result;
  }

  function getProductsJsonHostCandidates(domain) {
    var host = (domain || '').toLowerCase().trim();
    if (!host) {
      return [];
    }
    var candidates = [host];
    if (host.indexOf('www.') === 0) {
      candidates.push(host.slice(4));
    } else {
      candidates.push('www.' + host);
    }
    var seen = {};
    return candidates.filter(function (h) {
      if (seen[h]) {
        return false;
      }
      seen[h] = true;
      return true;
    });
  }

  function buildProductsJsonFetchUrlInPage() {
    var urlObj = new URL(window.location.href);
    var pathParts = urlObj.pathname.split('/').filter(function (part) {
      return Boolean(part);
    });
    var baseDataUrl = urlObj.origin;

    if (
      pathParts.length > 0 &&
      pathParts[0].length >= 2 &&
      pathParts[0].length <= 3 &&
      pathParts[0] !== 'products'
    ) {
      baseDataUrl = urlObj.origin + '/' + pathParts[0];
    }

    var search = urlObj.search || '';
    if (search.charAt(0) === '?') {
      search = search.slice(1);
    }
    var params = new URLSearchParams(search);
    if (!params.has('limit')) {
      params.set('limit', '50');
    }
    var q = params.toString();
    return baseDataUrl + '/products.json' + (q ? '?' + q : '');
  }

  async function fetchProductsJsonInPage() {
    var fetchUrl = buildProductsJsonFetchUrlInPage();
    var res = await fetch(fetchUrl);
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    return await res.json();
  }

  async function fetchProductsJsonForHost(host, tabId) {
    var tabHref = null;
    if (tabId) {
      var tab = await chrome.tabs.get(tabId);
      tabHref = tab.url;
    }

    var fetchUrl = ShopRadarUrl.buildProductsJsonFetchUrlForHost(host, tabHref);

    try {
      var response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return await response.json();
    } catch (fetchError) {
      if (!tabId) {
        throw fetchError;
      }
      var results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: fetchProductsJsonInPage,
      });
      if (!results[0] || results[0].result === undefined) {
        throw new Error('未获取到商品数据');
      }
      return results[0].result;
    }
  }

  async function fetchProductsJson(domain, tabId) {
    var hosts = getProductsJsonHostCandidates(domain);
    var lastError = null;

    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      try {
        var rawJson = await fetchProductsJsonForHost(host, tabId);
        var list =
          rawJson && Array.isArray(rawJson.products) ? rawJson.products : [];
        if (list.length > 0) {
          return rawJson;
        }
        lastError = new Error(host + ' 返回商品列表为空');
      } catch (fetchError) {
        lastError = fetchError;
      }
    }

    throw lastError || new Error('无法获取商品数据');
  }

  async function saveShopCache(domain, payload) {
    if (!domain || !payload) {
      return;
    }
    await chrome.storage.local.set({
      [domain]: {
        products: payload.products,
        rawProducts: payload.rawProducts,
        currency: ShopRadarData.normalizeCurrencyCode(payload.currency),
        storeType: payload.storeType || 'shopify',
        timestamp: Date.now(),
      },
    });
  }

  async function fetchSfccProducts(tabId) {
    if (!sfccInjectedTabs.has(tabId)) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['sfcc-fetch.js'],
      });
      sfccInjectedTabs.add(tabId);
    }

    var results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function runSfccFetchInPage(maxCount) {
        return fetchSfccProductsInPage(maxCount);
      },
      args: [SHOPRADAR_MAX_PRODUCTS],
    });

    var payload = results[0] && results[0].result;
    if (!payload || !Array.isArray(payload.products)) {
      throw new Error('未获取到 SFCC 商品数据');
    }
    return payload;
  }

  async function refreshShopForTab(tabId, url, options) {
    var force = Boolean(options && options.force);
    var domain = extractDomain(url);

    if (!domain || isRestrictedUrl(url) || !tabId) {
      return;
    }

    var negativeHit = await ShopRadarDetectionCache.readNegative(domain);
    if (negativeHit && !negativeHit.tentative) {
      return;
    }

    if (refreshingDomains.has(domain)) {
      return;
    }

    var lastAt = lastRefreshAtByDomain[domain] || 0;
    if (!force && Date.now() - lastAt < REFRESH_COOLDOWN_MS) {
      return;
    }

    refreshingDomains.add(domain);

    try {
      var detection = null;
      var detectAttempts = 10;
      var detectDelayMs = 400;

      for (var attempt = 0; attempt < detectAttempts; attempt++) {
        try {
          detection = await executeInMainWorld(tabId, detectStoreInPage);
        } catch (injectError) {
          detection = null;
        }
        if (
          detection &&
          (detection.isShopify || detection.platform === 'sfcc')
        ) {
          break;
        }
        if (attempt < detectAttempts - 1) {
          await new Promise(function (resolve) {
            setTimeout(resolve, detectDelayMs);
          });
        }
      }

      if (!detection) {
        return;
      }

      var isShopify = Boolean(detection.isShopify);
      var isSfcc = !isShopify && detection.platform === 'sfcc';

      if (!isShopify && !isSfcc) {
        return;
      }

      await ShopRadarDetectionCache.clearNegative(domain);

      var currency = ShopRadarData.normalizeCurrencyCode(detection.currency);
      var rawList = [];
      var items = [];

      if (isShopify) {
        if (!currency || currency === 'USD') {
          try {
            var pageCurrency = await executeInMainWorld(
              tabId,
              readActiveCurrencyFromPage
            );
            if (pageCurrency) {
              currency = ShopRadarData.normalizeCurrencyCode(pageCurrency);
            }
          } catch (currencyError) {
            /* 使用检测阶段带回的货币 */
          }
        }

        var rawJson = await fetchProductsJson(domain, tabId);
        rawList = Array.isArray(rawJson && rawJson.products)
          ? rawJson.products
          : [];
        items = ShopRadarData.cleanProducts(rawJson, currency);

        await saveShopCache(domain, {
          products: items,
          rawProducts: rawList,
          currency: currency,
          storeType: 'shopify',
        });
      } else {
        var parsed = await fetchSfccProducts(tabId);
        if (parsed.currency) {
          currency = ShopRadarData.normalizeCurrencyCode(parsed.currency);
        }
        rawList = parsed.products;
        items = ShopRadarData.cleanSfccProducts(
          parsed,
          currency,
          ShopRadarData.PLACEHOLDER_IMAGE
        );

        await saveShopCache(domain, {
          products: items,
          rawProducts: rawList,
          currency: currency,
          storeType: 'sfcc',
        });
      }

      lastRefreshAtByDomain[domain] = Date.now();
      console.log(
        '[ShopRadar] 后台已更新缓存:',
        domain,
        '(' + rawList.length + ' 件商品,',
        isSfcc ? 'SFCC' : 'Shopify',
        ')'
      );
    } catch (error) {
      console.warn('[ShopRadar] 后台刷新失败:', domain, error);
    } finally {
      refreshingDomains.delete(domain);
    }
  }

  function scheduleShopRefresh(tabId, url, options) {
    if (!tabId || !url || isRestrictedUrl(url)) {
      return;
    }
    refreshShopForTab(tabId, url, options).catch(function () {});
  }

  function onTabActivated(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
      if (chrome.runtime.lastError || !tab || !tab.url) {
        return;
      }
      scheduleShopRefresh(activeInfo.tabId, tab.url);
    });
  }

  function handleRefreshMessage(message, sendResponse) {
    var tabId = message.tabId;
    var domain = message.domain;
    var force = Boolean(message.force);

    if (!tabId || !domain) {
      sendResponse({ ok: false });
      return false;
    }

    var url = 'https://' + domain + '/';
    refreshShopForTab(tabId, url, { force: force })
      .then(function () {
        sendResponse({ ok: true });
      })
      .catch(function () {
        sendResponse({ ok: false });
      });
    return true;
  }

  function onExtensionUpdated(details) {
    if (details.reason === 'update') {
      chrome.storage.local
        .remove(ShopRadarDetectionCache.STORAGE_KEY)
        .catch(function () {});
    }
  }

  function install() {
    if (listenersInstalled) {
      return;
    }
    listenersInstalled = true;

    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
      if (changeInfo.status !== 'complete' || !tab.url) {
        return;
      }
      scheduleShopRefresh(tabId, tab.url);
    });

    chrome.tabs.onActivated.addListener(onTabActivated);
  }

  return {
    MSG_REFRESH_SHOP_TAB: MSG_REFRESH_SHOP_TAB,
    install: install,
    onExtensionUpdated: onExtensionUpdated,
    handleRefreshMessage: handleRefreshMessage,
  };
})();
