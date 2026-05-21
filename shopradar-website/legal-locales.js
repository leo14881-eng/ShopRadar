/**
 * ShopRadar 法律页文案（privacy / terms）— 与 locales.js 合并加载
 */
var SHOPRADAR_LEGAL_LOCALES = {
  en: {
    legal: {
      backLink: '← Back to ShopRadar',
      privacy: {
        pageTitle: 'Privacy Policy — ShopRadar',
        heading: 'Privacy Policy',
        updated: 'Last updated: May 21, 2026',
        intro:
          'ShopRadar ("we", "us") provides a Chrome extension and web dashboard that help merchants and analysts review public Shopify storefront data. This policy describes how we handle information when you use our services at <a href="https://shopradar.uk" class="text-cyan-400 hover:underline">shopradar.uk</a> and our API at <a href="https://api.shopradar.uk" class="text-cyan-400 hover:underline">api.shopradar.uk</a>.',
        hCollect: 'Data We Collect',
        liDevice:
          '<strong>Device ID</strong> — A random identifier stored in your browser to enforce free daily limits and Pro subscription status.',
        liStore:
          '<strong>Store domain</strong> — The hostname of shops you visit while using the extension.',
        liCatalog:
          '<strong>Public product catalog</strong> — Titles, SKUs, prices, and images from publicly accessible store listings (e.g. products.json). We do <em>not</em> collect cookies, login sessions, carts, orders, or personal customer data.',
        liApi:
          '<strong>API usage</strong> — Requests to our servers for authentication, quota, Pro status, and optional anonymous trending aggregation.',
        liPayment:
          '<strong>Payment metadata</strong> — Processed by Lemon Squeezy; we may receive your Device ID in checkout metadata to activate Pro.',
        hUse: 'How We Use Data',
        liUse1: 'Provide free tier limits and paid Pro features (CSV export and trending dashboard).',
        liUse2: 'Improve product intelligence and service reliability.',
        liUse3: 'Process subscriptions and support requests.',
        hStorage: 'Data Storage',
        liStorage1: 'Server-side data is stored on our infrastructure (Vultr).',
        liStorage2: 'Some data is cached locally in your browser by the extension.',
        liStorage3: 'Trending leaderboard data may be cached in Redis for performance.',
        hThird: 'Third Parties',
        liLemon: '<strong>Lemon Squeezy</strong> — Payment processing',
        liCloudflare: '<strong>Cloudflare</strong> — DNS / CDN',
        hContact: 'Contact',
        hChanges: 'Changes',
        changesBody:
          'We may update this policy. Continued use of ShopRadar means you accept the updated policy.',
      },
      terms: {
        pageTitle: 'Terms of Service — ShopRadar',
        heading: 'Terms of Service',
        updated: 'Last updated: May 21, 2026',
        intro:
          'By using ShopRadar (the Chrome extension, website, and API), you agree to these Terms of Service.',
        hService: 'Service Description',
        serviceBody:
          'ShopRadar provides Shopify store insights, public product listing tools, and a Pro subscription that includes CSV export and access to the global trending dashboard. Data is provided for informational purposes only.',
        hAccounts: 'Accounts & Subscriptions',
        liAcc1: 'Free tier includes daily usage limits as described in the extension.',
        liAcc2:
          'Pro subscriptions are billed through Lemon Squeezy and renew according to your chosen plan.',
        liAcc3: "Refunds are handled per Lemon Squeezy's refund policy.",
        hAcceptable: 'Acceptable Use',
        liUse1: 'Do not abuse API rate limits or attempt to circumvent quota restrictions.',
        liUse2:
          'Do not scrape, resell, or redistribute ShopRadar data without written permission.',
        liUse3: 'Do not use the service for unlawful purposes.',
        liUse4:
          'Only analyze publicly available storefront data; do not attempt to access private admin or customer areas.',
        hDisclaimer: 'Disclaimer',
        disclaimerBody:
          'Product revenue estimates, growth rates, and trending rankings are algorithmic approximations. We do not guarantee accuracy. You are solely responsible for business decisions made using ShopRadar data.',
        hLiability: 'Limitation of Liability',
        liabilityBody:
          'ShopRadar is provided "as is" without warranties. We are not liable for indirect, incidental, or consequential damages arising from use of the service.',
        hTermination: 'Termination',
        terminationBody:
          'We may suspend or terminate access for violations of these terms. You may cancel your Pro subscription at any time through Lemon Squeezy.',
        hContact: 'Contact',
      },
    },
  },

  zh: {
    legal: {
      backLink: '← 返回 ShopRadar',
      privacy: {
        pageTitle: '隐私政策 — ShopRadar',
        heading: '隐私政策',
        updated: '最后更新：2026年5月21日',
        intro:
          'ShopRadar（「我们」）提供 Chrome 插件与网页大盘，帮助商家与分析师查看 Shopify 店铺<strong>公开</strong>商品数据。本政策说明您使用 <a href="https://shopradar.uk" class="text-cyan-400 hover:underline">shopradar.uk</a> 与 API <a href="https://api.shopradar.uk" class="text-cyan-400 hover:underline">api.shopradar.uk</a> 时我们如何处理信息。',
        hCollect: '我们收集的数据',
        liDevice:
          '<strong>设备 ID</strong> — 存储在浏览器中的随机标识，用于免费额度与 Pro 订阅状态。',
        liStore: '<strong>店铺域名</strong> — 您使用插件时访问的店铺主机名。',
        liCatalog:
          '<strong>公开商品目录</strong> — 来自公开接口（如 products.json）的商品标题、SKU、价格与图片。我们<strong>不</strong>收集 Cookie、登录会话、购物车、订单或客户个人信息。',
        liApi: '<strong>API 使用记录</strong> — 鉴权、额度、Pro 状态及可选的匿名趋势聚合请求。',
        liPayment:
          '<strong>支付元数据</strong> — 由 Lemon Squeezy 处理；结账时可能携带设备 ID 以激活 Pro。',
        hUse: '数据用途',
        liUse1: '提供免费额度与 Pro 功能（CSV 导出、飙升榜大盘）。',
        liUse2: '改进产品情报与服务稳定性。',
        liUse3: '处理订阅与用户支持。',
        hStorage: '数据存储',
        liStorage1: '服务端数据存储于 Vultr 基础设施。',
        liStorage2: '部分数据由插件缓存在您的浏览器本地。',
        liStorage3: '飙升榜数据可能缓存于 Redis 以提升性能。',
        hThird: '第三方服务',
        liLemon: '<strong>Lemon Squeezy</strong> — 支付处理',
        liCloudflare: '<strong>Cloudflare</strong> — DNS / CDN',
        hContact: '联系我们',
        hChanges: '政策变更',
        changesBody: '我们可能更新本政策。继续使用 ShopRadar 即表示您接受更新后的政策。',
      },
      terms: {
        pageTitle: '服务条款 — ShopRadar',
        heading: '服务条款',
        updated: '最后更新：2026年5月21日',
        intro: '使用 ShopRadar（Chrome 插件、官网与 API）即表示您同意本服务条款。',
        hService: '服务说明',
        serviceBody:
          'ShopRadar 提供 Shopify 店铺洞察、公开商品列表工具及 Pro 订阅（含 CSV 导出与全球飙升榜）。所有数据仅供参考，不构成投资建议。',
        hAccounts: '账户与订阅',
        liAcc1: '免费版受插件内描述的每日额度限制。',
        liAcc2: 'Pro 订阅通过 Lemon Squeezy 计费，按所选方案自动续费。',
        liAcc3: '退款遵循 Lemon Squeezy 的退款政策。',
        hAcceptable: '可接受使用规范',
        liUse1: '不得滥用 API 或绕过额度限制。',
        liUse2: '未经许可不得爬取、转售或再分发 ShopRadar 数据。',
        liUse3: '不得将服务用于违法目的。',
        liUse4: '仅可分析公开店铺数据，不得访问店铺后台或客户私密区域。',
        hDisclaimer: '免责声明',
        disclaimerBody:
          '营收估算、增速与排名均为算法近似值，我们不保证准确性。您须自行对商业决策负责。',
        hLiability: '责任限制',
        liabilityBody:
          'ShopRadar 按「现状」提供，不含任何明示或暗示担保。我们对间接、附带或后果性损害不承担责任。',
        hTermination: '终止',
        terminationBody:
          '若违反条款，我们可暂停或终止访问。您可随时通过 Lemon Squeezy 取消 Pro 订阅。',
        hContact: '联系我们',
      },
    },
  },

  ar: {
    legal: {
      backLink: '← العودة إلى ShopRadar',
      privacy: {
        pageTitle: 'سياسة الخصوصية — ShopRadar',
        heading: 'سياسة الخصوصية',
        updated: 'آخر تحديث: 21 مايو 2026',
        intro:
          'يوفر ShopRadar امتداد Chrome ولوحة ويب لمراجعة بيانات المتاجر العامة على Shopify. تصف هذه السياسة كيفية التعامل مع المعلومات عند استخدام <a href="https://shopradar.uk" class="text-cyan-400 hover:underline">shopradar.uk</a> وواجهة API على <a href="https://api.shopradar.uk" class="text-cyan-400 hover:underline">api.shopradar.uk</a>.',
        hCollect: 'البيانات التي نجمعها',
        liDevice:
          '<strong>معرف الجهاز</strong> — معرف عشوائي مخزن في المتصفح لحدود الاستخدام المجاني وحالة Pro.',
        liStore: '<strong>نطاق المتجر</strong> — اسم المضيف للمتجر الذي تزوره.',
        liCatalog:
          '<strong>كتalog المنتجات العام</strong> — عناوين وأسعار وصور من قوائم عامة (مثل products.json). لا نجمع cookies أو جلسات تسجيل الدخول أو سلال أو طلبات.',
        liApi: '<strong>استخدام API</strong> — طلبات المصادقة والحصص وحالة Pro.',
        liPayment: '<strong>بيانات الدفع</strong> — تتم عبر Lemon Squeezy وقد يُرسل معرف الجهاز لتفعيل Pro.',
        hUse: 'كيف نستخدم البيانات',
        liUse1: 'تقديم الميزات المجانية وPro (تصدير CSV ولوحة الترند).',
        liUse2: 'تحسين موثوقية الخدمة.',
        liUse3: 'معالجة الاشتراكات والدعم.',
        hStorage: 'تخزين البيانات',
        liStorage1: 'البيانات على خوادمنا (Vultr).',
        liStorage2: 'بعض البيانات مخزنة محلياً في المتصفح.',
        liStorage3: 'قد تُخزَّن بيانات الترند مؤقتاً في Redis.',
        hThird: 'أطراف ثالثة',
        liLemon: '<strong>Lemon Squeezy</strong> — المدفوعات',
        liCloudflare: '<strong>Cloudflare</strong> — DNS / CDN',
        hContact: 'اتصل بنا',
        hChanges: 'التغييرات',
        changesBody: 'قد نحدّث هذه السياسة. الاستمرار في استخدام ShopRadar يعني قبولك للتحديث.',
      },
      terms: {
        pageTitle: 'شروط الخدمة — ShopRadar',
        heading: 'شروط الخدمة',
        updated: 'آخر تحديث: 21 مايو 2026',
        intro: 'باستخدام ShopRadar فإنك توافق على شروط الخدمة هذه.',
        hService: 'وصف الخدمة',
        serviceBody:
          'ShopRadar يقدم رؤى متاجر Shopify وأدوات قوائم منتجات عامة واشتراك Pro. البيانات لأغراض إعلامية فقط.',
        hAccounts: 'الحسابات والاشتراكات',
        liAcc1: 'الطبقة المجانية لها حدود يومية.',
        liAcc2: 'اشتراك Pro عبر Lemon Squeezy.',
        liAcc3: 'الاسترداد وفق سياسة Lemon Squeezy.',
        hAcceptable: 'الاستخدام المقبول',
        liUse1: 'لا تُسيء استخدام API أو تجاوز الحصص.',
        liUse2: 'لا إعادة بيع أو توزيع البيانات دون إذن.',
        liUse3: 'لا استخدام غير قانوني.',
        liUse4: 'تحليل البيانات العامة فقط.',
        hDisclaimer: 'إخلاء المسؤولية',
        disclaimerBody: 'التقديرات تقريبية ولا نضمن الدقة.',
        hLiability: 'حدود المسؤولية',
        liabilityBody: 'الخدمة «كما هي» دون ضمانات.',
        hTermination: 'الإنهاء',
        terminationBody: 'يمكننا تعليق الوصول عند المخالفة. يمكنك إلغاء Pro عبر Lemon Squeezy.',
        hContact: 'اتصل بنا',
      },
    },
  },

  de: {
    legal: {
      backLink: '← Zurück zu ShopRadar',
      privacy: {
        pageTitle: 'Datenschutz — ShopRadar',
        heading: 'Datenschutzerklärung',
        updated: 'Zuletzt aktualisiert: 21. Mai 2026',
        intro:
          'ShopRadar bietet eine Chrome-Erweiterung und ein Web-Dashboard zur Analyse öffentlicher Shopify-Storefront-Daten. Diese Richtlinie gilt für <a href="https://shopradar.uk" class="text-cyan-400 hover:underline">shopradar.uk</a> und die API unter <a href="https://api.shopradar.uk" class="text-cyan-400 hover:underline">api.shopradar.uk</a>.',
        hCollect: 'Welche Daten wir erheben',
        liDevice:
          '<strong>Geräte-ID</strong> — Zufällige Kennung im Browser für Free-Limits und Pro-Status.',
        liStore: '<strong>Shop-Domain</strong> — Hostname der besuchten Shops.',
        liCatalog:
          '<strong>Öffentlicher Produktkatalog</strong> — Titel, SKU, Preise aus öffentlichen Quellen (z. B. products.json). Keine Cookies, Sessions, Warenkörbe oder Kundendaten.',
        liApi: '<strong>API-Nutzung</strong> — Authentifizierung, Kontingente, Pro-Status.',
        liPayment: '<strong>Zahlungsmetadaten</strong> — über Lemon Squeezy; Geräte-ID zur Pro-Aktivierung.',
        hUse: 'Verwendung der Daten',
        liUse1: 'Free-Tier und Pro-Funktionen (CSV-Export, Trend-Dashboard).',
        liUse2: 'Verbesserung der Servicezuverlässigkeit.',
        liUse3: 'Abwicklung von Abonnements und Support.',
        hStorage: 'Speicherung',
        liStorage1: 'Serverdaten auf Vultr-Infrastruktur.',
        liStorage2: 'Lokaler Browser-Cache durch die Erweiterung.',
        liStorage3: 'Trend-Daten können in Redis zwischengespeichert werden.',
        hThird: 'Drittanbieter',
        liLemon: '<strong>Lemon Squeezy</strong> — Zahlungen',
        liCloudflare: '<strong>Cloudflare</strong> — DNS / CDN',
        hContact: 'Kontakt',
        hChanges: 'Änderungen',
        changesBody:
          'Wir können diese Richtlinie aktualisieren. Die weitere Nutzung gilt als Zustimmung.',
      },
      terms: {
        pageTitle: 'Nutzungsbedingungen — ShopRadar',
        heading: 'Nutzungsbedingungen',
        updated: 'Zuletzt aktualisiert: 21. Mai 2026',
        intro:
          'Mit der Nutzung von ShopRadar stimmen Sie diesen Bedingungen zu.',
        hService: 'Leistungsbeschreibung',
        serviceBody:
          'ShopRadar bietet Shopify-Store-Insights und Pro-Abo mit CSV-Export und Trend-Dashboard. Daten nur zu Informationszwecken.',
        hAccounts: 'Konten & Abos',
        liAcc1: 'Free-Tier mit täglichen Limits.',
        liAcc2: 'Pro über Lemon Squeezy.',
        liAcc3: 'Erstattungen gemäß Lemon Squeezy.',
        hAcceptable: 'Zulässige Nutzung',
        liUse1: 'Kein Missbrauch der API oder Umgehung von Limits.',
        liUse2: 'Kein Weiterverkauf ohne Genehmigung.',
        liUse3: 'Keine rechtswidrige Nutzung.',
        liUse4: 'Nur öffentliche Storefront-Daten analysieren.',
        hDisclaimer: 'Haftungsausschluss',
        disclaimerBody: 'Schätzungen sind unverbindlich.',
        hLiability: 'Haftungsbeschränkung',
        liabilityBody: 'Service „wie besehen“ ohne Garantien.',
        hTermination: 'Kündigung',
        terminationBody: 'Pro jederzeit über Lemon Squeezy kündbar.',
        hContact: 'Kontakt',
      },
    },
  },

  fr: {
    legal: {
      backLink: '← Retour à ShopRadar',
      privacy: {
        pageTitle: 'Politique de confidentialité — ShopRadar',
        heading: 'Politique de confidentialité',
        updated: 'Dernière mise à jour : 21 mai 2026',
        intro:
          'ShopRadar fournit une extension Chrome et un dashboard web pour analyser les données publiques des boutiques Shopify. Cette politique s\'applique à <a href="https://shopradar.uk" class="text-cyan-400 hover:underline">shopradar.uk</a> et à l\'API <a href="https://api.shopradar.uk" class="text-cyan-400 hover:underline">api.shopradar.uk</a>.',
        hCollect: 'Données collectées',
        liDevice:
          '<strong>ID appareil</strong> — Identifiant aléatoire pour les limites gratuites et le statut Pro.',
        liStore: '<strong>Domaine boutique</strong> — Nom d\'hôte des shops visités.',
        liCatalog:
          '<strong>Catalogue public</strong> — Titres, SKU, prix depuis des sources publiques (ex. products.json). Pas de cookies, sessions, paniers ou données clients.',
        liApi: '<strong>Usage API</strong> — Authentification, quotas, statut Pro.',
        liPayment: '<strong>Métadonnées paiement</strong> — via Lemon Squeezy ; ID appareil pour activer Pro.',
        hUse: 'Utilisation des données',
        liUse1: 'Fonctions gratuites et Pro (export CSV, dashboard tendances).',
        liUse2: 'Amélioration du service.',
        liUse3: 'Abonnements et support.',
        hStorage: 'Stockage',
        liStorage1: 'Données serveur sur infrastructure Vultr.',
        liStorage2: 'Cache local dans le navigateur.',
        liStorage3: 'Les tendances peuvent être mises en cache Redis.',
        hThird: 'Tiers',
        liLemon: '<strong>Lemon Squeezy</strong> — Paiements',
        liCloudflare: '<strong>Cloudflare</strong> — DNS / CDN',
        hContact: 'Contact',
        hChanges: 'Modifications',
        changesBody:
          'Nous pouvons mettre à jour cette politique. L\'utilisation continue vaut acceptation.',
      },
      terms: {
        pageTitle: 'Conditions d\'utilisation — ShopRadar',
        heading: 'Conditions d\'utilisation',
        updated: 'Dernière mise à jour : 21 mai 2026',
        intro:
          'En utilisant ShopRadar, vous acceptez ces conditions.',
        hService: 'Description du service',
        serviceBody:
          'ShopRadar fournit des insights Shopify et un abonnement Pro. Données à titre informatif uniquement.',
        hAccounts: 'Comptes et abonnements',
        liAcc1: 'Offre gratuite avec limites quotidiennes.',
        liAcc2: 'Pro facturé via Lemon Squeezy.',
        liAcc3: 'Remboursements selon Lemon Squeezy.',
        hAcceptable: 'Usage acceptable',
        liUse1: 'Ne pas abuser de l\'API.',
        liUse2: 'Pas de revente des données sans autorisation.',
        liUse3: 'Pas d\'usage illégal.',
        liUse4: 'Analyser uniquement les données publiques.',
        hDisclaimer: 'Avertissement',
        disclaimerBody: 'Estimations sans garantie d\'exactitude.',
        hLiability: 'Limitation de responsabilité',
        liabilityBody: 'Service fourni « en l\'état ».',
        hTermination: 'Résiliation',
        terminationBody: 'Annulation Pro via Lemon Squeezy à tout moment.',
        hContact: 'Contact',
      },
    },
  },
};
