/**
 * ShopRadar — SFCC / Demandware 公开商品 listing 解析（页面主世界注入，须自包含）
 * 仅读取页面 DOM / 公开 JSON-LD / 公开 Search-UpdateGrid 接口，不访问 Cookie 或私有 API
 * @param {number} [maxCount]
 * @returns {Promise<{ products: object[], currency: string }>}
 */
function fetchSfccProductsInPage(maxCount) {
  var limit = maxCount > 0 ? maxCount : 50;
  var FETCH_TIMEOUT_MS = 6500;
  var MIN_ON_PAGE_BEFORE_NETWORK = 10;
  var POPSOCKETS_DEFAULT_CGID = 'best-sellers';

  var WHOLE_UNIT_CURRENCIES = {
    AMD: true,
    JPY: true,
    KRW: true,
    VND: true,
    CLP: true,
    BIF: true,
    DJF: true,
    GNF: true,
    KMF: true,
    MGA: true,
    PYG: true,
    RWF: true,
    UGX: true,
    VUV: true,
    XAF: true,
    XOF: true,
    XPF: true,
  };

  var MINOR_UNIT_CURRENCIES = {
    USD: true,
    EUR: true,
    GBP: true,
    CAD: true,
    AUD: true,
    CHF: true,
    CNY: true,
    INR: true,
    AED: true,
    SAR: true,
  };

  function parseJsonAttr(raw) {
    if (!raw || raw === 'null') {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (e1) {
      try {
        var textarea = document.createElement('textarea');
        textarea.innerHTML = raw;
        return JSON.parse(textarea.value);
      } catch (e2) {
        return null;
      }
    }
  }

  function readTileItempropPrice(tile) {
    if (!tile) {
      return null;
    }
    var priceEl = tile.querySelector('[itemprop="price"]');
    if (!priceEl) {
      return null;
    }
    var raw =
      priceEl.getAttribute('content') || priceEl.textContent || '';
    var amount = parseFloat(String(raw).replace(/,/g, ''));
    return Number.isNaN(amount) ? null : amount;
  }

  function normalizePriceValue(rawPrice, currencyCode, tile) {
    var fromItemprop = readTileItempropPrice(tile);
    if (fromItemprop != null) {
      return fromItemprop;
    }
    if (rawPrice == null || rawPrice === '') {
      return null;
    }
    var amount = parseFloat(String(rawPrice).replace(/,/g, ''));
    if (Number.isNaN(amount)) {
      return null;
    }
    var code = (currencyCode || '').toString().toUpperCase();
    if (WHOLE_UNIT_CURRENCIES[code]) {
      return amount;
    }
    if (amount >= 1000 && MINOR_UNIT_CURRENCIES[code]) {
      return amount / 100;
    }
    if (amount >= 10000) {
      return amount / 100;
    }
    return amount;
  }

  function extractListingDateFromObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return '';
    }
    var keys = [
      'onlineFrom',
      'online_from',
      'creationDate',
      'creation_date',
      'availableFrom',
      'available_from',
      'datePublished',
      'releaseDate',
      'launchDate',
      'inStockDate',
      'firstAvailable',
      'published_at',
      'created_at',
    ];
    for (var i = 0; i < keys.length; i++) {
      var val = obj[keys[i]];
      if (val != null && String(val).trim()) {
        return String(val).trim();
      }
    }
    if (obj.custom && typeof obj.custom === 'object') {
      var nested = extractListingDateFromObject(obj.custom);
      if (nested) {
        return nested;
      }
    }
    return '';
  }

  function extractListingDateFromTile(tile) {
    if (!tile) {
      return '';
    }
    var attrs = [
      'data-online-from',
      'data-onlinefrom',
      'data-creation-date',
      'data-available-from',
      'data-release-date',
      'data-launch-date',
    ];
    for (var a = 0; a < attrs.length; a++) {
      var attrVal = tile.getAttribute(attrs[a]);
      if (attrVal) {
        return attrVal;
      }
    }
    if (tile.dataset) {
      return (
        extractListingDateFromObject({
          onlineFrom: tile.dataset.onlineFrom,
          creationDate: tile.dataset.creationDate,
          availableFrom: tile.dataset.availableFrom,
        }) || ''
      );
    }
    return '';
  }

  function buildProductPayload(base) {
    var createdAtRaw =
      base.createdAtRaw ||
      extractListingDateFromObject(base.gtmData) ||
      extractListingDateFromTile(base.tile) ||
      '';
    return {
      id: base.id,
      title: base.title,
      price: base.price,
      currency: base.currency,
      image: base.image,
      productUrl: base.productUrl,
      createdAtRaw: createdAtRaw,
    };
  }

  function detectCurrencyFromRoot(root) {
    var meta = root.querySelector(
      'meta[itemprop="priceCurrency"], meta[property="product:price:currency"]'
    );
    if (meta) {
      var code = (meta.getAttribute('content') || '').trim().toUpperCase();
      if (code) {
        return code;
      }
    }
    var offer = root.querySelector('[itemprop="priceCurrency"]');
    if (offer) {
      var offerCode = (offer.getAttribute('content') || offer.textContent || '')
        .trim()
        .toUpperCase();
      if (offerCode && offerCode.length <= 4) {
        return offerCode;
      }
    }
    var bodyText = root.body ? root.body.innerText || '' : '';
    if (bodyText.indexOf('AMD') !== -1) {
      return 'AMD';
    }
    if (bodyText.indexOf('EUR') !== -1) {
      return 'EUR';
    }
    if (bodyText.indexOf('GBP') !== -1) {
      return 'GBP';
    }
    return 'USD';
  }

  function resolveProductUrl(tile, origin, explicitHref) {
    if (explicitHref) {
      var href = explicitHref;
      if (href.indexOf('http://') === 0 || href.indexOf('https://') === 0) {
        return href;
      }
      if (href.charAt(0) === '/') {
        return origin + href;
      }
      return origin + '/' + href;
    }
    var linkEl = tile.querySelector(
      'a[href*=".html"], .product-name-wrapper, .pdp-link a, a.tile-image, a[data-pdp-url]'
    );
    if (!linkEl) {
      return '';
    }
    var linkHref =
      linkEl.getAttribute('data-pdp-url') || linkEl.getAttribute('href') || '';
    if (!linkHref || linkHref.indexOf('javascript:') === 0) {
      return '';
    }
    if (linkHref.indexOf('http://') === 0 || linkHref.indexOf('https://') === 0) {
      return linkHref;
    }
    if (linkHref.charAt(0) === '/') {
      return origin + linkHref;
    }
    return origin + '/' + linkHref;
  }

  function upsertProduct(map, payload) {
    if (!payload || !payload.id) {
      return;
    }
    var id = String(payload.id);
    if (map[id]) {
      if (!map[id].image && payload.image) {
        map[id].image = payload.image;
      }
      if (!map[id].productUrl && payload.productUrl) {
        map[id].productUrl = payload.productUrl;
      }
      if (!map[id].title && payload.title) {
        map[id].title = payload.title;
      }
      if (map[id].price == null && payload.price != null) {
        map[id].price = payload.price;
      }
      if (!map[id].createdAtRaw && payload.createdAtRaw) {
        map[id].createdAtRaw = payload.createdAtRaw;
      }
      return;
    }
    map[id] = payload;
  }

  function isPopsocketsHost(host) {
    return (host || '').indexOf('popsockets') !== -1;
  }

  function discoverCgidFromJsonLd(doc) {
    var scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (var s = 0; s < scripts.length; s++) {
      var json;
      try {
        json = JSON.parse(scripts[s].textContent || '');
      } catch (e) {
        continue;
      }
      var nodes = [];
      if (json && json['@graph']) {
        nodes = json['@graph'];
      } else if (Array.isArray(json)) {
        nodes = json;
      } else if (json) {
        nodes = [json];
      }
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        if (!node) {
          continue;
        }
        var ref = node['@id'] || node.url || '';
        if (!ref || String(ref).indexOf('cgid=') === -1) {
          continue;
        }
        var match = String(ref).match(/[?&]cgid=([^&]+)/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }
    }
    return '';
  }

  function collectProductWrappers(root, map, origin, defaultCurrency) {
    var wrappers = root.querySelectorAll('.product[data-pid]');
    for (var w = 0; w < wrappers.length; w++) {
      var wrapper = wrappers[w];
      var pid = wrapper.getAttribute('data-pid');
      if (!pid || pid === 'placeholder') {
        continue;
      }
      var tile = wrapper.querySelector('.product-tile') || wrapper;
      var gtmData = null;
      if (wrapper.dataset && wrapper.dataset.gtmdata) {
        gtmData = parseJsonAttr(wrapper.dataset.gtmdata);
      }
      if (!gtmData && tile.getAttribute('data-gtmdata')) {
        gtmData = parseJsonAttr(tile.getAttribute('data-gtmdata'));
      }
      if (!gtmData) {
        continue;
      }
      var variantId = gtmData.variantid || pid;
      var imgW = tile.querySelector(
        'img.product-tile-image, img.tile-image, img[itemprop="image"], img'
      );
      var imgWsrc = imgW && imgW.src ? imgW.src : '';
      if (imgWsrc.indexOf('1x1.png') !== -1) {
        imgWsrc = '';
      }
      var tileCurrency = defaultCurrency;
      var currencyMeta = tile.querySelector('meta[itemprop="priceCurrency"]');
      if (currencyMeta && currencyMeta.getAttribute('content')) {
        tileCurrency = currencyMeta.getAttribute('content').toUpperCase();
      }
      upsertProduct(
        map,
        buildProductPayload({
          id: String(variantId),
          title: (gtmData.name || variantId).replace(/\s+/g, ' ').trim(),
          price: normalizePriceValue(gtmData.price, tileCurrency, tile),
          currency: tileCurrency,
          image: imgWsrc,
          productUrl: resolveProductUrl(tile, origin),
          gtmData: gtmData,
          tile: tile,
        })
      );
    }
  }

  function collectGtmProductNodes(root, map, origin, defaultCurrency) {
    var gtmProductNodes = root.querySelectorAll('[data-gtm-product]');
    for (var g = 0; g < gtmProductNodes.length; g++) {
      var data = parseJsonAttr(gtmProductNodes[g].getAttribute('data-gtm-product'));
      if (!data || !data.id) {
        continue;
      }
      var tileG = gtmProductNodes[g].closest('.product-tile, .product') || gtmProductNodes[g];
      var imgG = tileG.querySelector(
        'img.tile-image, img[itemprop="image"], img.gtm-product, img.product-tile-image, img.product-image'
      );
      var imgSrc = imgG && imgG.src ? imgG.src : '';
      if (imgSrc.indexOf('1x1.png') !== -1) {
        imgSrc = '';
      }
      var codeG = (data.currency || defaultCurrency).toString().toUpperCase();
      upsertProduct(
        map,
        buildProductPayload({
          id: String(data.id),
          title: data.name || data.id,
          price: normalizePriceValue(data.price, codeG, tileG),
          currency: codeG,
          image: imgSrc,
          productUrl: resolveProductUrl(tileG, origin),
          gtmData: data,
          tile: tileG,
        })
      );
    }

    var gtmDataNodes = root.querySelectorAll('[data-gtmdata]');
    for (var d = 0; d < gtmDataNodes.length; d++) {
      var gtmRaw = gtmDataNodes[d].getAttribute('data-gtmdata');
      var gtmData = parseJsonAttr(gtmRaw);
      if (!gtmData) {
        continue;
      }
      var pid = gtmData.variantid || gtmData.id;
      if (!pid || pid === 'placeholder') {
        continue;
      }
      var tileD =
        gtmDataNodes[d].closest('.product-tile, .product') || gtmDataNodes[d];
      var imgD = tileD.querySelector(
        'img.product-tile-image, img.tile-image, img[itemprop="image"], img'
      );
      var imgDsrc = imgD && imgD.src ? imgD.src : '';
      if (imgDsrc.indexOf('1x1.png') !== -1) {
        imgDsrc = '';
      }
      var tileCurrency = defaultCurrency;
      var currencyMeta = tileD.querySelector('meta[itemprop="priceCurrency"]');
      if (currencyMeta && currencyMeta.getAttribute('content')) {
        tileCurrency = currencyMeta.getAttribute('content').toUpperCase();
      }
      upsertProduct(
        map,
        buildProductPayload({
          id: String(pid),
          title: (gtmData.name || pid).replace(/\s+/g, ' ').trim(),
          price: normalizePriceValue(gtmData.price, tileCurrency, tileD),
          currency: tileCurrency,
          image: imgDsrc,
          productUrl: resolveProductUrl(tileD, origin),
          gtmData: gtmData,
          tile: tileD,
        })
      );
    }
  }

  function collectProductTiles(root, map, origin, defaultCurrency) {
    var tiles = root.querySelectorAll('.product-tile[data-pid], .product[data-pid]');
    for (var t = 0; t < tiles.length; t++) {
      var tile = tiles[t];
      var pid = tile.getAttribute('data-pid');
      if (!pid || pid === 'placeholder') {
        continue;
      }
      if (map[pid]) {
        continue;
      }
      var namePrimary = tile.querySelector('.product-primary-name');
      var nameSecondary = tile.querySelector('.product-secondary-name');
      var titleParts = [];
      if (namePrimary) {
        titleParts.push(namePrimary.textContent.trim());
      }
      if (nameSecondary) {
        titleParts.push(nameSecondary.textContent.trim());
      }
      var title = titleParts.join(' ').trim() || pid;
      var priceEl = tile.querySelector('[itemprop="price"], .sales .value');
      var priceRaw =
        priceEl &&
        (priceEl.getAttribute('content') || priceEl.textContent || '');
      var tileCurrency = defaultCurrency;
      var currencyMeta = tile.querySelector('meta[itemprop="priceCurrency"]');
      if (currencyMeta && currencyMeta.getAttribute('content')) {
        tileCurrency = currencyMeta.getAttribute('content').toUpperCase();
      }
      var imgT = tile.querySelector(
        'img.product-tile-image, img.tile-image, img[itemprop="image"]'
      );
      var imgTsrc = imgT && imgT.src ? imgT.src : '';
      if (imgTsrc.indexOf('1x1.png') !== -1) {
        imgTsrc = '';
      }
      upsertProduct(
        map,
        buildProductPayload({
          id: String(pid),
          title: title,
          price: normalizePriceValue(priceRaw, tileCurrency, tile),
          currency: tileCurrency,
          image: imgTsrc,
          productUrl: resolveProductUrl(tile, origin),
          tile: tile,
        })
      );
    }
  }

  function collectJsonLdProducts(root, map, origin) {
    var scripts = root.querySelectorAll('script[type="application/ld+json"]');
    for (var s = 0; s < scripts.length; s++) {
      var json;
      try {
        json = JSON.parse(scripts[s].textContent || '');
      } catch (e) {
        continue;
      }
      var graphs = [];
      if (json && json['@graph']) {
        graphs = json['@graph'];
      } else if (Array.isArray(json)) {
        graphs = json;
      } else if (json) {
        graphs = [json];
      }
      for (var g = 0; g < graphs.length; g++) {
        var node = graphs[g];
        if (!node || node['@type'] !== 'ItemList' || !node.itemListElement) {
          continue;
        }
        var items = node.itemListElement;
        for (var i = 0; i < items.length; i++) {
          var url = items[i].url || '';
          if (!url) {
            continue;
          }
          var idMatch = url.match(/\/(\d+)\.html(?:\?|$|#)/i);
          var id = idMatch ? idMatch[1] : url;
          if (map[id]) {
            continue;
          }
          var slugMatch = url.match(/\/([^/]+)\/\d+\.html/);
          var title = slugMatch
            ? slugMatch[1].replace(/-/g, ' ')
            : 'Product ' + id;
          upsertProduct(map, {
            id: String(id),
            title: title,
            price: null,
            currency: detectCurrencyFromRoot(root),
            image: '',
            productUrl: url.indexOf('http') === 0 ? url : origin + url,
          });
        }
      }
    }
  }

  function collectProductsFromRoot(root, map, origin) {
    var baseOrigin = origin || window.location.origin;
    var defaultCurrency = detectCurrencyFromRoot(root);
    collectProductWrappers(root, map, baseOrigin, defaultCurrency);
    collectGtmProductNodes(root, map, baseOrigin, defaultCurrency);
    collectProductTiles(root, map, baseOrigin, defaultCurrency);
    collectJsonLdProducts(root, map, baseOrigin);
  }

  function countProducts(map) {
    var n = 0;
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        n++;
      }
    }
    return n;
  }

  function findStoreBase(doc) {
    var el = doc.querySelector(
      '[data-action-url*="/on/demandware.store/"], a[href*="/on/demandware.store/"], [data-url*="/on/demandware.store/"]'
    );
    if (el) {
      var chunk =
        el.getAttribute('data-action-url') ||
        el.getAttribute('data-url') ||
        el.getAttribute('href') ||
        '';
      var match = chunk.match(
        /(\/on\/demandware\.store\/Sites-[^/]+\/[a-z]{2}_[A-Z]{2})/
      );
      if (match) {
        return match[1];
      }
    }
    var html = doc.documentElement ? doc.documentElement.innerHTML : '';
    var htmlMatch = html.match(
      /\/on\/demandware\.store\/Sites-[^"'\\s]+\/[a-z]{2}_[A-Z]{2}/
    );
    return htmlMatch ? htmlMatch[0] : null;
  }

  function categoryIdFromQueryString(qs) {
    if (!qs) {
      return '';
    }
    var match = qs.match(/(?:^|&)cgid=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function getLocalePrefixFromPath(pathname) {
    var parts = (pathname || '').split('/').filter(function (part) {
      return Boolean(part);
    });
    if (parts.length > 0 && /^[a-z]{2}-[a-z]{2}$/i.test(parts[0])) {
      return '/' + parts[0];
    }
    return '';
  }

  function pickPrimaryCategoryId(doc) {
    var page = doc.querySelector('[data-action="Search-Show"]');
    if (page) {
      var fromPage = categoryIdFromQueryString(
        page.getAttribute('data-querystring') || ''
      );
      if (fromPage) {
        return fromPage;
      }
    }

    var sortInput = doc.querySelector(
      'input[data-option][value*="cgid="], select[name="sort-order"] option[value*="cgid="]'
    );
    if (sortInput) {
      var sortVal =
        sortInput.getAttribute('value') || sortInput.value || '';
      var sortMatch = sortVal.match(/[?&]cgid=([^&]+)/);
      if (sortMatch) {
        return decodeURIComponent(sortMatch[1]);
      }
    }

    var scoped = doc.querySelector(
      'nav a[href*="cgid="], header a[href*="cgid="], .main-menu a[href*="cgid="], a[data-href*="cgid="]'
    );
    if (scoped) {
      var href =
        scoped.getAttribute('data-href') ||
        scoped.getAttribute('href') ||
        '';
      var hrefMatch = href.match(/[?&]cgid=([^&]+)/);
      if (hrefMatch) {
        return decodeURIComponent(hrefMatch[1]);
      }
    }

    return '';
  }

  /** 从整页 HTML 统计最常见的 cgid（首页导航/脚本里常有） */
  function discoverCgidFromHtml(doc) {
    var html = '';
    if (doc.documentElement) {
      html = doc.documentElement.innerHTML || '';
    }
    if (!html && doc.body) {
      html = doc.body.innerHTML || '';
    }
    if (!html) {
      return '';
    }
    var counts = {};
    var re = /[?&]cgid=([a-zA-Z0-9_-]+)/g;
    var match;
    while ((match = re.exec(html)) !== null) {
      var id = match[1];
      counts[id] = (counts[id] || 0) + 1;
    }
    var best = '';
    var bestCount = 0;
    for (var key in counts) {
      if (
        Object.prototype.hasOwnProperty.call(counts, key) &&
        counts[key] > bestCount
      ) {
        bestCount = counts[key];
        best = key;
      }
    }
    return best;
  }

  function isLikelyHomePath(pathname) {
    var parts = (pathname || '').split('/').filter(function (part) {
      return Boolean(part);
    });
    if (!parts.length) {
      return true;
    }
    if (parts.length === 1 && /^[a-z]{2}-[a-z]{2}$/i.test(parts[0])) {
      return true;
    }
    return false;
  }

  function discoverFallbackPaths(doc, origin) {
    var paths = [];
    var seen = {};
    var pathForLocale =
      doc === document
        ? window.location.pathname
        : '';
    if (!pathForLocale) {
      var canonical = doc.querySelector('link[rel="canonical"]');
      if (canonical && canonical.href) {
        try {
          pathForLocale = new URL(canonical.href).pathname;
        } catch (canonicalError) {
          pathForLocale = '';
        }
      }
    }
    var locale = getLocalePrefixFromPath(pathForLocale);

    function addPath(path) {
      if (!path) {
        return;
      }
      var abs =
        path.indexOf('http') === 0
          ? path
          : path.charAt(0) === '/'
            ? origin + path
            : origin + '/' + path;
      if (seen[abs]) {
        return;
      }
      seen[abs] = true;
      paths.push(abs);
    }

    var host = '';
    try {
      host = new URL(origin).hostname.toLowerCase();
    } catch (hostError) {
      host = '';
    }

    var fallbacks;
    if (host.indexOf('mvmt') !== -1) {
      fallbacks = [
        locale + '/mens-watches/',
        locale + '/womens-watches/',
        locale + '/sunglasses/',
      ];
    } else if (host.indexOf('popsockets') !== -1) {
      fallbacks = [
        locale + '/new-and-featured/best-sellers',
        locale + '/best-sellers',
        locale + '/grips',
        locale + '/magsafe',
      ];
    } else {
      fallbacks = [
        locale + '/new-and-featured/best-sellers',
        locale + '/best-sellers',
        locale + '/mens-watches/',
        locale + '/womens-watches/',
      ];
    }
    for (var f = 0; f < fallbacks.length; f++) {
      addPath(fallbacks[f]);
    }
    var maxPaths = isLikelyHomePath(pathForLocale) ? 1 : 2;
    return paths.slice(0, maxPaths);
  }

  function fetchHtml(url) {
    var options = { credentials: 'same-origin' };
    var timerId = null;

    if (typeof AbortController !== 'undefined') {
      var controller = new AbortController();
      options.signal = controller.signal;
      timerId = setTimeout(function () {
        controller.abort();
      }, FETCH_TIMEOUT_MS);
    }

    return fetch(url, options)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.text();
      })
      .finally(function () {
        if (timerId) {
          clearTimeout(timerId);
        }
      });
  }

  function toList(map) {
    var list = [];
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        list.push(map[key]);
      }
    }
    return list;
  }

  function finalize(map) {
    var list = toList(map).slice(0, limit);
    var currency = detectCurrencyFromRoot(document);
    if (list[0] && list[0].currency) {
      currency = list[0].currency;
    }
    return { products: list, currency: currency };
  }

  function parseHtmlChunk(html, map, origin) {
    if (!html) {
      return;
    }
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    collectProductsFromRoot(parsed, map, origin);
  }

  function buildGridUrls(storeBase, cgid, options) {
    var opts = options || {};
    var qs =
      'cgid=' +
      encodeURIComponent(cgid) +
      '&pmin=0.01&start=0&sz=' +
      limit;
    if (opts.srule) {
      qs += '&srule=' + encodeURIComponent(opts.srule);
    }
    var urls = [
      storeBase + '/Search-UpdateGrid?' + qs + '&format=page-element',
    ];
    if (!opts.updateGridOnly) {
      urls.push(storeBase + '/Search-ShowAjax?' + qs);
    }
    return urls;
  }

  function fetchGridOnce(storeBase, cgid, map, origin, options) {
    if (!cgid || countProducts(map) >= limit) {
      return Promise.resolve(false);
    }
    var urls = buildGridUrls(storeBase, cgid, options);
    return new Promise(function (resolve) {
      var settled = false;
      var pending = urls.length;

      function finish(ok) {
        if (settled) {
          return;
        }
        if (ok) {
          settled = true;
          resolve(true);
          return;
        }
        pending -= 1;
        if (pending <= 0) {
          settled = true;
          resolve(false);
        }
      }

      for (var u = 0; u < urls.length; u++) {
        fetchHtml(urls[u])
          .then(function (html) {
            if (settled) {
              return false;
            }
            var before = countProducts(map);
            parseHtmlChunk(html, map, origin);
            return countProducts(map) > before;
          })
          .then(function (ok) {
            finish(Boolean(ok));
          })
          .catch(function () {
            finish(false);
          });
      }
    });
  }

  var map = {};
  var origin = window.location.origin;
  var host = '';
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch (hostErr) {
    host = '';
  }
  var popsockets = isPopsocketsHost(host);

  collectProductsFromRoot(document, map, origin);
  if (countProducts(map) >= limit) {
    return Promise.resolve(finalize(map));
  }
  if (!popsockets && countProducts(map) >= MIN_ON_PAGE_BEFORE_NETWORK) {
    return Promise.resolve(finalize(map));
  }

  var storeBase = findStoreBase(document);
  if (!storeBase) {
    return Promise.resolve(finalize(map));
  }

  var primaryCgid =
    pickPrimaryCategoryId(document) ||
    discoverCgidFromJsonLd(document) ||
    discoverCgidFromHtml(document) ||
    (popsockets ? POPSOCKETS_DEFAULT_CGID : '');

  if (popsockets && primaryCgid) {
    return fetchGridOnce(storeBase, primaryCgid, map, origin, {
      updateGridOnly: true,
    }).then(function () {
      return finalize(map);
    });
  }

  if (primaryCgid) {
    return fetchGridOnce(storeBase, primaryCgid, map, origin).then(function () {
      if (countProducts(map) >= limit) {
        return finalize(map);
      }
      var paths = discoverFallbackPaths(document, origin);
      if (!paths.length) {
        return finalize(map);
      }
      return fetchHtml(paths[0])
        .then(function (html) {
          parseHtmlChunk(html, map, origin);
          if (countProducts(map) >= limit) {
            return;
          }
          var parsedDoc = new DOMParser().parseFromString(html || '', 'text/html');
          var extraCgid = pickPrimaryCategoryId(parsedDoc);
          if (extraCgid && extraCgid !== primaryCgid) {
            return fetchGridOnce(storeBase, extraCgid, map, origin);
          }
        })
        .catch(function () {})
        .then(function () {
          return finalize(map);
        });
    });
  }

  var paths = discoverFallbackPaths(document, origin);
  if (!paths.length) {
    return Promise.resolve(finalize(map));
  }

  return Promise.all(
    paths.map(function (pathUrl) {
      return fetchHtml(pathUrl)
        .then(function (html) {
          parseHtmlChunk(html, map, origin);
          if (countProducts(map) >= limit) {
            return;
          }
          var parsedDoc = new DOMParser().parseFromString(html || '', 'text/html');
          var cgid =
            pickPrimaryCategoryId(parsedDoc) || discoverCgidFromJsonLd(parsedDoc);
          if (cgid) {
            return fetchGridOnce(storeBase, cgid, map, origin);
          }
        })
        .catch(function () {
          return;
        });
    })
  ).then(function () {
    return finalize(map);
  });
}
