/**
 * ShopRadar 官网环境配置
 *
 * - 生产（shopradar.uk）：apiBase → https://api.shopradar.uk
 * - 本地（localhost / 127.0.0.1）：apiBase → http://localhost:3000
 * - 可选：复制 website-config.dev.example.js 为 website-config.local.js 覆盖端口等
 */
(function () {
  'use strict';

  var LEMON_CHECKOUT =
    'https://shopradar.lemonsqueezy.com/checkout/buy/9a42e638-77ac-440c-ad73-82177b031a90';
  var CHROME_STORE =
    'https://chromewebstore.google.com/detail/shopradar/PLACEHOLDER';

  /** 线上环境（部署到 shopradar.uk 时使用） */
  var PRODUCTION = {
    env: 'production',
    apiBase: 'https://api.shopradar.uk',
    websiteUrl: 'https://shopradar.uk',
    lemonCheckoutUrl: LEMON_CHECKOUT,
    chromeStoreUrl: CHROME_STORE,
    paymentSuccessPath: '/success.html',
  };

  function isLocalDevHost() {
    if (typeof location === 'undefined' || !location.hostname) {
      return false;
    }
    var host = String(location.hostname).toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    );
  }

  /** 本地开发（IDE 静态服务、npm serve 等） */
  function buildLocalConfig() {
    var origin =
      typeof location !== 'undefined' && location.origin
        ? location.origin
        : 'http://localhost:8080';
    return {
      env: 'development',
      apiBase: 'http://localhost:3000',
      websiteUrl: origin,
      lemonCheckoutUrl: LEMON_CHECKOUT,
      chromeStoreUrl: CHROME_STORE,
      paymentSuccessPath: '/success.html',
    };
  }

  window.SHOPRADAR_WEBSITE_CONFIG = isLocalDevHost()
    ? buildLocalConfig()
    : PRODUCTION;
})();
