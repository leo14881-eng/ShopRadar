/**
 * ShopRadar — 各上下文第一个加载：生产环境废掉 console.error，避免 chrome://extensions 红标
 */
(function shopRadarConsoleShield() {
  'use strict';

  if (typeof globalThis !== 'undefined' && globalThis.__SHOPRADAR_CONSOLE_SHIELD__) {
    return;
  }

  // 强行拦截并降级所有的 console.error，将其转化为普通的 log 打印
  if (typeof console !== 'undefined' && console.error) {
    console.error = function () {
      var args = Array.prototype.slice.call(arguments);
      console.log.apply(console, ['[Shielded Error]:'].concat(args));
    };
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__SHOPRADAR_CONSOLE_SHIELD__ = true;
  }
})();
