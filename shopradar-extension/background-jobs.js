/**
 * ShopRadar — 后台任务（由 build:sw 合并进 background.js）
 *
 * ═══ 隐私与权限边界 ═══
 * • 不在后台静默扫描任意网站；仅响应用户触发的 REFRESH_SHOP_TAB / 侧边栏打开
 * • 店铺识别后只请求公开 products.json（或 SFCC 公开 listing API）
 * • 不访问 Cookie / Session / 非公开 admin 接口
 * • 自定义域名需 optional_host_permissions 或 activeTab + 页面内 fetch
 */
var ShopRadarBackgroundJobs = (function () {
  var REFRESH_COOLDOWN_MS = 45 * 1000;
  var SHOPRADAR_MAX_PRODUCTS = 50;
  var MSG_REFRESH_SHOP_TAB = 'REFRESH_SHOP_TAB';
  var MSG_PROBE_SHOPIFY_TAB = 'PROBE_SHOPIFY_TAB';

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
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isRestrictedUrl) {
      return ShopRadarGuard.isRestrictedUrl(url);
    }
    if (!url) {
      return true;
    }
    var u = String(url).trim().toLowerCase();
    return (
      u.indexOf('chrome://') === 0 ||
      u.indexOf('chrome-error://') === 0 ||
      u.indexOf('chrome-extension://') === 0 ||
      u.indexOf('edge://') === 0 ||
      u.indexOf('about:') === 0
    );
  }

  function isBenignInjectError(err) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isBenignInjectError) {
      return ShopRadarGuard.isBenignInjectError(err);
    }
    return false;
  }

  function isUserInitiated(options) {
    return Boolean(
      options && (options.force || options.userInitiated || options.fromMessage)
    );
  }

  function canAnalyzeUrl(url) {
    if (
      typeof ShopRadarPermissions !== 'undefined' &&
      ShopRadarPermissions.isAnalyzableStoreUrl
    ) {
      return ShopRadarPermissions.isAnalyzableStoreUrl(url);
    }
    return !isRestrictedUrl(url);
  }

  async function ensureFetchPermission(url) {
    if (
      typeof ShopRadarPermissions === 'undefined' ||
      !ShopRadarPermissions.hasHostPermissionForUrl
    ) {
      return true;
    }
    if (await ShopRadarPermissions.hasHostPermissionForUrl(url)) {
      return true;
    }
    return ShopRadarPermissions.requestHostPermissionForUrl(url);
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
    var tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (tabErr) {
      return undefined;
    }
    if (!tab || !tab.url || isRestrictedUrl(tab.url)) {
      return undefined;
    }

    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: func,
        args: args || [],
      });
      return results[0] && results[0].result;
    } catch (scriptErr) {
      if (isBenignInjectError(scriptErr)) {
        return undefined;
      }
      if (
        typeof ShopRadarGuard !== 'undefined' &&
        ShopRadarGuard.isBenignRuntimeError &&
        ShopRadarGuard.isBenignRuntimeError(scriptErr)
      ) {
        return undefined;
      }
      return undefined;
    }
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
    if (typeof ShopRadarUrl !== 'undefined' && ShopRadarUrl.buildProductsJsonFetchUrlFromHref) {
      return ShopRadarUrl.buildProductsJsonFetchUrlFromHref(window.location.href);
    }
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

    return baseDataUrl + '/products.json?limit=50';
  }

  async function fetchProductsJsonAtUrlsInPage(urlCandidates) {
    var urls =
      Array.isArray(urlCandidates) && urlCandidates.length
        ? urlCandidates
        : typeof ShopRadarUrl !== 'undefined' &&
            ShopRadarUrl.buildProductsJsonFetchUrlCandidatesFromHref
          ? ShopRadarUrl.buildProductsJsonFetchUrlCandidatesFromHref(
              window.location.href
            )
          : [buildProductsJsonFetchUrlInPage()];

    var lastError = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i]);
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        var finalUrl = String(res.url || urls[i] || '');
        if (finalUrl && finalUrl.indexOf('products.json') === -1) {
          throw new Error('products.json 被重定向');
        }
        var text = await res.text();
        var trimmed = String(text || '').trim();
        if (
          !trimmed ||
          trimmed.charAt(0) === '<' ||
          trimmed.indexOf('<!DOCTYPE') === 0 ||
          trimmed.indexOf('<!doctype') === 0
        ) {
          throw new Error('返回 HTML 而非 products.json');
        }
        var json = JSON.parse(trimmed);
        var list = json && Array.isArray(json.products) ? json.products : [];
        if (list.length > 0) {
          return json;
        }
        lastError = new Error('商品列表为空');
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('无法获取商品数据');
  }

  async function fetchProductsJsonInPage() {
    return fetchProductsJsonAtUrlsInPage(null);
  }

  function productsJsonHasItems(json) {
    return Boolean(json && Array.isArray(json.products) && json.products.length > 0);
  }

  async function extensionFetchProductsJsonUrl(fetchUrl) {
    var response = await fetch(fetchUrl, { credentials: 'omit' });
    if (
      typeof ShopRadarUrl !== 'undefined' &&
      ShopRadarUrl.parseProductsJsonHttpResponse
    ) {
      return await ShopRadarUrl.parseProductsJsonHttpResponse(response, fetchUrl);
    }
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return await response.json();
  }

  function pageHostMatchesFetchHost(referenceHref, targetHost) {
    if (!referenceHref || !targetHost) {
      return true;
    }
    try {
      var pageHost = new URL(referenceHref).hostname.toLowerCase();
      var target = String(targetHost).toLowerCase();
      return (
        pageHost === target ||
        pageHost === 'www.' + target ||
        'www.' + pageHost === target
      );
    } catch (e) {
      return true;
    }
  }

  async function hasExtensionFetchAccessForUrl(fetchUrl) {
    if (!fetchUrl || typeof ShopRadarPermissions === 'undefined') {
      return false;
    }
    if (ShopRadarPermissions.hasHostPermissionForFetchUrl) {
      return ShopRadarPermissions.hasHostPermissionForFetchUrl(fetchUrl);
    }
    return ShopRadarPermissions.hasHostPermissionForUrl(fetchUrl);
  }

  async function hasExtensionFetchAccessForTab(tabId) {
    if (!tabId || typeof ShopRadarPermissions === 'undefined') {
      return false;
    }
    try {
      var tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url || !ShopRadarPermissions.isAnalyzableStoreUrl(tab.url)) {
        return false;
      }
      var domain = extractDomain(tab.url);
      var hosts = getProductsJsonHostCandidates(domain);
      if (ShopRadarPermissions.hasHostPermissionForAnyHost) {
        return ShopRadarPermissions.hasHostPermissionForAnyHost(hosts);
      }
      return ShopRadarPermissions.hasHostPermissionForUrl(tab.url);
    } catch (e) {
      return false;
    }
  }

  async function fetchProductsJsonForHost(host, tabId) {
    var tabHref = null;
    if (tabId) {
      var tab = await chrome.tabs.get(tabId);
      tabHref = tab.url;
    }

    var urlCandidates = ShopRadarUrl.buildProductsJsonFetchUrlCandidatesForHost(
      host,
      tabHref
    );
    var pageMatchesHost = pageHostMatchesFetchHost(tabHref, host);
    var lastError = null;

    if (tabId && pageMatchesHost) {
      try {
        var pageResults = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: fetchProductsJsonAtUrlsInPage,
          args: [urlCandidates],
        });
        if (
          pageResults[0] &&
          pageResults[0].result !== undefined &&
          productsJsonHasItems(pageResults[0].result)
        ) {
          return pageResults[0].result;
        }
        lastError = new Error(host + ' 返回商品列表为空');
      } catch (pageFetchError) {
        lastError = pageFetchError;
      }
    }

    for (var u = 0; u < urlCandidates.length; u++) {
      var fetchUrl = urlCandidates[u];
      if (!(await hasExtensionFetchAccessForUrl(fetchUrl))) {
        continue;
      }
      try {
        var json = await extensionFetchProductsJsonUrl(fetchUrl);
        if (productsJsonHasItems(json)) {
          return json;
        }
        lastError = new Error(host + ' 返回商品列表为空');
      } catch (fetchError) {
        lastError = fetchError;
      }
    }

    if (!tabId) {
      throw lastError || new Error('无法访问当前标签页');
    }

    if (!pageMatchesHost) {
      throw lastError || new Error('当前页面域名与 ' + host + ' 不匹配，且无 host 权限');
    }

    var results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: fetchProductsJsonAtUrlsInPage,
      args: [urlCandidates],
    });
    if (
      results[0] &&
      results[0].result !== undefined &&
      productsJsonHasItems(results[0].result)
    ) {
      return results[0].result;
    }
    throw lastError || new Error('未获取到商品数据');
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
    var userInitiated = isUserInitiated(options);

    if (!userInitiated) {
      return;
    }

    var domain = extractDomain(url);

    if (!domain || !canAnalyzeUrl(url) || !tabId) {
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

      var isSfcc = detection.platform === 'sfcc';
      var isShopify = !isSfcc && Boolean(detection.isShopify);

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
        rawList = ShopRadarData.alignRawToCleaned(rawList, items);

        await saveShopCache(domain, {
          products: items,
          rawProducts: rawList,
          currency: currency,
          storeType: 'shopify',
        });

        if (typeof ShopRadarIngest !== 'undefined') {
          ShopRadarIngest.reportProducts(domain, rawList, {
            storeType: 'shopify',
            currency: currency,
          }).catch(function () {});
        }
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

        if (typeof ShopRadarIngest !== 'undefined') {
          ShopRadarIngest.reportProducts(domain, rawList, {
            storeType: 'sfcc',
            currency: currency,
          }).catch(function () {});
        }
      }

      lastRefreshAtByDomain[domain] = Date.now();
      if (
        typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
        SHOPRADAR_EXTENSION_CONFIG.debug
      ) {
        console.log(
          '[ShopRadar] 后台已更新缓存:',
          domain,
          '(' + rawList.length + ' 件商品,',
          isSfcc ? 'SFCC' : 'Shopify',
          ')'
        );
      }
    } catch (error) {
      console.warn('[ShopRadar] 后台刷新失败:', domain, error);
    } finally {
      refreshingDomains.delete(domain);
    }
  }

  function scheduleShopRefresh(tabId, url, options) {
    if (!tabId || !url || !canAnalyzeUrl(url)) {
      return;
    }
    if (!isUserInitiated(options)) {
      return;
    }
    refreshShopForTab(tabId, url, options).catch(function () {});
  }

  async function probeShopifyProductsJson(domain, tabId) {
    var hosts = getProductsJsonHostCandidates(domain);
    var tabHref = null;
    if (tabId) {
      try {
        var tab = await chrome.tabs.get(tabId);
        tabHref = tab.url;
      } catch (tabErr) {
        tabHref = null;
      }
    }

    for (var h = 0; h < hosts.length; h++) {
      var host = hosts[h];
      var urlCandidates = ShopRadarUrl.buildProductsJsonFetchUrlCandidatesForHost(
        host,
        tabHref
      );
      for (var u = 0; u < urlCandidates.length; u++) {
        var fetchUrl = urlCandidates[u];
        if (!(await hasExtensionFetchAccessForUrl(fetchUrl))) {
          continue;
        }
        try {
          var response = await fetch(fetchUrl, { credentials: 'omit' });
          if (!response.ok) {
            continue;
          }
          var json =
            typeof ShopRadarUrl !== 'undefined' &&
            ShopRadarUrl.parseProductsJsonHttpResponse
              ? await ShopRadarUrl.parseProductsJsonHttpResponse(
                  response,
                  fetchUrl
                )
              : await response.json();
          if (json && Array.isArray(json.products)) {
            return json;
          }
        } catch (fetchErr) {
          /* try next url */
        }
      }
    }

    if (!tabId) {
      return null;
    }

    try {
      var pageCandidates =
        typeof ShopRadarUrl !== 'undefined' &&
        ShopRadarUrl.buildProductsJsonFetchUrlCandidatesFromHref &&
        tabHref
          ? ShopRadarUrl.buildProductsJsonFetchUrlCandidatesFromHref(tabHref)
          : null;
      var pageResults = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: fetchProductsJsonAtUrlsInPage,
        args: [pageCandidates],
      });
      if (
        pageResults[0] &&
        pageResults[0].result &&
        Array.isArray(pageResults[0].result.products)
      ) {
        return pageResults[0].result;
      }
    } catch (pageErr) {
      /* ignore */
    }

    return null;
  }

  async function probeShopifyTab(tabId, domain) {
    if (!tabId || !domain) {
      return { isShopify: false };
    }

    try {
      var tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url || !canAnalyzeUrl(tab.url)) {
        return { isShopify: false };
      }
    } catch (tabReadErr) {
      return { isShopify: false };
    }

    var json = await probeShopifyProductsJson(domain, tabId);
    if (json && Array.isArray(json.products)) {
      return { isShopify: true, currency: 'USD' };
    }

    var detection = null;
    try {
      detection = await executeInMainWorld(tabId, detectStoreInPage);
    } catch (detectErr) {
      detection = null;
    }

    if (detection && detection.platform === 'sfcc') {
      return { isShopify: false, platform: 'sfcc' };
    }

    if (detection && detection.isShopify) {
      return {
        isShopify: true,
        currency: ShopRadarData.normalizeCurrencyCode(detection.currency),
      };
    }

    return { isShopify: false };
  }

  function replyMessage(sendResponse, payload) {
    var body =
      payload && typeof payload === 'object'
        ? Object.assign({ status: 'ok' }, payload)
        : { status: 'ok' };
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendResponse) {
      ShopRadarGuard.safeSendResponse(sendResponse, body);
      return;
    }
    try {
      sendResponse(body);
    } catch (sendErr) {
      if (
        typeof ShopRadarGuard !== 'undefined' &&
        ShopRadarGuard.consumeLastError
      ) {
        ShopRadarGuard.consumeLastError();
      }
    }
  }

  function handleRefreshMessage(message, sendResponse) {
    var tabId = message.tabId;
    var domain = message.domain;
    var force = Boolean(message.force);

    if (!tabId || !domain) {
      replyMessage(sendResponse, { ok: false });
      return false;
    }

    var url = 'https://' + domain + '/';
    refreshShopForTab(tabId, url, { force: force, fromMessage: true })
      .then(function () {
        replyMessage(sendResponse, { ok: true });
      })
      .catch(function () {
        replyMessage(sendResponse, { ok: false });
      });
    return true;
  }

  function handleProbeMessage(message, sendResponse) {
    var tabId = message.tabId;
    var domain = message.domain;

    if (!tabId || !domain) {
      replyMessage(sendResponse, { isShopify: false });
      return false;
    }

    probeShopifyTab(tabId, domain)
      .then(function (result) {
        replyMessage(
          sendResponse,
          Object.assign({ isShopify: false }, result || {})
        );
      })
      .catch(function () {
        replyMessage(sendResponse, { isShopify: false });
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

    /* 合规：不注册 tabs.onUpdated / onActivated 被动全站扫描 */

    if (
      typeof ShopRadarLemonReturn !== 'undefined' &&
      ShopRadarLemonReturn.installBackgroundListener
    ) {
      ShopRadarLemonReturn.installBackgroundListener();
    }
  }

  return {
    MSG_REFRESH_SHOP_TAB: MSG_REFRESH_SHOP_TAB,
    MSG_PROBE_SHOPIFY_TAB: MSG_PROBE_SHOPIFY_TAB,
    install: install,
    onExtensionUpdated: onExtensionUpdated,
    handleRefreshMessage: handleRefreshMessage,
    handleProbeMessage: handleProbeMessage,
  };
})();
