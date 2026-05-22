'use strict';

/**
 * 全球知名 DTC / 独立站样本（Shopify / SFCC 等，可扩展）
 * 榜单按 ShopRadar 用户「昨日研究热度」排序，非平台真实销量。
 */
const FAMOUS_STORES = [
  { domain: 'gymshark.com', name: 'Gymshark', platform: 'Shopify', region: 'UK' },
  { domain: 'skims.com', name: 'SKIMS', platform: 'Shopify', region: 'US' },
  { domain: 'glossier.com', name: 'Glossier', platform: 'Shopify', region: 'US' },
  { domain: 'allbirds.com', name: 'Allbirds', platform: 'Shopify', region: 'US' },
  { domain: 'bombas.com', name: 'Bombas', platform: 'Shopify', region: 'US' },
  { domain: 'fashionnova.com', name: 'Fashion Nova', platform: 'Shopify', region: 'US' },
  { domain: 'colourpop.com', name: 'ColourPop', platform: 'Shopify', region: 'US' },
  { domain: 'alo.com', name: 'Alo Yoga', platform: 'Shopify', region: 'US' },
  { domain: 'mvmt.com', name: 'MVMT', platform: 'SFCC', region: 'US' },
  { domain: 'popsockets.com', name: 'PopSockets', platform: 'SFCC', region: 'US' },
  { domain: 'chubbiesshorts.com', name: 'Chubbies', platform: 'Shopify', region: 'US' },
  { domain: 'rhodeskin.com', name: 'Rhode', platform: 'Shopify', region: 'US' },
  { domain: 'kyliecosmetics.com', name: 'Kylie Cosmetics', platform: 'Shopify', region: 'US' },
  { domain: 'denydesigns.com', name: 'Deny Designs', platform: 'Shopify', region: 'US' },
  { domain: 'puravidabracelets.com', name: 'Pura Vida', platform: 'Shopify', region: 'US' },
  { domain: 'lulus.com', name: 'Lulus', platform: 'Shopify', region: 'US' },
  { domain: 'ohpolly.com', name: 'Oh Polly', platform: 'Shopify', region: 'UK' },
  { domain: 'representclo.com', name: 'Represent', platform: 'Shopify', region: 'UK' },
  { domain: 'kith.com', name: 'Kith', platform: 'Shopify', region: 'US' },
  { domain: 'jeffreestarcosmetics.com', name: 'Jeffree Star Cosmetics', platform: 'Shopify', region: 'US' },
  { domain: 'fanjoy.co', name: 'Fanjoy', platform: 'Shopify', region: 'US' },
  { domain: 'triangl.com', name: 'Triangl', platform: 'Shopify', region: 'AU' },
  { domain: 'culturekings.com', name: 'Culture Kings', platform: 'Shopify', region: 'AU' },
  { domain: 'princesspolly.com', name: 'Princess Polly', platform: 'Shopify', region: 'AU' },
  { domain: 'shein.com', name: 'SHEIN (storefront)', platform: 'Other', region: 'CN' },
];

function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function getFamousStores() {
  return FAMOUS_STORES.map(function (row) {
    return {
      domain: normalizeDomain(row.domain),
      name: row.name,
      platform: row.platform,
      region: row.region,
    };
  });
}

function getFamousStoreDomains() {
  return getFamousStores().map(function (row) {
    return row.domain;
  });
}

function getFamousStoreMap() {
  const map = Object.create(null);
  getFamousStores().forEach(function (row) {
    map[row.domain] = row;
  });
  return map;
}

module.exports = {
  FAMOUS_STORES: FAMOUS_STORES,
  getFamousStores: getFamousStores,
  getFamousStoreDomains: getFamousStoreDomains,
  getFamousStoreMap: getFamousStoreMap,
  normalizeDomain: normalizeDomain,
};
