/**
 * ShopRadar — 商品数据清洗（popup / background 共用，无 DOM 依赖）
 */
var ShopRadarData = (function () {
  var PLACEHOLDER_IMAGE =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">' +
        '<rect fill="#1a1a22" width="50" height="50"/>' +
        '<text x="25" y="28" text-anchor="middle" fill="#5c5c68" font-size="10" font-family="sans-serif">N/A</text>' +
        '</svg>'
    );

  var CURRENCY_DISPLAY_MAP = {
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

  function normalizeCurrencyCode(code) {
    var normalized = (code || 'USD').toString().trim().toUpperCase();
    return normalized || 'USD';
  }

  function getCurrencyDisplay(currencyCode) {
    var code = normalizeCurrencyCode(currencyCode);
    if (CURRENCY_DISPLAY_MAP[code]) {
      return CURRENCY_DISPLAY_MAP[code];
    }
    return { mode: 'suffix', label: code + ' ' };
  }

  function parseVariantPrice(rawPrice) {
    if (rawPrice == null || rawPrice === '') {
      return null;
    }
    var str = String(rawPrice).trim().replace(/,/g, '');
    if (!str || !/^-?\d+(\.\d+)?$/.test(str)) {
      return null;
    }
    var amount = parseFloat(str);
    return Number.isNaN(amount) ? null : amount;
  }

  function formatAmountDigits(amount) {
    if (amount % 1 === 0) {
      return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPriceFromAmount(amount, currencyCode) {
    var code = normalizeCurrencyCode(currencyCode);
    var digits = formatAmountDigits(amount);
    var display = getCurrencyDisplay(code);
    if (display.mode === 'suffix') {
      return digits + ' ' + display.label.trim();
    }
    return display.label + digits;
  }

  function formatPriceRange(minAmount, maxAmount, currencyCode) {
    if (minAmount == null) {
      return '\u2014';
    }
    var code = normalizeCurrencyCode(currencyCode);
    if (maxAmount == null || Math.abs(minAmount - maxAmount) < 0.001) {
      return formatPriceFromAmount(minAmount, code);
    }
    return (
      formatPriceFromAmount(minAmount, code) +
      ' - ' +
      formatPriceFromAmount(maxAmount, code)
    );
  }

  function extractProductPricing(product, currencyCode) {
    var code = normalizeCurrencyCode(currencyCode);
    var variants = Array.isArray(product.variants) ? product.variants : [];
    var salePrices = [];
    var comparePrices = [];

    variants.forEach(function (variant) {
      var sale = parseVariantPrice(variant.price);
      if (sale == null) {
        return;
      }
      salePrices.push(sale);
      var compareRaw = variant.compare_at_price;
      if (compareRaw == null || compareRaw === '') {
        return;
      }
      var compare = parseVariantPrice(compareRaw);
      if (compare != null && compare > sale) {
        comparePrices.push(compare);
      }
    });

    if (!salePrices.length) {
      return {
        minSale: null,
        maxSale: null,
        minCompare: null,
        maxCompare: null,
      };
    }

    return {
      minSale: Math.min.apply(null, salePrices),
      maxSale: Math.max.apply(null, salePrices),
      minCompare: comparePrices.length ? Math.min.apply(null, comparePrices) : null,
      maxCompare: comparePrices.length ? Math.max.apply(null, comparePrices) : null,
    };
  }

  function formatCreatedAt(isoString) {
    if (!isoString) return '\u2014';
    var date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '\u2014';
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  /**
   * @param {object} rawJson
   * @param {string} currencyCode
   * @param {string} [placeholderImage]
   */
  function cleanProducts(rawJson, currencyCode, placeholderImage) {
    var thumb = placeholderImage || PLACEHOLDER_IMAGE;
    var activeCurrency = normalizeCurrencyCode(currencyCode);
    var products = Array.isArray(rawJson && rawJson.products) ? rawJson.products : [];

    var cleaned = products.map(function (product) {
      var firstImage =
        product.images &&
        product.images.length > 0 &&
        product.images[0] &&
        product.images[0].src
          ? product.images[0].src
          : thumb;

      var pricing = extractProductPricing(product, activeCurrency);
      var saleLabel = formatPriceRange(
        pricing.minSale,
        pricing.maxSale,
        activeCurrency
      );
      var compareLabel =
        pricing.minCompare != null && pricing.maxCompare != null
          ? formatPriceRange(
              pricing.minCompare,
              pricing.maxCompare,
              activeCurrency
            )
          : null;

      var dateSource = product.published_at || product.created_at || '';

      return {
        title: product.title || '\u672a\u547d\u540d\u5546\u54c1',
        image: firstImage,
        price: saleLabel,
        compareAtPrice: compareLabel,
        createdAt: formatCreatedAt(dateSource),
        createdAtRaw: dateSource,
      };
    });

    cleaned.sort(function (a, b) {
      var timeA = new Date(a.createdAtRaw).getTime() || 0;
      var timeB = new Date(b.createdAtRaw).getTime() || 0;
      return timeB - timeA;
    });

    return cleaned;
  }

  /**
   * SFCC 页面解析结果 → 与 Shopify 列表相同的展示结构
   * @param {{ products: Array<{ title: string, image?: string, price: number, currency?: string }> }} parsed
   * @param {string} currencyCode
   * @param {string} [placeholderImage]
   */
  function cleanSfccProducts(parsed, currencyCode, placeholderImage) {
    var thumb = placeholderImage || PLACEHOLDER_IMAGE;
    var fallbackCurrency = normalizeCurrencyCode(currencyCode);
    var list = Array.isArray(parsed && parsed.products) ? parsed.products : [];

    var cleaned = list.map(function (product) {
      var code = normalizeCurrencyCode(product.currency || fallbackCurrency);
      var amount = parseVariantPrice(product.price);
      var dateSource = product.createdAtRaw || product.created_at || '';
      return {
        title: product.title || '\u672a\u547d\u540d\u5546\u54c1',
        image: product.image || thumb,
        price:
          amount == null ? '\u2014' : formatPriceFromAmount(amount, code),
        compareAtPrice: null,
        createdAt: formatCreatedAt(dateSource),
        createdAtRaw: dateSource,
      };
    });

    cleaned.sort(function (a, b) {
      var timeA = new Date(a.createdAtRaw).getTime() || 0;
      var timeB = new Date(b.createdAtRaw).getTime() || 0;
      return timeB - timeA;
    });

    return cleaned;
  }

  return {
    PLACEHOLDER_IMAGE: PLACEHOLDER_IMAGE,
    normalizeCurrencyCode: normalizeCurrencyCode,
    cleanProducts: cleanProducts,
    cleanSfccProducts: cleanSfccProducts,
    extractProductPricing: extractProductPricing,
    parseVariantPrice: parseVariantPrice,
  };
})();
