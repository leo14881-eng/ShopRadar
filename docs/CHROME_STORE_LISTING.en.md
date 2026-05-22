# ShopRadar — Chrome Web Store Listing (English)

Copy/paste into [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).  
Privacy policy URL: **https://shopradar.uk/privacy.html**  
Support email: **qinx468@gmail.com**

---

## Store listing

### Extension name
```
ShopRadar — Shopify Store Insights
```

### Short description (max 132 characters)
```
Detect Shopify & SFCC stores, browse products, export Pro CSV, and track global trending research heat.
```
*(131 characters)*

### Detailed description
```
ShopRadar helps cross-border and Shopify sellers research stores faster — without manual copy-paste.

WHAT IT DOES
• Detect Shopify and Salesforce Commerce Cloud (SFCC) stores on the tab you open
• Load up to 50 products with titles, prices, variants, and images
• Free plan: 3 store scans per day
• Pro: unlimited scans + CSV/Excel export
• Sync with shopradar.uk for the global trending dashboard (Pro)

HOW IT WORKS
1. Open any independent store in Chrome
2. Click the ShopRadar icon → side panel opens
3. We read publicly available page signals and Shopify products.json (when present)
4. Optional: anonymous product views contribute to aggregated “research heat” rankings on shopradar.uk (see privacy policy)

PRO FEATURES (paid via Lemon Squeezy — shopradar.uk)
• Unlimited daily store scans
• CSV export for product research
• Full trending dashboard: source stores, heat estimates, 7-day attention change
• Restore Pro on a new device with your checkout email

PERMISSIONS (why we need them)
• activeTab + scripting: analyze only the store page you are viewing
• optional host access (https://*/*): requested when you scan a custom domain store
• storage: device ID for free quota & Pro status
• sidePanel: research UI without leaving the page
• api.shopradar.uk: authentication and trending API

NOT AFFILIATED WITH SHOPIFY OR SALESFORCE.

Privacy: https://shopradar.uk/privacy.html  
Terms: https://shopradar.uk/terms.html  
Website: https://shopradar.uk
```

### Category
**Shopping** (primary) or **Productivity**

### Language
English (default), also supports Chinese UI strings

---

## Permission justifications (Privacy practices → Justification)

Paste each block into the matching permission field in the dashboard.

### `storage`
```
Stores a random device ID (for daily free scan quota and Pro license lookup), cached store detection results, and local Pro flag. No passwords or payment card data are stored in the extension.
```

### `sidePanel`
```
Shows the ShopRadar research panel (product list, store type, upgrade to Pro) in Chrome’s side panel while you browse a store.
```

### `scripting`
```
Injects a short, user-initiated script into the active store tab to detect Shopify/SFCC markers and read public product data (e.g. Shopify products.json). Scripts run only after you open ShopRadar on that tab.
```

### `activeTab`
```
Grants temporary access to the current tab when you click the extension, so we can analyze the store you are already viewing.
```

### `tabs`
```
Reads the active tab URL to know which store domain to analyze and to keep the side panel aligned with your current store tab.
```

### Host permission: `https://*.myshopify.com/*`
```
Fetches public Shopify products.json and store assets on myshopify.com hostnames for product research.
```

### Host permission: `https://api.shopradar.uk/*`
```
Connects to ShopRadar API for free-tier quota checks, Pro status, access tokens, and anonymous trending ingest.
```

### Host permission: `https://*.lemonsqueezy.com/*`
```
Opens the Lemon Squeezy checkout page when you choose to upgrade to Pro.
```

### Host permission: `https://shopradar.uk/*`
```
Syncs Device ID and Pro status with the ShopRadar website after payment or email restore.
```

### Optional host permission: `https://*/*`
```
Independent Shopify stores use custom domains (e.g. brand.com). We request optional access only when you scan such a store, so we can read public product endpoints on that domain. We do not browse unrelated sites in the background.
```

---

## Data use & privacy (dashboard questionnaire)

| Question | Suggested answer |
|----------|------------------|
| Single purpose | Store research for e-commerce sellers (Shopify/SFCC product intelligence) |
| Collects personal data? | Yes — device ID, optional email (only if user enters it for Pro restore) |
| Collects browsing history? | Yes — store domains and product titles user scans (for quota + aggregated trending) |
| Data sold to third parties? | No |
| Privacy policy | https://shopradar.uk/privacy.html |
| Remote code? | No — all logic is bundled in the extension package |
| Payment | Handled by Lemon Squeezy (external checkout), not Chrome Web Store billing |

---

## Screenshot checklist (1280×800 recommended)

1. Side panel on a Shopify store — “Shopify store detected” + product list  
2. Free quota indicator / 3 scans per day  
3. Pro export button / CSV success  
4. SFCC store detected (if available)  
5. shopradar.uk trending dashboard (Pro unlocked)

---

## Pre-submit command

```powershell
cd D:\SOFT\java\ShopRadar
npm run package:store
```

Upload **`shopradar-extension/ShopRadar-chrome-store.zip`** — production manifest has **no localhost** entries.
