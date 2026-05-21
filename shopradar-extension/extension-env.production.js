'use strict';

/** 商店发布包专用：固定线上环境，禁止自动切本地 */
(function shopRadarExtensionEnvProduction(global) {
  if (!global) {
    return;
  }

  var PRODUCTION = {
    env: 'production',
    apiBase: 'https://api.shopradar.uk',
    websiteUrl: 'https://shopradar.uk',
    debug: false,
  };

  global.SHOPRADAR_EXTENSION_CONFIG = Object.assign({}, PRODUCTION);

  global.ShopRadarEnv = {
    getMode: function () {
      return 'production';
    },
    isDevelopment: function () {
      return false;
    },
    isProduction: function () {
      return true;
    },
    getApiBase: function () {
      return PRODUCTION.apiBase;
    },
    getWebsiteUrl: function () {
      return PRODUCTION.websiteUrl;
    },
    getConfig: function () {
      return Object.assign({}, PRODUCTION);
    },
  };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this
);
