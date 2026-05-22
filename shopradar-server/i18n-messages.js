'use strict';

/**
 * 后端 i18n — Accept-Language 解析与付费墙脱敏文案
 */

const LOCALE_MESSAGES = {
  en: {
    hidden_value: 'Hidden',
    hidden_domain: 'Hidden',
    hidden_url: 'Hidden',
    upgrade_unlock: 'Upgrade to Unlock',
    paywall_hint: 'Pro members see heat valuation, store URLs & attention trends.',
    famous_stores_disclaimer:
      'Curated famous DTC stores ranked by yesterday’s ShopRadar research heat—not verified platform or store sales.',
  },
  zh: {
    hidden_value: '已隐藏',
    hidden_domain: '已隐藏',
    hidden_url: '已隐藏',
    upgrade_unlock: '升级 Pro 解锁',
    paywall_hint: 'Pro 会员可查看热度估值、店铺域名与关注度变化。',
    famous_stores_disclaimer:
      '知名独立站样本榜，按 UTC 昨日 ShopRadar 研究热度排序，非平台或店铺真实销量。',
  },
  ar: {
    hidden_value: 'مخفي',
    hidden_domain: 'مخفي',
    hidden_url: 'مخفي',
    upgrade_unlock: 'ترقية Pro للفتح',
    paywall_hint: 'أعضاء Pro يرون تقييم الحرارة وروابط المتاجر واتجاهات الاهتمام.',
  },
  de: {
    hidden_value: 'Verborgen',
    hidden_domain: 'Verborgen',
    hidden_url: 'Verborgen',
    upgrade_unlock: 'Pro upgraden zum Freischalten',
    paywall_hint: 'Pro-Mitglieder sehen Heat-Bewertung, Shop-Domains und Attention-Trends.',
  },
  fr: {
    hidden_value: 'Masqué',
    hidden_domain: 'Masqué',
    hidden_url: 'Masqué',
    upgrade_unlock: 'Passer Pro pour débloquer',
    paywall_hint: 'Les membres Pro voient valorisation chaleur, domaines et tendances.',
  },
  es: {
    hidden_value: 'Oculto',
    hidden_domain: 'Oculto',
    hidden_url: 'Oculto',
    upgrade_unlock: 'Mejorar a Pro para desbloquear',
    paywall_hint: 'Los miembros Pro ven valoración de interés, dominios y tendencias.',
  },
  ja: {
    hidden_value: '非表示',
    hidden_domain: '非表示',
    hidden_url: '非表示',
    upgrade_unlock: 'Pro にアップグレードして解除',
    paywall_hint: 'Pro 会員は注目度評価・ストア URL・トレンドを閲覧できます。',
  },
  ko: {
    hidden_value: '숨김',
    hidden_domain: '숨김',
    hidden_url: '숨김',
    upgrade_unlock: 'Pro 업그레이드로 잠금 해제',
    paywall_hint: 'Pro 회원은 관심도 평가, 스토어 URL, 트렌드를 볼 수 있습니다.',
  },
  pt_BR: {
    hidden_value: 'Oculto',
    hidden_domain: 'Oculto',
    hidden_url: 'Oculto',
    upgrade_unlock: 'Upgrade Pro para desbloquear',
    paywall_hint: 'Membros Pro veem avaliação de interesse, domínios e tendências.',
  },
  zh_TW: {
    hidden_value: '已隱藏',
    hidden_domain: '已隱藏',
    hidden_url: '已隱藏',
    upgrade_unlock: '升級 Pro 解鎖',
    paywall_hint: 'Pro 會員可查看熱度估值、店鋪網域與關注度變化。',
  },
};

function normalizeLocale(code) {
  const raw = String(code || 'en')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (!raw) {
    return 'en';
  }
  if (raw === 'zh-tw' || raw === 'zh-hk' || raw === 'zh-hant') {
    return 'zh_TW';
  }
  if (raw === 'pt-br' || raw === 'pt') {
    return 'pt_BR';
  }
  const underscored = raw.replace('-', '_');
  if (LOCALE_MESSAGES[underscored]) {
    return underscored;
  }
  if (LOCALE_MESSAGES[raw]) {
    return raw;
  }
  const base = raw.split('-')[0];
  if (LOCALE_MESSAGES[base]) {
    return base;
  }
  return 'en';
}

function parseAcceptLanguage(header) {
  if (!header) {
    return 'en';
  }
  const parts = String(header)
    .split(',')
    .map(function (chunk) {
      const seg = chunk.trim().split(';');
      const lang = seg[0];
      let q = 1;
      if (seg[1]) {
        const match = seg[1].match(/q=([\d.]+)/);
        if (match) {
          q = Number(match[1]);
        }
      }
      return { lang: lang, q: q };
    })
    .sort(function (a, b) {
      return b.q - a.q;
    });

  for (let i = 0; i < parts.length; i++) {
    const loc = normalizeLocale(parts[i].lang);
    if (loc) {
      return loc;
    }
  }
  return 'en';
}

function getMessages(locale) {
  const key = normalizeLocale(locale);
  return LOCALE_MESSAGES[key] || LOCALE_MESSAGES.en;
}

function getNextHourUtcIso() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.toISOString();
}

module.exports = {
  LOCALE_MESSAGES: LOCALE_MESSAGES,
  normalizeLocale: normalizeLocale,
  parseAcceptLanguage: parseAcceptLanguage,
  getMessages: getMessages,
  getNextHourUtcIso: getNextHourUtcIso,
};
