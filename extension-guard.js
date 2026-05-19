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
