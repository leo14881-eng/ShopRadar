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
