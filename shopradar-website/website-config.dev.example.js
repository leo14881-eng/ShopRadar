/**
 * 可选本地覆盖（复制为 website-config.local.js，已在 .gitignore）
 *
 * website-config.js 在 localhost 已自动指向 http://localhost:3000；
 * 仅当 API 端口或地址不同时，再取消下行注释并改 index.html / success.html 引入本文件。
 */
(function () {
  if (!window.SHOPRADAR_WEBSITE_CONFIG) {
    return;
  }
  Object.assign(window.SHOPRADAR_WEBSITE_CONFIG, {
    // apiBase: 'http://localhost:3000',
    // websiteUrl: 'http://localhost:63342',
  });
})();
