/* ----- ShopRadar Service Worker 引导（由 build:sw 追加到 background.js 末尾） ----- */
'use strict';

var SIDE_PANEL_PATH = 'popup.html';

function setupSidePanel() {
  if (!chrome.sidePanel) {
    return;
  }
  if (chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(function () {});
  }
  if (chrome.sidePanel.setOptions) {
    chrome.sidePanel
      .setOptions({
        path: SIDE_PANEL_PATH,
        enabled: true,
      })
      .catch(function () {});
  }
}

function enableSidePanelForTab(tabId) {
  if (!chrome.sidePanel || !chrome.sidePanel.setOptions || tabId == null) {
    return;
  }
  chrome.tabs.get(tabId, function (tab) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
      ShopRadarGuard.consumeLastError();
    } else if (chrome.runtime.lastError) {
      /* consumed */
    }
    if (
      !tab ||
      !tab.url ||
      (typeof ShopRadarGuard !== 'undefined' &&
        ShopRadarGuard.isRestrictedUrl(tab.url))
    ) {
      return;
    }
    if (!isRetailShopTabUrl(tab.url)) {
      return;
    }
    chrome.sidePanel
      .setOptions({
        tabId: tabId,
        path: SIDE_PANEL_PATH,
        enabled: true,
      })
      .catch(function () {});
  });
}

var lastRetailTabId = null;

function isOwnAppHost(host) {
  var h = (host || '').toLowerCase();
  return (
    h === 'shopradar.uk' ||
    h.endsWith('.shopradar.uk') ||
    h === 'localhost' ||
    h === '127.0.0.1'
  );
}

function isRetailShopTabUrl(url) {
  if (!url) {
    return false;
  }
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.isRestrictedUrl(url)) {
    return false;
  }
  try {
    var host = new URL(url).hostname.toLowerCase();
    if (isOwnAppHost(host)) {
      return false;
    }
    if (host === 'lemonsqueezy.com' || host.endsWith('.lemonsqueezy.com')) {
      return false;
    }
    if (
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com')
    ) {
      return false;
    }
  } catch (urlErr) {
    return false;
  }
  return true;
}

function rememberRetailTab(tabId, url) {
  if (tabId != null && isRetailShopTabUrl(url)) {
    lastRetailTabId = tabId;
  }
}

function resolveBestRetailTab(callback) {
  chrome.windows.getLastFocused({ populate: true }, function (win) {
    if (win && win.tabs) {
      for (var i = 0; i < win.tabs.length; i++) {
        var candidate = win.tabs[i];
        if (candidate.active && isRetailShopTabUrl(candidate.url)) {
          lastRetailTabId = candidate.id;
          callback(candidate);
          return;
        }
      }
    }

    if (lastRetailTabId == null) {
      callback(null);
      return;
    }

    chrome.tabs.get(lastRetailTabId, function (tab) {
      if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
        ShopRadarGuard.consumeLastError();
      } else if (chrome.runtime.lastError) {
        /* consumed */
      }
      if (!tab || !tab.url || !isRetailShopTabUrl(tab.url)) {
        callback(null);
        return;
      }
      callback(tab);
    });
  });
}

function ensureBackgroundJobsInstalled() {
  if (
    typeof ShopRadarBackgroundJobs !== 'undefined' &&
    ShopRadarBackgroundJobs.install
  ) {
    ShopRadarBackgroundJobs.install();
    return true;
  }
  console.warn('[ShopRadar] ShopRadarBackgroundJobs 未定义');
  return false;
}

function swSendResponse(sendResponse, payload) {
  if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendResponse) {
    ShopRadarGuard.safeSendResponse(sendResponse, payload);
    return;
  }
  try {
    sendResponse(payload);
  } catch (sendErr) {
    /* message port closed */
  }
}

if (typeof ShopRadarGuard !== 'undefined') {
  ShopRadarGuard.installServiceWorkerGuards();
}

chrome.runtime.onInstalled.addListener(function (details) {
  setupSidePanel();
  ensureBackgroundJobsInstalled();

  if (
    typeof ShopRadarBackgroundJobs !== 'undefined' &&
    ShopRadarBackgroundJobs.onExtensionUpdated
  ) {
    ShopRadarBackgroundJobs.onExtensionUpdated(details);
  }

  if (
    typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
    SHOPRADAR_EXTENSION_CONFIG.debug
  ) {
    console.log(
      '[ShopRadar] Service Worker 就绪，版本:',
      chrome.runtime.getManifest().version,
      details.reason
    );
  }
});

chrome.runtime.onStartup.addListener(function () {
  setupSidePanel();
  ensureBackgroundJobsInstalled();
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  enableSidePanelForTab(activeInfo.tabId);
  chrome.tabs.get(activeInfo.tabId, function (tab) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
      ShopRadarGuard.consumeLastError();
    } else if (chrome.runtime.lastError) {
      /* consumed */
    }
    rememberRetailTab(activeInfo.tabId, tab && tab.url);
  });
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (!tab || !tab.url) {
    return;
  }
  if (changeInfo.url || changeInfo.status === 'complete') {
    rememberRetailTab(tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener(
  typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.wrapMessageListener
    ? ShopRadarGuard.wrapMessageListener(handleRuntimeMessage)
    : handleRuntimeMessage
);

function handleRuntimeMessage(message, sender, sendResponse) {
  if (message && message.type === 'PING') {
    swSendResponse(sendResponse, {
      status: 'ok',
      ok: true,
      source: 'background',
    });
    return false;
  }

  if (message && message.type === 'SET_SHOP_CONTEXT_TAB') {
    var pinId = message.tabId;
    if (pinId == null) {
      swSendResponse(sendResponse, { status: 'ok', ok: false });
      return false;
    }
    chrome.tabs.get(pinId, function (tab) {
      if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.consumeLastError) {
        ShopRadarGuard.consumeLastError();
      } else if (chrome.runtime.lastError) {
        /* consumed */
      }
      if (!tab || !tab.url || !isRetailShopTabUrl(tab.url)) {
        swSendResponse(sendResponse, { status: 'ok', ok: false });
        return;
      }
      lastRetailTabId = pinId;
      swSendResponse(sendResponse, {
        status: 'ok',
        ok: true,
        tabId: pinId,
        url: tab.url,
      });
    });
    return true;
  }

  if (message && message.type === 'GET_SHOP_CONTEXT_TAB') {
    resolveBestRetailTab(function (tab) {
      if (!tab) {
        swSendResponse(sendResponse, { status: 'ok', tabId: null });
        return;
      }
      swSendResponse(sendResponse, {
        status: 'ok',
        tabId: tab.id,
        url: tab.url,
      });
    });
    return true;
  }

  if (message && message.type === 'REFRESH_SHOP_TAB') {
    if (
      typeof ShopRadarBackgroundJobs === 'undefined' ||
      !ShopRadarBackgroundJobs.handleRefreshMessage
    ) {
      swSendResponse(sendResponse, {
        status: 'ok',
        ok: false,
        error: 'background_jobs_missing',
      });
      return false;
    }
    return ShopRadarBackgroundJobs.handleRefreshMessage(message, sendResponse);
  }

  if (message && message.type === 'PROBE_SHOPIFY_TAB') {
    if (
      typeof ShopRadarBackgroundJobs === 'undefined' ||
      !ShopRadarBackgroundJobs.handleProbeMessage
    ) {
      swSendResponse(sendResponse, {
        status: 'ok',
        isShopify: false,
        error: 'background_jobs_missing',
      });
      return false;
    }
    return ShopRadarBackgroundJobs.handleProbeMessage(message, sendResponse);
  }

  swSendResponse(sendResponse, { status: 'ok' });
  return false;
}
