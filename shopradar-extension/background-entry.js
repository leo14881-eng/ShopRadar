/**
 * ShopRadar — Service Worker（静态入口，勿用 importScripts）
 * manifest.service_worker 必须指向本文件。
 */
'use strict';

var SIDE_PANEL_PATH = 'popup.html';

function setupSidePanel() {
  if (!chrome.sidePanel) {
    console.log('[ShopRadar] [Log] 需要 Chrome 114+ 且支持 sidePanel API');
    return;
  }
  if (chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(function (err) {
        console.warn('Silent catch:', err && err.message ? err.message : err);
      });
  }
  if (chrome.sidePanel.setOptions) {
    chrome.sidePanel
      .setOptions({
        path: SIDE_PANEL_PATH,
        enabled: true,
      })
      .catch(function (err) {
        console.warn('Silent catch:', err && err.message ? err.message : err);
      });
  }
}

function enableSidePanelForTab(tabId) {
  if (!chrome.sidePanel || !chrome.sidePanel.setOptions || tabId == null) {
    return;
  }
  chrome.sidePanel
    .setOptions({
      tabId: tabId,
      path: SIDE_PANEL_PATH,
      enabled: true,
    })
    .catch(function () {});
}

function entrySendResponse(sendResponse, payload) {
  if (typeof sendResponse !== 'function') {
    return;
  }
  try {
    sendResponse(payload != null ? payload : { status: 'ok' });
  } catch (sendErr) {
    try {
      if (chrome.runtime.lastError) {
        console.log(
          'Ignored extension runtime error:',
          chrome.runtime.lastError.message
        );
      }
    } catch (readErr) {
      console.warn(
        'Silent catch:',
        readErr && readErr.message ? readErr.message : readErr
      );
    }
  }
}

self.addEventListener('error', function (event) {
  var msg =
    event && event.error && event.error.message
      ? event.error.message
      : event && event.message
        ? event.message
        : 'unknown';
  console.log('[ShopRadar] [Log] SW error event:', msg);
});

chrome.runtime.onInstalled.addListener(function (details) {
  setupSidePanel();
  console.log(
    '[ShopRadar] SW 入口 background-entry.js 已启动，版本',
    chrome.runtime.getManifest().version,
    details.reason
  );
});

chrome.runtime.onStartup.addListener(function () {
  setupSidePanel();
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  enableSidePanelForTab(activeInfo.tabId);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'PING') {
    entrySendResponse(sendResponse, {
      status: 'ok',
      ok: true,
      source: 'background-entry',
      version: chrome.runtime.getManifest().version,
    });
    return false;
  }
  if (message && message.type === 'REFRESH_SHOP_TAB') {
    entrySendResponse(sendResponse, {
      status: 'ok',
      ok: false,
      error: 'use_background_full',
      hint: '后台静默刷新需加载 background.js，见 npm run build:sw',
    });
    return false;
  }
  entrySendResponse(sendResponse, { status: 'ok' });
  return false;
});
