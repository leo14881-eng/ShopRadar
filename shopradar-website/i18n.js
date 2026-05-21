/**
 * ShopRadar 官网 i18n 引擎
 * - navigator.language 自动识别
 * - localStorage 手动切换持久化
 * - data-i18n / data-i18n-html 动态渲染
 * - ar 自动 RTL
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'shopradar_locale';
  var SUPPORTED = [
    'en',
    'zh',
    'zh_TW',
    'ar',
    'de',
    'fr',
    'es',
    'ja',
    'ko',
    'pt_BR',
  ];
  var DEFAULT_LOCALE = 'en';

  function getNested(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function mergeLegalLocales() {
    var legal = global.SHOPRADAR_LEGAL_LOCALES;
    var base = global.SHOPRADAR_LOCALES;
    if (!legal || !base) {
      return;
    }
    Object.keys(base).forEach(function (code) {
      if (legal[code] && legal[code].legal) {
        base[code].legal = legal[code].legal;
      }
    });
  }

  function detectLocale() {
    try {
      var qp = new URLSearchParams(window.location.search);
      var fromQuery = qp.get('lang');
      if (fromQuery && SUPPORTED.indexOf(fromQuery) !== -1) {
        return fromQuery;
      }
    } catch (e) {}

    var saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (e) {}
    if (saved && SUPPORTED.indexOf(saved) !== -1) {
      return saved;
    }

    var raw = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    if (raw.indexOf('zh-tw') === 0 || raw.indexOf('zh-hk') === 0 || raw.indexOf('zh-hant') === 0) {
      return 'zh_TW';
    }
    if (raw.indexOf('zh') === 0) return 'zh';
    if (raw.indexOf('pt') === 0) return 'pt_BR';
    if (raw.indexOf('es') === 0) return 'es';
    if (raw.indexOf('ja') === 0) return 'ja';
    if (raw.indexOf('ko') === 0) return 'ko';
    if (raw.indexOf('ar') === 0) return 'ar';
    if (raw.indexOf('de') === 0) return 'de';
    if (raw.indexOf('fr') === 0) return 'fr';
    return DEFAULT_LOCALE;
  }

  function getPack(code) {
    var locales = global.SHOPRADAR_LOCALES || {};
    return locales[code] || locales[DEFAULT_LOCALE] || {};
  }

  mergeLegalLocales();
  var currentLocale = detectLocale();

  function t(key) {
    var val = getNested(getPack(currentLocale), key);
    if (val == null) {
      val = getNested(getPack(DEFAULT_LOCALE), key);
    }
    return val != null ? String(val) : key;
  }

  function applyDom() {
    var pack = getPack(currentLocale);
    var dir = pack.dir || 'ltr';
    var htmlLang = pack.htmlLang || currentLocale;

    document.documentElement.lang = htmlLang;
    document.documentElement.dir = dir;
    document.body.classList.toggle('rtl', dir === 'rtl');

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (val !== key) el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var val = t(key);
      if (val !== key) el.innerHTML = val;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var val = t(key);
      if (val !== key) el.setAttribute('placeholder', val);
    });

    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var val = t(key);
      if (val !== key) el.setAttribute('title', val);
    });

    var titleKeyEl = document.querySelector('title[data-i18n]');
    if (titleKeyEl) {
      document.title = t(titleKeyEl.getAttribute('data-i18n'));
    } else if (getNested(pack, 'meta.title')) {
      document.title = t('meta.title');
    }

    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', t('meta.description'));
    }

    var selector = document.getElementById('sr-lang-select');
    if (selector && selector.value !== currentLocale) {
      selector.value = currentLocale;
    }
  }

  function setLocale(code) {
    if (SUPPORTED.indexOf(code) === -1) code = DEFAULT_LOCALE;
    currentLocale = code;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch (e) {}
    applyDom();
    if (typeof global.onShopRadarLocaleChange === 'function') {
      global.onShopRadarLocaleChange(code);
    }
    document.dispatchEvent(
      new CustomEvent('shopradar:locale', { detail: { locale: code } })
    );
  }

  function buildSelector(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var wrap = document.createElement('div');
    wrap.className = 'relative inline-flex items-center';

    var select = document.createElement('select');
    select.id = 'sr-lang-select';
    select.className =
      'appearance-none bg-slate-800/80 border border-slate-600/60 text-slate-200 text-xs rounded-lg pl-2.5 pr-7 py-1.5 cursor-pointer hover:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-colors';
    select.setAttribute('aria-label', 'Language');

    SUPPORTED.forEach(function (code) {
      var pack = getPack(code);
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = pack.label || code.toUpperCase();
      select.appendChild(opt);
    });

    select.value = currentLocale;
    select.addEventListener('change', function () {
      setLocale(select.value);
    });

    var chevron = document.createElement('span');
    chevron.className =
      'pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]';
    chevron.textContent = '▾';

    wrap.appendChild(select);
    wrap.appendChild(chevron);
    container.appendChild(wrap);
  }

  function getAcceptLanguage() {
    var pack = getPack(currentLocale);
    return pack.htmlLang || currentLocale;
  }

  function formatUtcLocal(iso, options) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var opts = options || {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    };
    try {
      return new Intl.DateTimeFormat(getAcceptLanguage(), opts).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function init() {
    buildSelector('sr-lang-selector');
    applyDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ShopRadarI18n = {
    getLocale: function () {
      return currentLocale;
    },
    setLocale: setLocale,
    t: t,
    applyDom: applyDom,
    getAcceptLanguage: getAcceptLanguage,
    formatUtcLocal: formatUtcLocal,
    supported: SUPPORTED.slice(),
  };
})(typeof window !== 'undefined' ? window : global);
