/**
 * 已知 SFCC 店铺域名特征（非 Shopify，products.json 恒 404）
 * @param {string} domainOrHost
 * @returns {boolean}
 */
function isKnownSfccDomainHint(domainOrHost) {
  var host = String(domainOrHost || '').toLowerCase();
  return host.indexOf('popsockets') !== -1 || host.indexOf('mvmt') !== -1;
}

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
    htmlSource.indexOf('/on/demandware.') !== -1 ||
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
      if (
        !platform &&
        (hrefChunk.indexOf('demandware.static') !== -1 ||
          hrefChunk.indexOf('demandware.store') !== -1 ||
          hrefChunk.indexOf('/on/demandware.') !== -1)
      ) {
        platform = 'sfcc';
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
    isShopify: platform === 'sfcc' ? false : hasShopifyGlobal || hasShopifyMarker,
    currency: String(currentCurrency).trim().toUpperCase(),
    platform: platform,
  };
}
