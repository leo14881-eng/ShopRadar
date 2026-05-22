/**
 * ShopRadar 官网 — Pro 鉴权、付费墙、榜单与 Lemon 结账闭环
 * 设备 ID / Token / Pro 状态见 auth-shared.js (ShopRadarAuth)
 */
(function () {
  'use strict';

  var Auth = window.ShopRadarAuth || {};
  var API_BASE = Auth.getApiBase ? Auth.getApiBase() : '';

  var PRODUCT_THUMB_PLACEHOLDER =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
        '<rect width="80" height="80" rx="12" fill="#2a2a32"/>' +
        '<path d="M24 52l10-12 8 8 6-8 8 12H24z" fill="#4b5563"/>' +
        '<circle cx="32" cy="30" r="5" fill="#4b5563"/>' +
        '</svg>'
    );

  var isPro = false;
  var lastProExpiresAt = '';
  var pollTimer = null;
  var trendingFetchGen = 0;
  var famousStoresFetchGen = 0;
  var extensionSyncBound = false;
  var lastKnownExtDeviceId = '';

  function bumpTrendingFetchGen() {
    trendingFetchGen += 1;
    return trendingFetchGen;
  }

  function isTrendingFetchStale(gen) {
    return gen !== trendingFetchGen;
  }

  function bumpFamousStoresFetchGen() {
    famousStoresFetchGen += 1;
    return famousStoresFetchGen;
  }

  function isFamousStoresFetchStale(gen) {
    return gen !== famousStoresFetchGen;
  }

  function getI18n() {
    return window.ShopRadarI18n || null;
  }

  function t(key) {
    var i18n = getI18n();
    return i18n && i18n.t ? i18n.t(key) : key;
  }

  function getAcceptLanguageHeader() {
    var i18n = getI18n();
    return i18n && i18n.getAcceptLanguage ? i18n.getAcceptLanguage() : 'en';
  }

  function formatUtcLocal(iso) {
    var i18n = getI18n();
    if (i18n && i18n.formatUtcLocal) {
      return i18n.formatUtcLocal(iso);
    }
    if (!iso) {
      return '—';
    }
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function isNumericValue(val) {
    return val != null && val !== '' && !isNaN(Number(val));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function wireUpgradeButtons(deviceId) {
    updateDeviceIdDisplay(deviceId);
    var checkoutUrl = Auth.buildLemonCheckoutUrl(deviceId);
    var buttons = document.querySelectorAll('.js-upgrade-pro');
    for (var i = 0; i < buttons.length; i++) {
      var el = buttons[i];
      if (checkoutUrl) {
        el.setAttribute('href', checkoutUrl);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        el.classList.remove('opacity-50', 'pointer-events-none');
      } else {
        el.setAttribute('href', '#');
        el.classList.add('opacity-50', 'pointer-events-none');
        el.title = 'Checkout URL not configured';
      }
    }
  }

  function truncateDeviceId(id) {
    var value = String(id || '').trim();
    if (value.length <= 16) {
      return value;
    }
    return value.slice(0, 8) + '…' + value.slice(-4);
  }

  function updateDeviceIdDisplay(deviceId) {
    var full = String(deviceId || '').trim();
    var short = full ? truncateDeviceId(full) : '—';
    var mainEl = $('dashboard-device-id');
    var paywallEl = $('paywall-device-id');
    if (mainEl) {
      mainEl.textContent = short;
      mainEl.title = full || '';
    }
    if (paywallEl) {
      paywallEl.textContent = short;
      paywallEl.title = full || '';
    }
  }

  function setSyncStatusMessage(text, isError) {
    var el = $('dashboard-sync-status');
    if (!el) {
      return;
    }
    if (!text) {
      el.textContent = '';
      el.classList.add('hidden');
      el.classList.remove('text-emerald-400', 'text-amber-400');
      return;
    }
    el.textContent = text;
    el.classList.remove('hidden', 'text-emerald-400', 'text-amber-400');
    el.classList.add(isError ? 'text-amber-400' : 'text-emerald-400');
  }

  function updateSyncHintVisible(show) {
    var hint = $('dashboard-sync-hint');
    if (!hint) {
      return;
    }
    hint.classList.toggle('hidden', !show);
  }

  function requestExtensionSync() {
    try {
      window.postMessage({ type: 'SR_REQUEST_DEVICE_SYNC', source: 'shopradar-website' }, '*');
    } catch (postErr) {
      /* ignore */
    }
  }

  function waitForDeviceSyncedEvent(timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = null;
      function finish(detail) {
        if (settled) {
          return;
        }
        settled = true;
        if (timer) {
          clearTimeout(timer);
        }
        resolve(detail || null);
      }
      window.addEventListener(
        'shopradar:device-synced',
        function (event) {
          finish(event && event.detail ? event.detail : null);
        },
        { once: true }
      );
      timer = setTimeout(function () {
        finish(null);
      }, timeoutMs || 10000);
    });
  }

  function applyDeviceSyncDetail(detail, deviceIdRef) {
    if (!detail || !detail.deviceId) {
      return deviceIdRef;
    }
    var syncedId = String(detail.deviceId).trim();
    if (detail.extDeviceId) {
      lastKnownExtDeviceId = String(detail.extDeviceId).trim();
    }
    if (syncedId && !Auth.readQueryDeviceId()) {
      try {
        localStorage.setItem(Auth.STORAGE_DEVICE_ID, syncedId);
      } catch (storageErr) {
        /* ignore */
      }
    }
    if (detail.payload) {
      Auth.saveAccessTokenFromPayload(detail.payload);
    }
    if (detail.payloadDefinite) {
      if (detail.isPro) {
        Auth.persistProFlag(true);
      } else {
        Auth.persistProFlag(false);
      }
    }
    deviceIdRef = syncedId;
    wireUpgradeButtons(deviceIdRef);
    if (detail.isPro) {
      applyProState(true, detail.proExpiresAt || lastProExpiresAt);
      updateSyncHintVisible(false);
      setSyncStatusMessage('');
    } else if (detail.payloadDefinite) {
      refreshProStatus(deviceIdRef).catch(function () {});
    } else {
      refreshProStatus(deviceIdRef).catch(function () {});
    }
    return deviceIdRef;
  }

  function triggerExtensionSync(deviceId, options) {
    var opts = options || {};
    var syncBtn = $('dashboard-sync-extension-btn');
    var paywallBtn = $('paywall-sync-extension-btn');
    if (syncBtn) {
      syncBtn.disabled = true;
    }
    if (paywallBtn) {
      paywallBtn.disabled = true;
    }
    if (!opts.quiet) {
      setSyncStatusMessage(t('dashboard.syncExtensionWorking'), false);
    }

    requestExtensionSync();
    setTimeout(requestExtensionSync, 400);

    return waitForDeviceSyncedEvent(opts.timeoutMs || 10000).then(function (detail) {
      if (syncBtn) {
        syncBtn.disabled = false;
      }
      if (paywallBtn) {
        paywallBtn.disabled = false;
      }

      if (detail && detail.extensionAvailable) {
        deviceId = applyDeviceSyncDetail(detail, deviceId);
        if (detail.isPro) {
          if (!opts.quiet) {
            setSyncStatusMessage(t('dashboard.syncExtensionSuccess'), false);
          }
          return { ok: true, deviceId: deviceId, isPro: true };
        }
        if (detail.idMerged) {
          return refreshProStatus(deviceId).then(function (pro) {
            if (pro) {
              if (!opts.quiet) {
                setSyncStatusMessage(t('dashboard.syncExtensionSuccess'), false);
              }
              updateSyncHintVisible(false);
              return { ok: true, deviceId: deviceId, isPro: true };
            }
            if (!opts.quiet) {
              setSyncStatusMessage('', false);
            }
            updateSyncHintVisible(true);
            return { ok: false, deviceId: deviceId, isPro: false };
          });
        }
      }

      if (!opts.quiet) {
        setSyncStatusMessage(t('dashboard.syncExtensionNoExtension'), true);
      }
      updateSyncHintVisible(true);
      return { ok: false, deviceId: deviceId, isPro: false, noExtension: true };
    });
  }

  function bindDeviceIdBar(getDeviceId) {
    if (extensionSyncBound) {
      return;
    }
    extensionSyncBound = true;

    var copyBtn = $('dashboard-copy-device-id');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var id = getDeviceId();
        if (!id) {
          return;
        }
        var copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(id).then(function () {
            setSyncStatusMessage(t('dashboard.deviceIdCopied'), false);
          }).catch(function () {});
          copied = true;
        }
        if (!copied) {
          try {
            var ta = document.createElement('textarea');
            ta.value = id;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setSyncStatusMessage(t('dashboard.deviceIdCopied'), false);
          } catch (copyErr) {
            /* ignore */
          }
        }
      });
    }

    function onSyncClick() {
      triggerExtensionSync(getDeviceId(), { quiet: false });
    }

    var syncBtn = $('dashboard-sync-extension-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', onSyncClick);
    }
    var paywallSyncBtn = $('paywall-sync-extension-btn');
    if (paywallSyncBtn) {
      paywallSyncBtn.addEventListener('click', onSyncClick);
    }
  }

  function setClaimProMessage(text, isError) {
    var msgEl = $('claim-pro-msg');
    if (!msgEl) {
      return;
    }
    if (!text) {
      msgEl.textContent = '';
      msgEl.classList.add('hidden');
      msgEl.classList.remove('text-red-400', 'text-emerald-400');
      return;
    }
    msgEl.textContent = text;
    msgEl.classList.remove('hidden', 'text-red-400', 'text-emerald-400');
    msgEl.classList.add(isError ? 'text-red-400' : 'text-emerald-400');
  }

  function claimProWithEmail(deviceId, email) {
    var trimmed = String(email || '').trim();
    if (!trimmed) {
      return Promise.resolve({ ok: false, msg: t('dashboard.claimProEmptyEmail') });
    }
    return fetch(API_BASE + '/api/claim-pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId, email: trimmed }),
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return { ok: false, isPro: false };
          })
          .then(function (data) {
            if (response.ok && data && data.isPro) {
              Auth.saveAccessTokenFromPayload(data);
              Auth.persistProFlag(true);
              applyProState(true, data.proExpiresAt || '');
              setPaywallLocked(false);
              loadTrending(deviceId, true);
              return { ok: true, msg: t('dashboard.claimProSuccess') };
            }
            return {
              ok: false,
              msg:
                (data && data.msg) ||
                'No Pro record found for this email. Check the address or wait 2 minutes after payment.',
            };
          });
      })
      .catch(function () {
        return { ok: false, msg: t('dashboard.claimProNetworkError') };
      });
  }

  var claimProFormBound = false;

  function bindClaimProForm() {
    if (claimProFormBound) {
      return;
    }
    var btn = $('claim-pro-btn');
    var input = $('claim-pro-email');
    if (!btn || !input) {
      return;
    }
    claimProFormBound = true;

    btn.addEventListener('click', function () {
      var deviceId = Auth.getOrCreateDeviceId();
      var labelEl = btn.querySelector('[data-i18n]') || btn;
      var prevText = labelEl.textContent;
      btn.disabled = true;
      input.disabled = true;
      labelEl.textContent = t('dashboard.claimProWorking');
      setClaimProMessage('');

      claimProWithEmail(deviceId, input.value).then(function (result) {
        if (result.ok) {
          setClaimProMessage(result.msg, false);
          input.value = '';
        } else {
          setClaimProMessage(result.msg, true);
        }
      }).finally(function () {
        btn.disabled = false;
        input.disabled = false;
        labelEl.textContent = prevText;
      });
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        btn.click();
      }
    });
  }

  function wireChromeStoreLinks() {
    var url = String((Auth.getConfig().chromeStoreUrl || '')).trim();
    if (!url || url.indexOf('PLACEHOLDER') !== -1) {
      return;
    }
    var links = document.querySelectorAll('.js-chrome-store');
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('href', url);
    }
  }

  function updateNavUpgrade(pro) {
    var navUpgrade = $('nav-upgrade-btn');
    if (!navUpgrade) {
      return;
    }
    navUpgrade.classList.remove('hidden');
    navUpgrade.removeAttribute('aria-hidden');

    if (pro) {
      navUpgrade.removeAttribute('href');
      navUpgrade.classList.remove(
        'js-upgrade-pro',
        'cta-shine',
        'text-radar-950',
        'hover:opacity-90',
        'transition-opacity'
      );
      navUpgrade.classList.add('pro-active-badge');
      navUpgrade.setAttribute('role', 'status');
      navUpgrade.setAttribute('aria-label', t('nav.proActive'));
      navUpgrade.innerHTML =
        '<span class="pro-pulse-dot" aria-hidden="true"></span>' +
        '<span class="pro-active-label">' +
        escapeHtml(t('nav.proActiveBtn')) +
        '</span>';
      return;
    }

    navUpgrade.setAttribute('href', '#');
    navUpgrade.classList.add(
      'js-upgrade-pro',
      'cta-shine',
      'text-radar-950',
      'hover:opacity-90',
      'transition-opacity'
    );
    navUpgrade.classList.remove('pro-active-badge');
    navUpgrade.removeAttribute('role');
    navUpgrade.removeAttribute('aria-label');
    navUpgrade.textContent = t('nav.upgradePro');
  }

  function setPaywallLocked(locked) {
    var overlay = $('paywall-overlay');
    var famousOverlay = $('famous-stores-paywall-overlay');
    var blurEl = $('trending-table-blur');
    var famousBlurEl = $('famous-stores-table-blur');

    if (overlay) {
      overlay.classList.toggle('hidden', !locked);
    }
    if (famousOverlay) {
      famousOverlay.classList.toggle('hidden', !locked);
    }
    if (blurEl) {
      blurEl.classList.toggle('paywall-blur', locked);
    }
    if (famousBlurEl) {
      famousBlurEl.classList.toggle('paywall-blur', locked);
    }
  }

  function applyProState(pro, proExpiresAt) {
    isPro = pro;
    if (proExpiresAt) {
      lastProExpiresAt = proExpiresAt;
    }
    Auth.persistProFlag(pro);
    updateNavUpgrade(pro);
    setPaywallLocked(!pro);
    loadTrending(Auth.getOrCreateDeviceId(), pro);
    loadFamousStores(Auth.getOrCreateDeviceId(), pro);
  }

  function formatMoney(value) {
    if (!isNumericValue(value)) {
      return String(value || '—');
    }
    var num = Number(value);
    if (!num) {
      return '—';
    }
    return '~$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function formatGrowth(value) {
    if (!isNumericValue(value)) {
      return String(value || '—');
    }
    var num = Number(value);
    var sign = num >= 0 ? '+' : '';
    return sign + num + '%';
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeTrendingItem(item) {
    return {
      rank: item.rank,
      title: item.title,
      sku: item.sku,
      category: item.category,
      estDailyRev: item.est_daily_rev != null ? item.est_daily_rev : item.estDailyRev,
      growth7d: item.growth_7d != null ? item.growth_7d : item.growth7d,
      sourceStore: item.shop_domain || item.sourceStore,
      productUrl: item.product_url || item.productUrl,
      adSignal: item.ad_signal || item.adSignal,
      imageUrl: item.image_url || item.imageUrl,
      locked: Boolean(item.locked),
      lockedMessage: item.locked_message || item.lockedMessage,
    };
  }

  function renderProductThumb(imageUrl, title) {
    var src = imageUrl || PRODUCT_THUMB_PLACEHOLDER;
    return (
      '<img src="' +
      escapeHtml(src) +
      '" alt="' +
      escapeHtml(title || '') +
      '" class="w-10 h-10 rounded-lg object-cover bg-gray-800 flex-shrink-0" loading="lazy" decoding="async" ' +
      'onerror="this.onerror=null;this.src=\'' +
      PRODUCT_THUMB_PLACEHOLDER +
      '\';" />'
    );
  }

  function lockedCell(text, hint) {
    var label = escapeHtml(String(text || hint || '—'));
    return (
      '<td class="px-6 py-4 text-muted italic text-xs" title="' +
      escapeHtml(String(hint || '')) +
      '">' +
      label +
      '</td>'
    );
  }

  function updateTrendingMeta(payload) {
    var dateEl = $('trending-date-label');
    var storesEl = $('stores-tracked-badge');
    if (dateEl && payload) {
      var parts = [];
      if (payload.rank_date_label || payload.rank_date) {
        parts.push(
          t('dashboard.rankFor') +
            ': ' +
            String(payload.rank_date_label || payload.rank_date)
        );
      }
      if (payload.updated_at) {
        parts.push(t('dashboard.updatedAt') + ': ' + formatUtcLocal(payload.updated_at));
      }
      if (payload.next_update_at) {
        parts.push(t('dashboard.nextUpdate') + ': ' + formatUtcLocal(payload.next_update_at));
      }
      dateEl.textContent = parts.length ? parts.join(' · ') : '—';
    }
    if (storesEl && payload) {
      var count = Number(
        payload.stores_tracked != null ? payload.stores_tracked : payload.storesTracked || 0
      );
      storesEl.textContent =
        count.toLocaleString() + ' ' + t('dashboard.storesTracked');
    }
  }

  function renderTrendingRows(items, pro) {
    var tbody = $('trending-table-body');
    var tableWrap = $('trending-table-blur');
    var loadingEl = $('trending-loading');
    var emptyEl = $('trending-empty');

    if (!tbody || !tableWrap) {
      return;
    }

    if (loadingEl) {
      loadingEl.classList.add('hidden');
    }

    if (!items || !items.length) {
      tableWrap.classList.add('hidden');
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
      }
      return;
    }

    if (emptyEl) {
      emptyEl.classList.add('hidden');
    }
    tableWrap.classList.remove('hidden');

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = normalizeTrendingItem(items[i]);
      var rankClass = item.rank <= 3 ? 'text-radar-cyan font-bold' : 'text-gray-400 font-bold';
      var revCell =
        pro && isNumericValue(item.estDailyRev)
          ? '<td class="px-6 py-4 font-semibold text-emerald-400">' +
            escapeHtml(formatMoney(item.estDailyRev)) +
            '</td>'
          : lockedCell(item.estDailyRev, item.lockedMessage);
      var growthCell =
        pro && isNumericValue(item.growth7d)
          ? '<td class="px-6 py-4"><span class="text-emerald-400 font-bold">' +
            escapeHtml(formatGrowth(item.growth7d)) +
            '</span></td>'
          : lockedCell(item.growth7d, item.lockedMessage);
      var storeCell =
        pro && item.sourceStore
          ? '<td class="px-6 py-4 text-radar-cyan">' + escapeHtml(item.sourceStore) + '</td>'
          : lockedCell(item.sourceStore, item.lockedMessage);

      html +=
        '<tr class="hover:bg-white/[0.02]">' +
        '<td class="px-6 py-4"><span class="' + rankClass + '">' + item.rank + '</span></td>' +
        '<td class="px-6 py-4">' +
          '<div class="flex items-center gap-3">' +
            renderProductThumb(item.imageUrl, item.title) +
            '<div>' +
              '<div class="font-medium text-gray-200">' + escapeHtml(item.title) + '</div>' +
              '<div class="text-xs text-muted">' +
              escapeHtml(t('misc.sku')) +
              ': ' +
              escapeHtml(item.sku || '—') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td class="px-6 py-4 text-gray-400">' + escapeHtml(item.category || 'General') + '</td>' +
        revCell +
        growthCell +
        storeCell +
        '</tr>';
    }

    tbody.innerHTML = html;
  }

  function normalizeFamousStoreItem(item) {
    return {
      rank: item.rank,
      displayName: item.display_name || item.displayName,
      platform: item.platform,
      region: item.region,
      yesterdayResearchers:
        item.yesterday_researchers != null
          ? item.yesterday_researchers
          : item.yesterdayResearchers,
      weekResearchers:
        item.week_researchers != null ? item.week_researchers : item.weekResearchers,
      storeDomain: item.store_domain || item.storeDomain,
      storeUrl: item.store_url || item.storeUrl,
      locked: Boolean(item.locked),
      lockedMessage: item.locked_message || item.lockedMessage,
    };
  }

  function updateFamousStoresMeta(payload) {
    var dateEl = $('famous-stores-date-label');
    var sampleEl = $('famous-stores-sample-badge');
    var disclaimerEl = $('famous-stores-disclaimer');

    if (dateEl && payload) {
      var parts = [];
      if (payload.rank_date_label || payload.rank_date) {
        parts.push(
          t('dashboard.rankFor') +
            ': ' +
            String(payload.rank_date_label || payload.rank_date)
        );
      }
      if (payload.updated_at) {
        parts.push(t('dashboard.updatedAt') + ': ' + formatUtcLocal(payload.updated_at));
      }
      dateEl.textContent = parts.length ? parts.join(' · ') : '—';
    }
    if (sampleEl && payload) {
      var count = Number(payload.sample_size != null ? payload.sample_size : 0);
      sampleEl.textContent =
        count.toLocaleString() + ' ' + t('famousStores.storesSample');
    }
    if (disclaimerEl && payload && payload.disclaimer) {
      disclaimerEl.textContent = String(payload.disclaimer);
    }
  }

  function renderFamousStoreRows(items, pro) {
    var tbody = $('famous-stores-table-body');
    var tableWrap = $('famous-stores-table-blur');
    var loadingEl = $('famous-stores-loading');
    var emptyEl = $('famous-stores-empty');

    if (!tbody || !tableWrap) {
      return;
    }

    if (loadingEl) {
      loadingEl.classList.add('hidden');
    }

    if (!items || !items.length) {
      tableWrap.classList.add('hidden');
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
      }
      return;
    }

    if (emptyEl) {
      emptyEl.classList.add('hidden');
    }
    tableWrap.classList.remove('hidden');

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = normalizeFamousStoreItem(items[i]);
      var rankClass = item.rank <= 3 ? 'text-radar-cyan font-bold' : 'text-gray-400 font-bold';
      var regionCell =
        pro && item.region
          ? '<td class="px-6 py-4 text-gray-400">' + escapeHtml(item.region) + '</td>'
          : lockedCell(item.region, item.lockedMessage);
      var yesterdayCell =
        pro && isNumericValue(item.yesterdayResearchers)
          ? '<td class="px-6 py-4 font-semibold text-emerald-400">' +
            escapeHtml(Number(item.yesterdayResearchers).toLocaleString()) +
            '</td>'
          : lockedCell(item.yesterdayResearchers, item.lockedMessage);
      var weekCell =
        pro && isNumericValue(item.weekResearchers)
          ? '<td class="px-6 py-4 text-gray-300">' +
            escapeHtml(Number(item.weekResearchers).toLocaleString()) +
            '</td>'
          : lockedCell(item.weekResearchers, item.lockedMessage);
      var urlCell =
        pro && item.storeUrl && item.storeDomain !== 'Hidden'
          ? '<td class="px-6 py-4"><a href="' +
            escapeHtml(item.storeUrl) +
            '" target="_blank" rel="noopener noreferrer" class="text-radar-cyan hover:underline">' +
            escapeHtml(item.storeDomain || item.storeUrl) +
            '</a></td>'
          : lockedCell(item.storeDomain || item.storeUrl, item.lockedMessage);

      html +=
        '<tr class="hover:bg-white/[0.02]">' +
        '<td class="px-6 py-4"><span class="' + rankClass + '">' + item.rank + '</span></td>' +
        '<td class="px-6 py-4 font-medium text-gray-200">' + escapeHtml(item.displayName || '—') + '</td>' +
        '<td class="px-6 py-4 text-gray-400">' + escapeHtml(item.platform || '—') + '</td>' +
        regionCell +
        yesterdayCell +
        weekCell +
        urlCell +
        '</tr>';
    }

    tbody.innerHTML = html;
  }

  function fetchFamousStores(deviceId, retryWithoutToken) {
    var token = retryWithoutToken ? '' : Auth.getStoredAccessToken();
    var url =
      API_BASE +
      '/api/v1/dashboard/trending/famous-stores?deviceId=' +
      encodeURIComponent(deviceId) +
      '&limit=25';
    var headers = {
      'Accept-Language': getAcceptLanguageHeader(),
    };
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    return fetch(url, { headers: headers })
      .then(function (response) {
        if (response.status === 401 && token) {
          Auth.clearStoredAccessToken();
          return fetchFamousStores(deviceId, true);
        }
        if (!response.ok) {
          return { ok: false, items: [] };
        }
        return response.json();
      })
      .catch(function () {
        return { ok: false, items: [] };
      });
  }

  function loadFamousStores(deviceId, pro) {
    var fetchGen = bumpFamousStoresFetchGen();
    var loadingEl = $('famous-stores-loading');
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
    }

    return fetchFamousStores(deviceId).then(function (payload) {
      if (isFamousStoresFetchStale(fetchGen)) {
        return payload;
      }
      updateFamousStoresMeta(payload);
      var viewerPro =
        (payload.viewer && payload.viewer.is_pro) ||
        payload.is_pro ||
        payload.isPro ||
        false;
      renderFamousStoreRows(payload.items || [], viewerPro);
      return payload;
    });
  }

  function fetchTrending(deviceId, retryWithoutToken) {
    var token = retryWithoutToken ? '' : Auth.getStoredAccessToken();
    var url =
      API_BASE +
      '/api/v1/dashboard/trending?deviceId=' +
      encodeURIComponent(deviceId) +
      '&limit=20';
    var headers = {
      'Accept-Language': getAcceptLanguageHeader(),
    };
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    return fetch(url, { headers: headers })
      .then(function (response) {
        if (response.status === 401 && token) {
          Auth.clearStoredAccessToken();
          return fetchTrending(deviceId, true);
        }
        if (!response.ok) {
          return { ok: false, items: [] };
        }
        return response.json();
      })
      .catch(function () {
        return { ok: false, items: [] };
      });
  }

  function loadTrending(deviceId, pro) {
    var fetchGen = bumpTrendingFetchGen();
    var loadingEl = $('trending-loading');
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
    }

    return fetchTrending(deviceId).then(function (payload) {
      if (isTrendingFetchStale(fetchGen)) {
        return payload;
      }
      updateTrendingMeta(payload);
      var viewerPro =
        (payload.viewer && payload.viewer.is_pro) ||
        payload.is_pro ||
        payload.isPro ||
        false;
      renderTrendingRows(payload.items || [], viewerPro);
      return payload;
    });
  }

  function fetchProStatus(deviceId) {
    return Auth.fetchProStatus(deviceId, {
      onNetworkError: function () {
        return {
          isPro: Auth.loadProFlagFromStorage(),
          proExpiresAt: lastProExpiresAt,
        };
      },
    });
  }

  function refreshProStatus(deviceId, options) {
    var opts = options || {};
    return fetchProStatus(deviceId).then(function (status) {
      if (status.isPro) {
        applyProState(true, status.proExpiresAt);
        return true;
      }
      if (
        opts.preserveOptimistic &&
        (Auth.loadProFlagFromStorage() || opts.paymentPending)
      ) {
        isPro = true;
        updateNavUpgrade(true);
        setPaywallLocked(false);
        return false;
      }
      applyProState(false, status.proExpiresAt);
      return false;
    });
  }

  function shouldPollAfterPayment() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('paid') === '1' || params.get('checkout') === 'success') {
        return true;
      }
      var hash = window.location.hash || '';
      var qIdx = hash.indexOf('?');
      if (qIdx >= 0) {
        var hashParams = new URLSearchParams(hash.slice(qIdx + 1));
        if (
          hashParams.get('paid') === '1' ||
          hashParams.get('checkout') === 'success'
        ) {
          return true;
        }
      }
    } catch (e) {
      /* ignore */
    }
    return window.location.pathname.indexOf('success') !== -1;
  }

  function pollProAfterPayment(deviceId) {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }

    Auth.pollUntilProActivated(deviceId, {
      timeoutMs: 28000,
      intervalMs: 2000,
    }).then(function (result) {
      if (result && result.activated) {
        applyProState(true, result.proExpiresAt || '');
        var dashboard = $('dashboard');
        if (dashboard) {
          dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateSyncHintVisible(false);
        return;
      }
      Auth.persistProFlag(false);
      refreshProStatus(deviceId).then(function (pro) {
        if (!pro) {
          updateSyncHintVisible(true);
          triggerExtensionSync(deviceId, { quiet: true });
        }
      }).catch(function () {
        updateSyncHintVisible(true);
      });
    });
  }

  function cleanPaymentQueryFromUrl() {
    try {
      var url = new URL(window.location.href);
      var changed = false;
      ['paid', 'checkout', 'deviceId', 'device_id'].forEach(function (key) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
      var hash = url.hash || '';
      var qIdx = hash.indexOf('?');
      if (qIdx >= 0) {
        var route = hash.slice(0, qIdx);
        var hashParams = new URLSearchParams(hash.slice(qIdx + 1));
        ['paid', 'checkout', 'deviceId', 'device_id'].forEach(function (key) {
          if (hashParams.has(key)) {
            hashParams.delete(key);
            changed = true;
          }
        });
        var rest = hashParams.toString();
        url.hash = route + (rest ? '?' + rest : '');
      }
      if (changed) {
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function waitForExtensionDeviceSync() {
    return new Promise(function (resolve) {
      var settled = false;
      var syncDetail = null;
      function finish() {
        if (!settled) {
          settled = true;
          resolve(syncDetail);
        }
      }
      window.addEventListener(
        'shopradar:device-synced',
        function (event) {
          syncDetail = event && event.detail ? event.detail : null;
          if (syncDetail && syncDetail.extDeviceId) {
            lastKnownExtDeviceId = String(syncDetail.extDeviceId).trim();
          }
          if (syncDetail && syncDetail.deviceId && !Auth.readQueryDeviceId()) {
            try {
              localStorage.setItem(Auth.STORAGE_DEVICE_ID, String(syncDetail.deviceId).trim());
            } catch (storageErr) {
              /* ignore */
            }
          }
          if (syncDetail && syncDetail.payload) {
            Auth.saveAccessTokenFromPayload(syncDetail.payload);
          }
          if (syncDetail && syncDetail.payloadDefinite) {
            if (syncDetail.isPro) {
              Auth.persistProFlag(true);
            } else {
              Auth.persistProFlag(false);
            }
          }
          finish();
        },
        { once: true }
      );
      requestExtensionSync();
      setTimeout(requestExtensionSync, 800);
      setTimeout(requestExtensionSync, 2500);
      setTimeout(finish, 10000);
    });
  }

  function init() {
    waitForExtensionDeviceSync().then(function (initialSync) {
      runDashboardInit(initialSync);
    });
  }

  function runDashboardInit(initialSync) {
    var deviceId = Auth.getOrCreateDeviceId({ deferCreate: true });
    if (!deviceId) {
      deviceId = Auth.getOrCreateDeviceId();
    }
    if (initialSync && initialSync.extDeviceId) {
      lastKnownExtDeviceId = String(initialSync.extDeviceId).trim();
    }
    if (initialSync && initialSync.isPro) {
      lastProExpiresAt = initialSync.proExpiresAt || lastProExpiresAt;
    }
    wireUpgradeButtons(deviceId);
    bindClaimProForm();
    bindDeviceIdBar(function () {
      return deviceId;
    });
    wireChromeStoreLinks();

    function onDeviceResynced(event) {
      deviceId = applyDeviceSyncDetail(
        event && event.detail ? event.detail : null,
        deviceId
      );
    }
    window.addEventListener('shopradar:device-synced', onDeviceResynced);

    document.addEventListener('shopradar:locale', function () {
      updateNavUpgrade(isPro);
      updateDeviceIdDisplay(deviceId);
      if (!isPro) {
        wireUpgradeButtons(deviceId);
      }
      loadTrending(deviceId, isPro);
      loadFamousStores(deviceId, isPro);
    });

    var paymentPending = shouldPollAfterPayment();
    var optimisticPro = Auth.loadProFlagFromStorage();

    if (initialSync && initialSync.isPro) {
      applyProState(true, initialSync.proExpiresAt || lastProExpiresAt);
    } else if (optimisticPro || paymentPending) {
      applyProState(true, lastProExpiresAt);
    } else {
      setPaywallLocked(true);
    }

    refreshProStatus(deviceId, {
      preserveOptimistic: optimisticPro || paymentPending,
      paymentPending: paymentPending,
    }).then(function (pro) {
      if (!pro && paymentPending) {
        pollProAfterPayment(deviceId);
      } else if (!pro && !paymentPending) {
        if (
          lastKnownExtDeviceId &&
          deviceId &&
          lastKnownExtDeviceId !== deviceId
        ) {
          updateSyncHintVisible(true);
        }
        setTimeout(function () {
          if (!isPro) {
            triggerExtensionSync(deviceId, { quiet: true }).then(function (result) {
              if (result && result.isPro) {
                deviceId = result.deviceId || deviceId;
              } else if (!result || !result.noExtension) {
                updateSyncHintVisible(true);
              }
            });
          }
        }, 1500);
      } else {
        updateSyncHintVisible(false);
      }
      cleanPaymentQueryFromUrl();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ShopRadarDashboard = {
    getDeviceId: Auth.getOrCreateDeviceId,
    refreshProStatus: function () {
      return refreshProStatus(Auth.getOrCreateDeviceId());
    },
    refreshTrending: function () {
      return loadTrending(Auth.getOrCreateDeviceId(), isPro);
    },
    refreshFamousStores: function () {
      return loadFamousStores(Auth.getOrCreateDeviceId(), isPro);
    },
    buildCheckoutUrl: function () {
      return Auth.buildLemonCheckoutUrl(Auth.getOrCreateDeviceId());
    },
    syncWithExtension: function () {
      return triggerExtensionSync(Auth.getOrCreateDeviceId(), { quiet: false });
    },
  };
})();
