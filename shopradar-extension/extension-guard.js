/**
 * ShopRadar — 全局错误静默与 MV3 消息闭环（popup / SW / content script 共用）
 * 须紧随 console-shield.js、extension-config.js 之后加载。
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
