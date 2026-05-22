/**
 * ShopRadar — Popup 控制器
 * 模块一：Shopify / SFCC 店铺环境识别
 * 模块二：公开 products.json 读取、清洗与列表渲染（用户打开侧边栏时触发）
 */

const stateLoading = document.getElementById('stateLoading');
const stateSuccess = document.getElementById('stateSuccess');
const stateFail = document.getElementById('stateFail');
const shopDomainEl = document.getElementById('shopDomain');
const statusIndicator = document.getElementById('statusIndicator');
const mainContent = document.getElementById('mainContent');
const productsLoading = document.getElementById('productsLoading');
const productsEmpty = document.getElementById('productsEmpty');
const productListEl = document.getElementById('product-list');
const exportBtn = document.getElementById('export-btn');
const exportFooterEl = document.getElementById('export-footer');
const loadingTextEl = document.getElementById('loadingText');
const successEmojiEl = document.getElementById('successEmoji');
const successTitleEl = document.getElementById('successTitle');
const productsSectionTitleEl = document.getElementById('productsSectionTitle');
const productsLoadingTextEl = document.getElementById('productsLoadingText');
const failEmojiEl = document.getElementById('failEmoji');
const failTitleEl = document.getElementById('failTitle');
const grantAccessBtnEl = document.getElementById('grant-access-btn');
const proMaskEl = document.getElementById('pro-mask');
const limitOverlayTitleEl = document.getElementById('limitOverlayTitle');
const limitOverlayDescEl = document.getElementById('limitOverlayDesc');
const refreshProBtn = document.getElementById('refresh-pro-btn');
const unlockProBtn = document.getElementById('unlock-pro-btn');
const claimProEmailEl = document.getElementById('claim-pro-email');
const claimProBtn = document.getElementById('claim-pro-btn');
const claimProMsgEl = document.getElementById('claim-pro-msg');
const deviceIdBarEl = document.getElementById('device-id-bar');
const proStatusTextEl = document.getElementById('pro-status-text');
const idleHeroEl = document.getElementById('idleHero');
const idleHeroTitleEl = document.getElementById('idleHeroTitle');
const idleHeroDescEl = document.getElementById('idleHeroDesc');
const idleHeroDomainEl = document.getElementById('idleHeroDomain');
const apiEnvBarEl = document.getElementById('api-env-bar');
const deviceIdTextEl = document.getElementById('deviceIdText');

const panels = [stateLoading, stateSuccess, stateFail];

/**
 * UI 文案：跟随 Chrome 界面语言（_locales + chrome.i18n）
 * 切换语言：chrome://settings/languages → 重启浏览器或重载扩展
 */
const UI_TEXT_FALLBACK = {
  statusDetecting: 'Detecting',
  statusShopify: 'Shopify store',
  statusSfcc: 'SFCC store',
  statusNotShopify: 'Waiting for store tab',
  statusIdleReady: 'Ready',
  loading: 'Detecting store type…',
  successTitle: 'Shopify store detected!',
  successTitleSfcc: 'SFCC store detected!',
  successEmoji: '\uD83C\uDF89',
  successEmojiSfcc: '\u2705',
  productsTitle: 'Latest products · up to 50',
  productsTitleSfcc: 'SFCC product list',
  productsLoading: 'Loading products…',
  productsEmpty: 'No products listed in this store \uD83D\uDCE6',
  productsFetchFailed:
    'Could not load products. Grant site access or refresh the page and try again.',
  failTitle: 'Not a Shopify site',
  failTitleSfcc: 'Not Shopify (SFCC detected)',
  failEmoji: '\u274C',
  needSitePermission:
    'Site access is required. Click the button below or set site access to “On all sites” in extension settings.',
  grantSiteAccess: 'Allow access to this site',
  extensionReloadHint:
    'Extension updated. Close this panel, reload ShopRadar at chrome://extensions, then open it again.',
  limitTitle: 'Daily free quota used',
  limitDescDefault: 'Upgrade to Pro for unlimited scans and CSV export.',
  proSyncHint:
    'After payment, tap “Refresh Pro status”. Reinstalled? Restore Pro with your checkout email below.',
  unlockPro: 'Unlock Pro',
  refreshProStatus: 'Refresh Pro status',
  refreshProStatusWorking: 'Confirming…',
  claimProLabel: 'Already paid? Restore Pro with checkout email',
  claimProPlaceholder: 'Checkout email',
  claimProBtn: 'Restore Pro by email',
  claimProWorking: 'Verifying…',
  claimProSuccess: 'Pro restored!',
  claimProEmptyEmail: 'Please enter your checkout email',
  claimProNetworkError: 'Network error. Please try again.',
  paymentPendingHint:
    'If you just paid, wait 1–2 minutes then tap “Refresh Pro status”.',
  authServerOffline:
    'Cannot reach auth server. Start shopradar-server locally, then reload this panel.',
  proReadySwitchShop: 'Pro active',
  proStatusActive: 'Pro active',
  proStatusInactive: 'Free plan',
  idleHeroTitleReady: 'Ready',
  idleHeroTitleNotShopify: 'Not a Shopify / SFCC page',
  idleHeroTitleNotShopifySfcc: 'SFCC detected — open a store page',
  idleHeroTitlePermission: 'Site access required',
  idleHeroTitleReload: 'Reload the extension',
  idleHeroDescPro:
    'Open any Shopify / SFCC store to browse products and export to Excel.',
  idleHeroDescFree:
    'Open a Shopify / SFCC store to scan products. Pro unlocks unlimited scans and Excel export.',
  idleHeroDescNotShopify:
    'This page cannot be analyzed. Switch to a Shopify or SFCC store tab.',
  idleHeroDescPermission:
    'Tap the button below or set site access to “On all sites” in extension settings.',
  idleHeroDescReload:
    'Extension updated. Close the panel, reload at chrome://extensions, then reopen.',
  paymentConfirming: 'Confirming payment…',
  paymentPendingSwitchShop:
    'Complete payment on Lemon. You will return here when successful.',
  exportBtnLabel: 'Export to Excel (Pro)',
  exportBtnSuccess: 'Exported! ✅',
  accountProLabel: 'Pro status',
  accountDeviceLabel: 'Device ID',
  copyDeviceHint: 'Tap to copy',
  copyDeviceDone: 'Copied ✓',
  copyDeviceTitle: 'Click to copy Device ID',
};

function t(key, substitutions) {
  if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
    try {
      var msg = chrome.i18n.getMessage(key, substitutions);
      if (msg) {
        return msg;
      }
    } catch (i18nErr) {
      /* ignore */
    }
  }
  var fb = UI_TEXT_FALLBACK[key];
  return fb != null ? String(fb) : String(key);
}

const UI_TEXT = new Proxy(Object.create(null), {
  get: function (_target, prop) {
    if (typeof prop !== 'string') {
      return undefined;
    }
    return t(prop);
  },
});

function getExportBtnLabel() {
  return t('exportBtnLabel');
}

function getExportBtnSuccessLabel() {
  return t('exportBtnSuccess');
}

/** CSV 表头 message key（见 _locales 各语言 messages.json） */
const EXPORT_CSV_HEADER_KEYS = [
  'csvHeaderTitle',
  'csvHeaderSku',
  'csvHeaderPrice',
  'csvHeaderCompareAtPrice',
  'csvHeaderVendor',
  'csvHeaderImageUrl',
  'csvHeaderCreatedAt',
];

const EXPORT_CSV_HEADERS_FALLBACK = [
  'Title',
  'SKU',
  'Price',
  'Compare At Price',
  'Vendor',
  'Image URL',
  'Created At',
];

/**
 * 按 Chrome UI 语言返回 CSV 表头（chrome.i18n / _locales）
 * @returns {string[]}
 */
function getExportCsvHeaders() {
  if (typeof chrome === 'undefined' || !chrome.i18n || !chrome.i18n.getMessage) {
    return EXPORT_CSV_HEADERS_FALLBACK.slice();
  }
  return EXPORT_CSV_HEADER_KEYS.map(function (key, index) {
    try {
      var text = chrome.i18n.getMessage(key);
      if (text) {
        return text;
      }
    } catch (i18nErr) {
      /* ignore */
    }
    return EXPORT_CSV_HEADERS_FALLBACK[index] || key;
  });
}

let shopCurrencyCode = '';
let currentStoreType = 'none';
let currentShopDomain = '';
let isProductsLoading = false;
let rawProductsForExport = null;
let exportSuccessTimer = null;

/** Side Panel 常驻时，切换浏览器标签页后重新检测当前店 */
let panelRefreshTimer = null;
let initRunId = 0;
let initInProgress = false;
let pendingPanelRefreshOptions = null;
let panelRefreshGeneration = 0;
let lastWebsiteSyncAt = 0;
const INIT_LOADING_WATCHDOG_MS = 25000;
const EXECUTE_SCRIPT_TIMEOUT_MS = 8000;
const PANEL_REFRESH_DEBOUNCE_MS = 700;
const PANEL_SOFT_REFRESH_DEBOUNCE_MS = 350;

/** 无商品主图时的占位图（内联 SVG，避免额外网络请求） */
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">' +
      '<rect fill="#1a1a22" width="50" height="50"/>' +
      '<text x="25" y="28" text-anchor="middle" fill="#5c5c68" font-size="10" font-family="sans-serif">N/A</text>' +
      '</svg>'
  );

/** 消息类型：页面上下文通过 Message Passing 回传商品 JSON */
const MSG_PRODUCTS_JSON = 'SHOPRADAR_PRODUCTS_JSON';

/** 请求 Background 对当前店铺静默刷新 */
const MSG_REFRESH_SHOP_TAB = 'REFRESH_SHOP_TAB';
const MSG_GET_SHOP_CONTEXT_TAB = 'GET_SHOP_CONTEXT_TAB';
const MSG_SET_SHOP_CONTEXT_TAB = 'SET_SHOP_CONTEXT_TAB';
const MSG_PROBE_SHOPIFY_TAB = 'PROBE_SHOPIFY_TAB';

/** 缓存超过该时长则触发后台强制刷新 */
const CACHE_STALE_MS = 45 * 1000;

/** 侧边栏停留在成功态时，定期后台拉取新上架商品 */
const PRODUCT_AUTO_REFRESH_MS = 90 * 1000;

const EXT_CFG =
  typeof ShopRadarEnv !== 'undefined' && ShopRadarEnv.getConfig
    ? ShopRadarEnv.getConfig()
    : typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined'
      ? SHOPRADAR_EXTENSION_CONFIG
      : {
          env: 'production',
          apiBase: 'https://api.shopradar.uk',
          websiteUrl: 'https://shopradar.uk',
          debug: false,
        };

const AUTH_API_BASE =
  typeof ShopRadarEnv !== 'undefined' && ShopRadarEnv.getApiBase
    ? ShopRadarEnv.getApiBase()
    : String(EXT_CFG.apiBase || 'https://api.shopradar.uk').replace(/\/$/, '');

const SHOPRADAR_WEBSITE_URL = String(
  EXT_CFG.websiteUrl || 'https://shopradar.uk'
).replace(/\/$/, '');

function debugLog() {
  if (EXT_CFG.debug) {
    console.info.apply(console, arguments);
  }
}

function runtimeSendMessage(message, options) {
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendMessage) {
    return ShopRadarGuard.safeSendMessage(message, options);
  }
  return new Promise(function (resolve) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        resolve(options && options.defaultResponse);
        return;
      }
      chrome.runtime.sendMessage(message, function (response) {
        try {
          if (chrome.runtime.lastError) {
            console.log(
              'Ignored extension runtime error:',
              chrome.runtime.lastError.message
            );
            resolve(options && options.defaultResponse);
            return;
          }
        } catch (readErr) {
          resolve(options && options.defaultResponse);
          return;
        }
        resolve(response);
      });
    } catch (sendErr) {
      resolve(options && options.defaultResponse);
    }
  });
}

function tabsSendMessage(tabId, message, options) {
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeTabsSendMessage) {
    return ShopRadarGuard.safeTabsSendMessage(tabId, message, options);
  }
  return new Promise(function (resolve) {
    try {
      if (tabId == null || !chrome.tabs || !chrome.tabs.sendMessage) {
        resolve(options && options.defaultResponse);
        return;
      }
      chrome.tabs.sendMessage(tabId, message, function (response) {
        try {
          if (chrome.runtime.lastError) {
            console.log(
              'Ignored extension runtime error:',
              chrome.runtime.lastError.message
            );
            resolve(options && options.defaultResponse);
            return;
          }
        } catch (readErr) {
          resolve(options && options.defaultResponse);
          return;
        }
        resolve(response);
      });
    } catch (sendErr) {
      resolve(options && options.defaultResponse);
    }
  });
}

const AUTH_API_CHECK_LIMIT = AUTH_API_BASE + '/api/check-limit';
const AUTH_API_PRO_STATUS = AUTH_API_BASE + '/api/pro-status';
const AUTH_API_VERIFY_EXPORT = AUTH_API_BASE + '/api/verify-export';
const AUTH_API_CLAIM_PRO = AUTH_API_BASE + '/api/claim-pro';

/** Lemon 结账链接：在 lemon-checkout.config.js 中配置 SHOPRADAR_LEMON_CHECKOUT_URL */
const LEMON_SQUEEZY_CHECKOUT_URL =
  typeof window !== 'undefined' && window.SHOPRADAR_LEMON_CHECKOUT_URL
    ? String(window.SHOPRADAR_LEMON_CHECKOUT_URL).trim()
    : '';

/** 当前会话是否已为 Pro（鉴权接口返回 isPro） */
let isProSubscriber = false;

/** chrome.storage 中持久化设备 ID 的键名 */
const STORAGE_DEVICE_ID_KEY = 'sr_device_id';
/** 本机已确认为 Pro 时写入，避免每次打开侧边栏重复触发二次 init */
const STORAGE_IS_PRO_KEY = 'sr_is_pro';
/** 服务端签发的短期访问令牌（仅存当前浏览器会话） */
const STORAGE_ACCESS_TOKEN_KEY = 'sr_access_token';
const STORAGE_TOKEN_EXPIRES_KEY = 'sr_token_expires_at';
/** 打开 Lemon 结账后写入，用于 Webhook 延迟期间的 Pro 轮询 */
const STORAGE_PAYMENT_PENDING_KEY = 'sr_payment_pending_at';
const PAYMENT_PENDING_MS = 5 * 60 * 1000;
/** 后台 Pro 轮询代次（切换 init 时可取消） */
let backgroundProPollGeneration = 0;

/** 当前活跃标签页 ID，供页面上下文 fetch 回退使用 */
let activeTabId = null;

/** 标签页 href 缓存，避免重复 executeScript 读 location */
const tabHrefCache = new Map();

/** 已注入 sfcc-fetch.js 的标签页（同页重复打开列表时跳过二次注入） */
const sfccScriptInjectedTabs = new Set();

/** 内存商品缓存（切标签时避免重复读 storage） */
const memoryShopCacheByDomain = new Map();
/** 曾成功分析过的店铺域名（www/裸域 alias，用于减少重复授权提示） */
const STORAGE_TRUSTED_SITES_KEY = 'sr_trusted_site_hosts';
/** 无 host 权限时对已知店铺延长 products.json 探测时间 */
const KNOWN_SITE_PROBE_TIMEOUT_MS = 10000;

/** 单次拉取商品数量上限（与 background 一致） */
const SHOPRADAR_MAX_PRODUCTS = 50;

/** 快速检测：complete 后短暂等待 Shopify/SFCC 标记 */
const QUICK_DETECT_SETTLE_MS = 120;

/** 并行/快速路径 products.json 探测超时 */
const FAST_PROBE_TIMEOUT_MS = 2200;

/** 首屏 products.json 探测超时（毫秒） */
const INSTANT_PROBE_TIMEOUT_MS = 2800;

/** 点击扩展图标时记录的标签页（session），避免侧边栏抢焦点后 query 错页 */
const SESSION_TAB_ID_KEY = 'sr_context_tab_id';
const SESSION_TAB_AT_KEY = 'sr_context_tab_at';
const SESSION_TAB_MAX_AGE_MS = 5 * 60 * 1000;

/** 最近一次失败检测的平台提示（写入确认负向缓存用） */
let lastDetectedFailPlatform = '';

/** 已确认非 Shopify 的域名（同页不重复进入 loading） */
let lastConfirmedNonShopDomain = '';

/** 成功态下定期后台刷新商品 */
let productAutoRefreshTimer = null;

/** 后台静默刷新商品（不阻塞导出、不清空已展示的缓存列表） */
let isBackgroundRefreshing = false;

/** 当日免费额度是否已锁定（鉴权拒绝后为 true） */
let isQueryLimitLocked = false;

/**
 * 规范化货币代码，无效时回退 USD
 * @param {string} [code]
 * @returns {string}
 */
function normalizeCurrencyCode(code) {
  return ShopRadarData.normalizeCurrencyCode(code);
}

/** ISO 4217 零小数货币（不做 /100 换算） */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
  'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** 货币展示：与网页 Shopify.currency.active 一致（AMD 等用后缀代码便于对照） */
const CURRENCY_DISPLAY_MAP = {
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

function isZeroDecimalCurrency(currencyCode) {
  return ZERO_DECIMAL_CURRENCIES.has(normalizeCurrencyCode(currencyCode));
}

/**
 * 写入网页活跃货币代码（来自 Shopify.currency.active）
 * @param {string} code
 */
function applyShopActiveCurrency(code) {
  shopCurrencyCode = normalizeCurrencyCode(code || 'USD');
}

/**
 * 获取当前用于展示/导出的活跃货币代码
 * @returns {string}
 */
function getActiveCurrencyCode() {
  return shopCurrencyCode ? normalizeCurrencyCode(shopCurrencyCode) : 'USD';
}

/**
 * 获取货币在 UI 上的展示方式（符号前缀或代码后缀）
 * @param {string} currencyCode
 * @returns {{ mode: 'prefix' | 'suffix', label: string }}
 */
function getCurrencyDisplay(currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  if (CURRENCY_DISPLAY_MAP[code]) {
    return CURRENCY_DISPLAY_MAP[code];
  }
  return { mode: 'suffix', label: code + ' ' };
}

/**
 * 遍历商品全部 variants，汇总销售价与划线原价区间
 * @param {object} product
 * @param {string} [currencyCode]
 * @returns {{ minSale: number|null, maxSale: number|null, minCompare: number|null, maxCompare: number|null }}
 */
function extractProductPricing(product, currencyCode) {
  return ShopRadarData.extractProductPricing(
    product,
    currencyCode || getActiveCurrencyCode()
  );
}

/**
 * 将已解析的金额格式化为带货币符号的字符串
 * @param {number} amount
 * @param {string} currencyCode
 * @returns {string}
 */
function formatPriceFromAmount(amount, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode || getActiveCurrencyCode());
  const digits = formatAmountDigits(amount);
  const display = getCurrencyDisplay(code);

  // 后缀货币：9600 AMD（与网页 currency.active 一致）
  if (display.mode === 'suffix') {
    return digits + ' ' + display.label.trim();
  }
  return display.label + digits;
}

/**
 * 格式化价格区间（最低价 - 最高价）
 * @param {number | null} minAmount
 * @param {number | null} maxAmount
 * @param {string} [currencyCode]
 * @returns {string}
 */
function formatPriceRange(minAmount, maxAmount, currencyCode) {
  if (minAmount == null) {
    return '\u2014';
  }

  const code = normalizeCurrencyCode(currencyCode || getActiveCurrencyCode());

  if (maxAmount == null || Math.abs(minAmount - maxAmount) < 0.001) {
    return formatPriceFromAmount(minAmount, code);
  }

  return (
    formatPriceFromAmount(minAmount, code) +
    ' - ' +
    formatPriceFromAmount(maxAmount, code)
  );
}

/**
 * 解析 Shopify 价格数值（不做 /100 缩放，与网页展示数字保持一致）
 * @param {string | number | null | undefined} rawPrice
 * @returns {number | null}
 */
function parseVariantPrice(rawPrice) {
  return ShopRadarData.parseVariantPrice(rawPrice);
}

/**
 * 将金额格式化为 UI 用数字（整数保持整数，如 9600 → "9,600"）
 * @param {number} amount
 * @returns {string}
 */
function formatAmountDigits(amount) {
  if (amount % 1 === 0) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * UI 价格格式化（单值，内部统一走 parseVariantPrice）
 * @param {string | number | null | undefined} rawPrice
 * @param {string} [currencyCode]
 * @returns {string}
 */
function formatPrice(rawPrice, currencyCode) {
  const amount = parseVariantPrice(rawPrice, currencyCode);
  if (amount == null) {
    return '\u2014';
  }
  return formatPriceFromAmount(amount, currencyCode);
}

/**
 * 在页面主世界（MAIN）执行脚本，才能读到页面真实的 window.Shopify
 * @param {number} tabId
 * @param {Function} func
 * @param {Array<*>} [args]
 * @returns {Promise<*>}
 */
async function executeInMainWorld(tabId, func, args, timeoutMs) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (tabErr) {
    return undefined;
  }
  if (!tab?.url || isRestrictedUrl(tab.url)) {
    return undefined;
  }

  const limit = timeoutMs || EXECUTE_SCRIPT_TIMEOUT_MS;

  try {
    const results = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: func,
        args: args || [],
      }),
      limit,
      'executeScript'
    );
    return results[0]?.result;
  } catch (scriptErr) {
    if (isBenignInjectError(scriptErr)) {
      return undefined;
    }
    throw scriptErr;
  }
}

/**
 * 记录应对准检测的浏览器标签页
 * @param {number | undefined} tabId
 */
async function rememberContextTabId(tabId) {
  if (tabId == null || !chrome.storage?.session) {
    return;
  }
  try {
    await chrome.storage.session.set({
      [SESSION_TAB_ID_KEY]: tabId,
      [SESSION_TAB_AT_KEY]: Date.now(),
    });
  } catch (error) {
    console.warn('[ShopRadar] 记录 context tab 失败:', error);
  }
}

/**
 * 通知后台固定当前应对准的店铺标签（点击扩展图标打开侧边栏时不会触发 tabs.onActivated）
 * @param {number | undefined} tabId
 */
function pinShopContextTab(tabId) {
  if (tabId == null) {
    return;
  }
  runtimeSendMessage({ type: MSG_SET_SHOP_CONTEXT_TAB, tabId: tabId });
}

/**
 * 从 Service Worker 读取店铺上下文标签（后台优先返回当前聚焦窗口内的 active 零售页）
 * @returns {Promise<chrome.tabs.Tab | undefined>}
 */
async function resolveRetailTabFromBackground() {
  try {
    const resp = await runtimeSendMessage({
      type: MSG_GET_SHOP_CONTEXT_TAB,
    });
    if (!resp || resp.tabId == null) {
      return undefined;
    }
    const tab = await chrome.tabs.get(resp.tabId);
    if (
      tab?.id &&
      tab.url &&
      !isRestrictedUrl(tab.url) &&
      !isNonShopBrowseContext(tab)
    ) {
      return tab;
    }
  } catch (bgErr) {
    /* ignore */
  }
  return undefined;
}

/**
 * 所有普通窗口中当前 active 的零售店标签
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function queryActiveRetailTabs() {
  let allActive = [];
  try {
    allActive = await chrome.tabs.query({ active: true, windowType: 'normal' });
  } catch (queryErr) {
    allActive = await chrome.tabs.query({ active: true });
  }

  return allActive.filter(function (t) {
    return (
      t?.id &&
      t.url &&
      !isRestrictedUrl(t.url) &&
      !isNonShopBrowseContext(t)
    );
  });
}

/**
 * 侧边栏场景下获取当前浏览器正在浏览的标签页。
 * 优先当前聚焦窗口内的 active 零售页，避免误用其他窗口的 shopradar 大屏或 Lemon 页。
 * @returns {Promise<chrome.tabs.Tab | undefined>}
 */
async function getActiveBrowserTab() {
  try {
    const currentWinTabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const currentTab = currentWinTabs[0];
    if (
      currentTab?.id &&
      currentTab.url &&
      !isRestrictedUrl(currentTab.url) &&
      !isNonShopBrowseContext(currentTab)
    ) {
      activeTabId = currentTab.id;
      await rememberContextTabId(currentTab.id);
      pinShopContextTab(currentTab.id);
      return currentTab;
    }
  } catch (currentWinErr) {
    /* ignore */
  }

  const shopTabs = await queryActiveRetailTabs();

  if (shopTabs.length >= 1) {
    let picked = shopTabs[0];
    if (shopTabs.length > 1) {
      try {
        const focusedWin = await chrome.windows.getLastFocused({
          populate: false,
        });
        const inFocused = shopTabs.find(function (t) {
          return t.windowId === focusedWin.id;
        });
        if (inFocused) {
          picked = inFocused;
        }
      } catch (winErr) {
        /* ignore */
      }
    }
    activeTabId = picked.id;
    await rememberContextTabId(picked.id);
    pinShopContextTab(picked.id);
    return picked;
  }

  const fromBackground = await resolveRetailTabFromBackground();
  if (fromBackground) {
    activeTabId = fromBackground.id;
    await rememberContextTabId(fromBackground.id);
    return fromBackground;
  }

  const queries = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
  ];

  for (const query of queries) {
    const tabs = await chrome.tabs.query(query);
    const tab = tabs[0];
    if (
      tab?.id &&
      tab.url &&
      !isRestrictedUrl(tab.url) &&
      !isNonShopBrowseContext(tab)
    ) {
      activeTabId = tab.id;
      await rememberContextTabId(tab.id);
      pinShopContextTab(tab.id);
      return tab;
    }
  }

  try {
    const sess = await chrome.storage.session.get([
      SESSION_TAB_ID_KEY,
      SESSION_TAB_AT_KEY,
    ]);
    const contextId = sess[SESSION_TAB_ID_KEY];
    const contextAt = sess[SESSION_TAB_AT_KEY];
    if (
      contextId != null &&
      contextAt &&
      Date.now() - contextAt < SESSION_TAB_MAX_AGE_MS
    ) {
      const contextTab = await chrome.tabs.get(contextId);
      if (
        contextTab?.id &&
        contextTab.url &&
        !isRestrictedUrl(contextTab.url) &&
        !isNonShopBrowseContext(contextTab)
      ) {
        return contextTab;
      }
    }
  } catch (sessionError) {
    console.warn('[ShopRadar] 读取 context tab 失败:', sessionError);
  }

  if (activeTabId != null) {
    try {
      const fallbackTab = await chrome.tabs.get(activeTabId);
      if (
        fallbackTab?.url &&
        !isRestrictedUrl(fallbackTab.url) &&
        !isNonShopBrowseContext(fallbackTab)
      ) {
        return fallbackTab;
      }
    } catch (fallbackError) {
      console.warn('[ShopRadar] activeTabId 回退失败:', fallbackError);
    }
  }

  return undefined;
}

/** 侧边栏已绑定标签页切换监听 */
let sidePanelTabListenersBound = false;

/**
 * 用户切换标签或导航时，侧边栏应对准当前页重新检测
 */
function bindSidePanelTabListeners() {
  if (sidePanelTabListenersBound) {
    return;
  }
  sidePanelTabListenersBound = true;

  chrome.tabs.onActivated.addListener(function (activeInfo) {
    if (document.visibilityState === 'hidden' || initInProgress) {
      return;
    }
    rememberContextTabId(activeInfo.tabId).catch(function () {});
    activeTabId = activeInfo.tabId;
    schedulePanelRefresh({ softRefresh: true });
  });

  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (document.visibilityState === 'hidden') {
      return;
    }
    if (!changeInfo.url) {
      return;
    }
    if (!tab?.url || isRestrictedUrl(tab.url)) {
      return;
    }
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
      if (!tabs[0] || tabs[0].id !== tabId) {
        return;
      }
      rememberContextTabId(tabId).catch(function () {});
      activeTabId = tabId;
      schedulePanelRefresh({ softRefresh: true });
    });
  });
}

/**
 * 当前标签页域名与侧边栏展示不一致时，先清空旧店数据避免串店
 * @param {string} domainEarly
 */
function resetUiIfDomainChanged(domainEarly, options) {
  if (!domainEarly || domainEarly === currentShopDomain) {
    return;
  }
  const hadPreviousStore = Boolean(currentShopDomain);
  if (domainEarly !== lastConfirmedNonShopDomain) {
    lastConfirmedNonShopDomain = '';
  }
  stopProductAutoRefresh();
  currentShopDomain = domainEarly;
  rawProductsForExport = null;
  isProductsLoading = false;
  productListEl.innerHTML = '';
  productsEmpty.classList.remove('visible');
  setProductsLoading(false);
  const softRefresh = Boolean(options && options.softRefresh);
  if (hadPreviousStore && !(softRefresh && stateSuccess.classList.contains('active'))) {
    showState('loading');
  }
}

/**
 * 注入页面主世界：读取 Shopify.currency.active（与网页显示币种一致）
 * @returns {string}
 */
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

/**
 * 将界面文案写入 DOM（解决 HTML 文件中文乱码）
 */
function applyUiStrings() {
  if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
    try {
      document.documentElement.lang = chrome.i18n.getUILanguage();
    } catch (langErr) {
      /* ignore */
    }
  }
  statusIndicator.title = UI_TEXT.statusDetecting;
  if (loadingTextEl) loadingTextEl.textContent = UI_TEXT.loading;
  if (successEmojiEl) successEmojiEl.textContent = UI_TEXT.successEmoji;
  if (successTitleEl) successTitleEl.textContent = UI_TEXT.successTitle;
  if (productsSectionTitleEl) {
    productsSectionTitleEl.textContent = UI_TEXT.productsTitle;
  }
  if (productsLoadingTextEl) {
    productsLoadingTextEl.textContent = UI_TEXT.productsLoading;
  }
  if (productsEmpty) productsEmpty.textContent = UI_TEXT.productsEmpty;
  if (failEmojiEl) failEmojiEl.textContent = UI_TEXT.failEmoji;
  if (failTitleEl) failTitleEl.textContent = UI_TEXT.failTitle;
  if (grantAccessBtnEl) {
    grantAccessBtnEl.textContent = UI_TEXT.grantSiteAccess;
    grantAccessBtnEl.classList.add('hidden');
  }
  if (exportBtn) {
    exportBtn.textContent = getExportBtnLabel();
  }
  if (limitOverlayTitleEl) {
    limitOverlayTitleEl.textContent = UI_TEXT.limitTitle;
  }
  if (limitOverlayDescEl) {
    limitOverlayDescEl.textContent = UI_TEXT.limitDescDefault;
  }
  if (unlockProBtn) {
    unlockProBtn.textContent = UI_TEXT.unlockPro;
  }
  if (refreshProBtn) {
    refreshProBtn.textContent = UI_TEXT.refreshProStatus;
  }
  if (claimProEmailEl) {
    claimProEmailEl.placeholder = UI_TEXT.claimProPlaceholder;
  }
  if (claimProBtn) {
    claimProBtn.textContent = UI_TEXT.claimProBtn;
  }
  var claimLabelEl = document.getElementById('claim-pro-label');
  if (claimLabelEl) {
    claimLabelEl.textContent = UI_TEXT.claimProLabel;
  }
  if (idleHeroTitleEl) {
    idleHeroTitleEl.textContent = UI_TEXT.idleHeroTitleReady;
  }
  if (idleHeroDescEl) {
    idleHeroDescEl.textContent = UI_TEXT.idleHeroDescPro;
  }
  var accountProLabelEl = document.getElementById('account-pro-label');
  if (accountProLabelEl) {
    accountProLabelEl.textContent = UI_TEXT.accountProLabel;
  }
  var accountDeviceLabelEl = document.querySelector(
    '.account-row-device .account-label'
  );
  if (accountDeviceLabelEl) {
    accountDeviceLabelEl.textContent = UI_TEXT.accountDeviceLabel;
  }
  if (deviceIdBarEl) {
    deviceIdBarEl.title = UI_TEXT.copyDeviceTitle;
    var hintEl = deviceIdBarEl.querySelector('.account-copy-hint');
    if (hintEl) {
      hintEl.textContent = UI_TEXT.copyDeviceHint;
    }
  }
}

/**
 * 生成 UUID v4（设备唯一标识）
 * @returns {string}
 */
function generateDeviceUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * 从 chrome.storage.local 读取或创建持久化设备 ID
 * @returns {Promise<string>}
 */
async function getOrCreateDeviceId() {
  const stored = await chrome.storage.local.get(STORAGE_DEVICE_ID_KEY);
  if (stored[STORAGE_DEVICE_ID_KEY]) {
    return String(stored[STORAGE_DEVICE_ID_KEY]);
  }

  const deviceId = generateDeviceUuid();
  await chrome.storage.local.set({ [STORAGE_DEVICE_ID_KEY]: deviceId });
  return deviceId;
}

function setExportButtonVisible(visible) {
  if (exportFooterEl) {
    exportFooterEl.classList.toggle('hidden', !visible);
  }
}

function updateProStatusBar(isPro) {
  if (!proStatusTextEl) {
    return;
  }
  proStatusTextEl.textContent = isPro ? UI_TEXT.proStatusActive : UI_TEXT.proStatusInactive;
  proStatusTextEl.className = 'account-value ' + (isPro ? 'pro-status-on' : 'pro-status-off');
  if (idleHeroTitleEl) {
    idleHeroTitleEl.textContent = isPro ? UI_TEXT.proStatusActive : UI_TEXT.proStatusInactive;
  }
  if (idleHeroDescEl) {
    idleHeroDescEl.textContent = isPro
      ? UI_TEXT.idleHeroDescPro
      : UI_TEXT.idleHeroDescFree;
  }
  if (idleHeroEl && idleHeroEl.classList.contains('hidden') === false) {
    applyIdleHeroIconVariant(isPro ? 'pro' : 'neutral');
  }
}

async function syncProStatusBar() {
  updateProStatusBar(await hasProAccess());
}

function setIdleBrowseMode(enabled, statusVariant) {
  if (mainContent) {
    mainContent.classList.toggle('idle-browse-mode', Boolean(enabled));
    mainContent.classList.toggle('pro-summary-only', Boolean(enabled));
  }
  if (idleHeroEl) {
    idleHeroEl.classList.toggle('hidden', !enabled);
    if (enabled) {
      idleHeroEl.removeAttribute('aria-hidden');
    } else {
      idleHeroEl.setAttribute('aria-hidden', 'true');
    }
  }
  if (enabled && statusIndicator) {
    statusIndicator.classList.remove('fail', 'success', 'neutral');
    if (statusVariant === 'success') {
      statusIndicator.classList.add('success');
      statusIndicator.title = UI_TEXT.proReadySwitchShop;
    } else if (statusVariant === 'neutral') {
      statusIndicator.classList.add('neutral');
      statusIndicator.title = UI_TEXT.statusIdleReady;
    } else {
      statusIndicator.title = UI_TEXT.statusIdleReady;
    }
  }
}

/** @deprecated 使用 setIdleBrowseMode */
function setProSummaryOnlyMode(enabled) {
  setIdleBrowseMode(enabled, enabled ? 'success' : null);
}

function getIdleHeroIconChar(variant) {
  if (variant === 'pro') {
    return '\u2713';
  }
  if (variant === 'permission') {
    return '\uD83D\uDD12';
  }
  if (variant === 'reload') {
    return '\uD83D\uDD04';
  }
  return '\uD83D\uDECD';
}

function applyIdleHeroIconVariant(variant) {
  if (!idleHeroEl) {
    return;
  }
  var iconEl = idleHeroEl.querySelector('.idle-hero-icon');
  if (!iconEl) {
    return;
  }
  iconEl.className = 'idle-hero-icon idle-hero-icon--' + (variant || 'neutral');
  iconEl.textContent = getIdleHeroIconChar(variant);
}

function resetIdleBrowseLayout() {
  setIdleBrowseMode(false);
  hideGrantAccessButton();
  if (idleHeroDomainEl) {
    idleHeroDomainEl.textContent = '';
    idleHeroDomainEl.classList.add('hidden');
  }
}

function isIdleBrowseActive() {
  return Boolean(mainContent && mainContent.classList.contains('idle-browse-mode'));
}

/**
 * 统一的「非店铺页 / 等待店铺」中性提示（无红 X）
 * @param {object} [opts]
 * @param {'pro'|'neutral'|'permission'|'reload'} [opts.variant]
 * @param {string} [opts.title]
 * @param {string} [opts.desc]
 * @param {string} [opts.domain]
 * @param {'success'|'neutral'} [opts.statusVariant]
 * @param {boolean} [opts.showGrantAccess]
 * @param {boolean} [opts.silentRecovery]
 */
function showIdlePrompt(opts) {
  var options = opts || {};
  clearFailStateRetries();
  stopProductAutoRefresh();
  isProductsLoading = false;
  setProductsLoading(false);
  rawProductsForExport = null;
  productListEl.innerHTML = '';
  productsEmpty.classList.remove('visible');
  currentStoreType = 'none';
  setExportButtonVisible(false);

  panels.forEach(function (panel) {
    panel.classList.remove('active');
  });

  var variant = options.variant || 'neutral';
  if (idleHeroTitleEl) {
    idleHeroTitleEl.textContent = options.title || UI_TEXT.idleHeroTitleReady;
  }
  if (idleHeroDescEl) {
    idleHeroDescEl.textContent = options.desc || UI_TEXT.idleHeroDescPro;
  }
  if (idleHeroDomainEl) {
    if (options.domain) {
      idleHeroDomainEl.textContent = options.domain;
      idleHeroDomainEl.classList.remove('hidden');
    } else {
      idleHeroDomainEl.textContent = '';
      idleHeroDomainEl.classList.add('hidden');
    }
  }

  applyIdleHeroIconVariant(variant);
  hideGrantAccessButton();
  if (options.showGrantAccess && grantAccessBtnEl) {
    grantAccessBtnEl.textContent = UI_TEXT.grantSiteAccess;
    grantAccessBtnEl.classList.remove('hidden');
  }

  var statusVariant =
    options.statusVariant || (variant === 'pro' ? 'success' : 'neutral');
  setIdleBrowseMode(true, statusVariant);

  if (options.silentRecovery && options.domain) {
    currentShopDomain = options.domain;
    lastConfirmedNonShopDomain = options.domain;
    scheduleFailStateSilentRecovery(options.domain);
  }
}

/**
 * 在侧边栏底部展示 Device ID，并输出到 Console（便于配置白名单）
 * @param {string} deviceId
 */
function showDeviceIdInPanel(deviceId) {
  const id = deviceId || '';
  if (deviceIdTextEl) {
    deviceIdTextEl.textContent = id || '—';
  }
  if (apiEnvBarEl) {
    const showEnv =
      EXT_CFG.debug ||
      (typeof ShopRadarEnv !== 'undefined' && ShopRadarEnv.isDevelopment());
    if (showEnv) {
      apiEnvBarEl.textContent = 'API: ' + AUTH_API_BASE;
      apiEnvBarEl.classList.remove('hidden');
      apiEnvBarEl.removeAttribute('aria-hidden');
    } else {
      apiEnvBarEl.textContent = '';
      apiEnvBarEl.classList.add('hidden');
      apiEnvBarEl.setAttribute('aria-hidden', 'true');
    }
  }
  void syncProStatusBar();
  debugLog('[ShopRadar] 当前环境:', EXT_CFG.env || 'unknown', '| API:', AUTH_API_BASE);
  debugLog('[ShopRadar] 当前设备 ID (sr_device_id):', id);
  debugLog(
    '[ShopRadar] 白名单：将上述 ID 填入 shopradar-server/whitelist.json 的 deviceIds 数组'
  );
}

/** 构建官网爆品大盘链接（内部同步仍可能使用） */
function buildDashboardUrl(deviceId) {
  const base = SHOPRADAR_WEBSITE_URL || 'https://shopradar.uk';
  const id = String(deviceId || '').trim();
  if (!id) {
    return base + '/#dashboard';
  }
  return base + '/?deviceId=' + encodeURIComponent(id) + '#dashboard';
}

/**
 * 绑定 Device ID 栏：点击复制
 */
function bindDeviceIdBar() {
  if (!deviceIdBarEl) {
    return;
  }

  async function copyDeviceId() {
    const stored = await chrome.storage.local.get(STORAGE_DEVICE_ID_KEY);
    const id = stored[STORAGE_DEVICE_ID_KEY];
    if (!id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(String(id));
      const hintEl = deviceIdBarEl.querySelector('.account-copy-hint');
      const prevHint = hintEl ? hintEl.textContent : '';
      if (hintEl) {
        hintEl.textContent = UI_TEXT.copyDeviceDone;
      }
      setTimeout(() => {
        if (hintEl) {
          hintEl.textContent = prevHint || UI_TEXT.copyDeviceHint;
        }
      }, 1200);
    } catch (error) {
      console.warn('[ShopRadar] 复制失败，请手动选择复制:', error);
    }
  }

  deviceIdBarEl.addEventListener('click', copyDeviceId);
  deviceIdBarEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void copyDeviceId();
    }
  });
}

/** 进行中的鉴权请求（同 device+domain 合并为一次，避免服务端 SQLITE_BUSY） */
const pendingQuotaChecks = new Map();

/**
 * 向鉴权服务校验本次查询是否允许（会消耗一次额度）
 * @param {string} deviceId
 * @param {string} domain
 * @returns {Promise<{ allowed: boolean, remaining?: number, msg?: string, authOffline?: boolean }>}
 */
async function checkQueryLimit(deviceId, domain) {
  const dedupeKey = (deviceId || '') + '|' + (domain || '');
  if (pendingQuotaChecks.has(dedupeKey)) {
    return pendingQuotaChecks.get(dedupeKey);
  }

  const promise = checkQueryLimitOnce(deviceId, domain);
  pendingQuotaChecks.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    pendingQuotaChecks.delete(dedupeKey);
  }
}

async function getStoredAccessToken() {
  try {
    const stored = await chrome.storage.session.get([
      STORAGE_ACCESS_TOKEN_KEY,
      STORAGE_TOKEN_EXPIRES_KEY,
    ]);
    const token = stored[STORAGE_ACCESS_TOKEN_KEY];
    const expiresAt = Number(stored[STORAGE_TOKEN_EXPIRES_KEY] || 0);
    if (!token) {
      return '';
    }
    if (expiresAt && expiresAt < Date.now()) {
      await clearStoredAccessToken();
      return '';
    }
    return String(token);
  } catch (sessionErr) {
    return '';
  }
}

async function saveAccessTokenFromPayload(payload) {
  if (!payload || !payload.accessToken) {
    return;
  }
  const expiresAt =
    payload.tokenExpiresAt != null
      ? Number(payload.tokenExpiresAt)
      : payload.tokenExpiresIn != null
        ? Date.now() + Number(payload.tokenExpiresIn) * 1000
        : 0;
  try {
    await chrome.storage.session.set({
      [STORAGE_ACCESS_TOKEN_KEY]: String(payload.accessToken),
      [STORAGE_TOKEN_EXPIRES_KEY]: expiresAt || 0,
    });
  } catch (sessionErr) {
    console.warn('[ShopRadar] 保存 accessToken 失败:', sessionErr);
  }
}

async function clearStoredAccessToken() {
  try {
    await chrome.storage.session.remove([
      STORAGE_ACCESS_TOKEN_KEY,
      STORAGE_TOKEN_EXPIRES_KEY,
    ]);
  } catch (sessionErr) {
    /* ignore */
  }
}

async function checkQueryLimitOnce(deviceId, domain) {
  const maxAttempts = 2;
  const accessToken = await getStoredAccessToken();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const body = { deviceId: deviceId, domain: domain };
      if (accessToken) {
        body.accessToken = accessToken;
      }
      const response = await fetch(AUTH_API_CHECK_LIMIT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let payload = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        payload = null;
      }

      if (response.ok) {
        await saveAccessTokenFromPayload(payload);
        return payload || { allowed: false, msg: '鉴权响应无效' };
      }

      if (response.status === 401 && accessToken) {
        await clearStoredAccessToken();
      }

      if (response.status >= 500 && attempt < maxAttempts - 1) {
        await delay(200);
        continue;
      }

      console.warn(
        '[ShopRadar] 鉴权服务错误:',
        response.status,
        payload && payload.msg ? payload.msg : ''
      );
      return {
        allowed: false,
        authOffline: response.status >= 500,
        msg:
          (payload && payload.msg) ||
          (response.status >= 500
            ? '鉴权服务暂时异常 (HTTP ' + response.status + ')，请稍后重试'
            : UI_TEXT.authServerOffline),
      };
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        await delay(200);
        continue;
      }
      console.warn('[ShopRadar] 鉴权服务不可用:', error);
      return {
        allowed: false,
        authOffline: true,
        msg: UI_TEXT.authServerOffline,
      };
    }
  }

  return {
    allowed: false,
    authOffline: true,
    msg: UI_TEXT.authServerOffline,
  };
}

/** 打开 Pro 遮罩时设为 inert 的背景区域（避免与对话框焦点/aria-hidden 冲突） */
function getProMaskInertTargets() {
  return [
    mainContent,
    document.querySelector('.header'),
    document.querySelector('.panel-footer'),
    exportFooterEl,
    deviceIdBarEl,
  ].filter(Boolean);
}

function setProMaskBackdropInert(inert) {
  getProMaskInertTargets().forEach(function (el) {
    el.inert = inert;
  });
}

function blurProMaskFocus() {
  if (
    proMaskEl &&
    document.activeElement &&
    proMaskEl.contains(document.activeElement)
  ) {
    document.activeElement.blur();
  }
}

/**
 * 显示 Pro 升级遮罩墙（额度用尽）
 * @param {string} [message] 后端返回的提示语
 */
function showLimitOverlay(message) {
  isQueryLimitLocked = true;
  document.body.classList.add('is-pro-locked');
  setProMaskBackdropInert(true);

  if (proMaskEl) {
    if (limitOverlayDescEl) {
      const base = message || UI_TEXT.limitDescDefault;
      limitOverlayDescEl.textContent = base + '\n\n' + UI_TEXT.proSyncHint;
    }
    setClaimProMessage('');
    proMaskEl.inert = false;
    proMaskEl.removeAttribute('aria-hidden');
    proMaskEl.classList.add('visible');
  }

  if (unlockProBtn) {
    unlockProBtn.tabIndex = 0;
    requestAnimationFrame(function () {
      try {
        unlockProBtn.focus({ preventScroll: true });
      } catch (focusErr) {
        unlockProBtn.focus();
      }
    });
  }

  if (exportBtn) {
    exportBtn.disabled = true;
  }
}

/**
 * 隐藏 Pro 遮罩
 */
function hideLimitOverlay() {
  isQueryLimitLocked = false;
  document.body.classList.remove('is-pro-locked');
  blurProMaskFocus();
  setProMaskBackdropInert(false);

  if (proMaskEl) {
    if (limitOverlayDescEl) {
      limitOverlayDescEl.textContent = UI_TEXT.limitDescDefault;
    }
    setClaimProMessage('');
    proMaskEl.classList.remove('visible');
    proMaskEl.setAttribute('aria-hidden', 'true');
    proMaskEl.inert = true;
  }

  if (unlockProBtn) {
    unlockProBtn.tabIndex = -1;
  }

  if (exportBtn) {
    exportBtn.disabled = false;
  }
}

/**
 * 抓取前鉴权：未通过则中断后续 Shopify 请求
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
function isStaleInit(runId) {
  return runId !== initRunId;
}

/**
 * 是否为本会话已确认的付费 Pro（内存标记，由服务端 isPro 或 loadProFlag 设置）
 */
function isPaidProSubscriber() {
  return isProSubscriber;
}

/** 本地 storage 或内存中是否已有 Pro 标记（不含付款中乐观态） */
async function isPersistedProSubscriber() {
  if (isProSubscriber) {
    return true;
  }
  try {
    const stored = await chrome.storage.local.get(STORAGE_IS_PRO_KEY);
    return stored[STORAGE_IS_PRO_KEY] === true;
  } catch (storageErr) {
    return false;
  }
}

/** 当前是否已确认 Pro（服务端或本地持久化，不含「刚点结账未付款」） */
async function hasProAccess() {
  if (isProSubscriber) {
    return true;
  }
  return await isPersistedProSubscriber();
}

async function markPaymentPending() {
  try {
    await chrome.storage.session.set({
      [STORAGE_PAYMENT_PENDING_KEY]: Date.now(),
    });
  } catch (pendingErr) {
    /* ignore */
  }
}

async function clearPaymentPending() {
  try {
    await chrome.storage.session.remove(STORAGE_PAYMENT_PENDING_KEY);
  } catch (pendingErr) {
    /* ignore */
  }
}

async function isPaymentRecentlyPending() {
  try {
    const stored = await chrome.storage.session.get(STORAGE_PAYMENT_PENDING_KEY);
    const pendingAt = Number(stored[STORAGE_PAYMENT_PENDING_KEY] || 0);
    return pendingAt > 0 && Date.now() - pendingAt < PAYMENT_PENDING_MS;
  } catch (pendingErr) {
    return false;
  }
}

/**
 * 付款后 Webhook 写入可能有延迟，短时轮询 pro-status
 * @returns {Promise<boolean>}
 */
async function pollProActivationAfterCheckout(maxWaitMs) {
  const deadline = Date.now() + (maxWaitMs || 30000);
  while (Date.now() < deadline) {
    const ok = await refreshProStatusWithWebsiteSync({ skipResume: true });
    if (ok || (await isPersistedProSubscriber())) {
      await clearPaymentPending();
      hideLimitOverlay();
      return true;
    }
    await delay(2000);
  }
  await loadProFlagFromStorage();
  return await isPersistedProSubscriber();
}

/**
 * 付款后后台轮询 Pro（不阻塞 init / 不切 loading）
 * @param {number} runId
 */
function startBackgroundProPollIfPending(runId) {
  isPaymentRecentlyPending().then(function (pending) {
    if (!pending || runId !== initRunId) {
      return;
    }
    backgroundProPollGeneration += 1;
    const pollGen = backgroundProPollGeneration;
    (async function () {
      const deadline = Date.now() + 90000;
      while (
        Date.now() < deadline &&
        pollGen === backgroundProPollGeneration &&
        runId === initRunId
      ) {
        const ok = await refreshProStatusWithWebsiteSync({ skipResume: true });
        if (ok && (await hasProAccess())) {
          await clearPaymentPending();
          hideLimitOverlay();
          schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
          return;
        }
        await delay(3000);
      }
    })().catch(function () {});
  });
}

async function ensureQueryAllowed(domain) {
  const deviceId = await getOrCreateDeviceId();
  showDeviceIdInPanel(deviceId);

  await refreshProStatusWithWebsiteSync({ skipResume: true });
  if (await hasProAccess()) {
    hideLimitOverlay();
    return true;
  }

  const result = await checkQueryLimit(deviceId, domain);

  await saveAccessTokenFromPayload(result);

  if (result.isPro === true) {
    isProSubscriber = true;
    await persistProFlag(true);
    await clearPaymentPending();
    hideLimitOverlay();
    return true;
  }

  if (!result.allowed) {
    const limitMsg = result.authOffline
      ? result.msg || UI_TEXT.authServerOffline
      : result.msg || UI_TEXT.limitTitle;
    showLimitOverlay(limitMsg);
    return false;
  }

  hideLimitOverlay();
  return true;
}

/**
 * 构建带 deviceId 的 Lemon Squeezy 结账链接（checkout custom → Webhook custom_data）
 * @param {string} deviceId
 * @returns {string|null}
 */
function buildLemonSqueezyCheckoutUrl(deviceId) {
  const base = (LEMON_SQUEEZY_CHECKOUT_URL || '').trim();
  if (
    !base ||
    base.indexOf('your-store') !== -1 ||
    base.indexOf('xxxxxxxx') !== -1 ||
    !/^https:\/\/[^/]+\.lemonsqueezy\.com\//i.test(base)
  ) {
    return null;
  }

  try {
    const url = new URL(base);
    url.searchParams.set('checkout[custom][device_id]', deviceId);
    url.searchParams.set('checkout[custom][source]', 'shopradar_extension');
    const websiteBase = (SHOPRADAR_WEBSITE_URL || 'https://shopradar.uk').replace(
      /\/$/,
      ''
    );
    url.searchParams.set(
      'checkout[redirect_url]',
      websiteBase +
        '/success.html?deviceId=' +
        encodeURIComponent(deviceId)
    );
    return url.toString();
  } catch (urlError) {
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return (
      base +
      sep +
      'checkout%5Bcustom%5D%5Bdevice_id%5D=' +
      encodeURIComponent(deviceId)
    );
  }
}

async function loadProFlagFromStorage() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_IS_PRO_KEY);
    if (stored[STORAGE_IS_PRO_KEY] === true) {
      isProSubscriber = true;
      updateProStatusBar(true);
    }
  } catch (storageErr) {
    console.warn('[ShopRadar] 读取 Pro 缓存失败:', storageErr);
  }
}

async function persistProFlag(isPro) {
  try {
    if (isPro) {
      await chrome.storage.local.set({ [STORAGE_IS_PRO_KEY]: true });
    } else {
      await chrome.storage.local.remove(STORAGE_IS_PRO_KEY);
      await clearStoredAccessToken();
    }
  } catch (storageErr) {
    console.warn('[ShopRadar] 写入 Pro 缓存失败:', storageErr);
  }
}

/**
 * 查询本机 Pro 状态；仅在「额度墙仍显示」时触发一次刷新，避免与 init 并发导致全盘误判
 * @param {{ skipResume?: boolean }} [options]
 */
async function verifyExportWithServer() {
  try {
    const deviceId = await getOrCreateDeviceId();
    const accessToken = await getStoredAccessToken();
    if (!accessToken) {
      return false;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(AUTH_API_VERIFY_EXPORT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId, accessToken: accessToken }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    let data = null;
    try {
      data = await response.json();
    } catch (parseErr) {
      data = null;
    }
    if (response.ok && data && data.exportAllowed) {
      await saveAccessTokenFromPayload(data);
      return true;
    }
    if (response.status === 401) {
      await clearStoredAccessToken();
    }
    return false;
  } catch (exportAuthErr) {
    console.warn('[ShopRadar] 导出鉴权失败:', exportAuthErr);
    return false;
  }
}

/**
 * 若已打开 shopradar 官网/本地大盘，触发 content script 将网页 Pro ID 同步进扩展
 * @returns {Promise<boolean>}
 */
async function trySyncDeviceFromOpenWebsiteTabs() {
  if (!chrome.tabs || !chrome.tabs.query) {
    return false;
  }
  if (Date.now() - lastWebsiteSyncAt < 2500) {
    return false;
  }

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({
      url: [
        'https://shopradar.uk/*',
        'http://localhost/*',
        'http://127.0.0.1/*',
      ],
    });
  } catch (queryErr) {
    return false;
  }

  if (!tabs.length) {
    return false;
  }

  let anySent = false;
  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }
    try {
      await tabsSendMessage(tab.id, { type: 'SR_REQUEST_DEVICE_SYNC' });
      anySent = true;
    } catch (sendErr) {
      /* 标签页可能尚未注入 content script */
    }
  }

  if (anySent) {
    lastWebsiteSyncAt = Date.now();
    await delay(600);
  }
  return anySent;
}

async function fetchProStatusPayloadForDevice(deviceId, accessToken) {
  let url =
    AUTH_API_PRO_STATUS + '?deviceId=' + encodeURIComponent(deviceId);
  if (accessToken) {
    url += '&accessToken=' + encodeURIComponent(accessToken);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, 4000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  return { response: response, deviceId: deviceId };
}

function setClaimProMessage(text, isError) {
  if (!claimProMsgEl) {
    return;
  }
  if (!text) {
    claimProMsgEl.textContent = '';
    claimProMsgEl.classList.add('hidden');
    claimProMsgEl.classList.remove('is-error', 'is-success');
    return;
  }
  claimProMsgEl.textContent = text;
  claimProMsgEl.classList.remove('hidden', 'is-error', 'is-success');
  claimProMsgEl.classList.add(isError ? 'is-error' : 'is-success');
}

/**
 * 用付款邮箱将 Pro 绑定到当前 Device ID（重装 / 换设备后恢复）
 * @param {string} email
 * @returns {Promise<{ ok: boolean, msg?: string }>}
 */
async function claimProWithEmail(email) {
  const deviceId = await getOrCreateDeviceId();
  const trimmed = String(email || '').trim();
  if (!trimmed) {
    return { ok: false, msg: UI_TEXT.claimProEmptyEmail };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, 10000);

  try {
    const response = await fetch(AUTH_API_CLAIM_PRO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId, email: trimmed }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let data = null;
    try {
      data = await response.json();
    } catch (parseErr) {
      data = null;
    }

    if (response.ok && data && data.isPro) {
      isProSubscriber = true;
      await persistProFlag(true);
      await clearPaymentPending();
      await saveAccessTokenFromPayload(data);
      hideLimitOverlay();
      schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
      return { ok: true, msg: UI_TEXT.claimProSuccess };
    }

    return {
      ok: false,
      msg:
        (data && data.msg) ||
        '未找到与该邮箱匹配的 Pro 记录。请确认付款邮箱无误；若刚付款请等待 2 分钟再试。',
    };
  } catch (claimErr) {
    clearTimeout(timeoutId);
    return { ok: false, msg: UI_TEXT.claimProNetworkError };
  }
}

async function applyProStatusPayload(data, options) {
  const skipResume = Boolean(options && options.skipResume);
  if (!data || !data.isPro) {
    return false;
  }
  isProSubscriber = true;
  await persistProFlag(true);
  updateProStatusBar(true);
  await clearPaymentPending();
  const hadQuotaWall = isQueryLimitLocked;
  hideLimitOverlay();
  if (!skipResume && hadQuotaWall) {
    schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
  }
  return true;
}

async function refreshProStatusFromServer(options) {
  const skipResume = Boolean(options && options.skipResume);

  try {
    const hadLocalPro = isProSubscriber;
    let deviceId = await getOrCreateDeviceId();
    let accessToken = await getStoredAccessToken();
    let result = await fetchProStatusPayloadForDevice(deviceId, accessToken);
    let response = result.response;

    if (response.status === 401 && accessToken) {
      await clearStoredAccessToken();
      result = await fetchProStatusPayloadForDevice(deviceId, '');
      response = result.response;
    }

    if (!response.ok) {
      if (response.status >= 500) {
        console.warn('[ShopRadar] Pro 状态服务异常:', response.status);
        return await isPersistedProSubscriber();
      }
      try {
        const errData = await response.json();
        await saveAccessTokenFromPayload(errData);
        if (await applyProStatusPayload(errData, { skipResume: skipResume })) {
          return true;
        }
      } catch (parseErr) {
        /* ignore */
      }
      return await isPersistedProSubscriber();
    }

    let data = await response.json();
    await saveAccessTokenFromPayload(data);
    if (await applyProStatusPayload(data, { skipResume: skipResume })) {
      return true;
    }

    if (
      hadLocalPro ||
      (await chrome.storage.local.get(STORAGE_IS_PRO_KEY))[STORAGE_IS_PRO_KEY]
    ) {
      const synced = await trySyncDeviceFromOpenWebsiteTabs();
      if (synced) {
        deviceId = await getOrCreateDeviceId();
        accessToken = await getStoredAccessToken();
        showDeviceIdInPanel(deviceId);
        result = await fetchProStatusPayloadForDevice(deviceId, accessToken);
        response = result.response;
        if (response.status === 401 && accessToken) {
          await clearStoredAccessToken();
          result = await fetchProStatusPayloadForDevice(deviceId, '');
          response = result.response;
        }
        if (response.ok) {
          data = await response.json();
          await saveAccessTokenFromPayload(data);
          if (await applyProStatusPayload(data, { skipResume: skipResume })) {
            return true;
          }
        }
      }
      if (await isPaymentRecentlyPending()) {
        console.warn(
          '[ShopRadar] 付款确认中，暂时保留本地 Pro 标记，等待 Webhook 写入…'
        );
        return true;
      }
    }

    isProSubscriber = false;
    await persistProFlag(false);
    updateProStatusBar(false);
  } catch (statusError) {
    console.warn('[ShopRadar] 查询 Pro 状态失败:', statusError);
    await loadProFlagFromStorage();
    return await isPersistedProSubscriber();
  }
  return false;
}

/**
 * 查询 Pro；若未开通则尝试从已打开的大盘页同步 Device ID 后再查一次
 * @param {{ skipResume?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
async function refreshProStatusWithWebsiteSync(options) {
  const ok = await refreshProStatusFromServer(options);
  if (ok || (await hasProAccess())) {
    return true;
  }
  const synced = await trySyncDeviceFromOpenWebsiteTabs();
  if (!synced) {
    return await hasProAccess();
  }
  const retryOk = await refreshProStatusFromServer(options);
  return retryOk || (await hasProAccess());
}

function csvExportCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value).trim();
  if (!str || str === '\u2014') {
    return '';
  }
  return str;
}

function productToCsvRow(rawProduct, cleanedRow) {
  const raw = rawProduct || {};
  const cleaned = cleanedRow || {};
  const title = csvExportCell(raw.title || cleaned.title || '');
  const variant =
    raw.variants && raw.variants.length > 0 ? raw.variants[0] : null;
  const sku = variant && variant.sku ? String(variant.sku) : '';
  const currency = getActiveCurrencyCode();
  const pricing = extractProductPricing(raw, currency);

  let price = '';
  if (pricing.minSale != null) {
    price = csvExportCell(
      formatPriceRange(pricing.minSale, pricing.maxSale, currency)
    );
  } else {
    price = csvExportCell(cleaned.price || '');
  }

  let compareAtPrice = '';
  if (pricing.minCompare != null) {
    compareAtPrice = csvExportCell(
      formatPriceRange(pricing.minCompare, pricing.maxCompare, currency)
    );
  } else {
    compareAtPrice = csvExportCell(cleaned.compareAtPrice || '');
  }

  let imageSrc = '';
  if (
    raw.images &&
    raw.images.length > 0 &&
    raw.images[0] &&
    raw.images[0].src
  ) {
    imageSrc = raw.images[0].src;
  } else if (cleaned.image && String(cleaned.image).indexOf('data:image') !== 0) {
    imageSrc = String(cleaned.image);
  }

  let createdAt = '';
  const rawDate = raw.published_at || raw.created_at || '';
  if (rawDate) {
    createdAt = csvExportCell(formatCreatedAt(rawDate));
  } else {
    createdAt = csvExportCell(cleaned.createdAt || '');
  }

  const vendor = raw.vendor ? String(raw.vendor) : '';

  return [title, sku, price, compareAtPrice, vendor, imageSrc, createdAt];
}

function rawRowHasPricing(rawRow) {
  if (!rawRow) {
    return false;
  }
  const pricing = extractProductPricing(rawRow, getActiveCurrencyCode());
  return pricing.minSale != null;
}

function buildShopifyExportRows(cleanedProducts, rawProducts) {
  const cleaned = Array.isArray(cleanedProducts) ? cleanedProducts : [];
  const rawList = Array.isArray(rawProducts) ? rawProducts : [];
  const rowPairs = cleaned.length
    ? cleaned.map(function (cleanedRow, index) {
        return { raw: rawList[index] || null, cleaned: cleanedRow };
      })
    : rawList.map(function (rawRow) {
        return { raw: rawRow, cleaned: null };
      });
  return rowPairs.map(function (pair) {
    return productToCsvRow(pair.raw, pair.cleaned);
  });
}

/**
 * 导出数据（侧边栏 cleaned + 对齐的 raw，与列表顺序一致）
 * @returns {Promise<{ cleaned: object[], raw: object[] }>}
 */
async function resolveExportData() {
  const domain = currentShopDomain;
  if (!domain) {
    return { cleaned: [], raw: [] };
  }

  const cache = await readShopCache(domain);
  const cleaned = cache?.products;
  if (!Array.isArray(cleaned) || !cleaned.length) {
    const rawOnly = Array.isArray(rawProductsForExport) ? rawProductsForExport : [];
    return { cleaned: [], raw: rawOnly };
  }

  function isCompleteRawRow(rawRow, cleanedRow) {
    if (!rawRow || !cleanedRow) {
      return false;
    }
    const idMatch =
      cleanedRow.productId != null && rawRow.id === cleanedRow.productId;
    const handleMatch =
      cleanedRow.handle && rawRow.handle === cleanedRow.handle;
    if (!idMatch && !handleMatch) {
      return false;
    }
    return rawRowHasPricing(rawRow);
  }

  let rawSource =
    cache?.rawProducts?.length > 0
      ? cache.rawProducts
      : rawProductsForExport || [];
  let aligned = ShopRadarData.alignRawToCleaned(rawSource, cleaned);
  let exportRaw = aligned.slice(0, cleaned.length);

  const needsRefetch =
    !cache?.rawProducts?.length ||
    exportRaw.some(function (rawRow, index) {
      return !isCompleteRawRow(rawRow, cleaned[index]);
    });

  if (needsRefetch) {
    try {
      const tab = await getActiveBrowserTab();
      if (tab?.id && extractDomain(tab.url) === domain) {
        const storeType = cache.storeType || currentStoreType || 'shopify';
        let freshRaw = [];

        if (storeType === 'sfcc') {
          const parsed = await fetchSfccProducts(tab.id);
          freshRaw = Array.isArray(parsed?.products) ? parsed.products : [];
        } else if (typeof isKnownSfccDomainHint === 'function' && isKnownSfccDomainHint(domain)) {
          const parsed = await fetchSfccProducts(tab.id);
          freshRaw = Array.isArray(parsed?.products) ? parsed.products : [];
        } else {
          const rawJson = await fetchProductsJson(domain, tab.id);
          freshRaw = Array.isArray(rawJson?.products) ? rawJson.products : [];
        }

        if (freshRaw.length) {
          aligned = ShopRadarData.alignRawToCleaned(freshRaw, cleaned);
          exportRaw = aligned.slice(0, cleaned.length);
          await saveShopCache(domain, {
            products: cleaned,
            rawProducts: exportRaw,
            currency: cache.currency || getActiveCurrencyCode(),
            storeType: storeType === 'sfcc' ? 'sfcc' : cache.storeType || currentStoreType || 'shopify',
          });
        }
      }
    } catch (exportRefetchErr) {
      if (!isBenignRuntimeError(exportRefetchErr)) {
        console.warn('[ShopRadar] 导出前补拉商品失败:', exportRefetchErr);
      }
    }
  }

  rawProductsForExport = exportRaw;
  return { cleaned: cleaned, raw: exportRaw };
}

function showExportSuccessFeedback() {
  if (!exportBtn) {
    return;
  }
  if (exportSuccessTimer) {
    clearTimeout(exportSuccessTimer);
  }
  exportBtn.textContent = getExportBtnSuccessLabel();
  exportBtn.classList.add('is-success');
  exportSuccessTimer = setTimeout(() => {
    exportBtn.textContent = getExportBtnLabel();
    exportBtn.classList.remove('is-success');
    exportSuccessTimer = null;
  }, 2000);
}

async function handleExportClick() {
  if (!(await hasProAccess())) {
    await refreshProStatusWithWebsiteSync({ skipResume: true });
  }
  if (!(await hasProAccess())) {
    showLimitOverlay(UI_TEXT.limitDescDefault);
    return;
  }
  let exportOk = await verifyExportWithServer();
  if (!exportOk) {
    await refreshProStatusWithWebsiteSync({ skipResume: true });
    exportOk = await verifyExportWithServer();
  }
  if (!exportOk) {
    await persistProFlag(false);
    isProSubscriber = false;
    updateProStatusBar(false);
    showLimitOverlay(
      '导出需要有效的 Pro 会话，请确认鉴权服务已启动并已开通 Pro。'
    );
    return;
  }
  if (isProductsLoading) {
    window.alert('数据正在加载中，请稍后...');
    return;
  }
  const exportData = await resolveExportData();
  if (!exportData.cleaned.length && !exportData.raw.length) {
    window.alert('暂无可用数据，请在 Shopify 店铺页面使用本功能。');
    return;
  }
  if (typeof ShopRadarExport === 'undefined' || !ShopRadarExport.downloadExcelFile) {
    window.alert('导出模块未加载，请重新加载扩展后重试。');
    return;
  }
  const headers = getExportCsvHeaders();
  const rows = buildShopifyExportRows(exportData.cleaned, exportData.raw);
  ShopRadarExport.downloadExcelFile(headers, rows, currentShopDomain);
  showExportSuccessFeedback();
}

function bindExportButton() {
  if (!exportBtn) {
    return;
  }
  exportBtn.textContent = getExportBtnLabel();
  exportBtn.addEventListener('click', handleExportClick);
}

/**
 * 绑定「解锁 Pro」按钮
 */
function bindUnlockProButton() {
  if (!unlockProBtn) {
    return;
  }

  unlockProBtn.addEventListener('click', async () => {
    const deviceId = await getOrCreateDeviceId();
    const checkoutUrl = buildLemonSqueezyCheckoutUrl(deviceId);

    if (!checkoutUrl) {
      const raw = (LEMON_SQUEEZY_CHECKOUT_URL || '').trim();
      let hint = '';
      if (raw.indexOf('xxxxxxxx') !== -1) {
        hint =
          '\n\n当前链接里还有占位符 xxxxxxxx，请从 Lemon 复制「完整」Checkout link（buy/ 后面是一串真实 UUID）。';
      } else if (!raw) {
        hint = '\n\n当前为空，请粘贴 Checkout link。';
      }
      window.alert(
        '请配置 Pro 结账链接：\n\n' +
          '1. Lemon 后台：Products → 你的商品 → Share → Checkout link（整段复制）\n' +
          '2. 粘贴到 lemon-checkout.config.js 的 SHOPRADAR_LEMON_CHECKOUT_URL\n' +
          '3. chrome://extensions 重新加载 ShopRadar' +
          hint
      );
      if (proMaskEl && proMaskEl.classList.contains('visible')) {
        requestAnimationFrame(function () {
          try {
            unlockProBtn.focus({ preventScroll: true });
          } catch (focusErr) {
            unlockProBtn.focus();
          }
        });
      }
      return;
    }

    var returnTab = await getActiveBrowserTab();
    if (
      returnTab &&
      returnTab.id != null &&
      returnTab.url &&
      !isRestrictedUrl(returnTab.url) &&
      !isLemonSqueezyHost(extractDomain(returnTab.url)) &&
      typeof ShopRadarLemonReturn !== 'undefined'
    ) {
      await ShopRadarLemonReturn.saveReturnContext(returnTab.id, returnTab.url);
    }

    await markPaymentPending();

    chrome.tabs.create({ url: checkoutUrl }, function (newTab) {
      if (
        newTab &&
        newTab.id != null &&
        typeof ShopRadarLemonReturn !== 'undefined'
      ) {
        ShopRadarLemonReturn.setCheckoutTabId(newTab.id);
      }
    });
  });
}

function bindRefreshProButton() {
  if (!refreshProBtn) {
    return;
  }
  refreshProBtn.textContent = UI_TEXT.refreshProStatus;
  refreshProBtn.addEventListener('click', async function () {
    const prevLabel = refreshProBtn.textContent;
    refreshProBtn.disabled = true;
    refreshProBtn.textContent = UI_TEXT.refreshProStatusWorking;
    try {
      const ok = await pollProActivationAfterCheckout(20000);
      if (ok || (await hasProAccess())) {
        hideLimitOverlay();
        schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
        return;
      }
      window.alert(
        '尚未检测到 Pro。\n\n' +
          '请确认是从本扩展点的「解锁 Pro」完成付款（会自动带上底部 Device ID）。\n' +
          '若刚付完，等 1–2 分钟再点「刷新 Pro 状态」。\n\n' +
          'Device ID: ' +
          (await getOrCreateDeviceId())
      );
    } finally {
      refreshProBtn.disabled = false;
      refreshProBtn.textContent = prevLabel || UI_TEXT.refreshProStatus;
    }
  });
}

function bindClaimProButton() {
  if (!claimProBtn || !claimProEmailEl) {
    return;
  }

  claimProBtn.addEventListener('click', async function () {
    const prevLabel = claimProBtn.textContent;
    claimProBtn.disabled = true;
    claimProEmailEl.disabled = true;
    claimProBtn.textContent = UI_TEXT.claimProWorking;
    setClaimProMessage('');

    try {
      const result = await claimProWithEmail(claimProEmailEl.value);
      if (result.ok) {
        setClaimProMessage(result.msg || UI_TEXT.claimProSuccess, false);
        claimProEmailEl.value = '';
        return;
      }
      setClaimProMessage(result.msg || UI_TEXT.claimProNetworkError, true);
    } finally {
      claimProBtn.disabled = false;
      claimProEmailEl.disabled = false;
      claimProBtn.textContent = prevLabel || UI_TEXT.claimProBtn;
    }
  });

  claimProEmailEl.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      claimProBtn.click();
    }
  });
}

/**
 * 切换 UI 到指定状态面板
 * @param {'loading' | 'success' | 'fail'} state
 */
function showState(state) {
  const map = {
    loading: stateLoading,
    success: stateSuccess,
    fail: stateFail,
  };

  if (state === 'success' || state === 'loading') {
    resetIdleBrowseLayout();
  }

  panels.forEach((panel) => panel.classList.remove('active'));
  map[state].classList.add('active');

  if (state === 'success' || state === 'loading') {
    hideGrantAccessButton();
  }

  mainContent.classList.toggle('has-products', state === 'success');

  if (state === 'success' || state === 'loading') {
    setProSummaryOnlyMode(false);
  }

  statusIndicator.classList.remove('success', 'fail', 'neutral');
  if (state === 'success') {
    statusIndicator.classList.add('success');
    statusIndicator.title =
      currentStoreType === 'sfcc' ? UI_TEXT.statusSfcc : UI_TEXT.statusShopify;
  } else if (state === 'fail') {
    statusIndicator.classList.add('fail');
    statusIndicator.title = UI_TEXT.statusNotShopify;
  } else {
    statusIndicator.classList.add('neutral');
    statusIndicator.title = UI_TEXT.statusDetecting;
  }

  setExportButtonVisible(state === 'success');
}

/**
 * 从标签页 URL 提取店铺域名（hostname）
 * @param {string | undefined} url
 * @returns {string}
 */
function extractDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * 根据检测到的非 Shopify 平台更新文案（保留供 i18n 扩展）
 * @param {string} [platform]
 */
function applyFailPlatformHint(platform) {
  if (!failTitleEl) {
    return;
  }
  if (platform === 'sfcc') {
    failTitleEl.textContent = UI_TEXT.failTitleSfcc;
    return;
  }
  failTitleEl.textContent = UI_TEXT.failTitle;
}

/**
 * 展示「非 Shopify / SFCC 店铺」中性提示（同页不重复转圈；仅静默探测 SPA 晚挂载）
 * @param {string} [platform]
 * @param {string} [domain]
 */
async function showNonShopifyState(platform, domain) {
  hideGrantAccessButton();
  if (domain) {
    currentShopDomain = domain;
  }
  lastDetectedFailPlatform = platform || '';

  const isPro = await hasProAccess();
  await syncProStatusBar();

  const title = isPro
    ? UI_TEXT.proReadySwitchShop
    : platform === 'sfcc'
      ? UI_TEXT.idleHeroTitleNotShopifySfcc
      : UI_TEXT.idleHeroTitleNotShopify;

  showIdlePrompt({
    variant: isPro ? 'pro' : 'neutral',
    title: title,
    desc: isPro ? UI_TEXT.idleHeroDescPro : UI_TEXT.idleHeroDescNotShopify,
    domain: domain || '',
    statusVariant: isPro ? 'success' : 'neutral',
    silentRecovery: Boolean(domain),
  });
}

function clearConfirmedNonShopDomain() {
  lastConfirmedNonShopDomain = '';
}

function stopProductAutoRefresh() {
  if (productAutoRefreshTimer) {
    clearInterval(productAutoRefreshTimer);
    productAutoRefreshTimer = null;
  }
}

/**
 * 成功识别店铺后：侧边栏停留期间定期后台拉 products.json
 * @param {string} domain
 * @param {number | null | undefined} tabId
 */
function startProductAutoRefresh(domain, tabId) {
  stopProductAutoRefresh();
  if (!domain || !tabId) {
    return;
  }
  productAutoRefreshTimer = setInterval(function () {
    if (
      !stateSuccess.classList.contains('active') ||
      currentShopDomain !== domain
    ) {
      stopProductAutoRefresh();
      return;
    }
    requestBackgroundRefresh(tabId, domain, true);
  }, PRODUCT_AUTO_REFRESH_MS);
}

/**
 * SPA 站点 Shopify 脚本晚于首次检测挂载时的静默纠正（不切换 loading）
 * @param {string | undefined} domain
 */
function scheduleFailStateSilentRecovery(domain) {
  clearFailStateRetries();
  if (!domain) {
    return;
  }
  const delays = [5000, 12000];
  delays.forEach(function (delayMs) {
    setTimeout(function () {
      if (
        !isIdleBrowseActive() ||
        lastConfirmedNonShopDomain !== domain
      ) {
        return;
      }
      getActiveBrowserTab()
        .then(async function (tab) {
          if (
            !tab?.id ||
            extractDomain(tab.url) !== domain ||
            lastConfirmedNonShopDomain !== domain
          ) {
            return;
          }
          const recovered = await tryLastChanceStoreDetection(tab, domain);
          if (
            recovered &&
            (recovered.storeType === 'shopify' || recovered.storeType === 'sfcc')
          ) {
            clearConfirmedNonShopDomain();
            await applySupportedDetection(recovered, initRunId);
          }
        })
        .catch(function () {});
    }, delayMs);
  });
}

/**
 * 按店铺类型更新成功态标题与状态灯文案
 * @param {'shopify' | 'sfcc' | 'none'} storeType
 */
function applySuccessStoreLabel(storeType) {
  if (successTitleEl) {
    successTitleEl.textContent =
      storeType === 'sfcc' ? UI_TEXT.successTitleSfcc : UI_TEXT.successTitle;
  }
  if (successEmojiEl) {
    successEmojiEl.textContent =
      storeType === 'sfcc' ? UI_TEXT.successEmojiSfcc : UI_TEXT.successEmoji;
  }
  if (productsSectionTitleEl) {
    productsSectionTitleEl.textContent =
      storeType === 'sfcc' ? UI_TEXT.productsTitleSfcc : UI_TEXT.productsTitle;
  }
}

/**
 * 从当前页强制同步 Shopify.currency.active（加载商品与导出前必调）
 * @param {number | null} tabId
 * @returns {Promise<string>}
 */
async function syncActiveCurrencyFromPage(tabId) {
  if (!tabId) {
    return getActiveCurrencyCode();
  }

  try {
    const currency = await executeInMainWorld(tabId, readActiveCurrencyFromPage);
    applyShopActiveCurrency(currency);
  } catch (error) {
    console.warn('[ShopRadar] 读取 currency.active 失败:', error);
  }

  return getActiveCurrencyCode();
}

/**
 * 页面主世界：根据当前 URL 生成 products.json 地址（含 /am/ 等国家路径 + search）
 * 注入脚本须自包含，逻辑与 shop-url.js 保持一致
 * @returns {string}
 */
function buildProductsJsonFetchUrlInPage() {
  if (
    typeof ShopRadarUrl !== 'undefined' &&
    ShopRadarUrl.buildProductsJsonFetchUrlFromHref
  ) {
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

  var search = urlObj.search || '';
  if (search.charAt(0) === '?') {
    search = search.slice(1);
  }
  var params = new URLSearchParams(search);
  params.delete('page');
  params.set('limit', '50');
  var q = params.toString();
  return baseDataUrl + '/products.json' + (q ? '?' + q : '?limit=50');
}

/**
 * 在页面上下文中发起 fetch（同源，动态国家路径 + search）
 * 通过 chrome.runtime.sendMessage 将 JSON 回传给 popup
 */
function fetchProductsInPageContext(urlCandidates) {
  const messageType = 'SHOPRADAR_PRODUCTS_JSON';

  function pageSafeSendMessage(payload) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        return;
      }
      chrome.runtime.sendMessage(payload, function () {
        try {
          if (chrome.runtime.lastError) {
            console.log(
              'Ignored extension runtime error:',
              chrome.runtime.lastError.message
            );
          }
        } catch (readErr) {
          /* context invalidated */
        }
      });
    } catch (sendErr) {
      /* context invalidated */
    }
  }

  var urls = Array.isArray(urlCandidates) && urlCandidates.length
    ? urlCandidates
    : [buildProductsJsonFetchUrlInPage()];

  function tryFetchAt(index) {
    if (index >= urls.length) {
      pageSafeSendMessage({
        type: messageType,
        ok: false,
        error: '无法获取商品数据',
      });
      return;
    }

    fetch(urls[index])
      .then((response) => {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then((data) => {
        var list = data && Array.isArray(data.products) ? data.products : [];
        if (list.length > 0) {
          pageSafeSendMessage({
            type: messageType,
            ok: true,
            data: data,
          });
          return;
        }
        tryFetchAt(index + 1);
      })
      .catch((error) => {
        if (index + 1 >= urls.length) {
          pageSafeSendMessage({
            type: messageType,
            ok: false,
            error: error && error.message ? error.message : 'fetch failed',
          });
          return;
        }
        tryFetchAt(index + 1);
      });
  }

  tryFetchAt(0);
}

/**
 * 判断 URL 是否为无法注入脚本的系统页
 * @param {string | undefined} url
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  const u = String(url).trim().toLowerCase();
  return (
    u.startsWith('chrome://') ||
    u.startsWith('chrome-error://') ||
    u.startsWith('chrome-extension://') ||
    u.startsWith('edge://') ||
    u.startsWith('edge-error://') ||
    u.startsWith('about:') ||
    u.startsWith('devtools://')
  );
}

/** 页面崩溃/无法打开等，注入必然失败，不必反复 warn */
function isBenignInjectError(err) {
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isBenignInjectError) {
    return ShopRadarGuard.isBenignInjectError(err);
  }
  return false;
}

function isBenignRuntimeError(err) {
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isBenignRuntimeError) {
    return ShopRadarGuard.isBenignRuntimeError(err);
  }
  return isBenignInjectError(err);
}

function isUserGestureRequiredError(err) {
  var msg = String(err && err.message ? err.message : err);
  return msg.indexOf('user gesture') !== -1;
}

function isExtensionContextInvalidated(err) {
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isBenignRuntimeError) {
    if (ShopRadarGuard.isBenignRuntimeError(err)) {
      var msg = String(err && err.message ? err.message : err);
      if (msg.indexOf('Extension context invalidated') !== -1) {
        return true;
      }
    }
  }
  var msg = String(err && err.message ? err.message : err);
  return msg.indexOf('Extension context invalidated') !== -1;
}

function showExtensionReloadHint() {
  showIdlePrompt({
    variant: 'reload',
    title: UI_TEXT.idleHeroTitleReload,
    desc: UI_TEXT.idleHeroDescReload,
    statusVariant: 'neutral',
  });
}

/** 明显非独立站/电商的域名（跳过长时间检测与 products.json 探测） */
var NON_RETAIL_DOMAIN_SUFFIXES = [
  'google.com',
  'google.com.hk',
  'googleapis.com',
  'gstatic.com',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'microsoft.com',
  'office.com',
  'live.com',
  'bing.com',
  'apple.com',
  'icloud.com',
  'github.com',
  'gitlab.com',
  'stackoverflow.com',
  'reddit.com',
  'wikipedia.org',
  'baidu.com',
  'zhihu.com',
  'bilibili.com',
  'notion.so',
  'figma.com',
  'lemonsqueezy.com',
  'shopradar.uk',
  'localhost',
  '127.0.0.1',
];

/**
 * 是否为已知非电商站（如 gemini.google.com、youtube.com）
 * @param {string} domain
 * @returns {boolean}
 */
function isNonRetailDomain(domain) {
  var host = (domain || '').toLowerCase().trim();
  if (!host) {
    return true;
  }
  for (var i = 0; i < NON_RETAIL_DOMAIN_SUFFIXES.length; i++) {
    var suffix = NON_RETAIL_DOMAIN_SUFFIXES[i];
    if (host === suffix || host.endsWith('.' + suffix)) {
      return true;
    }
  }
  return false;
}

function isLemonSqueezyHost(domain) {
  var host = (domain || '').toLowerCase();
  return host === 'lemonsqueezy.com' || host.endsWith('.lemonsqueezy.com');
}

/**
 * 当前标签页不是可分析的独立站（支付页、Google、系统页等）
 * @param {chrome.tabs.Tab | null | undefined} tab
 */
function isNonShopBrowseContext(tab) {
  if (!tab?.url) {
    return true;
  }
  if (isRestrictedUrl(tab.url)) {
    return true;
  }
  return isNonRetailDomain(extractDomain(tab.url));
}

/**
 * 支付完成后在 Lemon 页轮询本机 Pro 状态（等待 Webhook 写入）
 */
async function pollProActivationAfterPayment(runId, maxWaitMs) {
  const deadline = Date.now() + (maxWaitMs || 20000);
  const prevLoadingText = loadingTextEl ? loadingTextEl.textContent : '';

  while (Date.now() < deadline) {
    if (runId !== initRunId) {
      return false;
    }

    if (loadingTextEl) {
      loadingTextEl.textContent = UI_TEXT.paymentConfirming;
    }

    const ok = await refreshProStatusWithWebsiteSync({ skipResume: true });
    if (ok && (await hasProAccess())) {
      await clearPaymentPending();
      if (typeof ShopRadarLemonReturn !== 'undefined') {
        await ShopRadarLemonReturn.returnToShopAfterPayment();
      }
      if (loadingTextEl) {
        loadingTextEl.textContent = prevLoadingText || UI_TEXT.loading;
      }
      schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
      return true;
    }

    await delay(2000);
  }

  if (loadingTextEl) {
    loadingTextEl.textContent = prevLoadingText || UI_TEXT.loading;
  }
  return await hasProAccess();
}

/**
 * 非店铺页（含 Lemon 支付成功页）的提示，避免对支付页做店铺检测一直转圈
 */
async function showNonShopBrowseState(domain) {
  const confirmedPro = await hasProAccess();
  updateProStatusBar(confirmedPro);

  if (isLemonSqueezyHost(domain) && (await isPaymentRecentlyPending())) {
    showIdlePrompt({
      variant: 'neutral',
      title: UI_TEXT.paymentPendingSwitchShop,
      desc: UI_TEXT.paymentConfirming,
      domain: domain || '',
      statusVariant: 'neutral',
    });
    return;
  }

  if (confirmedPro) {
    showIdlePrompt({
      variant: 'pro',
      title: UI_TEXT.proReadySwitchShop,
      desc: UI_TEXT.idleHeroDescPro,
      domain: domain || '',
      statusVariant: 'success',
    });
    return;
  }

  showIdlePrompt({
    variant: 'neutral',
    title: UI_TEXT.idleHeroTitleReady,
    desc: isLemonSqueezyHost(domain)
      ? UI_TEXT.paymentPendingSwitchShop
      : UI_TEXT.idleHeroDescFree,
    domain: domain || '',
    statusVariant: 'neutral',
  });
}

/** init 结束仍停在 loading 时兜底（避免并发 init 或异常导致无限转圈） */
async function ensureInitNotStuckOnLoading(runId) {
  if (runId !== initRunId) {
    return;
  }
  if (!stateLoading.classList.contains('active')) {
    return;
  }

  const tab = await getActiveBrowserTab();
  const domain = tab?.url ? extractDomain(tab.url) : '';
  if (domain && tab?.id && !isNonShopBrowseContext(tab)) {
    let detection = null;
    try {
      detection = await executeInMainWorld(tab.id, detectStoreInPage);
    } catch (injectErr) {
      /* ignore */
    }
    if (detection?.platform === 'sfcc' && runId === initRunId) {
      await ShopRadarDetectionCache.clearNegative(domain);
      await persistResult({
        isShopify: false,
        domain: domain,
        currency: '',
        platform: 'sfcc',
        storeType: 'sfcc',
      });
      await finishSupportedStoreInit(domain, tab.id, 'sfcc', runId);
      return;
    }
    if (detection?.isShopify && runId === initRunId) {
      await ShopRadarDetectionCache.clearNegative(domain);
      await persistResult({
        isShopify: true,
        domain: domain,
        currency: getActiveCurrencyCode(),
        platform: '',
        storeType: 'shopify',
      });
      await finishSupportedStoreInit(domain, tab.id, 'shopify', runId);
      return;
    }

    const probed = await probeShopifyByProductsJson(domain, tab.id, {
      timeoutMs: INSTANT_PROBE_TIMEOUT_MS,
    });
    if (probed && runId === initRunId) {
      await ShopRadarDetectionCache.clearNegative(domain);
      await persistResult({
        isShopify: true,
        domain: domain,
        currency: getActiveCurrencyCode(),
        platform: '',
        storeType: 'shopify',
      });
      await finishSupportedStoreInit(domain, tab.id, 'shopify', runId);
      return;
    }
    if ((await probeSfccByPageMarkers(tab.id)) && runId === initRunId) {
      await ShopRadarDetectionCache.clearNegative(domain);
      await persistResult({
        isShopify: false,
        domain: domain,
        currency: '',
        platform: 'sfcc',
        storeType: 'sfcc',
      });
      await finishSupportedStoreInit(domain, tab.id, 'sfcc', runId);
      return;
    }
  }

  console.warn('[ShopRadar] init 未切换界面，离开 loading 兜底');
  const recovered =
    tab && domain
      ? await tryLastChanceStoreDetection(tab, domain)
      : null;
  if (recovered && runId === initRunId) {
    if (recovered.storeType === 'shopify' || recovered.storeType === 'sfcc') {
      await ShopRadarDetectionCache.clearNegative(domain);
      await persistResult({
        isShopify: recovered.isShopify,
        domain: recovered.domain,
        currency: recovered.currency,
        platform: recovered.platform,
        storeType: recovered.storeType,
      });
      await finishSupportedStoreInit(
        recovered.domain,
        recovered.tabId,
        recovered.storeType,
        runId
      );
      return;
    }
  }

  const bgProbe =
    tab && domain ? await probeShopifyViaBackground(tab.id, domain) : null;
  if (bgProbe?.isShopify && runId === initRunId && tab?.id) {
    await ShopRadarDetectionCache.clearNegative(domain);
    await persistResult({
      isShopify: true,
      domain: domain,
      currency: getActiveCurrencyCode(),
      platform: '',
      storeType: 'shopify',
    });
    await finishSupportedStoreInit(domain, tab.id, 'shopify', runId);
    return;
  }

  if (runId === initRunId) {
    if (await tryRecoverKnownSiteWithoutPermission(tab, domain, runId)) {
      return;
    }
    if (await shouldPromptForSitePermission(tab, domain)) {
      showPermissionRequiredState();
      return;
    }
    showNonShopifyState(lastDetectedFailPlatform || '', domain);
  }
}

/**
 * 延迟指定毫秒（用于检测重试）
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
  let timer = null;
  const timeoutPromise = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      reject(new Error((label || 'operation') + ' timed out'));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(function () {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * 等待标签页进入 complete 状态（避免刚打开站时误判为非 Shopify）
 * @param {number} tabId
 * @param {number} [maxWaitMs]
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function waitForTabComplete(tabId, maxWaitMs) {
  const limit = maxWaitMs || 15000;
  const start = Date.now();

  while (Date.now() - start < limit) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') {
      return tab;
    }
    await delay(200);
  }

  return chrome.tabs.get(tabId);
}

/** document complete 后等待 Shopify 脚本注入的时间（SPA 常晚于 complete） */
const POST_COMPLETE_SETTLE_MS = 800;

/** 检测最大重试次数（页面/Shopify 脚本延迟加载） */
const DETECTION_MAX_ATTEMPTS = 12;
const DETECTION_RETRY_INTERVAL_MS = 400;
const DETECTION_FAST_MAX_ATTEMPTS = 2;
const DETECTION_FAST_RETRY_INTERVAL_MS = 150;

/** 非 Shopify 失败态不再周期性全量 init（见 scheduleFailStateSilentRecovery） */
let failStateRetryTimer = null;

function schedulePanelRefresh(options) {
  pendingPanelRefreshOptions = {
    ...(pendingPanelRefreshOptions || {}),
    ...(options || {}),
  };
  panelRefreshGeneration += 1;

  if (initInProgress) {
    return;
  }

  schedulePanelRefreshDebounced();
}

function schedulePanelRefreshDebounced() {
  const generation = panelRefreshGeneration;

  if (panelRefreshTimer) {
    clearTimeout(panelRefreshTimer);
  }

  const options = pendingPanelRefreshOptions || {};
  const delayMs =
    options.softRefresh ? PANEL_SOFT_REFRESH_DEBOUNCE_MS : PANEL_REFRESH_DEBOUNCE_MS;

  panelRefreshTimer = setTimeout(function () {
    panelRefreshTimer = null;
    if (generation !== panelRefreshGeneration) {
      return;
    }

    const runOptions = pendingPanelRefreshOptions || {};
    pendingPanelRefreshOptions = null;

    if (runOptions.softRefresh && stateSuccess.classList.contains('active')) {
      getActiveBrowserTab()
        .then(function (tab) {
          const domain = tab?.url ? extractDomain(tab.url) : '';
          if (domain && domain === currentShopDomain) {
            return;
          }
          runInitWithWatchdog(runOptions).catch(handleInitError);
        })
        .catch(function () {
          runInitWithWatchdog(runOptions).catch(handleInitError);
        });
      return;
    }

    runInitWithWatchdog(runOptions).catch(handleInitError);
  }, delayMs);
}

function handleInitError(err) {
  if (isExtensionContextInvalidated(err)) {
    showExtensionReloadHint();
    return;
  }
  if (isUserGestureRequiredError(err)) {
    console.warn('[ShopRadar] 权限请求需用户点击，已显示授权按钮');
    showPermissionRequiredState();
    return;
  }
  if (isBenignRuntimeError(err)) {
    console.warn('[ShopRadar] init 跳过:', err);
    return;
  }
  console.warn('[ShopRadar] init 异常:', err);
  if (stateLoading.classList.contains('active')) {
    showIdlePrompt({
      variant: 'neutral',
      title: UI_TEXT.idleHeroTitleReady,
      desc: UI_TEXT.idleHeroDescFree,
      statusVariant: 'neutral',
    });
    isProductsLoading = false;
  }
}

/**
 * 仅检查是否已有 host / 注入权限（不在 init 中弹权限窗，避免 user gesture 报错）
 * @param {chrome.tabs.Tab | null | undefined} tab
 * @returns {Promise<boolean>}
 */
async function ensureScriptingAccessForTab(tab) {
  return hasScriptingAccessForTab(tab);
}

/**
 * 用户点击「允许访问」时申请 host 权限（必须在 click 等用户手势内调用）
 * @param {chrome.tabs.Tab | null | undefined} tab
 * @returns {Promise<boolean>}
 */
async function requestScriptingAccessForTab(tab) {
  if (!tab?.url || typeof ShopRadarPermissions === 'undefined') {
    return false;
  }
  if (!ShopRadarPermissions.isAnalyzableStoreUrl(tab.url)) {
    return false;
  }
  if (await hasExtensionFetchAccessForTab(tab.id)) {
    return true;
  }
  try {
    let granted = false;
    if (ShopRadarPermissions.requestHostPermissionForUrlAndAliases) {
      granted = await ShopRadarPermissions.requestHostPermissionForUrlAndAliases(
        tab.url
      );
    } else {
      granted = await ShopRadarPermissions.requestHostPermissionForUrl(tab.url);
    }
    if (granted) {
      await rememberSiteAccessSuccess(extractDomain(tab.url));
    }
    return granted;
  } catch (permErr) {
    if (isUserGestureRequiredError(permErr)) {
      return false;
    }
    return false;
  }
}

/**
 * 是否能在目标页注入脚本（host 权限或 activeTab 临时权限）
 * @param {number | null | undefined} tabId
 * @returns {Promise<boolean>}
 */
async function canInjectScriptIntoTab(tabId) {
  if (!tabId) {
    return false;
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function pingShopRadarScriptAccess() {
        return true;
      },
    });
    return Boolean(results[0]?.result);
  } catch (injectErr) {
    return false;
  }
}

/**
 * 是否已具备 host 权限或 activeTab 注入能力
 * @param {chrome.tabs.Tab | null | undefined} tab
 * @returns {Promise<boolean>}
 */
async function hasScriptingAccessForTab(tab) {
  if (!tab?.id || !tab.url) {
    return false;
  }
  if (await hasExtensionFetchAccessForTab(tab.id)) {
    return true;
  }
  return canInjectScriptIntoTab(tab.id);
}

/**
 * 请 Background 用 extension fetch / 页面注入探测 Shopify（popup 注入失败时的兜底）
 * @param {number | null | undefined} tabId
 * @param {string} domain
 * @returns {Promise<{ isShopify: boolean, currency?: string } | null>}
 */
async function probeShopifyViaBackground(tabId, domain) {
  if (!tabId || !domain) {
    return null;
  }
  try {
    const resp = await runtimeSendMessage({
      type: MSG_PROBE_SHOPIFY_TAB,
      tabId: tabId,
      domain: domain,
    });
    if (resp && resp.isShopify) {
      return resp;
    }
  } catch (bgProbeErr) {
    /* ignore */
  }
  return null;
}

function hideGrantAccessButton() {
  if (grantAccessBtnEl) {
    grantAccessBtnEl.classList.add('hidden');
  }
}

/**
 * 缺少站点权限时提示用户点击授权（避免误判为非 Shopify）
 */
function showPermissionRequiredState() {
  currentStoreType = 'none';
  showIdlePrompt({
    variant: 'permission',
    title: UI_TEXT.idleHeroTitlePermission,
    desc: UI_TEXT.idleHeroDescPermission,
    statusVariant: 'neutral',
    showGrantAccess: true,
  });
}

function bindGrantAccessButton() {
  if (!grantAccessBtnEl) {
    return;
  }
  grantAccessBtnEl.addEventListener('click', function () {
    getActiveBrowserTab()
      .then(async function (tab) {
        if (!tab?.url || typeof ShopRadarPermissions === 'undefined') {
          return;
        }
        const granted = await requestScriptingAccessForTab(tab);
        if (!granted) {
          return;
        }
        hideGrantAccessButton();
        schedulePanelRefresh({ forceRecheck: true });
      })
      .catch(function () {});
  });
}

/**
 * 注入 / products.json 均未命中时的最后兜底（避免超时误判为非 Shopify）
 * @param {chrome.tabs.Tab | null | undefined} tab
 * @param {string} domain
 * @returns {Promise<object | null>}
 */
async function tryLastChanceStoreDetection(tab, domain) {
  if (!tab?.id || !domain || isNonRetailDomain(domain)) {
    return null;
  }

  let detection = null;
  try {
    detection = await executeInMainWorld(tab.id, detectStoreInPage);
  } catch (injectErr) {
    /* ignore */
  }

  if (detection?.isShopify) {
    currentStoreType = 'shopify';
    applyShopActiveCurrency(detection.currency);
    return {
      storeType: 'shopify',
      isShopify: true,
      domain: domain,
      tabId: tab.id,
      currency: getActiveCurrencyCode(),
      platform: '',
    };
  }

  if (detection?.platform === 'sfcc') {
    return buildSfccDetection(domain, tab.id);
  }

  const probed = await probeShopifyByProductsJson(domain, tab.id, {
    timeoutMs: 5000,
  });
  if (probed) {
    return buildShopifyProbeDetection(domain, tab.id);
  }

  const bgProbe = await probeShopifyViaBackground(tab.id, domain);
  if (bgProbe?.isShopify) {
    return buildShopifyProbeDetection(domain, tab.id);
  }

  return null;
}

async function runInitWithWatchdog(options) {
  initInProgress = true;
  let watchdogFired = false;
  const watchdogId = setTimeout(function () {
    if (!stateLoading.classList.contains('active')) {
      return;
    }
    watchdogFired = true;
    console.warn('[ShopRadar] init 超时，强制离开 loading');
    ensureInitNotStuckOnLoading(initRunId).catch(function () {});
  }, INIT_LOADING_WATCHDOG_MS);

  try {
    await init(options);
  } finally {
    initInProgress = false;
    clearTimeout(watchdogId);
    pendingPanelRefreshOptions = null;
  }
}

function clearFailStateRetries() {
  if (failStateRetryTimer) {
    clearInterval(failStateRetryTimer);
    failStateRetryTimer = null;
  }
}

/**
 * 后台静默重检店铺类型 / 商品（不进入 loading）
 * @param {chrome.tabs.Tab} tab
 * @param {string} domain
 * @param {number} runId
 */
function runSilentStoreRefresh(tab, domain, runId) {
  if (!tab?.id || !domain) {
    return;
  }
  requestBackgroundRefresh(tab.id, domain, true);
  runDetection({ fast: true, tab: tab })
    .then(async function (detection) {
      if (runId !== initRunId) {
        return;
      }
      if (detection.storeType === 'shopify' || detection.storeType === 'sfcc') {
        await applySupportedDetection(detection, runId);
      }
    })
    .catch(function () {});
}

/**
 * 对当前活跃标签页执行 Shopify 检测（含等待加载 + 多次重试）
 * @returns {Promise<{ storeType: 'shopify'|'sfcc'|'none', isShopify: boolean, domain: string, tabId: number | null, currency: string, platform: string }>}
 */
/**
 * 应用负向缓存结果（非 Shopify，跳过检测与转圈）
 * @param {string} domain
 * @param {string} platform
 * @param {number | null} tabId
 * @returns {{ storeType: 'none', isShopify: boolean, domain: string, tabId: number | null, currency: string, platform: string, fromNegativeCache: boolean }}
 */
function buildNegativeCacheDetection(domain, platform, tabId) {
  shopCurrencyCode = '';
  currentStoreType = 'none';
  return {
    storeType: 'none',
    isShopify: false,
    domain: domain,
    tabId: tabId,
    currency: '',
    platform: platform || '',
    fromNegativeCache: true,
  };
}

/**
 * 单次注入快速识别 Shopify / SFCC（冷启动优先路径，失败则走完整 runDetection）
 * @param {chrome.tabs.Tab} tab
 * @param {{ fast?: boolean }} [options]
 * @returns {Promise<object | null>}
 */
async function quickDetectStore(tab, options) {
  const fast = Boolean(options && options.fast);
  if (!tab?.id) {
    return null;
  }

  const domain = extractDomain(tab.url);
  if (isRestrictedUrl(tab.url) || isNonRetailDomain(domain)) {
    return null;
  }

  activeTabId = tab.id;
  await rememberContextTabId(tab.id);

  try {
    const freshTab = await chrome.tabs.get(tab.id);
    if (freshTab.status !== 'complete') {
      await waitForTabComplete(tab.id, fast ? 8000 : 12000);
    }
  } catch (waitErr) {
    console.warn('[ShopRadar] quickDetect 等待标签页失败:', waitErr);
  }

  await delay(fast ? QUICK_DETECT_SETTLE_MS : POST_COMPLETE_SETTLE_MS);

  if (isKnownSfccDomain(domain)) {
    let knownSfccDetection = null;
    try {
      knownSfccDetection = await executeInMainWorld(tab.id, detectStoreInPage);
    } catch (injectErr) {
      if (!isBenignInjectError(injectErr)) {
        console.warn('[ShopRadar] quickDetect SFCC 注入失败:', injectErr);
      }
    }
    const knownResolved = await resolveDomDetection(
      knownSfccDetection,
      domain,
      tab.id
    );
    if (knownResolved) {
      return knownResolved;
    }
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildSfccDetection(domain, tab.id);
  }

  let detection;
  try {
    detection = await executeInMainWorld(tab.id, detectStoreInPage);
  } catch (injectErr) {
    if (!isBenignInjectError(injectErr)) {
      console.warn('[ShopRadar] quickDetect 注入失败:', injectErr);
    }
    const probedAfterInjectFail = await probeShopifyByProductsJson(domain, tab.id, {
      timeoutMs: fast ? FAST_PROBE_TIMEOUT_MS : INSTANT_PROBE_TIMEOUT_MS,
    });
    if (probedAfterInjectFail) {
      await ShopRadarDetectionCache.clearNegative(domain);
      return buildShopifyProbeDetection(domain, tab.id);
    }
    return null;
  }

  const resolved = await resolveDomDetection(detection, domain, tab.id);
  if (resolved) {
    return resolved;
  }

  const probed = await probeShopifyByProductsJson(domain, tab.id, {
    timeoutMs: fast ? FAST_PROBE_TIMEOUT_MS : INSTANT_PROBE_TIMEOUT_MS,
  });
  if (probed) {
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildShopifyProbeDetection(domain, tab.id);
  }

  return null;
}

/**
 * products.json 探测确认为 Shopify 时的标准返回值
 */
function buildShopifyProbeDetection(domain, tabId) {
  currentStoreType = 'shopify';
  applyShopActiveCurrency('USD');
  return {
    storeType: 'shopify',
    isShopify: true,
    domain,
    tabId: tabId,
    currency: getActiveCurrencyCode(),
    platform: '',
    fromNegativeCache: false,
  };
}

/**
 * SFCC / Demandware 探测确认为可分析店铺时的标准返回值
 */
function buildSfccDetection(domain, tabId) {
  currentStoreType = 'sfcc';
  shopCurrencyCode = '';
  return {
    storeType: 'sfcc',
    isShopify: false,
    domain,
    tabId: tabId,
    currency: '',
    platform: 'sfcc',
    fromNegativeCache: false,
  };
}

function isKnownSfccDomain(domain) {
  return typeof isKnownSfccDomainHint === 'function' && isKnownSfccDomainHint(domain);
}

/**
 * 将 DOM 注入检测结果转为标准 detection 对象
 * @returns {Promise<object | null>}
 */
async function resolveDomDetection(detection, domain, tabId) {
  if (!detection) {
    return null;
  }

  const platform = detection.platform ? String(detection.platform) : '';
  if (platform === 'sfcc') {
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildSfccDetection(domain, tabId);
  }

  if (detection.isShopify) {
    currentStoreType = 'shopify';
    applyShopActiveCurrency(detection.currency);
    await ShopRadarDetectionCache.clearNegative(domain);
    return {
      storeType: 'shopify',
      isShopify: true,
      domain,
      tabId: tabId,
      currency: getActiveCurrencyCode(),
      platform: '',
    };
  }

  return null;
}

/**
 * 页面 DOM 是否含 Demandware / SFCC 标记（MVMT 等）
 * @param {number | null} tabId
 * @returns {Promise<boolean>}
 */
async function probeSfccByPageMarkers(tabId) {
  if (!tabId) {
    return false;
  }
  try {
    const detection = await executeInMainWorld(tabId, detectStoreInPage);
    return detection?.platform === 'sfcc';
  } catch (probeErr) {
    return false;
  }
}

/**
 * 已识别店铺：鉴权 → 缓存秒开或拉取商品
 * @returns {Promise<boolean>}
 */
async function finishSupportedStoreInit(domain, tabId, storeType, runId) {
  clearFailStateRetries();
  clearConfirmedNonShopDomain();
  currentShopDomain = domain;
  applySuccessStoreLabel(storeType);
  shopDomainEl.textContent = domain + '  |  ' + getActiveCurrencyCode();

  const cache = await readShopCache(domain);
  if (runId !== initRunId) {
    return false;
  }

  if (cache?.products?.length) {
    if (!(await hasProAccess())) {
      const allowed = await ensureQueryAllowed(domain);
      if (runId !== initRunId) {
        return false;
      }
      if (!allowed) {
        showState('success');
        rawProductsForExport = null;
        renderProductList([]);
        setProductsLoading(false);
        return false;
      }
    }

    hydrateFromShopCache(domain, cache);
    showState('success');
    setProductsLoading(false);
    const stale =
      !cache.timestamp || Date.now() - cache.timestamp > CACHE_STALE_MS;
  if (!isQueryLimitLocked && tabId) {
    requestBackgroundRefresh(tabId, domain, stale);
    startProductAutoRefresh(domain, tabId);
  }
  rememberSiteAccessSuccess(domain).catch(function () {});
  return true;
}

  const allowed = await ensureQueryAllowed(domain);
  if (runId !== initRunId) {
    return false;
  }
  if (!allowed) {
    showState('success');
    rawProductsForExport = null;
    renderProductList([]);
    setProductsLoading(false);
    return false;
  }
  showState('success');
  setProductsLoading(true);
  await loadAndRenderProducts(domain, tabId, { skipQuotaCheck: true });
  if (!isQueryLimitLocked && tabId) {
    requestBackgroundRefresh(tabId, domain, true);
    startProductAutoRefresh(domain, tabId);
  }
  return true;
}

/**
 * 首屏极速路径：页面 complete 时并行注入 + 短超时 products.json
 * @returns {Promise<object | null>}
 */
async function fastFirstDetect(tab, runId) {
  if (!tab?.id || !tab.url || isRestrictedUrl(tab.url)) {
    return null;
  }

  const domain = extractDomain(tab.url);
  if (!domain || isNonRetailDomain(domain)) {
    return null;
  }

  try {
    const freshTab = await chrome.tabs.get(tab.id);
    if (freshTab.status !== 'complete') {
      return null;
    }
  } catch (tabErr) {
    console.warn('[ShopRadar] fastFirstDetect 读取标签页失败:', tabErr);
    return null;
  }

  activeTabId = tab.id;

  const skipProductsProbe = isKnownSfccDomain(domain);
  const [detection, probed] = await Promise.all([
    executeInMainWorld(tab.id, detectStoreInPage).catch(function () {
      return null;
    }),
    skipProductsProbe
      ? Promise.resolve(false)
      : probeShopifyByProductsJson(domain, tab.id, {
          timeoutMs: FAST_PROBE_TIMEOUT_MS,
        }),
  ]);

  if (skipProductsProbe) {
    const sfccResolved = await resolveDomDetection(detection, domain, tab.id);
    if (sfccResolved) {
      return sfccResolved;
    }
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildSfccDetection(domain, tab.id);
  }

  const resolved = await resolveDomDetection(detection, domain, tab.id);
  if (resolved) {
    return resolved;
  }

  if (probed) {
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildShopifyProbeDetection(domain, tab.id);
  }

  /* 注入/探测均未确认 Shopify 时交给 quickDetect / runDetection，避免误写负向缓存 */
  return null;
}

/**
 * 已识别平台缓存命中时跳过 loading（7 天 TTL）
 * @returns {Promise<boolean>}
 */
async function tryInstantPlatformCache(domain, tab, runId, forceRecheck) {
  if (forceRecheck || !domain || !tab?.id) {
    return false;
  }

  const positive = await ShopRadarDetectionCache.readPositive(domain);
  if (!positive || runId !== initRunId) {
    return false;
  }

  const detection =
    positive.storeType === 'sfcc'
      ? buildSfccDetection(domain, tab.id)
      : {
          storeType: 'shopify',
          isShopify: true,
          domain: domain,
          tabId: tab.id,
          currency: getActiveCurrencyCode(),
          platform: '',
        };

  return applySupportedDetection(detection, runId);
}

/**
 * 负向缓存命中时立即显示非 Shopify
 */
async function tryInstantNegativeCache(domain, runId, forceRecheck, options) {
  if (forceRecheck || !domain) {
    return false;
  }
  if (options && options.softRefresh) {
    return false;
  }

  const negative = await ShopRadarDetectionCache.readNegative(domain);
  if (!negative || runId !== initRunId) {
    return false;
  }
  /* 仅对明确 SFCC 负向缓存秒退；Shopify 误判的缓存不再跳过检测 */
  if (negative.platform !== 'sfcc') {
    return false;
  }

  lastDetectedFailPlatform = negative.platform || '';
  showNonShopifyState(negative.platform, domain);
  return true;
}

/**
 * 将检测结果写入 UI（Shopify / SFCC）
 * @returns {Promise<boolean>}
 */
async function applySupportedDetection(detection, runId) {
  if (!detection || detection.instantFail || isStaleInit(runId)) {
    return false;
  }

  const storeType = detection.storeType;
  if (storeType !== 'shopify' && storeType !== 'sfcc') {
    return false;
  }

  await persistResult({
    isShopify: detection.isShopify,
    domain: detection.domain,
    currency: detection.currency,
    platform: detection.platform,
    storeType: detection.storeType,
  });

  return finishSupportedStoreInit(
    detection.domain,
    detection.tabId,
    storeType,
    runId
  );
}

async function runDetection(options) {
  const forceRecheck = Boolean(options && options.forceRecheck);
  const fast = Boolean(options && options.fast);
  const tab =
    options && options.tab ? options.tab : await getActiveBrowserTab();

  if (!tab || !tab.id) {
    shopCurrencyCode = '';
    currentStoreType = 'none';
    return {
      storeType: 'none',
      isShopify: false,
      domain: '',
      tabId: null,
      currency: '',
      platform: '',
    };
  }

  activeTabId = tab.id;
  await rememberContextTabId(tab.id);
  const domain = extractDomain(tab.url);

  if (isRestrictedUrl(tab.url)) {
    shopCurrencyCode = '';
    currentStoreType = 'none';
    return {
      storeType: 'none',
      isShopify: false,
      domain,
      tabId: tab.id,
      currency: '',
      platform: '',
    };
  }

  if (isNonRetailDomain(domain)) {
    shopCurrencyCode = '';
    currentStoreType = 'none';
    return {
      storeType: 'none',
      isShopify: false,
      domain,
      tabId: tab.id,
      currency: '',
      platform: '',
    };
  }

  if (!forceRecheck) {
    const cachedNegative = await ShopRadarDetectionCache.readNegative(domain);
    if (cachedNegative && cachedNegative.platform === 'sfcc') {
      lastDetectedFailPlatform = cachedNegative.platform || '';
      return buildNegativeCacheDetection(
        domain,
        cachedNegative.platform,
        tab.id
      );
    }
  }

  let lastPlatform = '';

  try {
    if (!fast) {
      await waitForTabComplete(tab.id);
      await delay(POST_COMPLETE_SETTLE_MS);
    } else {
      try {
        const freshTab = await chrome.tabs.get(tab.id);
        if (freshTab.status !== 'complete') {
          await waitForTabComplete(tab.id, 5000);
        }
      } catch (waitErr) {
        console.warn('[ShopRadar] fast 检测等待标签页失败:', waitErr);
      }
      await delay(QUICK_DETECT_SETTLE_MS);
    }

    if (isKnownSfccDomain(domain)) {
      let knownDetection = null;
      try {
        knownDetection = await executeInMainWorld(tab.id, detectStoreInPage);
      } catch (injectErr) {
        if (!isBenignInjectError(injectErr)) {
          console.warn('[ShopRadar] 已知 SFCC 注入失败:', injectErr);
        }
      }
      const knownResolved = await resolveDomDetection(
        knownDetection,
        domain,
        tab.id
      );
      if (knownResolved) {
        debugLog('[ShopRadar] 已知 SFCC 店铺 DOM 探测成功');
        return knownResolved;
      }
      await ShopRadarDetectionCache.clearNegative(domain);
      return buildSfccDetection(domain, tab.id);
    }

    const maxAttempts = fast ? DETECTION_FAST_MAX_ATTEMPTS : DETECTION_MAX_ATTEMPTS;
    const retryInterval = fast
      ? DETECTION_FAST_RETRY_INTERVAL_MS
      : DETECTION_RETRY_INTERVAL_MS;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let detection = null;
      try {
        detection = await executeInMainWorld(tab.id, detectStoreInPage);
      } catch (injectErr) {
        if (!isBenignInjectError(injectErr)) {
          console.warn('[ShopRadar] 页面注入检测失败，第', attempt + 1, '次:', injectErr);
        }
      }

      const platform = detection?.platform ? String(detection.platform) : '';
      if (detection?.platform) {
        lastPlatform = platform;
      }

      const resolved = await resolveDomDetection(detection, domain, tab.id);
      if (resolved) {
        if (attempt > 0) {
          debugLog('[ShopRadar] 延迟检测成功，第', attempt + 1, '次');
        }
        return resolved;
      }

      if (attempt < maxAttempts - 1) {
        await delay(retryInterval);
      }
    }

    const probedEarly = await probeShopifyByProductsJson(domain, tab.id, {
      timeoutMs: fast ? FAST_PROBE_TIMEOUT_MS : INSTANT_PROBE_TIMEOUT_MS,
    });
    if (probedEarly) {
      await ShopRadarDetectionCache.clearNegative(domain);
      debugLog('[ShopRadar] products.json 探测确认为 Shopify');
      return buildShopifyProbeDetection(domain, tab.id);
    }
  } catch (error) {
    if (isBenignRuntimeError(error)) {
      debugLog('[ShopRadar] 检测流程跳过:', error);
    } else {
      console.warn('[ShopRadar] 检测流程异常:', error);
    }
  }

  shopCurrencyCode = '';
  if (lastPlatform === 'sfcc') {
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildSfccDetection(domain, tab.id);
  }

  if (domain && !isNonRetailDomain(domain)) {
    const probedLate = await probeShopifyByProductsJson(domain, tab.id, {
      timeoutMs: INSTANT_PROBE_TIMEOUT_MS,
    });
    if (probedLate) {
      await ShopRadarDetectionCache.clearNegative(domain);
      debugLog('[ShopRadar] products.json 兜底探测确认为 Shopify');
      return buildShopifyProbeDetection(domain, tab.id);
    }
  }

  currentStoreType = 'none';
  lastDetectedFailPlatform = lastPlatform;
  if (domain && lastPlatform === 'sfcc') {
    ShopRadarDetectionCache.saveNegative(domain, lastPlatform).catch(function () {});
  }
  return {
    storeType: 'none',
    isShopify: false,
    domain,
    tabId: tab.id,
    currency: '',
    platform: lastPlatform,
    fromNegativeCache: false,
  };
}

/**
 * 将 ISO 时间格式化为 YYYY-MM-DD
 * @param {string | undefined} isoString
 * @returns {string}
 */
function formatCreatedAt(isoString) {
  if (!isoString) return '\u2014';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/**
 * 清洗 products.json 原始数据，提取列表渲染所需字段
 * @param {object} rawJson
 * @returns {Array<{ title: string, image: string, price: string, compareAtPrice: string|null, createdAt: string, createdAtRaw: string }>}
 */
function cleanProducts(rawJson) {
  return ShopRadarData.cleanProducts(
    rawJson,
    getActiveCurrencyCode(),
    PLACEHOLDER_IMAGE
  );
}

/**
 * 通过 Message Passing：在目标页上下文 fetch 并等待 popup 接收回传
 * @param {number} tabId
 * @returns {Promise<object>}
 */
function fetchProductsViaPageContext(tabId, urlCandidates) {
  return new Promise((resolve, reject) => {
    const timeoutMs = 20000;
    let settled = false;

    const onMessage = (message, sender, sendResponse) => {
      if (!message || message.type !== MSG_PRODUCTS_JSON) {
        return false;
      }

      settled = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMessage);

      try {
        sendResponse({ status: 'ok' });
      } catch (ackErr) {
        try {
          if (chrome.runtime.lastError) {
            console.log(
              'Ignored extension runtime error:',
              chrome.runtime.lastError.message
            );
          }
        } catch (readErr) {
          /* port closed */
        }
      }

      if (message.ok) {
        resolve(message.data);
      } else {
        reject(new Error(message.error || '页面上下文 fetch 失败'));
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(onMessage);

    const timer = setTimeout(() => {
      if (settled) return;
      chrome.runtime.onMessage.removeListener(onMessage);
      reject(new Error('请求超时'));
    }, timeoutMs);

    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: fetchProductsInPageContext,
        args: [urlCandidates || null],
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(onMessage);
          reject(error);
        }
      });
  });
}

/**
 * 页面内按候选 URL 依次 fetch，返回首个有商品的 JSON
 * @param {string[] | null | undefined} urlCandidates
 * @returns {Promise<object>}
 */
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
      var response = await fetch(urls[i]);
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      var finalUrl = String(response.url || urls[i] || '');
      if (finalUrl && finalUrl.indexOf('products.json') === -1) {
        throw new Error('products.json 被重定向');
      }
      var text = await response.text();
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

/**
 * 页面内直接 fetch 并返回 JSON（保留 location.search）
 * @returns {Promise<object>}
 */
async function fetchProductsJsonInPage() {
  return fetchProductsJsonAtUrlsInPage(null);
}

/**
 * @param {object | null | undefined} json
 * @returns {boolean}
 */
function productsJsonHasItems(json) {
  return Boolean(json && Array.isArray(json.products) && json.products.length > 0);
}

/**
 * 通过 executeScript 直接返回 JSON（Message Passing 失败时的二次回退）
 * @param {number} tabId
 * @param {string[] | null | undefined} [urlCandidates]
 * @returns {Promise<object>}
 */
async function fetchProductsViaScriptReturn(tabId, urlCandidates) {
  const [result] = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: fetchProductsJsonAtUrlsInPage,
      args: [urlCandidates || null],
    }),
    8000,
    'products.json page fetch'
  );

  if (!result || result.result === undefined) {
    throw new Error('未获取到商品数据');
  }

  return result.result;
}

/**
 * 生成 products.json 候选主机名（部分大店 www 被 WAF 403，裸域名可访问）
 * @param {string} domain
 * @returns {string[]}
 */
function getProductsJsonHostCandidates(domain) {
  const host = (domain || '').toLowerCase().trim();
  if (!host) {
    return [];
  }

  const candidates = [host];
  if (host.startsWith('www.')) {
    candidates.push(host.slice(4));
  } else {
    candidates.push('www.' + host);
  }

  return [...new Set(candidates)];
}

/**
 * 解析 products.json 请求 URL（国家子路径 + search + www 回退）
 * @param {number | null} tabId
 * @param {string} host
 * @param {string | null} [cachedHref]
 * @returns {Promise<string>}
 */
async function resolveProductsJsonFetchUrl(tabId, host, cachedHref) {
  let referenceHref = cachedHref || null;

  if (!referenceHref && tabId) {
    try {
      referenceHref = await executeInMainWorld(tabId, function readPageHrefForProductsJson() {
        return window.location.href;
      });
    } catch (error) {
      console.warn('[ShopRadar] 读取页面 href 失败，回退 tab.url:', error);
    }

    if (!referenceHref) {
      try {
        const tab = await chrome.tabs.get(tabId);
        referenceHref = tab.url || null;
      } catch (tabError) {
        console.warn('[ShopRadar] 读取 tab.url 失败:', tabError);
      }
    }
  }

  const fetchUrl = ShopRadarUrl.buildProductsJsonFetchUrlForHost(host, referenceHref);
  debugLog('[ShopRadar] products.json URL:', fetchUrl);
  return fetchUrl;
}

/**
 * 用户打开侧边栏后，为自定义域名申请 optional host 权限（myshopify.com 已在 manifest 声明）
 * @param {string | null | undefined} tabUrl
 * @returns {Promise<boolean>}
 */
async function ensureStoreFetchPermission(tabUrl) {
  if (!tabUrl || typeof ShopRadarPermissions === 'undefined') {
    return true;
  }
  if (!ShopRadarPermissions.isAnalyzableStoreUrl(tabUrl)) {
    return false;
  }
  if (await ShopRadarPermissions.hasHostPermissionForUrl(tabUrl)) {
    return true;
  }
  return false;
}

/**
 * 页面 hostname 是否与 products.json 候选 host 一致（含 www / 裸域等价）
 * @param {string | null | undefined} referenceHref
 * @param {string} targetHost
 * @returns {boolean}
 */
function pageHostMatchesFetchHost(referenceHref, targetHost) {
  if (!referenceHref || !targetHost) {
    return true;
  }
  try {
    const pageHost = new URL(referenceHref).hostname.toLowerCase();
    const target = String(targetHost).toLowerCase();
    return (
      pageHost === target ||
      pageHost === 'www.' + target ||
      'www.' + pageHost === target
    );
  } catch (error) {
    return true;
  }
}

/**
 * 扩展上下文 fetch 是否允许访问该 URL（精确 origin，避免 CORS）
 * @param {string} fetchUrl
 * @returns {Promise<boolean>}
 */
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
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || !ShopRadarPermissions.isAnalyzableStoreUrl(tab.url)) {
      return false;
    }
    const domain = extractDomain(tab.url);
    if (
      typeof ShopRadarPermissions !== 'undefined' &&
      ShopRadarPermissions.hasHostPermissionForDomain
    ) {
      return await ShopRadarPermissions.hasHostPermissionForDomain(domain);
    }
    const hosts = getProductsJsonHostCandidates(domain);
    if (ShopRadarPermissions.hasHostPermissionForAnyHost) {
      return await ShopRadarPermissions.hasHostPermissionForAnyHost(hosts);
    }
    return await ShopRadarPermissions.hasHostPermissionForUrl(tab.url);
  } catch (error) {
    return false;
  }
}

/**
 * 扩展上下文 fetch 单个 products.json URL
 * @param {string} fetchUrl
 * @returns {Promise<object>}
 */
async function extensionFetchProductsJsonUrl(fetchUrl) {
  const response = await fetch(fetchUrl, { credentials: 'omit' });
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

/**
 * @param {string} host
 * @param {number | null} tabId
 * @param {string | null} [cachedHref]
 * @returns {Promise<object>}
 */
async function fetchProductsJsonForHost(host, tabId, cachedHref) {
  const referenceHref = cachedHref || (tabId ? await resolveTabReferenceHref(tabId) : null);
  const pageMatchesHost = pageHostMatchesFetchHost(referenceHref, host);
  const urlCandidates = ShopRadarUrl.buildProductsJsonFetchUrlCandidatesForHost(
    host,
    referenceHref
  );
  let lastError = null;

  if (tabId && pageMatchesHost) {
    try {
      const json = await fetchProductsViaScriptReturn(tabId, urlCandidates);
      if (productsJsonHasItems(json)) {
        return json;
      }
      lastError = new Error(host + ' 返回商品列表为空');
    } catch (scriptError) {
      lastError = scriptError;
      console.warn('[ShopRadar] 页面脚本 fetch 失败，尝试其他方式:', scriptError);
    }
    try {
      const json = await fetchProductsViaPageContext(tabId, urlCandidates);
      if (productsJsonHasItems(json)) {
        return json;
      }
      lastError = new Error(host + ' 返回商品列表为空');
    } catch (messageError) {
      lastError = messageError;
      console.warn('[ShopRadar] Message Passing 失败，尝试扩展 fetch:', messageError);
    }
  }

  for (let i = 0; i < urlCandidates.length; i++) {
    const fetchUrl = urlCandidates[i];
    if (!(await hasExtensionFetchAccessForUrl(fetchUrl))) {
      continue;
    }
    try {
      const json = await extensionFetchProductsJsonUrl(fetchUrl);
      if (productsJsonHasItems(json)) {
        return json;
      }
      lastError = new Error(host + ' 返回商品列表为空');
    } catch (popupError) {
      lastError = popupError;
      console.warn('[ShopRadar] 扩展 fetch 失败:', fetchUrl, popupError);
    }
  }

  if (!tabId) {
    throw lastError || new Error('无法访问当前标签页');
  }

  if (!pageMatchesHost) {
    throw lastError || new Error('当前页面域名与 ' + host + ' 不匹配，且无 host 权限');
  }

  const json = await fetchProductsViaScriptReturn(tabId, urlCandidates);
  if (productsJsonHasItems(json)) {
    return json;
  }
  throw lastError || new Error(host + ' 返回商品列表为空');
}

/**
 * 页面标记未命中时，用 products.json 快速探测是否为 Shopify
 * @param {string} domain
 * @param {number | null} tabId
 * @returns {Promise<boolean>}
 */
function isShopifyProductsJsonPayload(json) {
  return Boolean(json && Array.isArray(json.products));
}

async function fetchProbeUrl(fetchUrl, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) {
    return fetch(fetchUrl);
  }
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(fetchUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeShopifyByProductsJson(domain, tabId, options) {
  if (!domain || !tabId || isNonRetailDomain(domain)) {
    return false;
  }
  if (typeof isKnownSfccDomainHint === 'function' && isKnownSfccDomainHint(domain)) {
    return false;
  }

  const timeoutMs =
    options && options.timeoutMs ? Number(options.timeoutMs) : 0;
  const pageProbeBudgetMs = timeoutMs > 0 ? timeoutMs : 4500;
  const hosts = getProductsJsonHostCandidates(domain);
  const cachedHref = await resolveTabReferenceHref(tabId);

  for (const host of hosts) {
    const urlCandidates = ShopRadarUrl.buildProductsJsonFetchUrlCandidatesForHost(
      host,
      cachedHref
    );
    for (let i = 0; i < urlCandidates.length; i++) {
      const fetchUrl = urlCandidates[i];
      if (!(await hasExtensionFetchAccessForUrl(fetchUrl))) {
        continue;
      }
      try {
        const response = await fetchProbeUrl(fetchUrl, timeoutMs);
        if (!response.ok) {
          continue;
        }
        const json = ShopRadarUrl.parseProductsJsonHttpResponse
          ? await ShopRadarUrl.parseProductsJsonHttpResponse(response, fetchUrl)
          : await response.json();
        if (isShopifyProductsJsonPayload(json)) {
          return true;
        }
      } catch (probeError) {
        /* 扩展 fetch 失败时继续尝试页面注入 */
      }
    }
  }

  async function probeViaPageContext() {
    const urlCandidates = ShopRadarUrl.buildProductsJsonFetchUrlCandidatesFromHref(
      cachedHref || 'https://' + domain + '/'
    );
    try {
      const rawJson = await withTimeout(
        fetchProductsViaScriptReturn(tabId, urlCandidates),
        pageProbeBudgetMs,
        'products.json probe'
      );
      if (isShopifyProductsJsonPayload(rawJson)) {
        return true;
      }
    } catch (pageProbeError) {
      /* ignore */
    }

    try {
      const rawJson = await withTimeout(
        fetchProductsViaPageContext(tabId, urlCandidates),
        pageProbeBudgetMs,
        'products.json message probe'
      );
      if (isShopifyProductsJsonPayload(rawJson)) {
        return true;
      }
    } catch (messageProbeError) {
      /* ignore */
    }

    return false;
  }

  if (await probeViaPageContext()) {
    return true;
  }

  const bgProbe = await probeShopifyViaBackground(tabId, domain);
  return Boolean(bgProbe && bgProbe.isShopify);
}

function invalidateTabHrefCache(tabId) {
  if (tabId) {
    tabHrefCache.delete(tabId);
  }
}

async function resolveTabReferenceHref(tabId) {
  if (!tabId) {
    return null;
  }

  if (tabHrefCache.has(tabId)) {
    return tabHrefCache.get(tabId);
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    const href = tab.url || null;
    tabHrefCache.set(tabId, href);
    return href;
  } catch (tabError) {
    console.warn('[ShopRadar] 读取标签页 URL 失败:', tabError);
    return null;
  }
}

/**
 * 读取 Shopify 公开 products.json（含 www / 非 www 自动回退）
 * @param {string} domain
 * @param {number | null} tabId
 * @returns {Promise<object>}
 */
async function fetchProductsJson(domain, tabId) {
  if (typeof isKnownSfccDomainHint === 'function' && isKnownSfccDomainHint(domain)) {
    throw new Error(domain + ' 为 SFCC 店铺，无 products.json 接口');
  }
  const hosts = getProductsJsonHostCandidates(domain);
  const cachedHref = await resolveTabReferenceHref(tabId);

  let lastError = null;
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    try {
      const rawJson = await fetchProductsJsonForHost(host, tabId, cachedHref);
      const list = Array.isArray(rawJson?.products) ? rawJson.products : [];
      if (list.length > 0) {
        if (host !== domain) {
          debugLog('[ShopRadar] 使用备用域名抓取成功:', host);
        }
        return rawJson;
      }
      lastError = new Error(host + ' 返回商品列表为空');
    } catch (fetchError) {
      lastError = fetchError;
      console.warn('[ShopRadar] 抓取失败:', host, fetchError);
    }
  }

  throw lastError || new Error('无法获取商品数据');
}

/**
 * 在页面上下文中抓取 SFCC 商品（分类页 / Search-UpdateGrid / 首页推荐）
 * @param {number | null} tabId
 * @returns {Promise<{ products: object[], currency: string }>}
 */
async function fetchSfccProducts(tabId) {
  if (!tabId) {
    throw new Error('无法访问当前标签页');
  }

  if (!sfccScriptInjectedTabs.has(tabId)) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['sfcc-fetch.js'],
    });
    sfccScriptInjectedTabs.add(tabId);
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function runSfccFetchInPage(maxCount) {
      return fetchSfccProductsInPage(maxCount);
    },
    args: [SHOPRADAR_MAX_PRODUCTS],
  });

  const payload = result && result.result;
  if (!payload || !Array.isArray(payload.products)) {
    throw new Error('未获取到 SFCC 商品数据');
  }

  return payload;
}

/**
 * 从 chrome.storage.local 读取该域名的商品缓存
 * @param {string} domain
 * @returns {Promise<{ products: object[], rawProducts: object[], currency: string, timestamp: number, storeType?: string } | null>}
 */
function normalizeShopCacheEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  if (!Array.isArray(entry.products) || !entry.currency) {
    return null;
  }
  return {
    products: entry.products,
    rawProducts: Array.isArray(entry.rawProducts) ? entry.rawProducts : [],
    currency: normalizeCurrencyCode(entry.currency),
    timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : 0,
    storeType:
      entry.storeType === 'sfcc' || entry.storeType === 'shopify'
        ? entry.storeType
        : '',
  };
}

async function readShopCache(domain) {
  if (!domain) {
    return null;
  }

  if (memoryShopCacheByDomain.has(domain)) {
    return memoryShopCacheByDomain.get(domain);
  }

  try {
    const stored = await chrome.storage.local.get(domain);
    const normalized = normalizeShopCacheEntry(stored[domain]);
    if (normalized) {
      memoryShopCacheByDomain.set(domain, normalized);
    }
    return normalized;
  } catch (error) {
    console.warn('[ShopRadar] 读取本地缓存失败:', error);
    return null;
  }
}

function getShopDomainAliases(domain) {
  if (
    typeof ShopRadarPermissions !== 'undefined' &&
    ShopRadarPermissions.getShopDomainAliases
  ) {
    return ShopRadarPermissions.getShopDomainAliases(domain);
  }
  const host = String(domain || '')
    .trim()
    .toLowerCase();
  if (!host) {
    return [];
  }
  if (host.startsWith('www.')) {
    return [host, host.slice(4)];
  }
  return [host, 'www.' + host];
}

/**
 * 按 www/裸域 alias 读取商品缓存（避免域名写法不同导致重复授权）
 * @returns {Promise<{ cache: object | null, cacheKey: string }>}
 */
async function readShopCacheWithAliases(domain) {
  const aliases = getShopDomainAliases(domain);
  for (let i = 0; i < aliases.length; i++) {
    const cache = await readShopCache(aliases[i]);
    if (cache?.products?.length) {
      return { cache: cache, cacheKey: aliases[i] };
    }
  }
  return { cache: null, cacheKey: domain || '' };
}

async function rememberSiteAccessSuccess(domain) {
  const aliases = getShopDomainAliases(domain);
  if (!aliases.length) {
    return;
  }
  try {
    const stored = await chrome.storage.local.get(STORAGE_TRUSTED_SITES_KEY);
    const existing = Array.isArray(stored[STORAGE_TRUSTED_SITES_KEY])
      ? stored[STORAGE_TRUSTED_SITES_KEY]
      : [];
    const merged = {};
    existing.concat(aliases).forEach(function (host) {
      if (host) {
        merged[String(host).toLowerCase()] = true;
      }
    });
    await chrome.storage.local.set({
      [STORAGE_TRUSTED_SITES_KEY]: Object.keys(merged),
    });
  } catch (error) {
    console.warn('[ShopRadar] 记录已信任站点失败:', error);
  }
}

async function isTrustedSiteDomain(domain) {
  const aliases = getShopDomainAliases(domain);
  if (!aliases.length) {
    return false;
  }
  try {
    const stored = await chrome.storage.local.get(STORAGE_TRUSTED_SITES_KEY);
    const list = Array.isArray(stored[STORAGE_TRUSTED_SITES_KEY])
      ? stored[STORAGE_TRUSTED_SITES_KEY]
      : [];
    const trusted = {};
    list.forEach(function (host) {
      trusted[String(host).toLowerCase()] = true;
    });
    return aliases.some(function (host) {
      return trusted[host];
    });
  } catch (error) {
    return false;
  }
}

async function hasPersistedSiteAccess(tab) {
  if (!tab?.url) {
    return false;
  }
  const domain = extractDomain(tab.url);
  if (
    typeof ShopRadarPermissions !== 'undefined' &&
    ShopRadarPermissions.hasHostPermissionForDomain
  ) {
    if (await ShopRadarPermissions.hasHostPermissionForDomain(domain)) {
      return true;
    }
  } else if (await hasExtensionFetchAccessForTab(tab.id)) {
    return true;
  }
  return isTrustedSiteDomain(domain);
}

/**
 * 显示授权按钮前：缓存秒开 / 页面内探测 / 后台探测（无需 optional host 权限）
 * @returns {Promise<boolean>}
 */
async function tryRecoverKnownSiteWithoutPermission(tab, domain, runId) {
  if (!tab?.id || !domain || isNonShopBrowseContext(tab)) {
    return false;
  }

  const cacheHit = await readShopCacheWithAliases(domain);
  if (cacheHit.cache?.products?.length && runId === initRunId) {
    if (
      await openShopFromCacheEntry(domain, tab, runId, cacheHit.cache, {
        allowQuotaCheck: true,
      })
    ) {
      return true;
    }
  }

  const probeTimeout =
    (await isTrustedSiteDomain(domain)) || (await hasPersistedSiteAccess(tab))
      ? KNOWN_SITE_PROBE_TIMEOUT_MS
      : INSTANT_PROBE_TIMEOUT_MS;

  if (await probeSfccByPageMarkers(tab.id)) {
    await ShopRadarDetectionCache.clearNegative(domain);
    await persistResult({
      isShopify: false,
      domain: domain,
      currency: '',
      platform: 'sfcc',
      storeType: 'sfcc',
    });
    await finishSupportedStoreInit(domain, tab.id, 'sfcc', runId);
    return true;
  }

  const probed = await probeShopifyByProductsJson(domain, tab.id, {
    timeoutMs: probeTimeout,
  });
  if (probed && runId === initRunId) {
    await ShopRadarDetectionCache.clearNegative(domain);
    await persistResult({
      isShopify: true,
      domain: domain,
      currency: getActiveCurrencyCode(),
      platform: '',
      storeType: 'shopify',
    });
    await finishSupportedStoreInit(domain, tab.id, 'shopify', runId);
    return true;
  }

  const bgProbe = await probeShopifyViaBackground(tab.id, domain);
  if (bgProbe?.isShopify && runId === initRunId) {
    await ShopRadarDetectionCache.clearNegative(domain);
    await persistResult({
      isShopify: true,
      domain: domain,
      currency: getActiveCurrencyCode(),
      platform: '',
      storeType: 'shopify',
    });
    await finishSupportedStoreInit(domain, tab.id, 'shopify', runId);
    return true;
  }

  const recovered = await tryLastChanceStoreDetection(tab, domain);
  if (
    recovered &&
    runId === initRunId &&
    (recovered.storeType === 'shopify' || recovered.storeType === 'sfcc')
  ) {
    await ShopRadarDetectionCache.clearNegative(domain);
    await persistResult({
      isShopify: recovered.isShopify,
      domain: recovered.domain,
      currency: recovered.currency,
      platform: recovered.platform,
      storeType: recovered.storeType,
    });
    await finishSupportedStoreInit(
      recovered.domain,
      recovered.tabId,
      recovered.storeType,
      runId
    );
    return true;
  }

  return false;
}

/**
 * 是否应向用户展示「允许访问此网站」（调用前应先 tryRecoverKnownSiteWithoutPermission）
 * @returns {Promise<boolean>}
 */
async function shouldPromptForSitePermission(tab, domain) {
  if (!tab?.id || !domain) {
    return false;
  }
  if (await hasScriptingAccessForTab(tab)) {
    return false;
  }
  if (
    typeof ShopRadarPermissions !== 'undefined' &&
    ShopRadarPermissions.hasHostPermissionForDomain &&
    (await ShopRadarPermissions.hasHostPermissionForDomain(domain))
  ) {
    return false;
  }
  return true;
}

/**
 * 用已有缓存条目打开店铺 UI
 * @returns {Promise<boolean>}
 */
async function openShopFromCacheEntry(domain, tab, runId, productCache, options) {
  if (!domain || !tab?.id || !productCache?.products?.length || runId !== initRunId) {
    return false;
  }

  activeTabId = tab.id;
  let storeType = productCache.storeType === 'sfcc' ? 'sfcc' : 'shopify';
  if (storeType !== 'sfcc') {
    const pageIsSfcc = await probeSfccByPageMarkers(tab.id);
    if (pageIsSfcc) {
      storeType = 'sfcc';
    }
  }
  currentStoreType = storeType;
  applySuccessStoreLabel(currentStoreType);
  currentShopDomain = domain;
  shopDomainEl.textContent = domain + '  |  ' + getActiveCurrencyCode();

  if (storeType === 'sfcc' && productCache.storeType !== 'sfcc') {
    hideLimitOverlay();
    clearConfirmedNonShopDomain();
    showState('success');
    setProductsLoading(true);
    await loadAndRenderProducts(domain, tab.id, { skipQuotaCheck: true });
    rememberSiteAccessSuccess(domain).catch(function () {});
    if (!isQueryLimitLocked && tab.id) {
      requestBackgroundRefresh(tab.id, domain, true);
      startProductAutoRefresh(domain, tab.id);
    }
    return true;
  }

  const allowQuotaCheck = !options || options.allowQuotaCheck !== false;
  if (allowQuotaCheck && !(await hasProAccess())) {
    const allowed = await ensureQueryAllowed(domain);
    if (runId !== initRunId) {
      return false;
    }
    if (!allowed) {
      showState('success');
      rawProductsForExport = null;
      renderProductList([]);
      setProductsLoading(false);
      return true;
    }
  }

  hideLimitOverlay();
  clearConfirmedNonShopDomain();
  hydrateFromShopCache(domain, productCache);
  showState('success');
  setProductsLoading(false);
  rememberSiteAccessSuccess(domain).catch(function () {});

  const stale =
    !productCache.timestamp ||
    Date.now() - productCache.timestamp > CACHE_STALE_MS;

  if (!isQueryLimitLocked && tab.id) {
    requestBackgroundRefresh(tab.id, domain, stale);
    startProductAutoRefresh(domain, tab.id);
    runSilentStoreRefresh(tab, domain, runId);
  }

  return true;
}

/**
 * 将清洗结果与原始商品写入 chrome.storage.local（按域名键）
 * @param {string} domain
 * @param {{ products: object[], rawProducts: object[], currency: string, storeType?: string }} payload
 */
async function saveShopCache(domain, payload) {
  if (!domain || !payload) {
    return;
  }

  const entry = {
    products: payload.products,
    rawProducts: payload.rawProducts,
    currency: normalizeCurrencyCode(payload.currency),
    storeType: payload.storeType || currentStoreType || 'shopify',
    timestamp: Date.now(),
  };

  memoryShopCacheByDomain.set(domain, {
    products: entry.products,
    rawProducts: entry.rawProducts,
    currency: entry.currency,
    storeType: entry.storeType,
    timestamp: entry.timestamp,
  });

  try {
    await chrome.storage.local.set({ [domain]: entry });
  } catch (error) {
    console.warn('[ShopRadar] 写入本地缓存失败:', error);
  }

  rememberSiteAccessSuccess(domain).catch(function () {});

  if (typeof ShopRadarIngest !== 'undefined' && payload.rawProducts) {
    ShopRadarIngest.reportProducts(domain, payload.rawProducts, {
      storeType: entry.storeType,
      currency: entry.currency,
    }).catch(function () {});
  }
}

/**
 * 用缓存数据立即渲染 UI（秒开，无需等待网络）
 * @param {string} domain
 * @param {{ products: object[], rawProducts: object[], currency: string }} entry
 */
function hydrateFromShopCache(domain, entry) {
  currentShopDomain = domain;
  if (entry.storeType === 'sfcc' || entry.storeType === 'shopify') {
    currentStoreType = entry.storeType;
    applySuccessStoreLabel(currentStoreType);
  }
  applyShopActiveCurrency(entry.currency);
  shopDomainEl.textContent = domain + '  |  ' + getActiveCurrencyCode();
  rawProductsForExport = ShopRadarData.alignRawToCleaned(
    entry.rawProducts,
    entry.products
  );
  renderProductList(entry.products);
  isProductsLoading = false;
  setProductsLoading(false);
}

/**
 * 显示/隐藏商品加载状态
 * @param {boolean} isLoading
 * @param {{ preserveList?: boolean }} [options]
 */
function setProductsLoading(isLoading, options) {
  const preserveList = Boolean(options && options.preserveList);
  productsLoading.style.display = isLoading ? 'flex' : 'none';
  if (isLoading && !preserveList) {
    productsEmpty.classList.remove('visible');
    productListEl.innerHTML = '';
  }
}

/**
 * 将清洗后的商品渲染到 #product-list
 * @param {Array<{ title: string, image: string, price: string, createdAt: string }>} items
 * @param {{ fetchFailed?: boolean }} [options]
 */
function renderProductList(items, options) {
  productListEl.innerHTML = '';

  if (!items.length) {
    productsEmpty.textContent =
      options && options.fetchFailed
        ? UI_TEXT.productsFetchFailed
        : UI_TEXT.productsEmpty;
    productsEmpty.classList.add('visible');
    return;
  }

  productsEmpty.textContent = UI_TEXT.productsEmpty;
  productsEmpty.classList.remove('visible');

  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'product-item';
    row.setAttribute('role', 'listitem');

    const thumb = document.createElement('img');
    thumb.className = 'product-thumb';
    thumb.src = item.image;
    thumb.alt = item.title;
    thumb.width = 50;
    thumb.height = 50;
    thumb.loading = 'lazy';
    thumb.addEventListener('error', () => {
      thumb.src = PLACEHOLDER_IMAGE;
    });

    const info = document.createElement('div');
    info.className = 'product-info';

    const title = document.createElement('h3');
    title.className = 'product-title';
    title.textContent = item.title;

    const meta = document.createElement('div');
    meta.className = 'product-meta';

    const date = document.createElement('span');
    date.className = 'product-date';
    date.textContent = item.createdAt;

    const priceWrap = document.createElement('div');
    priceWrap.className = 'product-prices';

    if (item.compareAtPrice) {
      const compareEl = document.createElement('span');
      compareEl.className = 'product-compare-price';
      compareEl.textContent = item.compareAtPrice;
      priceWrap.appendChild(compareEl);
    }

    const price = document.createElement('span');
    price.className = 'product-price';
    price.textContent = item.price;
    priceWrap.appendChild(price);

    meta.appendChild(date);
    meta.appendChild(priceWrap);
    info.appendChild(title);
    info.appendChild(meta);

    row.appendChild(thumb);
    row.appendChild(info);
    fragment.appendChild(row);
  });

  productListEl.appendChild(fragment);
}

/**
 * 识别为 Shopify / SFCC 后加载并展示商品列表
 * @param {string} domain
 * @param {number | null} tabId
 */
async function loadAndRenderProducts(domain, tabId, options) {
  const preserveList = Boolean(
    options && options.preserveList !== undefined
      ? options.preserveList
      : productListEl.children.length > 0
  );
  isProductsLoading = true;
  if (!preserveList) {
    rawProductsForExport = null;
  }
  currentShopDomain = domain || '';
  setProductsLoading(true, { preserveList: preserveList });

  if (currentStoreType !== 'sfcc' && tabId) {
    const pageIsSfcc = await probeSfccByPageMarkers(tabId);
    if (pageIsSfcc) {
      currentStoreType = 'sfcc';
      applySuccessStoreLabel('sfcc');
    }
  }

  try {
    if (currentStoreType === 'sfcc') {
      const parsed = await fetchSfccProducts(tabId);
      const currency = ShopRadarData.normalizeCurrencyCode(parsed.currency);
      applyShopActiveCurrency(currency);
      rawProductsForExport = Array.isArray(parsed.products) ? parsed.products : [];
      const items = ShopRadarData.cleanSfccProducts(
        parsed,
        currency,
        PLACEHOLDER_IMAGE
      );
      renderProductList(items);
      shopDomainEl.textContent = domain + '  |  ' + getActiveCurrencyCode();
      await saveShopCache(domain, {
        products: items,
        rawProducts: rawProductsForExport,
        currency: currency,
        storeType: 'sfcc',
      });
      return;
    }

    const rawJson = await fetchProductsJson(domain, tabId);
    const rawList = Array.isArray(rawJson?.products) ? rawJson.products : [];
    const items = cleanProducts(rawJson);
    rawProductsForExport = ShopRadarData.alignRawToCleaned(rawList, items);
    renderProductList(items);
    await saveShopCache(domain, {
      products: items,
      rawProducts: rawProductsForExport,
      currency: getActiveCurrencyCode(),
      storeType: 'shopify',
    });
  } catch (error) {
    if (
      currentStoreType === 'shopify' &&
      tabId &&
      (await probeSfccByPageMarkers(tabId))
    ) {
      currentStoreType = 'sfcc';
      applySuccessStoreLabel('sfcc');
      try {
        const parsed = await fetchSfccProducts(tabId);
        const currency = ShopRadarData.normalizeCurrencyCode(parsed.currency);
        applyShopActiveCurrency(currency);
        rawProductsForExport = Array.isArray(parsed.products)
          ? parsed.products
          : [];
        const items = ShopRadarData.cleanSfccProducts(
          parsed,
          currency,
          PLACEHOLDER_IMAGE
        );
        renderProductList(items);
        shopDomainEl.textContent = domain + '  |  ' + getActiveCurrencyCode();
        await saveShopCache(domain, {
          products: items,
          rawProducts: rawProductsForExport,
          currency: currency,
          storeType: 'sfcc',
        });
        return;
      } catch (sfccError) {
        if (!isBenignRuntimeError(sfccError)) {
          console.warn('[ShopRadar] SFCC 商品数据加载失败:', sfccError);
        }
        rawProductsForExport = [];
        renderProductList([], { fetchFailed: true });
        return;
      }
    }
    if (!isBenignRuntimeError(error)) {
      console.warn('[ShopRadar] 商品数据加载失败:', error);
    }
    rawProductsForExport = [];
    renderProductList([], { fetchFailed: true });
  } finally {
    isProductsLoading = false;
    setProductsLoading(false);
  }
}

/**
 * 将检测结果写入 storage
 * @param {{ isShopify: boolean, domain: string, currency?: string }} payload
 */
async function persistResult(payload) {
  try {
    await chrome.storage.local.set({
      lastDetection: {
        ...payload,
        detectedAt: Date.now(),
      },
    });
  } catch (error) {
    console.warn('[ShopRadar] 缓存检测结果失败:', error);
  }

  if (!payload?.domain) {
    return;
  }

  if (payload.storeType === 'shopify' || payload.storeType === 'sfcc') {
    ShopRadarDetectionCache.savePositive(payload.domain, payload.storeType).catch(
      function () {}
    );
  } else {
    ShopRadarDetectionCache.clearPositive(payload.domain).catch(function () {});
  }
}

/**
 * 请 Background 在后台无痕刷新（不阻塞 Popup）
 * @param {number | null} tabId
 * @param {string} domain
 * @param {boolean} [force]
 */
function requestBackgroundRefresh(tabId, domain, force) {
  if (!tabId || !domain) {
    return;
  }

  runtimeSendMessage({
    type: MSG_REFRESH_SHOP_TAB,
    tabId: tabId,
    domain: domain,
    force: Boolean(force),
  });
}

/**
 * 监听 storage：后台写完缓存后 Popup 自动刷新列表（无需再点图标）
 */
function bindShopCacheListener() {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') {
      return;
    }

    getActiveBrowserTab()
      .then(function (tab) {
        const activeDomain = tab?.url ? extractDomain(tab.url) : '';
        if (!activeDomain || !changes[activeDomain]) {
          return;
        }
        const change = changes[activeDomain];
        if (!change?.newValue) {
          return;
        }
        const normalized = normalizeShopCacheEntry(change.newValue);
        if (!normalized) {
          return;
        }

        memoryShopCacheByDomain.set(activeDomain, normalized);

        if (!stateSuccess.classList.contains('active')) {
          return;
        }
        if (activeDomain !== currentShopDomain) {
          return;
        }

        hydrateFromShopCache(activeDomain, normalized);
      })
      .catch(function () {});
  });
}

/**
 * 有本地缓存时立即展示列表（切回已打开店铺用）
 * @returns {Promise<boolean>}
 */
async function tryInstantOpenFromCache(domain, tab, runId, options) {
  if (!domain || !tab?.url || isRestrictedUrl(tab.url)) {
    return false;
  }

  const cacheHit = await readShopCacheWithAliases(domain);
  if (!cacheHit.cache?.products?.length) {
    return false;
  }

  return openShopFromCacheEntry(domain, tab, runId, cacheHit.cache, {
    allowQuotaCheck: true,
  });
}

/**
 * 弹窗初始化：有缓存秒开；后台/ storage 驱动无痕更新
 */
async function init(options) {
  const runId = ++initRunId;
  const forceRecheck = Boolean(options && options.forceRecheck);

  clearFailStateRetries();
  hideLimitOverlay();

  const [deviceId, resolvedTab] = await Promise.all([
    getOrCreateDeviceId(),
    getActiveBrowserTab(),
  ]);
  let tab = resolvedTab;
  showDeviceIdInPanel(deviceId);
  await loadProFlagFromStorage();
  refreshProStatusWithWebsiteSync({ skipResume: true }).catch(function () {});

  if (tab?.id) {
    activeTabId = tab.id;
    rememberContextTabId(tab.id).catch(function () {});
    pinShopContextTab(tab.id);
  }

  const domainEarly = tab && tab.url ? extractDomain(tab.url) : '';
  resetUiIfDomainChanged(domainEarly, options);

  if (isNonShopBrowseContext(tab)) {
    const retailTab = await resolveRetailTabFromBackground();
    if (retailTab) {
      tab = retailTab;
      activeTabId = tab.id;
      rememberContextTabId(tab.id).catch(function () {});
      pinShopContextTab(tab.id);
    }
  }

  const domain = tab && tab.url ? extractDomain(tab.url) : domainEarly;
  if (domain && domain !== domainEarly) {
    resetUiIfDomainChanged(domain, options);
  }

  startBackgroundProPollIfPending(runId);

  if (isNonShopBrowseContext(tab)) {
    showState('loading');
    if (isLemonSqueezyHost(domain)) {
      await pollProActivationAfterPayment(runId, 22000);
    }
    if (runId !== initRunId) {
      return;
    }
    await showNonShopBrowseState(domain);
    return;
  }

  if (
    !forceRecheck &&
    domain &&
    domain === lastConfirmedNonShopDomain
  ) {
    showNonShopifyState(lastDetectedFailPlatform, domain);
    return;
  }

  if (await tryInstantOpenFromCache(domain, tab, runId, options)) {
    return;
  }

  if (await tryInstantPlatformCache(domain, tab, runId, forceRecheck)) {
    if (!forceRecheck && tab?.id) {
      runDetection({ fast: true, tab: tab, forceRecheck: false })
        .then(async function (detection) {
          if (runId !== initRunId) {
            return;
          }
          if (detection.storeType === 'shopify' || detection.storeType === 'sfcc') {
            await applySupportedDetection(detection, runId);
          }
        })
        .catch(function () {});
    }
    return;
  }

  if (await tryInstantNegativeCache(domain, runId, forceRecheck, options)) {
    return;
  }

  if (tab?.id && domain && (await hasExtensionFetchAccessForTab(tab.id))) {
    const permProbe = await probeShopifyViaBackground(tab.id, domain);
    if (isStaleInit(runId)) {
      return;
    }
    if (
      permProbe?.isShopify &&
      (await applySupportedDetection(
        buildShopifyProbeDetection(domain, tab.id),
        runId
      ))
    ) {
      return;
    }
  }

  if (!forceRecheck && tab?.id && domain) {
    const fast = await fastFirstDetect(tab, runId);
    if (isStaleInit(runId)) {
      return;
    }
    if (await applySupportedDetection(fast, runId)) {
      return;
    }
  }

  showState('loading');

  if (!forceRecheck && tab?.id) {
    const quick = await quickDetectStore(tab, { fast: true });
    if (isStaleInit(runId)) {
      return;
    }
    if (await applySupportedDetection(quick, runId)) {
      runDetection({ fast: true, tab: tab })
        .then(async function (detection) {
          if (runId !== initRunId) {
            return;
          }
          if (detection.storeType === 'shopify' || detection.storeType === 'sfcc') {
            await applySupportedDetection(detection, runId);
          }
        })
        .catch(function () {});
      return;
    }
  }

  if (isStaleInit(runId)) {
    return;
  }

  const detection = await runDetection({
    forceRecheck: forceRecheck,
    fast: true,
    tab: tab,
  });
  if (isStaleInit(runId)) {
    return;
  }

  await persistResult({
    isShopify: detection.isShopify,
    domain: detection.domain,
    currency: detection.currency,
    platform: detection.platform,
    storeType: detection.storeType,
  });

  if (detection.storeType === 'shopify' || detection.storeType === 'sfcc') {
    await applySupportedDetection(detection, runId);
    return;
  }

  if (detection.isShopify) {
    shopDomainEl.textContent = '未知域名';
    showState('success');
    renderProductList([]);
    setProductsLoading(false);
    return;
  }

  lastDetectedFailPlatform = detection.platform || '';
  if (lastDetectedFailPlatform === 'sfcc') {
    ShopRadarDetectionCache.saveNegative(
      detection.domain || domain,
      lastDetectedFailPlatform
    ).catch(function () {});
  }

  const recovered = await tryLastChanceStoreDetection(tab, domain);
  if (recovered && (await applySupportedDetection(recovered, runId))) {
    return;
  }

  const bgProbe = await probeShopifyViaBackground(tab?.id, domain);
  if (
    bgProbe?.isShopify &&
    tab?.id &&
    (await applySupportedDetection(
      buildShopifyProbeDetection(domain, tab.id),
      runId
    ))
  ) {
    return;
  }

  if (await tryRecoverKnownSiteWithoutPermission(tab, domain, runId)) {
    return;
  }

  if (await shouldPromptForSitePermission(tab, domain)) {
    showPermissionRequiredState();
    return;
  }

  console.log('[ShopRadar] [Log] 检测未识别 Shopify:', domain, {
    tabId: tab?.id,
    tabUrl: tab?.url,
  });
  showNonShopifyState(lastDetectedFailPlatform, domain);
}

document.addEventListener('DOMContentLoaded', () => {
  applyUiStrings();
  hideLimitOverlay();
  bindExportButton();
  bindUnlockProButton();
  bindRefreshProButton();
  bindClaimProButton();
  bindGrantAccessButton();
  bindDeviceIdBar();
  bindShopCacheListener();
  bindSidePanelTabListeners();

  chrome.runtime.onMessage.addListener(
    typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.wrapMessageListener
      ? ShopRadarGuard.wrapMessageListener(handlePopupRuntimeMessage)
      : handlePopupRuntimeMessage
  );

  runInitWithWatchdog({}).catch(handleInitError);
});

function handlePopupRuntimeMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return { status: 'ok' };
  }
  if (message.type === 'SR_PRO_ACTIVATED') {
    return refreshProStatusWithWebsiteSync({ skipResume: true })
      .then(async function (ok) {
        if (ok || (await hasProAccess())) {
          hideLimitOverlay();
          schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
        }
        return { status: 'ok' };
      })
      .catch(function () {
        return { status: 'ok' };
      });
  }
  if (message.type === 'SR_DEVICE_SYNCED') {
    if (message.deviceId) {
      showDeviceIdInPanel(String(message.deviceId));
    }
    return refreshProStatusWithWebsiteSync({ skipResume: true })
      .then(async function (ok) {
        if (ok || (await hasProAccess())) {
          hideLimitOverlay();
        }
        if (!initInProgress && (await hasProAccess())) {
          schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
        }
        return { status: 'ok' };
      })
      .catch(function () {
        return { status: 'ok' };
      });
  }
  return { status: 'ok' };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || initInProgress) {
    return;
  }
  isPaymentRecentlyPending()
    .then(function (pending) {
      if (pending) {
        return loadProFlagFromStorage();
      }
      return refreshProStatusWithWebsiteSync({ skipResume: true });
    })
    .catch(function () {});
  if (
    grantAccessBtnEl &&
    !grantAccessBtnEl.classList.contains('hidden') &&
    isIdleBrowseActive()
  ) {
    schedulePanelRefresh({ forceRecheck: true });
  }
});
