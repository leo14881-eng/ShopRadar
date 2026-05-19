/* ShopRadar background.js — 自动生成，请勿手改。修改源文件后运行: npm run build:sw */

/* ----- extension-config.js ----- */
/**
 * ShopRadar 扩展发布配置（打包进 Chrome 商店）
 * 本地调试可复制 extension-config.dev.example.js 为 extension-config.local.js 并改 popup.html 引入
 */
var SHOPRADAR_EXTENSION_CONFIG = {
  apiBase: 'https://api.shopradar.uk',
  debug: false,
};

/* ----- extension-guard.js ----- */
/**
 * ShopRadar — 扩展运行时容错（popup / Service Worker 共用）
 */
var ShopRadarGuard = (function () {
  'use strict';

  function isRestrictedUrl(url) {
    if (!url) {
      return true;
    }
    var u = String(url).trim().toLowerCase();
    return (
      u.indexOf('chrome://') === 0 ||
      u.indexOf('chrome-error://') === 0 ||
      u.indexOf('chrome-extension://') === 0 ||
      u.indexOf('edge://') === 0 ||
      u.indexOf('edge-error://') === 0 ||
      u.indexOf('about:') === 0 ||
      u.indexOf('devtools://') === 0
    );
  }

  function isBenignInjectError(err) {
    var msg = String(err && err.message ? err.message : err);
    return (
      msg.indexOf('showing error page') !== -1 ||
      msg.indexOf('Cannot access a chrome://') !== -1 ||
      msg.indexOf('Cannot access contents of') !== -1 ||
      msg.indexOf('The tab was closed') !== -1 ||
      msg.indexOf('No tab with id') !== -1 ||
      msg.indexOf('Could not establish connection') !== -1
    );
  }

  function isBenignRuntimeError(err) {
    if (isBenignInjectError(err)) {
      return true;
    }
    var msg = String(err && err.message ? err.message : err);
    return (
      msg.indexOf('Extension context invalidated') !== -1 ||
      msg.indexOf('Failed to fetch') !== -1 ||
      msg.indexOf('NetworkError') !== -1 ||
      msg.indexOf('Load failed') !== -1 ||
      msg.indexOf('AbortError') !== -1 ||
      msg.indexOf('HTTP 4') !== -1 ||
      msg.indexOf('HTTP 5') !== -1
    );
  }

  function installServiceWorkerGuards() {
    if (typeof self === 'undefined' || !self.addEventListener) {
      return;
    }
    self.addEventListener('unhandledrejection', function (event) {
      if (isBenignRuntimeError(event.reason)) {
        event.preventDefault();
      }
    });
    self.addEventListener('error', function (event) {
      if (isBenignRuntimeError(event.error || event.message)) {
        event.preventDefault();
      }
    });
  }

  function installWindowGuards() {
    if (typeof window === 'undefined' || !window.addEventListener) {
      return;
    }
    window.addEventListener('unhandledrejection', function (event) {
      if (isBenignRuntimeError(event.reason)) {
        event.preventDefault();
      }
    });
    window.addEventListener('error', function (event) {
      if (isBenignRuntimeError(event.error || event.message)) {
        event.preventDefault();
      }
    });
  }

  return {
    isRestrictedUrl: isRestrictedUrl,
    isBenignInjectError: isBenignInjectError,
    isBenignRuntimeError: isBenignRuntimeError,
    installServiceWorkerGuards: installServiceWorkerGuards,
    installWindowGuards: installWindowGuards,
  };
})();

/* ----- shop-processor.js ----- */
/**
 * ShopRadar — 商品数据清洗（popup / background 共用，无 DOM 依赖）
 */
var ShopRadarData = (function () {
  var PLACEHOLDER_IMAGE =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">' +
        '<rect fill="#1a1a22" width="50" height="50"/>' +
        '<text x="25" y="28" text-anchor="middle" fill="#5c5c68" font-size="10" font-family="sans-serif">N/A</text>' +
        '</svg>'
    );

  var CURRENCY_DISPLAY_MAP = {
    USD: { mode: 'prefix', label: '$' },
    EUR: { mode: 'prefix', label: '\u20AC' },
    GBP: { mode: 'prefix', label: '\u00A3' },
    AMD: { mode: 'suffix', label: 'AMD' },
    CAD: { mode: 'prefix', label: 'C$' },
    AUD: { mode: 'prefix', label: 'A$' },
    CNY: { mode: 'prefix', label: '\u00A5' },
    JPY: { mode: 'prefix', label: '\u00A5' },
    CHF: { mode: 'prefix', label: 'CHF ' },
    INR: { mode: 'prefix', label: '\u20B9' },
    AED: { mode: 'prefix', label: 'AED ' },
    SAR: { mode: 'prefix', label: 'SAR ' },
  };

  function normalizeCurrencyCode(code) {
    var normalized = (code || 'USD').toString().trim().toUpperCase();
    return normalized || 'USD';
  }

  function getCurrencyDisplay(currencyCode) {
    var code = normalizeCurrencyCode(currencyCode);
    if (CURRENCY_DISPLAY_MAP[code]) {
      return CURRENCY_DISPLAY_MAP[code];
    }
    return { mode: 'suffix', label: code + ' ' };
  }

  function parseVariantPrice(rawPrice) {
    if (rawPrice == null || rawPrice === '') {
      return null;
    }
    var str = String(rawPrice).trim().replace(/,/g, '');
    if (!str || !/^-?\d+(\.\d+)?$/.test(str)) {
      return null;
    }
    var amount = parseFloat(str);
    return Number.isNaN(amount) ? null : amount;
  }

  function formatAmountDigits(amount) {
    if (amount % 1 === 0) {
      return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPriceFromAmount(amount, currencyCode) {
    var code = normalizeCurrencyCode(currencyCode);
    var digits = formatAmountDigits(amount);
    var display = getCurrencyDisplay(code);
    if (display.mode === 'suffix') {
      return digits + ' ' + display.label.trim();
    }
    return display.label + digits;
  }

  function formatPriceRange(minAmount, maxAmount, currencyCode) {
    if (minAmount == null) {
      return '\u2014';
    }
    var code = normalizeCurrencyCode(currencyCode);
    if (maxAmount == null || Math.abs(minAmount - maxAmount) < 0.001) {
      return formatPriceFromAmount(minAmount, code);
    }
    return (
      formatPriceFromAmount(minAmount, code) +
      ' - ' +
      formatPriceFromAmount(maxAmount, code)
    );
  }

  function extractProductPricing(product, currencyCode) {
    var code = normalizeCurrencyCode(currencyCode);
    var variants = Array.isArray(product.variants) ? product.variants : [];
    var salePrices = [];
    var comparePrices = [];

    variants.forEach(function (variant) {
      var sale = parseVariantPrice(variant.price);
      if (sale == null) {
        return;
      }
      salePrices.push(sale);
      var compareRaw = variant.compare_at_price;
      if (compareRaw == null || compareRaw === '') {
        return;
      }
      var compare = parseVariantPrice(compareRaw);
      if (compare != null && compare > sale) {
        comparePrices.push(compare);
      }
    });

    if (!salePrices.length) {
      return {
        minSale: null,
        maxSale: null,
        minCompare: null,
        maxCompare: null,
      };
    }

    return {
      minSale: Math.min.apply(null, salePrices),
      maxSale: Math.max.apply(null, salePrices),
      minCompare: comparePrices.length ? Math.min.apply(null, comparePrices) : null,
      maxCompare: comparePrices.length ? Math.max.apply(null, comparePrices) : null,
    };
  }

  function formatCreatedAt(isoString) {
    if (!isoString) return '\u2014';
    var date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '\u2014';
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  /**
   * @param {object} rawJson
   * @param {string} currencyCode
   * @param {string} [placeholderImage]
   */
  function cleanProducts(rawJson, currencyCode, placeholderImage) {
    var thumb = placeholderImage || PLACEHOLDER_IMAGE;
    var activeCurrency = normalizeCurrencyCode(currencyCode);
    var products = Array.isArray(rawJson && rawJson.products) ? rawJson.products : [];

    var cleaned = products.map(function (product) {
      var firstImage =
        product.images &&
        product.images.length > 0 &&
        product.images[0] &&
        product.images[0].src
          ? product.images[0].src
          : thumb;

      var pricing = extractProductPricing(product, activeCurrency);
      var saleLabel = formatPriceRange(
        pricing.minSale,
        pricing.maxSale,
        activeCurrency
      );
      var compareLabel =
        pricing.minCompare != null && pricing.maxCompare != null
          ? formatPriceRange(
              pricing.minCompare,
              pricing.maxCompare,
              activeCurrency
            )
          : null;

      var dateSource = product.published_at || product.created_at || '';

      return {
        title: product.title || '\u672a\u547d\u540d\u5546\u54c1',
        image: firstImage,
        price: saleLabel,
        compareAtPrice: compareLabel,
        createdAt: formatCreatedAt(dateSource),
        createdAtRaw: dateSource,
      };
    });

    cleaned.sort(function (a, b) {
      var timeA = new Date(a.createdAtRaw).getTime() || 0;
      var timeB = new Date(b.createdAtRaw).getTime() || 0;
      return timeB - timeA;
    });

    return cleaned;
  }

  /**
   * SFCC 页面解析结果 → 与 Shopify 列表相同的展示结构
   * @param {{ products: Array<{ title: string, image?: string, price: number, currency?: string }> }} parsed
   * @param {string} currencyCode
   * @param {string} [placeholderImage]
   */
  function cleanSfccProducts(parsed, currencyCode, placeholderImage) {
    var thumb = placeholderImage || PLACEHOLDER_IMAGE;
    var fallbackCurrency = normalizeCurrencyCode(currencyCode);
    var list = Array.isArray(parsed && parsed.products) ? parsed.products : [];

    var cleaned = list.map(function (product) {
      var code = normalizeCurrencyCode(product.currency || fallbackCurrency);
      var amount = parseVariantPrice(product.price);
      var dateSource = product.createdAtRaw || product.created_at || '';
      return {
        title: product.title || '\u672a\u547d\u540d\u5546\u54c1',
        image: product.image || thumb,
        price:
          amount == null ? '\u2014' : formatPriceFromAmount(amount, code),
        compareAtPrice: null,
        createdAt: formatCreatedAt(dateSource),
        createdAtRaw: dateSource,
      };
    });

    cleaned.sort(function (a, b) {
      var timeA = new Date(a.createdAtRaw).getTime() || 0;
      var timeB = new Date(b.createdAtRaw).getTime() || 0;
      return timeB - timeA;
    });

    return cleaned;
  }

  return {
    PLACEHOLDER_IMAGE: PLACEHOLDER_IMAGE,
    normalizeCurrencyCode: normalizeCurrencyCode,
    cleanProducts: cleanProducts,
    cleanSfccProducts: cleanSfccProducts,
    extractProductPricing: extractProductPricing,
    parseVariantPrice: parseVariantPrice,
  };
})();

/* ----- shop-url.js ----- */
/**
 * ShopRadar — products.json URL 动态解析（popup / background / 页面注入共用）
 */
var ShopRadarUrl = (function () {
  /**
   * 是否为 Shopify 国际化路径段（如 am, ca, uk）
   * @param {string} segment
   * @returns {boolean}
   */
  function isLocalePathSegment(segment) {
    return (
      segment &&
      segment.length >= 2 &&
      segment.length <= 3 &&
      segment !== 'products'
    );
  }

  /**
   * 根据完整页面 URL 生成 products.json 请求地址
   * @param {string} href 例如 https://www.mvmt.com/am/products/x?v=1
   * @returns {string} 例如 https://www.mvmt.com/am/products.json?v=1
   */
  function buildProductsJsonFetchUrlFromHref(href) {
    var urlObj = new URL(href || 'about:blank');
    var pathParts = urlObj.pathname.split('/').filter(function (part) {
      return Boolean(part);
    });
    var baseDataUrl = urlObj.origin;

    if (pathParts.length > 0 && isLocalePathSegment(pathParts[0])) {
      baseDataUrl = urlObj.origin + '/' + pathParts[0];
    }

    return baseDataUrl + '/products.json' + urlObj.search;
  }

  /**
   * 在保留路径/query 的前提下，将 hostname 替换为候选域名（www 回退）
   * @param {string} host 目标 hostname
   * @param {string} [referenceHref] 当前标签页 URL
   * @returns {string}
   */
  function buildProductsJsonFetchUrlForHost(host, referenceHref) {
    var refHref = referenceHref || 'https://' + host + '/';
    var ref = new URL(refHref);
    var pathParts = ref.pathname.split('/').filter(function (part) {
      return Boolean(part);
    });
    var baseDataUrl = 'https://' + host;

    if (pathParts.length > 0 && isLocalePathSegment(pathParts[0])) {
      baseDataUrl = 'https://' + host + '/' + pathParts[0];
    }

    return baseDataUrl + '/products.json' + ref.search;
  }

  return {
    isLocalePathSegment: isLocalePathSegment,
    buildProductsJsonFetchUrlFromHref: buildProductsJsonFetchUrlFromHref,
    buildProductsJsonFetchUrlForHost: buildProductsJsonFetchUrlForHost,
  };
})();

/* ----- detection-cache.js ----- */
/**
 * ShopRadar — 非 Shopify 域名负向检测缓存（24 小时 TTL，按 hostname）
 */
var ShopRadarDetectionCache = (function () {
  var STORAGE_KEY = 'sr_negative_detection_v1';
  var TTL_MS = 24 * 60 * 60 * 1000;

  function normalizeDomain(domain) {
    return (domain || '').toLowerCase().trim();
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

  return {
    STORAGE_KEY: STORAGE_KEY,
    TTL_MS: TTL_MS,
    readNegative: readNegative,
    saveNegative: saveNegative,
    clearNegative: clearNegative,
  };
})();

/* ----- store-detect.js ----- */
/**
 * ShopRadar — 店铺平台检测（popup 注入 / background MAIN world 共用）
 * @returns {{ isShopify: boolean, currency: string, platform: string }}
 */
function detectStoreInPage() {
  var hasShopifyGlobal =
    typeof window.Shopify !== 'undefined' && window.Shopify !== null;

  var htmlSource = document.documentElement
    ? document.documentElement.outerHTML
    : '';
  var platform = '';
  if (
    htmlSource.indexOf('demandware.static') !== -1 ||
    htmlSource.indexOf('demandware.store') !== -1 ||
    htmlSource.indexOf('commercecloud.salesforce') !== -1
  ) {
    platform = 'sfcc';
  }

  var hasShopifyMarker =
    htmlSource.indexOf('cdn.shopify.com') !== -1 ||
    htmlSource.indexOf('shopify-features') !== -1 ||
    htmlSource.indexOf('myshopify.com') !== -1 ||
    htmlSource.indexOf('shopify-checkout') !== -1;

  if (
    !hasShopifyMarker &&
    typeof window.Shopify !== 'undefined' &&
    window.Shopify &&
    (window.Shopify.shop || window.Shopify.theme)
  ) {
    hasShopifyGlobal = true;
  }

  if (!hasShopifyMarker) {
    var headLinks = document.head
      ? document.head.querySelectorAll('link[href], script[src]')
      : [];
    for (var h = 0; h < headLinks.length; h++) {
      var hrefChunk =
        (headLinks[h].href || '') + (headLinks[h].src || '');
      if (
        hrefChunk.indexOf('cdn.shopify.com') !== -1 ||
        hrefChunk.indexOf('shopifycloud.com') !== -1 ||
        hrefChunk.indexOf('shopify-features') !== -1 ||
        hrefChunk.indexOf('myshopify.com') !== -1
      ) {
        hasShopifyMarker = true;
        break;
      }
    }
  }

  if (!hasShopifyMarker) {
    var nodes = document.querySelectorAll(
      'script[src], link[href], script[type="application/json"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var chunk =
        (nodes[i].src || '') +
        (nodes[i].href || '') +
        (nodes[i].textContent || '');
      if (
        chunk.indexOf('cdn.shopify.com') !== -1 ||
        chunk.indexOf('shopifycloud.com') !== -1 ||
        chunk.indexOf('shopify-features') !== -1 ||
        chunk.indexOf('myshopify.com') !== -1 ||
        chunk.indexOf('Shopify.shop') !== -1
      ) {
        hasShopifyMarker = true;
        break;
      }
      if (
        !platform &&
        (chunk.indexOf('demandware.static') !== -1 ||
          chunk.indexOf('demandware.store') !== -1)
      ) {
        platform = 'sfcc';
      }
    }
  }

  var currentCurrency = 'USD';
  if (
    window.Shopify &&
    window.Shopify.currency &&
    window.Shopify.currency.active
  ) {
    currentCurrency = window.Shopify.currency.active;
  }

  return {
    isShopify: hasShopifyGlobal || hasShopifyMarker,
    currency: String(currentCurrency).trim().toUpperCase(),
    platform: platform,
  };
}

/* ----- background-jobs.js ----- */
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
      throw scriptErr;
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

/* ----- ShopRadar Service Worker 引导（由 build:sw 追加到 background.js 末尾） ----- */
'use strict';

var SIDE_PANEL_PATH = 'popup.html';

function setupSidePanel() {
  if (!chrome.sidePanel) {
    return;
  }
  if (chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(function () {});
  }
  if (chrome.sidePanel.setOptions) {
    chrome.sidePanel
      .setOptions({
        path: SIDE_PANEL_PATH,
        enabled: true,
      })
      .catch(function () {});
  }
}

function enableSidePanelForTab(tabId) {
  if (!chrome.sidePanel || !chrome.sidePanel.setOptions || tabId == null) {
    return;
  }
  chrome.sidePanel
    .setOptions({
      tabId: tabId,
      path: SIDE_PANEL_PATH,
      enabled: true,
    })
    .catch(function () {});
}

function ensureBackgroundJobsInstalled() {
  if (
    typeof ShopRadarBackgroundJobs !== 'undefined' &&
    ShopRadarBackgroundJobs.install
  ) {
    ShopRadarBackgroundJobs.install();
    return true;
  }
  console.error('[ShopRadar] ShopRadarBackgroundJobs 未定义');
  return false;
}

if (typeof ShopRadarGuard !== 'undefined') {
  ShopRadarGuard.installServiceWorkerGuards();
}

chrome.runtime.onInstalled.addListener(function (details) {
  setupSidePanel();
  ensureBackgroundJobsInstalled();

  if (
    typeof ShopRadarBackgroundJobs !== 'undefined' &&
    ShopRadarBackgroundJobs.onExtensionUpdated
  ) {
    ShopRadarBackgroundJobs.onExtensionUpdated(details);
  }

  if (
    typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
    SHOPRADAR_EXTENSION_CONFIG.debug
  ) {
    console.log(
      '[ShopRadar] Service Worker 就绪，版本:',
      chrome.runtime.getManifest().version,
      details.reason
    );
  }
});

chrome.runtime.onStartup.addListener(function () {
  setupSidePanel();
  ensureBackgroundJobsInstalled();
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  enableSidePanelForTab(activeInfo.tabId);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'PING') {
    sendResponse({ ok: true, source: 'background' });
    return false;
  }

  if (message && message.type === 'REFRESH_SHOP_TAB') {
    if (
      typeof ShopRadarBackgroundJobs === 'undefined' ||
      !ShopRadarBackgroundJobs.handleRefreshMessage
    ) {
      sendResponse({ ok: false, error: 'background_jobs_missing' });
      return false;
    }
    return ShopRadarBackgroundJobs.handleRefreshMessage(message, sendResponse);
  }

  return false;
});
