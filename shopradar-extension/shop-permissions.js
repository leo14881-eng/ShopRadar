/**
 * ShopRadar — 权限与 URL 安全边界（Manifest V3 / Chrome Web Store 合规）
 *
 * 设计原则：
 * 1. 不使用 <all_urls>；自定义域名通过 optional_host_permissions 按需申请
 * 2. 仅允许 HTTPS 公开店铺页；拒绝 chrome://、支付页以外的敏感域
 * 3. 所有分析行为须由用户打开侧边栏或点击刷新触发（见 background-jobs.js）
 */
var ShopRadarPermissions = (function () {
  'use strict';

  var MYShopify_SUFFIX = '.myshopify.com';

  /** 非电商分析目标（减少误触与审核风险） */
  var BLOCKED_ANALYSIS_HOSTS = [
    'accounts.google.com',
    'mail.google.com',
    'facebook.com',
    'www.facebook.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
    'github.com',
    'chrome.google.com',
  ];

  function normalizeHost(host) {
    return String(host || '')
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');
  }

  function isRestrictedUrl(url) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isRestrictedUrl) {
      return ShopRadarGuard.isRestrictedUrl(url);
    }
    return !url;
  }

  /**
   * 是否为可分析的 HTTPS 店铺页（非浏览器内部页）
   * @param {string} url
   * @returns {boolean}
   */
  function isAnalyzableStoreUrl(url) {
    if (!url || isRestrictedUrl(url)) {
      return false;
    }
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return false;
      }
      var host = normalizeHost(parsed.hostname);
      if (!host || host === 'localhost' || host === '127.0.0.1') {
        return false;
      }
      for (var i = 0; i < BLOCKED_ANALYSIS_HOSTS.length; i++) {
        var blocked = BLOCKED_ANALYSIS_HOSTS[i];
        if (host === blocked || host.endsWith('.' + blocked)) {
          return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function isMyshopifyHost(host) {
    var h = normalizeHost(host);
    return h.endsWith(MYShopify_SUFFIX) || h === 'myshopify.com';
  }

  /**
   * @param {string} url
   * @returns {string} 例如 https://example.com
   */
  function originPatternFromUrl(url) {
    var parsed = new URL(url);
    return parsed.origin + '/*';
  }

  var OPTIONAL_BROAD_ORIGINS = ['https://' + '*/*', 'http://' + '*/*'];

  /**
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  function hasHostPermissionForUrl(url) {
    if (!chrome.permissions || !chrome.permissions.contains) {
      return Promise.resolve(false);
    }
    if (!isAnalyzableStoreUrl(url)) {
      return Promise.resolve(false);
    }
    if (isMyshopifyHost(new URL(url).hostname)) {
      return Promise.resolve(true);
    }
    var pattern = originPatternFromUrl(url);
    return chrome.permissions.contains({ origins: [pattern] }).then(function (has) {
      if (has) {
        return true;
      }
      return containsAnyBroadHostPermission();
    });
  }

  /**
   * 用户将站点访问权限设为「在所有网站上」时，只授予全站 HTTPS 通配而非逐域模式
   * @returns {Promise<boolean>}
   */
  function containsAnyBroadHostPermission() {
    if (!chrome.permissions || !chrome.permissions.contains) {
      return Promise.resolve(false);
    }
    return chrome.permissions
      .contains({ origins: OPTIONAL_BROAD_ORIGINS })
      .then(function (hasBroad) {
        if (hasBroad) {
          return true;
        }
        return chrome.permissions.contains({ origins: ['<all_urls>'] });
      });
  }

  /**
   * 任一候选 hostname 已具备 host 权限（含全站授权）
   * @param {string[]} hosts
   * @returns {Promise<boolean>}
   */
  function hasHostPermissionForAnyHost(hosts) {
    if (!hosts || !hosts.length) {
      return Promise.resolve(false);
    }
    var chain = Promise.resolve(false);
    for (var i = 0; i < hosts.length; i++) {
      (function (host) {
        chain = chain.then(function (found) {
          if (found) {
            return true;
          }
          return hasHostPermissionForUrl('https://' + host + '/');
        });
      })(hosts[i]);
    }
    return chain;
  }

  /**
   * 为自定义 Shopify 域名申请 optional_host_permissions（用户可见系统弹窗）
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  function requestHostPermissionForUrl(url) {
    if (!chrome.permissions || !chrome.permissions.request) {
      return Promise.resolve(false);
    }
    if (!isAnalyzableStoreUrl(url)) {
      return Promise.resolve(false);
    }
    if (isMyshopifyHost(new URL(url).hostname)) {
      return Promise.resolve(true);
    }
    var pattern = originPatternFromUrl(url);
    return chrome.permissions.request({ origins: [pattern] }).catch(function (err) {
      var msg = String(err && err.message ? err.message : err);
      if (msg.indexOf('user gesture') !== -1) {
        return false;
      }
      return false;
    });
  }

  /**
   * 是否仅为公开商品目录端点（products.json 等）
   * @param {string} fetchUrl
   * @returns {boolean}
   */
  function isPublicCatalogFetchUrl(fetchUrl) {
    try {
      var path = new URL(fetchUrl).pathname.toLowerCase();
      return (
        path.endsWith('/products.json') ||
        path.indexOf('/search-updategrid') !== -1 ||
        path.indexOf('/search-show') !== -1
      );
    } catch (e) {
      return false;
    }
  }

  function getShopDomainAliases(domain) {
    var host = normalizeHost(domain);
    if (!host) {
      return [];
    }
    var aliases = [host];
    if (host.indexOf('www.') === 0) {
      aliases.push(host.slice(4));
    } else {
      aliases.push('www.' + host);
    }
    var seen = {};
    return aliases.filter(function (item) {
      if (seen[item]) {
        return false;
      }
      seen[item] = true;
      return true;
    });
  }

  /**
   * 当前 URL 及 www/裸域 等价的 origin 模式（一次授权覆盖常见跳转）
   * @param {string} url
   * @returns {string[]}
   */
  function getOriginPatternsForUrl(url) {
    if (!isAnalyzableStoreUrl(url)) {
      return [];
    }
    var parsed = new URL(url);
    var patterns = [originPatternFromUrl(url)];
    getShopDomainAliases(parsed.hostname).forEach(function (host) {
      patterns.push('https://' + host + '/*');
    });
    var seen = {};
    return patterns.filter(function (pattern) {
      if (seen[pattern]) {
        return false;
      }
      seen[pattern] = true;
      return true;
    });
  }

  /**
   * @param {string} domain
   * @returns {Promise<boolean>}
   */
  function hasHostPermissionForDomain(domain) {
    var aliases = getShopDomainAliases(domain);
    if (!aliases.length) {
      return Promise.resolve(false);
    }
    return hasHostPermissionForAnyHost(aliases);
  }

  /**
   * 一次申请当前站及 www/裸域 alias（减少同一店铺重复授权）
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  function requestHostPermissionForUrlAndAliases(url) {
    if (!chrome.permissions || !chrome.permissions.request) {
      return Promise.resolve(false);
    }
    if (!isAnalyzableStoreUrl(url)) {
      return Promise.resolve(false);
    }
    if (isMyshopifyHost(new URL(url).hostname)) {
      return Promise.resolve(true);
    }
    var patterns = getOriginPatternsForUrl(url);
    if (!patterns.length) {
      return Promise.resolve(false);
    }
    return chrome.permissions.request({ origins: patterns }).catch(function (err) {
      var msg = String(err && err.message ? err.message : err);
      if (msg.indexOf('user gesture') !== -1) {
        return false;
      }
      return false;
    });
  }

  /**
   * 扩展上下文 fetch 是否允许访问该 URL（精确到 origin，避免 www/裸域混用触发 CORS）
   * @param {string} fetchUrl
   * @returns {Promise<boolean>}
   */
  function hasHostPermissionForFetchUrl(fetchUrl) {
    if (!fetchUrl) {
      return Promise.resolve(false);
    }
    try {
      var parsed = new URL(fetchUrl);
      if (parsed.protocol !== 'https:') {
        return Promise.resolve(false);
      }
      return hasHostPermissionForUrl(parsed.origin + '/');
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  return {
    isAnalyzableStoreUrl: isAnalyzableStoreUrl,
    isMyshopifyHost: isMyshopifyHost,
    isPublicCatalogFetchUrl: isPublicCatalogFetchUrl,
    hasHostPermissionForUrl: hasHostPermissionForUrl,
    hasHostPermissionForFetchUrl: hasHostPermissionForFetchUrl,
    hasHostPermissionForDomain: hasHostPermissionForDomain,
    hasHostPermissionForAnyHost: hasHostPermissionForAnyHost,
    getShopDomainAliases: getShopDomainAliases,
    getOriginPatternsForUrl: getOriginPatternsForUrl,
    containsAnyBroadHostPermission: containsAnyBroadHostPermission,
    requestHostPermissionForUrl: requestHostPermissionForUrl,
    requestHostPermissionForUrlAndAliases: requestHostPermissionForUrlAndAliases,
    originPatternFromUrl: originPatternFromUrl,
  };
})();
