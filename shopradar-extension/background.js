/* ShopRadar background.js — 自动生成，请勿手改。修改源文件后运行: npm run build:sw */

/* ----- extension-config.js ----- */
/**
 * ShopRadar 扩展发布配置（打包进 Chrome 商店）
 * 本地调试可复制 extension-config.dev.example.js 为 extension-config.local.js 并改 popup.html 引入
 */
var SHOPRADAR_EXTENSION_CONFIG = {
  apiBase: 'https://api.shopradar.uk',
  websiteUrl: 'https://shopradar.uk',
  debug: false,
};

/* ----- local-dev-config.js ----- */
'use strict';
/** 本地 API — npm run dev:prod 可恢复线上 */
(function shopRadarLocalDevConfig(global) {
  if (!global) {
    return;
  }
  global.__SHOPRADAR_LOCAL_DEV__ = true;
  global.SHOPRADAR_EXTENSION_CONFIG = {
    apiBase: 'http://localhost:3000',
    websiteUrl: 'http://localhost:8080',
    debug: true,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);

/* ----- extension-guard.js ----- */
/**
 * ShopRadar — 全局错误静默与 MV3 消息闭环（popup / SW / content script 共用）
 * 须紧随 extension-config.js 之后作为首个守卫脚本加载。
 */
(function shopRadarInstallImmediateGlobalSilencers() {
  'use strict';

  if (typeof globalThis !== 'undefined' && globalThis.__SHOPRADAR_SILENCERS__) {
    return;
  }

  function isProductionSilent() {
    try {
      return !(
        typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
        SHOPRADAR_EXTENSION_CONFIG &&
        SHOPRADAR_EXTENSION_CONFIG.debug
      );
    } catch (cfgErr) {
      return true;
    }
  }

  function attachImmediateSilencers(target) {
    if (!target || target.__shopradarImmediateSilencer__) {
      return;
    }
    target.__shopradarImmediateSilencer__ = true;

    var previousOnerror = target.onerror;
    target.onerror = function (message, source, lineno, colno, error) {
      if (isProductionSilent()) {
        return true;
      }
      if (typeof previousOnerror === 'function') {
        return previousOnerror.call(
          target,
          message,
          source,
          lineno,
          colno,
          error
        );
      }
      return false;
    };

    if (typeof target.addEventListener === 'function') {
      target.addEventListener('unhandledrejection', function (event) {
        if (isProductionSilent()) {
          event.preventDefault();
          return;
        }
        var reason = event.reason;
        var msg = String(reason && reason.message ? reason.message : reason);
        if (
          msg.indexOf('Extension context invalidated') !== -1 ||
          msg.indexOf('Could not establish connection') !== -1 ||
          msg.indexOf('Receiving end does not exist') !== -1 ||
          msg.indexOf('message port closed') !== -1 ||
          msg.indexOf('The message port closed') !== -1
        ) {
          event.preventDefault();
        }
      });
    }
  }

  var root =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof self !== 'undefined'
        ? self
        : typeof window !== 'undefined'
          ? window
          : null;

  if (root) {
    attachImmediateSilencers(root);
  }
  if (typeof window !== 'undefined' && window !== root) {
    attachImmediateSilencers(window);
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__SHOPRADAR_SILENCERS__ = true;
  }
})();

var ShopRadarGuard = (function () {
  'use strict';

  var installedTargets = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var installedFlag = false;

  /** MV3 异步消息默认 ACK — 所有分支必须 sendResponse，至少返回此对象 */
  var MESSAGE_ACK = { status: 'ok' };

  function isDebugMode() {
    try {
      return Boolean(
        typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
          SHOPRADAR_EXTENSION_CONFIG &&
          SHOPRADAR_EXTENSION_CONFIG.debug
      );
    } catch (cfgErr) {
      return false;
    }
  }

  function shouldSilenceToChrome() {
    return !isDebugMode();
  }

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
      msg.indexOf('Could not establish connection') !== -1 ||
      msg.indexOf('Receiving end does not exist') !== -1 ||
      msg.indexOf('message port closed') !== -1 ||
      msg.indexOf('The message port closed') !== -1
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
      msg.indexOf('HTTP 5') !== -1 ||
      msg.indexOf('user gesture') !== -1 ||
      msg.indexOf('Side panel') !== -1 ||
      msg.indexOf('side panel') !== -1 ||
      msg.indexOf('SidePanel') !== -1 ||
      msg.indexOf('未获取到') !== -1 ||
      msg.indexOf('无法获取商品') !== -1 ||
      msg.indexOf('无法访问当前标签页') !== -1
    );
  }

  function debugRuntimeNoise(label, err) {
    if (isDebugMode()) {
      console.warn(label, err);
    }
  }

  function normalizeError(err) {
    if (err instanceof Error) {
      return err;
    }
    return new Error(String(err == null ? 'unknown' : err));
  }

  function markInstalled(target) {
    if (!target) {
      return;
    }
    if (installedTargets) {
      installedTargets.add(target);
    }
  }

  function isInstalled(target) {
    if (!target) {
      return installedFlag;
    }
    if (installedTargets) {
      return installedTargets.has(target);
    }
    return installedFlag;
  }

  function installGlobalSilencers(target) {
    var root =
      target ||
      (typeof globalThis !== 'undefined'
        ? globalThis
        : typeof self !== 'undefined'
          ? self
          : typeof window !== 'undefined'
            ? window
            : null);

    if (!root || isInstalled(root)) {
      return;
    }
    markInstalled(root);
    installedFlag = true;

    var previousOnerror = root.onerror;
    root.onerror = function (message, source, lineno, colno, error) {
      if (shouldSilenceToChrome()) {
        debugRuntimeNoise('[ShopRadar] onerror:', error || message);
        return true;
      }
      if (isBenignRuntimeError(error || message)) {
        debugRuntimeNoise('[ShopRadar] benign onerror:', error || message);
        return true;
      }
      if (typeof previousOnerror === 'function') {
        return previousOnerror.call(
          root,
          message,
          source,
          lineno,
          colno,
          error
        );
      }
      return false;
    };

    if (typeof root.addEventListener === 'function') {
      root.addEventListener('unhandledrejection', function (event) {
        if (shouldSilenceToChrome()) {
          event.preventDefault();
          debugRuntimeNoise('[ShopRadar] unhandledrejection:', event.reason);
          return;
        }
        if (isBenignRuntimeError(event.reason)) {
          event.preventDefault();
          debugRuntimeNoise('[ShopRadar] benign rejection:', event.reason);
        }
      });

      root.addEventListener('error', function (event) {
        var err = event.error || event.message;
        if (shouldSilenceToChrome() || isBenignRuntimeError(err)) {
          event.preventDefault();
          debugRuntimeNoise('[ShopRadar] error event:', err);
        }
      });
    }
  }

  function installServiceWorkerGuards() {
    installGlobalSilencers(typeof self !== 'undefined' ? self : null);
  }

  function installWindowGuards() {
    installGlobalSilencers(typeof window !== 'undefined' ? window : null);
  }

  function installAllGuards() {
    installGlobalSilencers(
      typeof globalThis !== 'undefined' ? globalThis : null
    );
    if (typeof window !== 'undefined') {
      installGlobalSilencers(window);
    }
    if (typeof self !== 'undefined' && typeof window === 'undefined') {
      installServiceWorkerGuards();
    }
  }

  /**
   * 读取 chrome.runtime.lastError — 必须读取才能避免 chrome://extensions 红标
   * @returns {chrome.runtime.LastError|null}
   */
  function consumeLastError() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        return null;
      }
      var error = chrome.runtime.lastError;
      if (error && error.message) {
        console.log('Ignored extension runtime error:', error.message);
      }
      return error || null;
    } catch (readErr) {
      return null;
    }
  }

  function hasRuntimeContext() {
    try {
      return Boolean(
        typeof chrome !== 'undefined' &&
          chrome.runtime &&
          chrome.runtime.id
      );
    } catch (ctxErr) {
      return false;
    }
  }

  function safeSendResponse(sendResponse, payload) {
    if (typeof sendResponse !== 'function') {
      return;
    }
    try {
      sendResponse(payload != null ? payload : MESSAGE_ACK);
    } catch (sendErr) {
      consumeLastError();
      if (!isBenignRuntimeError(sendErr)) {
        debugRuntimeNoise('[ShopRadar] sendResponse 失败:', sendErr);
      }
    }
  }

  /**
   * @param {object} message
   * @param {{ defaultResponse?: *, timeoutMs?: number }} [options]
   * @returns {Promise<*>}
   */
  function safeSendMessage(message, options) {
    var opts = options || {};
    var timeoutMs =
      typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0
        ? opts.timeoutMs
        : 0;

    return new Promise(function (resolve) {
      if (!hasRuntimeContext() || !chrome.runtime.sendMessage) {
        resolve(opts.defaultResponse);
        return;
      }

      var settled = false;
      function finish(value) {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      }

      var timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(function () {
          finish(opts.defaultResponse);
        }, timeoutMs);
      }

      try {
        chrome.runtime.sendMessage(message, function (response) {
          if (timer) {
            clearTimeout(timer);
          }
          var lastError = consumeLastError();
          if (lastError) {
            finish(opts.defaultResponse);
            return;
          }
          finish(response);
        });
      } catch (sendErr) {
        if (timer) {
          clearTimeout(timer);
        }
        consumeLastError();
        if (!isBenignRuntimeError(sendErr)) {
          debugRuntimeNoise('[ShopRadar] runtime.sendMessage 异常:', sendErr);
        }
        finish(opts.defaultResponse);
      }
    });
  }

  /**
   * 单向发送（不等待响应），仍消费 lastError
   * @param {object} message
   */
  function safeSendMessageNoWait(message) {
    if (!hasRuntimeContext() || !chrome.runtime.sendMessage) {
      return;
    }
    try {
      chrome.runtime.sendMessage(message, function () {
        consumeLastError();
      });
    } catch (sendErr) {
      consumeLastError();
      if (!isBenignRuntimeError(sendErr)) {
        debugRuntimeNoise('[ShopRadar] runtime.sendMessage 异常:', sendErr);
      }
    }
  }

  /**
   * @param {number} tabId
   * @param {object} message
   * @param {{ defaultResponse?: * }} [options]
   * @returns {Promise<*>}
   */
  function safeTabsSendMessage(tabId, message, options) {
    var opts = options || {};

    return new Promise(function (resolve) {
      if (
        tabId == null ||
        typeof chrome === 'undefined' ||
        !chrome.tabs ||
        !chrome.tabs.sendMessage
      ) {
        resolve(opts.defaultResponse);
        return;
      }

      try {
        chrome.tabs.sendMessage(tabId, message, function (response) {
          var lastError = consumeLastError();
          if (lastError) {
            resolve(opts.defaultResponse);
            return;
          }
          resolve(response);
        });
      } catch (sendErr) {
        consumeLastError();
        if (!isBenignRuntimeError(sendErr)) {
          debugRuntimeNoise('[ShopRadar] tabs.sendMessage 异常:', sendErr);
        }
        resolve(opts.defaultResponse);
      }
    });
  }

  /**
   * MV3 同步闭环包装：
   * - 传入 guarded sendResponse，防止重复响应
   * - handler 返回 Promise 或 true → 保持通道（return true）
   * - 同步路径未响应 → 自动 sendResponse({ status: 'ok' })
   * @param {function(object, chrome.runtime.MessageSender, function): *} handler
   * @returns {function(object, chrome.runtime.MessageSender, function): boolean}
   */
  function wrapMessageListener(handler) {
    return function wrappedListener(message, sender, sendResponse) {
      var responded = false;

      function guardedSendResponse(payload) {
        if (responded) {
          return;
        }
        responded = true;
        safeSendResponse(sendResponse, payload);
      }

      try {
        var result = handler(message, sender, guardedSendResponse);

        if (result === true) {
          return true;
        }

        if (result && typeof result.then === 'function') {
          result
            .then(function (payload) {
              if (!responded) {
                guardedSendResponse(
                  payload !== undefined ? payload : MESSAGE_ACK
                );
              }
            })
            .catch(function (handlerErr) {
              consumeLastError();
              if (!isBenignRuntimeError(handlerErr)) {
                debugRuntimeNoise(
                  '[ShopRadar] onMessage async 失败:',
                  handlerErr
                );
              }
              if (!responded) {
                guardedSendResponse(MESSAGE_ACK);
              }
            });
          return true;
        }

        if (!responded) {
          guardedSendResponse(
            result !== undefined ? result : MESSAGE_ACK
          );
        }
        return false;
      } catch (handlerErr) {
        consumeLastError();
        if (!isBenignRuntimeError(handlerErr)) {
          debugRuntimeNoise('[ShopRadar] onMessage 失败:', handlerErr);
        }
        if (!responded) {
          guardedSendResponse(MESSAGE_ACK);
        }
        return false;
      }
    };
  }

  /**
   * @template T
   * @param {function(): Promise<T>|T} fn
   * @param {{ fallback?: T, label?: string }} [options]
   * @returns {Promise<T|undefined>}
   */
  function runSafelyAsync(fn, options) {
    var opts = options || {};
    try {
      var result = fn();
      if (result && typeof result.then === 'function') {
        return result.catch(function (asyncErr) {
          consumeLastError();
          if (!isBenignRuntimeError(asyncErr)) {
            debugRuntimeNoise(opts.label || '[ShopRadar] async 失败:', asyncErr);
          }
          return opts.fallback;
        });
      }
      return Promise.resolve(result);
    } catch (syncErr) {
      consumeLastError();
      if (!isBenignRuntimeError(syncErr)) {
        debugRuntimeNoise(opts.label || '[ShopRadar] sync 失败:', syncErr);
      }
      return Promise.resolve(opts.fallback);
    }
  }

  return {
    MESSAGE_ACK: MESSAGE_ACK,
    isRestrictedUrl: isRestrictedUrl,
    isBenignInjectError: isBenignInjectError,
    isBenignRuntimeError: isBenignRuntimeError,
    isDebugMode: isDebugMode,
    hasRuntimeContext: hasRuntimeContext,
    consumeLastError: consumeLastError,
    installGlobalSilencers: installGlobalSilencers,
    installServiceWorkerGuards: installServiceWorkerGuards,
    installWindowGuards: installWindowGuards,
    installAllGuards: installAllGuards,
    safeSendResponse: safeSendResponse,
    safeSendMessage: safeSendMessage,
    safeSendMessageNoWait: safeSendMessageNoWait,
    safeTabsSendMessage: safeTabsSendMessage,
    wrapMessageListener: wrapMessageListener,
    runSafelyAsync: runSafelyAsync,
    debugRuntimeNoise: debugRuntimeNoise,
    normalizeError: normalizeError,
  };
})();

(function shopRadarAutoInstallGuards() {
  if (typeof ShopRadarGuard === 'undefined' || !ShopRadarGuard.installAllGuards) {
    return;
  }
  ShopRadarGuard.installAllGuards();
})();

/* ----- shop-permissions.js ----- */
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
        handle: product.handle || '',
        productId: product.id != null ? product.id : null,
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
   * 与 cleanProducts 相同规则：按 published_at / created_at 降序
   * @param {object[]} rawProducts
   * @returns {object[]}
   */
  function sortRawProductsByDate(rawProducts) {
    return (rawProducts || []).slice().sort(function (a, b) {
      var timeA =
        new Date(a.published_at || a.created_at || 0).getTime() || 0;
      var timeB =
        new Date(b.published_at || b.created_at || 0).getTime() || 0;
      return timeB - timeA;
    });
  }

  /**
   * 在 raw 池中查找与 cleaned 行对应的商品（id → handle → title）
   * @param {object[]} pool
   * @param {object} used
   * @param {object} row
   * @returns {number}
   */
  function findRawIndexForCleanedRow(pool, used, row) {
    var i;
    if (row.productId != null) {
      for (i = 0; i < pool.length; i++) {
        if (used[i]) {
          continue;
        }
        if (pool[i].id === row.productId) {
          return i;
        }
      }
    }
    if (row.handle) {
      for (i = 0; i < pool.length; i++) {
        if (used[i]) {
          continue;
        }
        if (pool[i].handle === row.handle) {
          return i;
        }
      }
    }
    var title = row.title || '';
    for (i = 0; i < pool.length; i++) {
      if (used[i]) {
        continue;
      }
      if ((pool[i].title || '') === title) {
        return i;
      }
    }
    return -1;
  }

  /**
   * cleaned 行在 raw 中无匹配时，生成最小导出结构（至少保留 Title）
   * @param {object} row
   * @returns {object}
   */
  function buildFallbackRawFromCleaned(row) {
    return {
      title: row.title || '',
      handle: row.handle || '',
      id: row.productId != null ? row.productId : undefined,
      published_at: row.createdAtRaw || '',
      created_at: row.createdAtRaw || '',
      images:
        row.image && String(row.image).indexOf('data:image') !== 0
          ? [{ src: row.image }]
          : [],
      variants: [{ sku: '', price: '' }],
    };
  }

  /**
   * 使导出用 raw 与侧边栏展示顺序、条目一致（按 cleaned 对齐）
   * @param {object[]} rawProducts
   * @param {object[]} cleanedProducts
   * @returns {object[]}
   */
  function alignRawToCleaned(rawProducts, cleanedProducts) {
    if (!Array.isArray(cleanedProducts) || !cleanedProducts.length) {
      if (!Array.isArray(rawProducts) || !rawProducts.length) {
        return [];
      }
      return sortRawProductsByDate(rawProducts);
    }
    if (!Array.isArray(rawProducts) || !rawProducts.length) {
      return cleanedProducts.map(buildFallbackRawFromCleaned);
    }

    var pool = rawProducts.slice();
    var used = {};
    var ordered = [];

    cleanedProducts.forEach(function (row) {
      var idx = findRawIndexForCleanedRow(pool, used, row);
      if (idx >= 0) {
        used[idx] = true;
        ordered.push(pool[idx]);
      } else {
        ordered.push(buildFallbackRawFromCleaned(row));
      }
    });

    for (var j = 0; j < pool.length; j++) {
      if (!used[j]) {
        ordered.push(pool[j]);
      }
    }

    return ordered;
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
    sortRawProductsByDate: sortRawProductsByDate,
    alignRawToCleaned: alignRawToCleaned,
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

/* ----- product-ingest.js ----- */
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

  var STORAGE_DEVICE_ID_KEY = 'sr_device_id';
  var INGEST_PATH = '/api/ingest/products';
  var MAX_PRODUCTS = 50;

  function getApiBase() {
    if (
      typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
      SHOPRADAR_EXTENSION_CONFIG.apiBase
    ) {
      return String(SHOPRADAR_EXTENSION_CONFIG.apiBase).replace(/\/$/, '');
    }
    return 'https://api.shopradar.uk';
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
    if (!chrome.storage || !chrome.storage.local) {
      return '';
    }
    try {
      var stored = await chrome.storage.local.get(STORAGE_DEVICE_ID_KEY);
      return stored[STORAGE_DEVICE_ID_KEY]
        ? String(stored[STORAGE_DEVICE_ID_KEY])
        : '';
    } catch (err) {
      return '';
    }
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

/* ----- lemon-payment-return.js ----- */
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
      var isPro = Boolean(data && data.isPro);
      if (isPro && chrome.storage && chrome.storage.local) {
        try {
          await chrome.storage.local.set({ sr_is_pro: true });
        } catch (persistErr) {
          /* ignore */
        }
      }
      return isPro;
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

    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendMessageNoWait) {
      ShopRadarGuard.safeSendMessageNoWait({ type: 'SR_PRO_ACTIVATED' });
    } else if (
      typeof ShopRadarGuard !== 'undefined' &&
      ShopRadarGuard.safeSendMessage
    ) {
      ShopRadarGuard.safeSendMessage({ type: 'SR_PRO_ACTIVATED' });
    } else {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          return switched;
        }
        chrome.runtime.sendMessage({ type: 'SR_PRO_ACTIVATED' }, function () {
          try {
            if (chrome.runtime.lastError) {
              console.log(
                'Ignored extension runtime error:',
                chrome.runtime.lastError.message
              );
            }
          } catch (readErr) {
            /* ignore */
          }
        });
      } catch (msgErr) {
        /* popup 未打开 */
      }
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

/* ----- background-jobs.js ----- */
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
  chrome.tabs.get(tabId, function (tab) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
      ShopRadarGuard.consumeLastError();
    } else if (chrome.runtime.lastError) {
      /* consumed */
    }
    if (
      !tab ||
      !tab.url ||
      (typeof ShopRadarGuard !== 'undefined' &&
        ShopRadarGuard.isRestrictedUrl(tab.url))
    ) {
      return;
    }
    if (!isRetailShopTabUrl(tab.url)) {
      return;
    }
    chrome.sidePanel
      .setOptions({
        tabId: tabId,
        path: SIDE_PANEL_PATH,
        enabled: true,
      })
      .catch(function () {});
  });
}

var lastRetailTabId = null;

function isOwnAppHost(host) {
  var h = (host || '').toLowerCase();
  return (
    h === 'shopradar.uk' ||
    h.endsWith('.shopradar.uk') ||
    h === 'localhost' ||
    h === '127.0.0.1'
  );
}

function isRetailShopTabUrl(url) {
  if (!url) {
    return false;
  }
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isRestrictedUrl(url)) {
    return false;
  }
  try {
    var host = new URL(url).hostname.toLowerCase();
    if (isOwnAppHost(host)) {
      return false;
    }
    if (host === 'lemonsqueezy.com' || host.endsWith('.lemonsqueezy.com')) {
      return false;
    }
    if (
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com')
    ) {
      return false;
    }
  } catch (urlErr) {
    return false;
  }
  return true;
}

function rememberRetailTab(tabId, url) {
  if (tabId != null && isRetailShopTabUrl(url)) {
    lastRetailTabId = tabId;
  }
}

function resolveBestRetailTab(callback) {
  chrome.windows.getLastFocused({ populate: true }, function (win) {
    if (win && win.tabs) {
      for (var i = 0; i < win.tabs.length; i++) {
        var candidate = win.tabs[i];
        if (candidate.active && isRetailShopTabUrl(candidate.url)) {
          lastRetailTabId = candidate.id;
          callback(candidate);
          return;
        }
      }
    }

    if (lastRetailTabId == null) {
      callback(null);
      return;
    }

    chrome.tabs.get(lastRetailTabId, function (tab) {
      if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
        ShopRadarGuard.consumeLastError();
      } else if (chrome.runtime.lastError) {
        /* consumed */
      }
      if (!tab || !tab.url || !isRetailShopTabUrl(tab.url)) {
        callback(null);
        return;
      }
      callback(tab);
    });
  });
}

function ensureBackgroundJobsInstalled() {
  if (
    typeof ShopRadarBackgroundJobs !== 'undefined' &&
    ShopRadarBackgroundJobs.install
  ) {
    ShopRadarBackgroundJobs.install();
    return true;
  }
  console.warn('[ShopRadar] ShopRadarBackgroundJobs 未定义');
  return false;
}

function swSendResponse(sendResponse, payload) {
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendResponse) {
    ShopRadarGuard.safeSendResponse(sendResponse, payload);
    return;
  }
  try {
    sendResponse(payload);
  } catch (sendErr) {
    /* message port closed */
  }
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
  chrome.tabs.get(activeInfo.tabId, function (tab) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
      ShopRadarGuard.consumeLastError();
    } else if (chrome.runtime.lastError) {
      /* consumed */
    }
    rememberRetailTab(activeInfo.tabId, tab && tab.url);
  });
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (!tab || !tab.url) {
    return;
  }
  if (changeInfo.url || changeInfo.status === 'complete') {
    rememberRetailTab(tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener(
  typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.wrapMessageListener
    ? ShopRadarGuard.wrapMessageListener(handleRuntimeMessage)
    : handleRuntimeMessage
);

function handleRuntimeMessage(message, sender, sendResponse) {
  if (message && message.type === 'PING') {
    swSendResponse(sendResponse, {
      status: 'ok',
      ok: true,
      source: 'background',
    });
    return false;
  }

  if (message && message.type === 'SET_SHOP_CONTEXT_TAB') {
    var pinId = message.tabId;
    if (pinId == null) {
      swSendResponse(sendResponse, { status: 'ok', ok: false });
      return false;
    }
    chrome.tabs.get(pinId, function (tab) {
      if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
        ShopRadarGuard.consumeLastError();
      } else if (chrome.runtime.lastError) {
        /* consumed */
      }
      if (!tab || !tab.url || !isRetailShopTabUrl(tab.url)) {
        swSendResponse(sendResponse, { status: 'ok', ok: false });
        return;
      }
      lastRetailTabId = pinId;
      swSendResponse(sendResponse, {
        status: 'ok',
        ok: true,
        tabId: pinId,
        url: tab.url,
      });
    });
    return true;
  }

  if (message && message.type === 'GET_SHOP_CONTEXT_TAB') {
    resolveBestRetailTab(function (tab) {
      if (!tab) {
        swSendResponse(sendResponse, { status: 'ok', tabId: null });
        return;
      }
      swSendResponse(sendResponse, {
        status: 'ok',
        tabId: tab.id,
        url: tab.url,
      });
    });
    return true;
  }

  if (message && message.type === 'REFRESH_SHOP_TAB') {
    if (
      typeof ShopRadarBackgroundJobs === 'undefined' ||
      !ShopRadarBackgroundJobs.handleRefreshMessage
    ) {
      swSendResponse(sendResponse, {
        status: 'ok',
        ok: false,
        error: 'background_jobs_missing',
      });
      return false;
    }
    return ShopRadarBackgroundJobs.handleRefreshMessage(message, sendResponse);
  }

  if (message && message.type === 'PROBE_SHOPIFY_TAB') {
    if (
      typeof ShopRadarBackgroundJobs === 'undefined' ||
      !ShopRadarBackgroundJobs.handleProbeMessage
    ) {
      swSendResponse(sendResponse, {
        status: 'ok',
        isShopify: false,
        error: 'background_jobs_missing',
      });
      return false;
    }
    return ShopRadarBackgroundJobs.handleProbeMessage(message, sendResponse);
  }

  swSendResponse(sendResponse, { status: 'ok' });
  return false;
}
