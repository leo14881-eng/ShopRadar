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
   * 生成 products.json 查询串（忽略页面上的 limit/page，固定最多 50 件）
   * @param {string} [referenceSearch] 页面 location.search，如 ?limit=3&foo=bar
   * @returns {string} 如 ?limit=50&foo=bar
   */
  function buildProductsJsonQuery(referenceSearch) {
    var search = referenceSearch || '';
    if (search.charAt(0) === '?') {
      search = search.slice(1);
    }
    var params = new URLSearchParams(search);
    params.delete('page');
    params.set('limit', '50');
    var q = params.toString();
    return q ? '?' + q : '?limit=50';
  }

  /**
   * @param {string} href
   * @returns {{ baseDataUrl: string, search: string }}
   */
  function resolveProductsJsonBaseFromHref(href) {
    var urlObj = new URL(href || 'about:blank');
    var pathParts = urlObj.pathname.split('/').filter(function (part) {
      return Boolean(part);
    });
    var baseDataUrl = urlObj.origin;

    if (pathParts.length > 0 && isLocalePathSegment(pathParts[0])) {
      baseDataUrl = urlObj.origin + '/' + pathParts[0];
    }

    return { baseDataUrl: baseDataUrl, search: urlObj.search };
  }

  /**
   * @param {string} host
   * @param {string} [referenceHref]
   * @returns {{ baseDataUrl: string, search: string }}
   */
  function resolveProductsJsonBaseForHost(host, referenceHref) {
    var refHref = referenceHref || 'https://' + host + '/';
    var ref = new URL(refHref);
    var pathParts = ref.pathname.split('/').filter(function (part) {
      return Boolean(part);
    });
    var baseDataUrl = 'https://' + host;

    if (pathParts.length > 0 && isLocalePathSegment(pathParts[0])) {
      baseDataUrl = 'https://' + host + '/' + pathParts[0];
    }

    return { baseDataUrl: baseDataUrl, search: ref.search };
  }

  /**
   * @param {string[]} urls
   * @returns {string[]}
   */
  function dedupeFetchUrls(urls) {
    var seen = {};
    return (urls || []).filter(function (url) {
      if (!url || seen[url]) {
        return false;
      }
      seen[url] = true;
      return true;
    });
  }

  /**
   * 根据完整页面 URL 生成 products.json 请求地址
   * @param {string} href 例如 https://www.mvmt.com/am/products/x?v=1
   * @param {string} [resourcePath] 默认 /products.json
   * @returns {string} 例如 https://www.mvmt.com/am/products.json?limit=50&v=1
   */
  function buildProductsJsonFetchUrlFromHref(href, resourcePath) {
    var resolved = resolveProductsJsonBaseFromHref(href);
    return (
      resolved.baseDataUrl +
      (resourcePath || '/products.json') +
      buildProductsJsonQuery(resolved.search)
    );
  }

  /**
   * products.json 候选 URL（含 /collections/all 回退）
   * @param {string} href
   * @returns {string[]}
   */
  function buildProductsJsonFetchUrlCandidatesFromHref(href) {
    return dedupeFetchUrls([
      buildProductsJsonFetchUrlFromHref(href),
      buildProductsJsonFetchUrlFromHref(href, '/collections/all/products.json'),
    ]);
  }

  /**
   * 在保留路径/query 的前提下，将 hostname 替换为候选域名（www 回退）
   * @param {string} host 目标 hostname
   * @param {string} [referenceHref] 当前标签页 URL
   * @param {string} [resourcePath] 默认 /products.json
   * @returns {string}
   */
  function buildProductsJsonFetchUrlForHost(host, referenceHref, resourcePath) {
    var resolved = resolveProductsJsonBaseForHost(host, referenceHref);
    return (
      resolved.baseDataUrl +
      (resourcePath || '/products.json') +
      buildProductsJsonQuery(resolved.search)
    );
  }

  /**
   * 指定 host 的 products.json 候选 URL
   * @param {string} host
   * @param {string} [referenceHref]
   * @returns {string[]}
   */
  function buildProductsJsonFetchUrlCandidatesForHost(host, referenceHref) {
    return dedupeFetchUrls([
      buildProductsJsonFetchUrlForHost(host, referenceHref),
      buildProductsJsonFetchUrlForHost(
        host,
        referenceHref,
        '/collections/all/products.json'
      ),
    ]);
  }

  /**
   * 校验 fetch 响应是否为 products.json（非 HTML 重定向页）
   * @param {Response} response
   * @param {string} [requestUrl]
   * @returns {Promise<object>}
   */
  function parseProductsJsonHttpResponse(response, requestUrl) {
    if (!response || !response.ok) {
      return Promise.reject(
        new Error('HTTP ' + (response ? response.status : 0))
      );
    }

    var finalUrl = String(response.url || requestUrl || '');
    if (finalUrl && finalUrl.indexOf('products.json') === -1) {
      return Promise.reject(
        new Error('products.json 被重定向到: ' + finalUrl)
      );
    }

    return response.text().then(function (text) {
      var trimmed = String(text || '').trim();
      if (
        !trimmed ||
        trimmed.charAt(0) === '<' ||
        trimmed.indexOf('<!DOCTYPE') === 0 ||
        trimmed.indexOf('<!doctype') === 0
      ) {
        return Promise.reject(new Error('返回 HTML 而非 products.json'));
      }
      try {
        return JSON.parse(trimmed);
      } catch (parseError) {
        return Promise.reject(new Error('响应不是有效的 products.json'));
      }
    });
  }

  return {
    isLocalePathSegment: isLocalePathSegment,
    buildProductsJsonQuery: buildProductsJsonQuery,
    buildProductsJsonFetchUrlFromHref: buildProductsJsonFetchUrlFromHref,
    buildProductsJsonFetchUrlCandidatesFromHref:
      buildProductsJsonFetchUrlCandidatesFromHref,
    buildProductsJsonFetchUrlForHost: buildProductsJsonFetchUrlForHost,
    buildProductsJsonFetchUrlCandidatesForHost:
      buildProductsJsonFetchUrlCandidatesForHost,
    parseProductsJsonHttpResponse: parseProductsJsonHttpResponse,
  };
})();
