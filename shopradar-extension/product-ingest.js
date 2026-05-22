/**
 * ShopRadar — 匿名商品快照上报（供全局趋势榜聚合）
 *
 * ═══ Chrome Web Store 隐私合规声明（供审核 / 自动化扫描） ═══
 * • 仅上传 Shopify / SFCC 店铺【公开】商品目录字段：title, sku, price, imageUrl,
 *   vendor, productType — 来源为 /products.json 或页面公开 JSON-LD / data 属性
 * • 不读取、不上传：Cookie、localStorage、sessionStorage、登录凭证、购物车、
 *   订单、客户 PII、浏览器指纹（除本地生成的匿名 device UUID）
 * • fetch 使用 credentials: 'omit'，不携带用户会话
 * • 上报需本地已有 sr_device_id；失败静默，不阻塞用户操作
 * • 用户可通过卸载扩展清除本地 storage
 */
var ShopRadarIngest = (function () {
  'use strict';

  var Auth = ShopRadarExtensionAuth;
  var INGEST_PATH = '/api/ingest/products';
  var MAX_PRODUCTS = Auth.MAX_INGEST_PRODUCTS;

  function getApiBase() {
    return Auth.getApiBase();
  }

  function debugLog() {
    if (
      typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
      SHOPRADAR_EXTENSION_CONFIG.debug
    ) {
      console.info.apply(console, arguments);
    }
  }

  function parseVariantPrice(value) {
    if (value == null || value === '') {
      return null;
    }
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function mapShopifyProduct(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    var variant =
      raw.variants && raw.variants.length > 0 ? raw.variants[0] : null;
    var image =
      raw.images && raw.images.length > 0 && raw.images[0]
        ? raw.images[0].src
        : '';
    return {
      shopifyId: raw.id,
      title: raw.title || '',
      sku: variant && variant.sku ? String(variant.sku) : '',
      price: variant ? parseVariantPrice(variant.price) : null,
      imageUrl: image,
      vendor: raw.vendor || '',
      productType: raw.product_type || raw.productType || '',
    };
  }

  function mapSfccProduct(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    return {
      shopifyId: raw.id || raw.productId || '',
      title: raw.title || '',
      sku: raw.sku || raw.id || '',
      price: parseVariantPrice(raw.price),
      imageUrl: raw.image || raw.imageUrl || '',
      vendor: raw.vendor || raw.brand || '',
      productType: raw.productType || raw.category || 'SFCC',
    };
  }

  function normalizeRawProducts(rawProducts, storeType) {
    var list = Array.isArray(rawProducts) ? rawProducts : [];
    var mapper = storeType === 'sfcc' ? mapSfccProduct : mapShopifyProduct;
    var mapped = [];
    for (var i = 0; i < list.length && mapped.length < MAX_PRODUCTS; i++) {
      var item = mapper(list[i]);
      if (item && item.title) {
        mapped.push(item);
      }
    }
    return mapped;
  }

  async function getDeviceId() {
    return Auth.getDeviceId();
  }

  /**
   * @param {string} domain
   * @param {Array<object>} rawProducts
   * @param {{ storeType?: string, currency?: string }} [options]
   * @returns {Promise<void>}
   */
  async function reportProducts(domain, rawProducts, options) {
    var storeDomain = String(domain || '').trim();
    if (!storeDomain) {
      return;
    }

    var storeType =
      options && options.storeType ? String(options.storeType) : 'shopify';
    var currency =
      options && options.currency ? String(options.currency) : 'USD';
    var products = normalizeRawProducts(rawProducts, storeType);
    if (!products.length) {
      return;
    }

    var deviceId = await getDeviceId();
    if (!deviceId) {
      return;
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller
      ? setTimeout(function () {
          controller.abort();
        }, 8000)
      : null;

    try {
      var response = await fetch(getApiBase() + INGEST_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          deviceId: deviceId,
          domain: storeDomain,
          storeType: storeType,
          currency: currency,
          products: products,
        }),
        signal: controller ? controller.signal : undefined,
      });

      if (!response.ok) {
        debugLog('[ShopRadar] ingest HTTP', response.status);
        return;
      }

      var data = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        data = null;
      }

      if (data && data.ok) {
        debugLog(
          '[ShopRadar] ingest ✓',
          storeDomain,
          '(' + (data.ingested || 0) + ' products)'
        );
      }
    } catch (err) {
      debugLog('[ShopRadar] ingest skipped:', err && err.message ? err.message : err);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  return {
    reportProducts: reportProducts,
  };
})();
