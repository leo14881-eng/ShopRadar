'use strict';

/**
 * 扩展运行环境：自动选择 API / 官网地址
 *
 * - 开发者「加载已解压的扩展程序」→ 本地 http://localhost:3000
 * - Chrome Web Store 正式安装（含 update_url）→ 线上 https://api.shopradar.uk
 * - 官网 content script 在 localhost 打开 → 本地 API
 *
 * 商店打包使用 extension-env.production.js（见 scripts/package-chrome-store.js）
 */
(function shopRadarExtensionEnv(global) {
  if (!global) {
    return;
  }

  var PRODUCTION = {
    env: 'production',
    apiBase: 'https://api.shopradar.uk',
    websiteUrl: 'https://shopradar.uk',
    debug: false,
  };

  var DEVELOPMENT = {
    env: 'development',
    apiBase: 'http://localhost:3000',
    websiteUrl: 'http://localhost:8080',
    debug: true,
  };

  function isLocalWebsiteHost() {
    try {
      if (typeof location !== 'undefined' && location.hostname) {
        var host = String(location.hostname).toLowerCase();
        return (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '[::1]' ||
          host.endsWith('.localhost')
        );
      }
    } catch (hostErr) {
      return false;
    }
    return false;
  }

  function isUnpackedExtensionLoad() {
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.getManifest
      ) {
        var manifest = chrome.runtime.getManifest();
        if (manifest && manifest.shopradar_env === 'production') {
          return false;
        }
        // Web Store 安装后 Chrome 会注入 update_url；本地解压加载没有
        if (!manifest.update_url) {
          return true;
        }
      }
    } catch (manifestErr) {
      return false;
    }
    return false;
  }

  function resolveEnvMode() {
    var base =
      typeof global.SHOPRADAR_EXTENSION_CONFIG !== 'undefined'
        ? global.SHOPRADAR_EXTENSION_CONFIG
        : {};
    if (base.env === 'production') {
      return 'production';
    }
    if (base.env === 'development') {
      return 'development';
    }
    if (isUnpackedExtensionLoad() || isLocalWebsiteHost()) {
      return 'development';
    }
    return 'production';
  }

  var mode = resolveEnvMode();
  var resolved = Object.assign(
    {},
    mode === 'development' ? DEVELOPMENT : PRODUCTION
  );

  global.SHOPRADAR_EXTENSION_CONFIG = resolved;

  global.ShopRadarEnv = {
    getMode: function () {
      return mode;
    },
    isDevelopment: function () {
      return mode === 'development';
    },
    isProduction: function () {
      return mode === 'production';
    },
    getApiBase: function () {
      return String(resolved.apiBase || PRODUCTION.apiBase).replace(/\/$/, '');
    },
    getWebsiteUrl: function () {
      return String(resolved.websiteUrl || PRODUCTION.websiteUrl).replace(
        /\/$/,
        ''
      );
    },
    getConfig: function () {
      return Object.assign({}, resolved);
    },
  };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this
);
