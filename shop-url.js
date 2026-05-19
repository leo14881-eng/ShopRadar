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
