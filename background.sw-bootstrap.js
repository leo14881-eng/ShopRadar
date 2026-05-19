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
      .catch(function (err) {
        console.error('[ShopRadar] setPanelBehavior 失败:', err);
      });
  }
  if (chrome.sidePanel.setOptions) {
    chrome.sidePanel
      .setOptions({
        path: SIDE_PANEL_PATH,
        enabled: true,
      })
      .catch(function (err) {
        console.error('[ShopRadar] setOptions 失败:', err);
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

function ensureBackgroundJobsInstalled() {
  if (
    typeof ShopRadarBackgroundJobs !== 'undefined' &&
    ShopRadarBackgroundJobs.install
  ) {
    ShopRadarBackgroundJobs.install();
    return true;
  }
  console.error('[ShopRadar] ShopRadarBackgroundJobs 未定义');
  return false;
}

self.addEventListener('error', function (event) {
  console.error('[ShopRadar] Service Worker 错误:', event.error || event.message);
});

self.addEventListener('unhandledrejection', function (event) {
  console.error('[ShopRadar] Service Worker 未捕获 Promise:', event.reason);
});

chrome.runtime.onInstalled.addListener(function (details) {
  setupSidePanel();
  ensureBackgroundJobsInstalled();

  if (
    typeof ShopRadarBackgroundJobs !== 'undefined' &&
    ShopRadarBackgroundJobs.onExtensionUpdated
  ) {
    ShopRadarBackgroundJobs.onExtensionUpdated(details);
  }

  console.log(
    '[ShopRadar] Service Worker 就绪，版本:',
    chrome.runtime.getManifest().version,
    details.reason
  );
});

chrome.runtime.onStartup.addListener(function () {
  setupSidePanel();
  ensureBackgroundJobsInstalled();
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  enableSidePanelForTab(activeInfo.tabId);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'PING') {
    sendResponse({ ok: true, source: 'background' });
    return false;
  }

  if (message && message.type === 'REFRESH_SHOP_TAB') {
    if (
      typeof ShopRadarBackgroundJobs === 'undefined' ||
      !ShopRadarBackgroundJobs.handleRefreshMessage
    ) {
      sendResponse({ ok: false, error: 'background_jobs_missing' });
      return false;
    }
    return ShopRadarBackgroundJobs.handleRefreshMessage(message, sendResponse);
  }

  return false;
});
