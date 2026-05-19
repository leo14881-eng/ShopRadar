/**
 * ShopRadar — Popup 控制器
 * 模块一：Shopify 环境检测
 * 模块二：products.json 抓取、清洗与列表渲染
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
const loadingTextEl = document.getElementById('loadingText');
const successEmojiEl = document.getElementById('successEmoji');
const successTitleEl = document.getElementById('successTitle');
const productsSectionTitleEl = document.getElementById('productsSectionTitle');
const productsLoadingTextEl = document.getElementById('productsLoadingText');
const failEmojiEl = document.getElementById('failEmoji');
const failTitleEl = document.getElementById('failTitle');
const proMaskEl = document.getElementById('pro-mask');
const limitOverlayTitleEl = document.getElementById('limitOverlayTitle');
const limitOverlayDescEl = document.getElementById('limitOverlayDesc');
const unlockProBtn = document.getElementById('unlock-pro-btn');
const deviceIdBarEl = document.getElementById('device-id-bar');
const deviceIdTextEl = document.getElementById('deviceIdText');

const panels = [stateLoading, stateSuccess, stateFail];

const EXPORT_BTN_LABEL = '一键导出 CSV (Pro)';
const EXPORT_BTN_SUCCESS_LABEL = '导出成功! ✅';

const UI_TEXT = {
  statusDetecting: '检测中',
  statusShopify: 'Shopify 店铺',
  statusSfcc: 'SFCC 店铺',
  statusNotShopify: '非 Shopify',
  loading: '正在检测店铺类型...',
  successTitle: '成功检测到 Shopify 店铺！',
  successTitleSfcc: '成功检测到 SFCC 店铺！',
  successEmoji: '\uD83C\uDF89',
  successEmojiSfcc: '\u2705',
  productsTitle: '最新商品 · 最多 50 件',
  productsTitleSfcc: 'SFCC 商品列表',
  productsLoading: '正在加载商品数据...',
  productsEmpty: '该店铺暂无上架商品 \uD83D\uDCE6',
  failTitle: '非 Shopify 网站',
  failTitleSfcc: '非 Shopify 网站（检测到 SFCC）',
  failEmoji: '\u274C',
  limitTitle: '今日免费额度已用完',
  limitDescDefault: '升级 Pro 可无限查询与导出 CSV。',
  unlockPro: '解锁 Pro',
  authServerOffline:
    '无法连接鉴权服务。请先在终端执行：cd shopradar-server → npm start，然后刷新本侧边栏。',
  proReadySwitchShop:
    'Pro 已开通！请切换到 Shopify / SFCC 店铺标签页即可加载商品列表。',
  paymentConfirming: '正在确认支付结果…',
  paymentPendingSwitchShop:
    '支付页无法检测店铺。若已付款成功，请切回店铺标签页；或稍等 Webhook 回调。',
};

/** 导出 CSV 列（精选字段，便于 Excel 查看） */
const EXPORT_CSV_HEADERS = [
  'Title',
  'SKU',
  'Price',
  'Compare At Price',
  'Vendor',
  'Image URL',
  'Created At',
];

let shopCurrencyCode = '';
let currentStoreType = 'none';
let currentShopDomain = '';
let isProductsLoading = false;
let rawProductsForExport = null;
let exportSuccessTimer = null;

/** Side Panel 常驻时，切换浏览器标签页后重新检测当前店 */
let panelRefreshTimer = null;
let initRunId = 0;
let initChain = Promise.resolve();
const INIT_LOADING_WATCHDOG_MS = 35000;

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

/** 缓存超过该时长则 Popup 打开时强制触发后台刷新 */
const CACHE_STALE_MS = 60 * 1000;

/** 本地鉴权 API（需先启动 shopradar-server） */
const AUTH_API_CHECK_LIMIT = 'http://localhost:3000/api/check-limit';
const AUTH_API_PRO_STATUS = 'http://localhost:3000/api/pro-status';
const AUTH_API_VERIFY_EXPORT = 'http://localhost:3000/api/verify-export';

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

/** 当前活跃标签页 ID，供页面上下文 fetch 回退使用 */
let activeTabId = null;

/** 标签页 href 缓存，避免重复 executeScript 读 location */
const tabHrefCache = new Map();

/** 已注入 sfcc-fetch.js 的标签页（同页重复打开列表时跳过二次注入） */
const sfccScriptInjectedTabs = new Set();

/** 内存商品缓存（切标签时避免重复读 storage） */
const memoryShopCacheByDomain = new Map();

/** 快速检测：complete 后短暂等待 Shopify/SFCC 标记 */
const QUICK_DETECT_SETTLE_MS = 300;

/** 首屏 products.json 探测超时（毫秒），超时则先显示非 Shopify，后台继续重试 */
const INSTANT_PROBE_TIMEOUT_MS = 2800;

/** 点击扩展图标时记录的标签页（session），避免侧边栏抢焦点后 query 错页 */
const SESSION_TAB_ID_KEY = 'sr_context_tab_id';
const SESSION_TAB_AT_KEY = 'sr_context_tab_at';
const SESSION_TAB_MAX_AGE_MS = 5 * 60 * 1000;

/** 最近一次失败检测的平台提示（写入确认负向缓存用） */
let lastDetectedFailPlatform = '';

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
async function executeInMainWorld(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: func,
    args: args || [],
  });
  return results[0]?.result;
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
 * 侧边栏场景下获取当前浏览器正在浏览的标签页。
 * 优先用窗口内真实 active 标签（切换店铺后不能再用旧的 session 快照）。
 * @returns {Promise<chrome.tabs.Tab | undefined>}
 */
async function getActiveBrowserTab() {
  const queries = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
  ];

  for (const query of queries) {
    const tabs = await chrome.tabs.query(query);
    const tab = tabs[0];
    if (tab?.id && tab.url && !isRestrictedUrl(tab.url)) {
      await rememberContextTabId(tab.id);
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
        !isRestrictedUrl(contextTab.url)
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
      if (fallbackTab?.url && !isRestrictedUrl(fallbackTab.url)) {
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
    if (document.visibilityState === 'hidden') {
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
    if (!tab?.url || isRestrictedUrl(tab.url)) {
      return;
    }
    if (changeInfo.status !== 'complete' && !changeInfo.url) {
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
function resetUiIfDomainChanged(domainEarly) {
  if (!domainEarly || domainEarly === currentShopDomain) {
    return;
  }
  const hadPreviousStore = Boolean(currentShopDomain);
  currentShopDomain = domainEarly;
  rawProductsForExport = null;
  isProductsLoading = false;
  productListEl.innerHTML = '';
  productsEmpty.classList.remove('visible');
  setProductsLoading(false);
  if (hadPreviousStore) {
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
  if (exportBtn) exportBtn.textContent = EXPORT_BTN_LABEL;
  if (limitOverlayTitleEl) {
    limitOverlayTitleEl.textContent = UI_TEXT.limitTitle;
  }
  if (limitOverlayDescEl) {
    limitOverlayDescEl.textContent = UI_TEXT.limitDescDefault;
  }
  if (unlockProBtn) {
    unlockProBtn.textContent = UI_TEXT.unlockPro;
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

/**
 * 在侧边栏底部展示 Device ID，并输出到 Console（便于配置白名单）
 * @param {string} deviceId
 */
function showDeviceIdInPanel(deviceId) {
  const id = deviceId || '';
  if (deviceIdTextEl) {
    deviceIdTextEl.textContent = id || '—';
  }
  console.info('[ShopRadar] 当前设备 ID (sr_device_id):', id);
  console.info(
    '[ShopRadar] 白名单：将上述 ID 填入 shopradar-server/whitelist.json 的 deviceIds 数组'
  );
}

/**
 * 绑定 Device ID 栏：点击复制
 */
function bindDeviceIdBar() {
  if (!deviceIdBarEl) {
    return;
  }

  deviceIdBarEl.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get(STORAGE_DEVICE_ID_KEY);
    const id = stored[STORAGE_DEVICE_ID_KEY];
    if (!id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(String(id));
      const prev = deviceIdTextEl ? deviceIdTextEl.textContent : '';
      if (deviceIdTextEl) {
        deviceIdTextEl.textContent = '已复制 ✓';
      }
      setTimeout(() => {
        if (deviceIdTextEl) {
          deviceIdTextEl.textContent = prev;
        }
      }, 1200);
    } catch (error) {
      console.warn('[ShopRadar] 复制失败，请手动选择复制:', error);
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
    document.querySelector('.footer'),
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
      limitOverlayDescEl.textContent = message || UI_TEXT.limitDescDefault;
    }
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
 * 是否为本会话已确认的付费 Pro（必须经服务端 isPro，不能仅靠 allowed）
 */
function isPaidProSubscriber() {
  return isProSubscriber;
}

async function ensureQueryAllowed(domain) {
  const deviceId = await getOrCreateDeviceId();
  showDeviceIdInPanel(deviceId);
  const result = await checkQueryLimit(deviceId, domain);

  await saveAccessTokenFromPayload(result);

  if (result.isPro === true) {
    isProSubscriber = true;
    await persistProFlag(true);
  } else if (isProSubscriber) {
    const stillPro = await refreshProStatusFromServer({ skipResume: true });
    if (!stillPro) {
      isProSubscriber = false;
    }
  }

  if (isPaidProSubscriber()) {
    hideLimitOverlay();
    return true;
  }

  if (!result.allowed) {
    showLimitOverlay(
      result.authOffline ? result.msg || UI_TEXT.authServerOffline : result.msg || UI_TEXT.limitTitle
    );
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

async function refreshProStatusFromServer(options) {
  const skipResume = Boolean(options && options.skipResume);

  try {
    const deviceId = await getOrCreateDeviceId();
    const accessToken = await getStoredAccessToken();
    let url =
      AUTH_API_PRO_STATUS + '?deviceId=' + encodeURIComponent(deviceId);
    if (accessToken) {
      url += '&accessToken=' + encodeURIComponent(accessToken);
    }
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 401) {
        await clearStoredAccessToken();
      }
      isProSubscriber = false;
      await persistProFlag(false);
      return false;
    }
    const data = await response.json();
    await saveAccessTokenFromPayload(data);
    if (data && data.isPro) {
      isProSubscriber = true;
      await persistProFlag(true);
      const hadQuotaWall = isQueryLimitLocked;
      hideLimitOverlay();
      if (!skipResume && hadQuotaWall) {
        schedulePanelRefresh({ forceRecheck: true, softRefresh: true });
      }
      return true;
    }
    isProSubscriber = false;
    await persistProFlag(false);
  } catch (statusError) {
    console.warn('[ShopRadar] 查询 Pro 状态失败:', statusError);
    isProSubscriber = false;
    await persistProFlag(false);
  }
  return false;
}

function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value).replace(/\r/g, '').replace(/\n/g, ' ');
  if (/[",]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function productToCsvRow(product) {
  const title = product.title || '';
  const variant =
    product.variants && product.variants.length > 0 ? product.variants[0] : null;
  const sku = variant && variant.sku ? String(variant.sku) : '';
  const currency = getActiveCurrencyCode();
  const pricing = extractProductPricing(product, currency);
  const price = formatPriceRange(pricing.minSale, pricing.maxSale, currency);
  const compareAtPrice =
    pricing.minCompare != null
      ? formatPriceRange(pricing.minCompare, pricing.maxCompare, currency)
      : '';
  const imageSrc =
    product.images &&
    product.images.length > 0 &&
    product.images[0] &&
    product.images[0].src
      ? product.images[0].src
      : '';
  const createdAt = formatCreatedAt(
    product.published_at || product.created_at || ''
  );
  const vendor = product.vendor ? String(product.vendor) : '';

  return [
    title,
    sku,
    price,
    compareAtPrice,
    vendor,
    imageSrc,
    createdAt,
  ];
}

function buildShopifyCsv(products) {
  const headerLine = EXPORT_CSV_HEADERS.map(escapeCsvField).join(',');
  const dataLines = (products || []).map((product) => {
    return productToCsvRow(product).map(escapeCsvField).join(',');
  });
  return headerLine + '\r\n' + dataLines.join('\r\n') + '\r\n';
}

function downloadCsvFile(csvContent, domain) {
  const safeDomain = (domain || 'unknown')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_');
  const fileName = 'ShopRadar_' + safeDomain + '_Products.csv';
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function showExportSuccessFeedback() {
  if (!exportBtn) {
    return;
  }
  if (exportSuccessTimer) {
    clearTimeout(exportSuccessTimer);
  }
  exportBtn.textContent = EXPORT_BTN_SUCCESS_LABEL;
  exportBtn.classList.add('is-success');
  exportSuccessTimer = setTimeout(() => {
    exportBtn.textContent = EXPORT_BTN_LABEL;
    exportBtn.classList.remove('is-success');
    exportSuccessTimer = null;
  }, 2000);
}

async function handleExportClick() {
  if (!isPaidProSubscriber()) {
    showLimitOverlay(UI_TEXT.limitDescDefault);
    return;
  }
  const exportOk = await verifyExportWithServer();
  if (!exportOk) {
    isProSubscriber = false;
    await persistProFlag(false);
    showLimitOverlay(
      '导出需要有效的 Pro 会话，请确认鉴权服务已启动并已开通 Pro。'
    );
    return;
  }
  if (isProductsLoading) {
    window.alert('数据正在加载中，请稍后...');
    return;
  }
  if (rawProductsForExport === null) {
    window.alert('暂无可用数据，请在 Shopify 店铺页面使用本功能。');
    return;
  }
  const csvContent = buildShopifyCsv(rawProductsForExport);
  downloadCsvFile(csvContent, currentShopDomain);
  showExportSuccessFeedback();
}

function bindExportButton() {
  if (!exportBtn) {
    return;
  }
  exportBtn.textContent = EXPORT_BTN_LABEL;
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

    chrome.tabs.create({ url: checkoutUrl });
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

  panels.forEach((panel) => panel.classList.remove('active'));
  map[state].classList.add('active');

  mainContent.classList.toggle('has-products', state === 'success');

  statusIndicator.classList.remove('success', 'fail');
  if (state === 'success') {
    statusIndicator.classList.add('success');
    statusIndicator.title =
      currentStoreType === 'sfcc' ? UI_TEXT.statusSfcc : UI_TEXT.statusShopify;
  } else if (state === 'fail') {
    statusIndicator.classList.add('fail');
    statusIndicator.title = UI_TEXT.statusNotShopify;
  } else {
    statusIndicator.title = UI_TEXT.statusDetecting;
  }
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
 * 根据检测到的非 Shopify 平台更新失败态文案
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
 * 展示「非 Shopify 网站」并安排延迟重试（SPA 晚挂载 Shopify 时可纠正）
 * @param {string} [platform]
 */
function showNonShopifyState(platform) {
  clearFailStateRetries();
  isProductsLoading = false;
  setProductsLoading(false);
  rawProductsForExport = null;
  productListEl.innerHTML = '';
  productsEmpty.classList.remove('visible');
  currentStoreType = 'none';
  applyFailPlatformHint(platform);
  if (failEmojiEl) {
    failEmojiEl.textContent = UI_TEXT.failEmoji;
  }
  showState('fail');
  scheduleFailStateRetries();
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
  if (!params.has('limit')) {
    params.set('limit', '50');
  }
  var q = params.toString();
  return baseDataUrl + '/products.json' + (q ? '?' + q : '');
}

/**
 * 在页面上下文中发起 fetch（同源，动态国家路径 + search）
 * 通过 chrome.runtime.sendMessage 将 JSON 回传给 popup
 */
function fetchProductsInPageContext() {
  const messageType = 'SHOPRADAR_PRODUCTS_JSON';
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
  if (!params.has('limit')) {
    params.set('limit', '50');
  }
  var q = params.toString();
  var fetchUrl = baseDataUrl + '/products.json' + (q ? '?' + q : '');

  fetch(fetchUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    })
    .then((data) => {
      chrome.runtime.sendMessage({
        type: messageType,
        ok: true,
        data: data,
      });
    })
    .catch((error) => {
      chrome.runtime.sendMessage({
        type: messageType,
        ok: false,
        error: error && error.message ? error.message : 'fetch failed',
      });
    });
}

/**
 * 判断 URL 是否为无法注入脚本的系统页
 * @param {string | undefined} url
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  );
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
  if (isProSubscriber) {
    return true;
  }

  const deadline = Date.now() + (maxWaitMs || 20000);
  const prevLoadingText = loadingTextEl ? loadingTextEl.textContent : '';

  while (Date.now() < deadline) {
    if (runId !== initRunId) {
      return false;
    }

    if (loadingTextEl) {
      loadingTextEl.textContent = UI_TEXT.paymentConfirming;
    }

    const ok = await refreshProStatusFromServer({ skipResume: true });
    if (ok || isProSubscriber) {
      if (loadingTextEl) {
        loadingTextEl.textContent = prevLoadingText || UI_TEXT.loading;
      }
      return true;
    }

    await delay(2000);
  }

  if (loadingTextEl) {
    loadingTextEl.textContent = prevLoadingText || UI_TEXT.loading;
  }
  return isProSubscriber;
}

/**
 * 非店铺页（含 Lemon 支付成功页）的提示，避免对支付页做店铺检测一直转圈
 */
function showNonShopBrowseState(domain) {
  clearFailStateRetries();
  isProductsLoading = false;
  setProductsLoading(false);
  rawProductsForExport = null;
  showState('fail');

  if (isProSubscriber) {
    if (failEmojiEl) {
      failEmojiEl.textContent = '\u2705';
    }
    if (failTitleEl) {
      failTitleEl.textContent = UI_TEXT.proReadySwitchShop;
    }
    return;
  }

  if (failEmojiEl) {
    failEmojiEl.textContent = UI_TEXT.failEmoji;
  }
  if (failTitleEl) {
    failTitleEl.textContent = isLemonSqueezyHost(domain)
      ? UI_TEXT.paymentPendingSwitchShop
      : '请打开 Shopify / SFCC 店铺页面';
  }
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
    const probed = await probeShopifyByProductsJson(domain, tab.id);
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
  }

  console.warn('[ShopRadar] init 未切换界面，离开 loading 兜底');
  showNonShopifyState(lastDetectedFailPlatform || '');
}

/**
 * 延迟指定毫秒（用于检测重试）
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
const POST_COMPLETE_SETTLE_MS = 1200;

/** 检测最大重试次数（页面/Shopify 脚本延迟加载） */
const DETECTION_MAX_ATTEMPTS = 12;
const DETECTION_RETRY_INTERVAL_MS = 400;

/** 显示「非 Shopify」后的自动重检（无 complete 事件时兜底） */
const FAIL_STATE_MAX_RETRIES = 15;
const FAIL_STATE_RETRY_MS = 1500;

let failStateRetryTimer = null;
let failStateRetryCount = 0;

function schedulePanelRefresh(options) {
  const delayMs = options && options.softRefresh ? 80 : 450;
  if (panelRefreshTimer) {
    clearTimeout(panelRefreshTimer);
  }
  panelRefreshTimer = setTimeout(() => {
    panelRefreshTimer = null;
    initChain = initChain
      .then(() => runInitWithWatchdog(options))
      .catch((err) => {
        console.error('[ShopRadar] init 异常:', err);
        if (stateLoading.classList.contains('active')) {
          showState('fail');
          isProductsLoading = false;
        }
      });
  }, delayMs);
}

async function runInitWithWatchdog(options) {
  const runIdAtStart = initRunId;
  const watchdogId = setTimeout(() => {
    if (runIdAtStart !== initRunId) {
      return;
    }
  }, INIT_LOADING_WATCHDOG_MS);

  try {
    await init(options);
  } finally {
    clearTimeout(watchdogId);
    await ensureInitNotStuckOnLoading(initRunId);
  }
}

function clearFailStateRetries() {
  if (failStateRetryTimer) {
    clearInterval(failStateRetryTimer);
    failStateRetryTimer = null;
  }
  failStateRetryCount = 0;
}

/**
 * 误判为非 Shopify 时定时重新检测（新站 SPA 常在 complete 之后才挂载 Shopify）
 */
function scheduleFailStateRetries() {
  clearFailStateRetries();
  failStateRetryTimer = setInterval(() => {
    if (!stateFail.classList.contains('active')) {
      clearFailStateRetries();
      return;
    }
    failStateRetryCount += 1;
    if (failStateRetryCount > FAIL_STATE_MAX_RETRIES) {
      const domain = currentShopDomain;
      if (domain) {
        ShopRadarDetectionCache.saveNegative(
          domain,
          lastDetectedFailPlatform
        ).catch(() => {});
      }
      clearFailStateRetries();
      return;
    }
    schedulePanelRefresh({ forceRecheck: true });
  }, FAIL_STATE_RETRY_MS);
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

  const probedQuick = await probeShopifyByProductsJson(domain, tab.id);
  if (probedQuick) {
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildShopifyProbeDetection(domain, tab.id);
  }

  let detection;
  try {
    detection = await executeInMainWorld(tab.id, detectStoreInPage);
  } catch (injectErr) {
    console.warn('[ShopRadar] quickDetect 注入失败:', injectErr);
    const probedAfterInjectFail = await probeShopifyByProductsJson(domain, tab.id);
    if (probedAfterInjectFail) {
      await ShopRadarDetectionCache.clearNegative(domain);
      return buildShopifyProbeDetection(domain, tab.id);
    }
    return null;
  }

  const platform = detection?.platform ? String(detection.platform) : '';

  if (detection?.isShopify) {
    currentStoreType = 'shopify';
    applyShopActiveCurrency(detection.currency);
    await ShopRadarDetectionCache.clearNegative(domain);
    return {
      storeType: 'shopify',
      isShopify: true,
      domain,
      tabId: tab.id,
      currency: getActiveCurrencyCode(),
      platform: '',
    };
  }

  if (platform === 'sfcc') {
    currentStoreType = 'sfcc';
    shopCurrencyCode = '';
    await ShopRadarDetectionCache.clearNegative(domain);
    return {
      storeType: 'sfcc',
      isShopify: false,
      domain,
      tabId: tab.id,
      currency: '',
      platform: 'sfcc',
    };
  }

  const probed = await probeShopifyByProductsJson(domain, tab.id);
  if (probed) {
    currentStoreType = 'shopify';
    applyShopActiveCurrency('USD');
    await ShopRadarDetectionCache.clearNegative(domain);
    return {
      storeType: 'shopify',
      isShopify: true,
      domain,
      tabId: tab.id,
      currency: getActiveCurrencyCode(),
      platform: '',
    };
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
 * 已识别店铺：鉴权 → 缓存秒开或拉取商品
 * @returns {Promise<boolean>}
 */
async function finishSupportedStoreInit(domain, tabId, storeType, runId) {
  clearFailStateRetries();
  currentShopDomain = domain;
  applySuccessStoreLabel(storeType);
  shopDomainEl.textContent = domain + '  |  ' + getActiveCurrencyCode();

  const cache = await readShopCache(domain);
  if (runId !== initRunId) {
    return false;
  }

  if (cache?.products?.length) {
    if (!isPaidProSubscriber()) {
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
    }
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
  await loadAndRenderProducts(domain, tabId, { skipQuotaCheck: true });
  if (!isQueryLimitLocked && tabId) {
    requestBackgroundRefresh(tabId, domain, true);
  }
  return true;
}

/**
 * 首屏极速路径：页面 complete 时并行注入 + 短超时 products.json
 * @returns {Promise<object | { instantFail: boolean, platform: string } | null>}
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

  let injectDetection = null;
  const injectPromise = executeInMainWorld(tab.id, detectStoreInPage)
    .then(function (result) {
      injectDetection = result;
      return result;
    })
    .catch(function () {
      return null;
    });

  const probePromise = probeShopifyByProductsJson(domain, tab.id, {
    timeoutMs: INSTANT_PROBE_TIMEOUT_MS,
  });

  const [, probed] = await Promise.all([injectPromise, probePromise]);

  if (probed) {
    await ShopRadarDetectionCache.clearNegative(domain);
    return buildShopifyProbeDetection(domain, tab.id);
  }

  const detection = injectDetection;
  if (detection?.isShopify) {
    currentStoreType = 'shopify';
    applyShopActiveCurrency(detection.currency);
    await ShopRadarDetectionCache.clearNegative(domain);
    return {
      storeType: 'shopify',
      isShopify: true,
      domain: domain,
      tabId: tab.id,
      currency: getActiveCurrencyCode(),
      platform: '',
    };
  }

  const platform = detection?.platform ? String(detection.platform) : '';
  if (platform === 'sfcc') {
    currentStoreType = 'sfcc';
    shopCurrencyCode = '';
    await ShopRadarDetectionCache.clearNegative(domain);
    return {
      storeType: 'sfcc',
      isShopify: false,
      domain: domain,
      tabId: tab.id,
      currency: '',
      platform: 'sfcc',
    };
  }

  lastDetectedFailPlatform = platform;
  return { instantFail: true, platform: platform };
}

/**
 * 负向缓存命中时立即显示非 Shopify
 */
async function tryInstantNegativeCache(domain, runId, forceRecheck) {
  if (forceRecheck || !domain) {
    return false;
  }

  const negative = await ShopRadarDetectionCache.readNegative(domain);
  if (!negative || runId !== initRunId) {
    return false;
  }

  lastDetectedFailPlatform = negative.platform || '';
  showNonShopifyState(negative.platform);
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
  const tab = await getActiveBrowserTab();

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
    if (cachedNegative) {
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
          await waitForTabComplete(tab.id, 6000);
        }
      } catch (waitErr) {
        console.warn('[ShopRadar] fast 检测等待标签页失败:', waitErr);
      }
      await delay(300);
    }

    const probedEarly = await probeShopifyByProductsJson(domain, tab.id);
    if (probedEarly) {
      await ShopRadarDetectionCache.clearNegative(domain);
      console.info('[ShopRadar] products.json 优先探测确认为 Shopify');
      return buildShopifyProbeDetection(domain, tab.id);
    }

    const maxAttempts = fast ? 4 : DETECTION_MAX_ATTEMPTS;
    const retryInterval = fast ? 300 : DETECTION_RETRY_INTERVAL_MS;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let detection = null;
      try {
        detection = await executeInMainWorld(tab.id, detectStoreInPage);
      } catch (injectErr) {
        console.warn('[ShopRadar] 页面注入检测失败，第', attempt + 1, '次:', injectErr);
      }

      const isShopify = Boolean(detection?.isShopify);
      if (detection?.platform) {
        lastPlatform = String(detection.platform);
      }

      if (isShopify) {
        currentStoreType = 'shopify';
        applyShopActiveCurrency(detection?.currency);
        if (attempt > 0) {
          console.info('[ShopRadar] 延迟检测成功，第', attempt + 1, '次');
        }
        await ShopRadarDetectionCache.clearNegative(domain);
        return {
          storeType: 'shopify',
          isShopify: true,
          domain,
          tabId: tab.id,
          currency: getActiveCurrencyCode(),
          platform: '',
          fromNegativeCache: false,
        };
      }

      if (attempt < maxAttempts - 1) {
        await delay(retryInterval);
      }
    }
  } catch (error) {
    console.error('[ShopRadar] 检测流程异常:', error);
  }

  shopCurrencyCode = '';
  if (lastPlatform === 'sfcc') {
    currentStoreType = 'sfcc';
    await ShopRadarDetectionCache.clearNegative(domain);
    return {
      storeType: 'sfcc',
      isShopify: false,
      domain,
      tabId: tab.id,
      currency: '',
      platform: 'sfcc',
      fromNegativeCache: false,
    };
  }

  if (domain && !isNonRetailDomain(domain)) {
    const probedLate = await probeShopifyByProductsJson(domain, tab.id);
    if (probedLate) {
      await ShopRadarDetectionCache.clearNegative(domain);
      console.info('[ShopRadar] products.json 兜底探测确认为 Shopify');
      return buildShopifyProbeDetection(domain, tab.id);
    }
  }

  currentStoreType = 'none';
  lastDetectedFailPlatform = lastPlatform;
  if (domain) {
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
function fetchProductsViaPageContext(tabId) {
  return new Promise((resolve, reject) => {
    const timeoutMs = 20000;
    let settled = false;

    const onMessage = (message) => {
      if (!message || message.type !== MSG_PRODUCTS_JSON) return;

      settled = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMessage);

      if (message.ok) {
        resolve(message.data);
      } else {
        reject(new Error(message.error || '页面上下文 fetch 失败'));
      }
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
 * 页面内直接 fetch 并返回 JSON（保留 location.search）
 * @returns {Promise<object>}
 */
async function fetchProductsJsonInPage() {
  const fetchUrl = buildProductsJsonFetchUrlInPage();
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }
  return await response.json();
}

/**
 * 通过 executeScript 直接返回 JSON（Message Passing 失败时的二次回退）
 * @param {number} tabId
 * @returns {Promise<object>}
 */
async function fetchProductsViaScriptReturn(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: fetchProductsJsonInPage,
  });

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
  console.info('[ShopRadar] products.json URL:', fetchUrl);
  return fetchUrl;
}

/**
 * 对单个主机名抓取 products.json
 * @param {string} host
 * @param {number | null} tabId
 * @param {string | null} [cachedHref]
 * @returns {Promise<object>}
 */
async function fetchProductsJsonForHost(host, tabId, cachedHref) {
  const fetchUrl = await resolveProductsJsonFetchUrl(tabId, host, cachedHref);

  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return await response.json();
  } catch (popupError) {
    console.warn('[ShopRadar] Popup fetch 失败，尝试页面上下文:', fetchUrl, popupError);

    if (!tabId) {
      throw new Error('无法访问当前标签页');
    }

    try {
      return await fetchProductsViaPageContext(tabId);
    } catch (messageError) {
      console.warn('[ShopRadar] Message Passing 失败，尝试脚本返回值:', messageError);
    }

    return await fetchProductsViaScriptReturn(tabId);
  }
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

  const timeoutMs =
    options && options.timeoutMs ? Number(options.timeoutMs) : 0;
  const hosts = getProductsJsonHostCandidates(domain);
  const cachedHref = await resolveTabReferenceHref(tabId);

  for (const host of hosts) {
    const fetchUrl = ShopRadarUrl.buildProductsJsonFetchUrlForHost(
      host,
      cachedHref
    );
    try {
      const response = await fetchProbeUrl(fetchUrl, timeoutMs);
      if (!response.ok) {
        continue;
      }
      const json = await response.json();
      if (isShopifyProductsJsonPayload(json)) {
        return true;
      }
    } catch (probeError) {
      /* 扩展上下文 fetch 失败时继续尝试下一 host / 页面上下文 */
    }
  }

  try {
    const rawJson = await fetchProductsViaScriptReturn(tabId);
    if (isShopifyProductsJsonPayload(rawJson)) {
      return true;
    }
  } catch (pageProbeError) {
    /* ignore */
  }

  try {
    const rawJson = await fetchProductsViaPageContext(tabId);
    if (isShopifyProductsJsonPayload(rawJson)) {
      return true;
    }
  } catch (messageProbeError) {
    /* ignore */
  }

  return false;
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
 * 抓取 Shopify products.json（含 www / 非 www 自动回退）
 * @param {string} domain
 * @param {number | null} tabId
 * @returns {Promise<object>}
 */
async function fetchProductsJson(domain, tabId) {
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
          console.info('[ShopRadar] 使用备用域名抓取成功:', host);
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
  rawProductsForExport = entry.rawProducts;
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
 */
function renderProductList(items) {
  productListEl.innerHTML = '';

  if (!items.length) {
    productsEmpty.classList.add('visible');
    return;
  }

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
 * 检测到 Shopify 后加载并展示商品列表
 * @param {string} domain
 * @param {number | null} tabId
 */
async function loadAndRenderProducts(domain, tabId) {
  isProductsLoading = true;
  rawProductsForExport = null;
  currentShopDomain = domain || '';
  setProductsLoading(true);

  try {
    const rawJson = await fetchProductsJson(domain, tabId);
    rawProductsForExport = Array.isArray(rawJson?.products) ? rawJson.products : [];
    const items = cleanProducts(rawJson);
    renderProductList(items);
  } catch (error) {
    console.error('[ShopRadar] 商品数据加载失败:', error);
    rawProductsForExport = [];
    renderProductList([]);
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

  chrome.runtime
    .sendMessage({
      type: MSG_REFRESH_SHOP_TAB,
      tabId: tabId,
      domain: domain,
      force: Boolean(force),
    })
    .catch(() => {});
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

  const productCache = await readShopCache(domain);
  if (!productCache?.products?.length || runId !== initRunId) {
    return false;
  }

  activeTabId = tab.id;
  currentStoreType =
    productCache.storeType === 'sfcc' ? 'sfcc' : 'shopify';
  applySuccessStoreLabel(currentStoreType);
  currentShopDomain = domain;
  shopDomainEl.textContent = domain + '  |  ' + getActiveCurrencyCode();

  if (!isPaidProSubscriber()) {
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
  hydrateFromShopCache(domain, productCache);
  showState('success');
  setProductsLoading(false);

  const softRefresh = Boolean(
    options && (options.softRefresh || options.forceRecheck)
  );
  const stale =
    !productCache.timestamp ||
    Date.now() - productCache.timestamp > CACHE_STALE_MS;

  if (!isQueryLimitLocked && tab.id) {
    requestBackgroundRefresh(tab.id, domain, stale || softRefresh);
  }

  if (softRefresh) {
    runDetection({ fast: true })
      .then(async function (detection) {
        if (runId !== initRunId) {
          return;
        }
        await persistResult({
          isShopify: detection.isShopify,
          domain: detection.domain,
          currency: detection.currency,
          platform: detection.platform,
          storeType: detection.storeType,
        });
        if (detection.storeType && detection.storeType !== currentStoreType) {
          currentStoreType =
            detection.storeType === 'sfcc' ? 'sfcc' : 'shopify';
          applySuccessStoreLabel(currentStoreType);
        }
      })
      .catch(function () {});
  }

  return true;
}

/**
 * 弹窗初始化：有缓存秒开；后台/ storage 驱动无痕更新
 */
async function init(options) {
  const runId = ++initRunId;
  const forceRecheck = Boolean(options && options.forceRecheck);

  clearFailStateRetries();
  hideLimitOverlay();

  const [deviceId, tab] = await Promise.all([
    getOrCreateDeviceId(),
    getActiveBrowserTab(),
  ]);
  showDeviceIdInPanel(deviceId);
  await loadProFlagFromStorage();
  await refreshProStatusFromServer({ skipResume: true });

  if (tab?.id) {
    activeTabId = tab.id;
    rememberContextTabId(tab.id).catch(function () {});
  }

  const domainEarly = tab && tab.url ? extractDomain(tab.url) : '';
  resetUiIfDomainChanged(domainEarly);

  if (isNonShopBrowseContext(tab)) {
    showState('loading');
    if (isLemonSqueezyHost(domainEarly)) {
      await pollProActivationAfterPayment(runId, 22000);
    }
    if (runId !== initRunId) {
      return;
    }
    showNonShopBrowseState(domainEarly);
    return;
  }

  if (!forceRecheck && (await tryInstantOpenFromCache(domainEarly, tab, runId, options))) {
    return;
  }

  if (await tryInstantNegativeCache(domainEarly, runId, forceRecheck)) {
    return;
  }

  if (!forceRecheck && tab?.id && domainEarly) {
    const fast = await fastFirstDetect(tab, runId);
    if (isStaleInit(runId)) {
      return;
    }
    if (fast?.instantFail) {
      ShopRadarDetectionCache.saveNegative(domainEarly, fast.platform || '').catch(
        function () {}
      );
      showNonShopifyState(fast.platform);
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
      runDetection({ fast: true })
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

  const detection = await runDetection({ forceRecheck: forceRecheck });
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
  ShopRadarDetectionCache.saveNegative(
    detection.domain || domainEarly,
    lastDetectedFailPlatform
  ).catch(function () {});
  showNonShopifyState(lastDetectedFailPlatform);
}

document.addEventListener('DOMContentLoaded', () => {
  applyUiStrings();
  hideLimitOverlay();
  bindExportButton();
  bindUnlockProButton();
  bindDeviceIdBar();
  bindShopCacheListener();
  bindSidePanelTabListeners();
  initChain = initChain.then(() => runInitWithWatchdog({}));
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    return;
  }
  refreshProStatusFromServer({ skipResume: true }).catch(() => {});
  schedulePanelRefresh({ softRefresh: true });
});
