/**
 * 已知 SFCC 店铺域名特征（非 Shopify，products.json 恒 404）
 * @param {string} domainOrHost
 * @returns {boolean}
 */
function isKnownSfccDomainHint(domainOrHost) {
  var host = String(domainOrHost || '').toLowerCase();
  return host.indexOf('popsockets') !== -1 || host.indexOf('mvmt') !== -1;
}

var SHOPIFY_MARKERS = [
  'cdn.shopify.com',
  'shopifycloud.com',
  'shopify-features',
  'myshopify.com',
  'shopify-checkout',
  'Shopify.shop',
];

var SFCC_MARKERS = [
  'demandware.static',
  'demandware.store',
  '/on/demandware.',
  'commercecloud.salesforce',
];

/**
 * @param {string} chunk
 * @param {{ hasShopifyMarker: boolean, platform: string }} state
 */
function scanMarkerChunk(chunk, state) {
  if (!chunk) {
    return;
  }
  if (!state.hasShopifyMarker) {
    for (var s = 0; s < SHOPIFY_MARKERS.length; s++) {
      if (chunk.indexOf(SHOPIFY_MARKERS[s]) !== -1) {
        state.hasShopifyMarker = true;
        break;
      }
    }
  }
  if (!state.platform) {
    for (var f = 0; f < SFCC_MARKERS.length; f++) {
      if (chunk.indexOf(SFCC_MARKERS[f]) !== -1) {
        state.platform = 'sfcc';
        break;
      }
    }
  }
}

/**
 * ShopRadar — 店铺平台检测（popup 注入 / background MAIN world 共用）
 * 避免 documentElement.outerHTML，仅扫描 head + 有限 script/link 节点。
 * @returns {{ isShopify: boolean, currency: string, platform: string }}
 */
function detectStoreInPage() {
  var state = {
    hasShopifyGlobal:
      typeof window.Shopify !== 'undefined' && window.Shopify !== null,
    hasShopifyMarker: false,
    platform: '',
  };

  if (
    state.hasShopifyGlobal &&
    window.Shopify &&
    (window.Shopify.shop || window.Shopify.theme)
  ) {
    state.hasShopifyMarker = true;
  }

  if (document.head) {
    var headNodes = document.head.querySelectorAll(
      'link[href], script[src], script:not([src])'
    );
    for (var h = 0; h < headNodes.length; h++) {
      var headEl = headNodes[h];
      scanMarkerChunk((headEl.href || '') + (headEl.src || ''), state);
      if (!state.hasShopifyMarker && headEl.textContent) {
        scanMarkerChunk(headEl.textContent.slice(0, 600), state);
      }
      if (state.hasShopifyMarker && state.platform) {
        break;
      }
    }
  }

  if (!state.platform && document.querySelector) {
    if (
      document.querySelector(
        'script[src*="demandware"], link[href*="demandware"], script[src*="commercecloud.salesforce"]'
      )
    ) {
      state.platform = 'sfcc';
    }
  }

  if (!state.hasShopifyMarker || !state.platform) {
    var bodyNodes = document.querySelectorAll('script[src], link[href]');
    var bodyLimit = bodyNodes.length > 120 ? 120 : bodyNodes.length;
    for (var i = 0; i < bodyLimit; i++) {
      scanMarkerChunk(
        (bodyNodes[i].src || '') + (bodyNodes[i].href || ''),
        state
      );
      if (state.hasShopifyMarker && state.platform) {
        break;
      }
    }
  }

  if (!state.hasShopifyMarker) {
    var jsonScripts = document.querySelectorAll(
      'script[type="application/json"]'
    );
    var jsonLimit = jsonScripts.length > 8 ? 8 : jsonScripts.length;
    for (var j = 0; j < jsonLimit; j++) {
      var jsonText = jsonScripts[j].textContent;
      if (jsonText && jsonText.length < 8192) {
        scanMarkerChunk(jsonText, state);
      }
      if (state.hasShopifyMarker) {
        break;
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
    isShopify:
      state.platform === 'sfcc'
        ? false
        : state.hasShopifyGlobal || state.hasShopifyMarker,
    currency: String(currentCurrency).trim().toUpperCase(),
    platform: state.platform,
  };
}
