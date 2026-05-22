/**
 * 官网 ↔ 扩展 Device ID / Pro 状态同步
 * - 向 API 核实 isPro，避免仅本地缓存不一致
 * - 若仅官网 ID 已付费，写入扩展 storage（修复「网页已 Pro、插件未开通」）
 */
(function () {
  'use strict';

  var STORAGE_DEVICE = 'sr_device_id';
  var STORAGE_PRO = 'sr_is_pro';
  var STORAGE_TOKEN = 'sr_access_token';
  var STORAGE_TOKEN_EXP = 'sr_token_expires_at';

  function getApiBase() {
    if (typeof ShopRadarEnv !== 'undefined' && ShopRadarEnv.getApiBase) {
      return ShopRadarEnv.getApiBase();
    }
    if (
      typeof SHOPRADAR_EXTENSION_CONFIG !== 'undefined' &&
      SHOPRADAR_EXTENSION_CONFIG.apiBase
    ) {
      return String(SHOPRADAR_EXTENSION_CONFIG.apiBase).replace(/\/$/, '');
    }
    return 'https://api.shopradar.uk';
  }

  function readQueryDeviceId() {
    try {
      var params = new URLSearchParams(window.location.search);
      var q = params.get('deviceId') || params.get('device_id');
      return q ? String(q).trim() : '';
    } catch (queryErr) {
      return '';
    }
  }

  function readWebDeviceId() {
    var fromQuery = readQueryDeviceId();
    if (fromQuery) {
      return fromQuery;
    }
    try {
      return localStorage.getItem(STORAGE_DEVICE) || '';
    } catch (storageErr) {
      return '';
    }
  }

  function fetchProPayload(deviceId) {
    if (!deviceId) {
      return Promise.resolve(null);
    }
    return fetch(
      getApiBase() + '/api/pro-status?deviceId=' + encodeURIComponent(deviceId),
      { credentials: 'omit' }
    )
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            return data;
          });
      })
      .catch(function () {
        return null;
      });
  }

  function tokenExpiresAt(payload) {
    if (!payload) {
      return 0;
    }
    if (payload.tokenExpiresAt != null) {
      return Number(payload.tokenExpiresAt) || 0;
    }
    if (payload.tokenExpiresIn != null) {
      return Date.now() + Number(payload.tokenExpiresIn) * 1000;
    }
    return 0;
  }

  function publishToWebsite(deviceId, payload) {
    if (!deviceId) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_DEVICE, deviceId);
      if (payload && payload.isPro) {
        localStorage.setItem(STORAGE_PRO, '1');
      } else {
        localStorage.removeItem(STORAGE_PRO);
      }
      if (payload && payload.isPro && payload.accessToken) {
        sessionStorage.setItem(STORAGE_TOKEN, String(payload.accessToken));
        var exp = tokenExpiresAt(payload);
        if (exp) {
          sessionStorage.setItem(STORAGE_TOKEN_EXP, String(exp));
        }
      } else {
        try {
          sessionStorage.removeItem(STORAGE_TOKEN);
          sessionStorage.removeItem(STORAGE_TOKEN_EXP);
        } catch (tokenErr) {
          /* ignore */
        }
      }
    } catch (webErr) {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('shopradar:device-synced', {
          detail: {
            deviceId: deviceId,
            isPro: Boolean(payload && payload.isPro),
            proExpiresAt:
              payload && payload.proExpiresAt ? String(payload.proExpiresAt) : '',
            payload: payload || null,
          },
        })
      );
    } catch (eventErr) {
      /* ignore */
    }
  }

  function isPaymentPending(callback) {
    if (!chrome.storage || !chrome.storage.session) {
      callback(false);
      return;
    }
    chrome.storage.session.get(['sr_payment_pending_at'], function (sess) {
      if (chrome.runtime.lastError) {
        callback(false);
        return;
      }
      var pendingAt = Number(sess && sess.sr_payment_pending_at ? sess.sr_payment_pending_at : 0);
      callback(pendingAt > 0 && Date.now() - pendingAt < 5 * 60 * 1000);
    });
  }

  function publishToExtension(deviceId, payload) {
    if (!deviceId || !chrome.storage || !chrome.storage.local) {
      return;
    }
    var nextPro = Boolean(payload && payload.isPro);

    chrome.storage.local.get([STORAGE_DEVICE, STORAGE_PRO], function (current) {
      if (chrome.runtime.lastError) {
        return;
      }
      var curId =
        current && current[STORAGE_DEVICE]
          ? String(current[STORAGE_DEVICE]).trim()
          : '';
      var curPro = Boolean(current && current[STORAGE_PRO]);

      // 勿用官网/URL 上的非 Pro ID 覆盖扩展里已有 ID（避免付款 Device ID 被冲掉）
      if (curId && curId !== deviceId && !nextPro) {
        return;
      }
      // 勿将未付费的官网随机 ID 写入扩展（content script 与 popup 竞态时）
      if (!curId && !nextPro) {
        return;
      }

      isPaymentPending(function (paymentPending) {
        var patch = {};
        if (!curId || curId === deviceId || nextPro) {
          patch[STORAGE_DEVICE] = deviceId;
        }
        if (nextPro) {
          patch[STORAGE_PRO] = true;
        } else if (!paymentPending) {
          patch[STORAGE_PRO] = false;
        }

        var deviceChanged = Boolean(patch[STORAGE_DEVICE] && patch[STORAGE_DEVICE] !== curId);
        var proChanged =
          patch[STORAGE_PRO] === true ||
          (patch[STORAGE_PRO] === false && curPro);
        var changed = deviceChanged || proChanged;

        if (!Object.keys(patch).length) {
          return;
        }

        chrome.storage.local.set(patch, function () {
          if (chrome.runtime.lastError || !changed) {
            return;
          }
          if (payload && payload.isPro && payload.accessToken && chrome.storage.session) {
            var sessionPatch = {};
            sessionPatch[STORAGE_TOKEN] = String(payload.accessToken);
            var exp = tokenExpiresAt(payload);
            if (exp) {
              sessionPatch[STORAGE_TOKEN_EXP] = exp;
            }
            chrome.storage.session.set(sessionPatch, function () {
              notifyExtension(deviceId, payload);
            });
          } else {
            notifyExtension(deviceId, payload);
          }
        });
      });
    });
  }

  function notifyExtension(deviceId, payload) {
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendMessageNoWait) {
      ShopRadarGuard.safeSendMessageNoWait({
        type: 'SR_DEVICE_SYNCED',
        deviceId: deviceId,
        isPro: Boolean(payload && payload.isPro),
      });
      return;
    }
    if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendMessage) {
      ShopRadarGuard.safeSendMessage({
        type: 'SR_DEVICE_SYNCED',
        deviceId: deviceId,
        isPro: Boolean(payload && payload.isPro),
      });
      return;
    }
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: 'SR_DEVICE_SYNCED',
          deviceId: deviceId,
          isPro: Boolean(payload && payload.isPro),
        },
        function () {
          try {
            if (chrome.runtime.lastError) {
              console.log(
                'Ignored extension runtime error:',
                chrome.runtime.lastError.message
              );
            }
          } catch (readErr) {
            /* ignore */
          }
        }
      );
    } catch (msgErr) {
      /* popup may be closed */
    }
  }

  function pickCanonicalId(extId, webId, extPayload, webPayload) {
    var extPro = Boolean(extPayload && extPayload.isPro);
    var webPro = Boolean(webPayload && webPayload.isPro);

    if (extId && webId && extId === webId) {
      return { id: extId, payload: extPro || webPro ? extPayload || webPayload : extPayload };
    }
    if (webPro && !extPro && webId) {
      return { id: webId, payload: webPayload };
    }
    if (extPro && extId) {
      return { id: extId, payload: extPayload };
    }
    if (extId) {
      return { id: extId, payload: extPayload };
    }
    if (webId) {
      return { id: webId, payload: webPayload };
    }
    return { id: '', payload: null };
  }

  function reconcile(extId, webId) {
    var queryId = readQueryDeviceId();
    if (queryId) {
      fetchProPayload(queryId).then(function (payload) {
        publishToWebsite(queryId, payload);
        publishToExtension(queryId, payload);
      });
      return;
    }

    if (!extId && !webId) {
      return;
    }

    Promise.all([fetchProPayload(extId), fetchProPayload(webId)]).then(
      function (results) {
        var picked = pickCanonicalId(extId, webId, results[0], results[1]);
        if (!picked.id) {
          return;
        }
        publishToWebsite(picked.id, picked.payload);
        // 扩展已有 ID 且未确认 Pro 时，不把官网随机 ID 推回扩展
        if (extId && picked.id !== extId && !Boolean(picked.payload && picked.payload.isPro)) {
          return;
        }
        publishToExtension(picked.id, picked.payload);
      }
    );
  }

  if (!chrome.storage || !chrome.storage.local) {
    return;
  }

  chrome.storage.local.get([STORAGE_DEVICE], function (result) {
    if (chrome.runtime.lastError) {
      return;
    }
    var extId =
      result && result[STORAGE_DEVICE] ? String(result[STORAGE_DEVICE]).trim() : '';
    var webId = readWebDeviceId();
    reconcile(extId, webId);
  });

  try {
    window.addEventListener('message', function (event) {
      if (event.source !== window) {
        return;
      }
      var data = event.data;
      if (!data || data.type !== 'SR_REQUEST_DEVICE_SYNC') {
        return;
      }
      chrome.storage.local.get([STORAGE_DEVICE], function (result) {
        if (chrome.runtime.lastError) {
          return;
        }
        var extId =
          result && result[STORAGE_DEVICE]
            ? String(result[STORAGE_DEVICE]).trim()
            : '';
        reconcile(extId, readWebDeviceId());
      });
    });
  } catch (msgBridgeErr) {
    /* ignore */
  }

  try {
    var onDeviceSyncRequest = function (message, sender, sendResponse) {
      if (!message || message.type !== 'SR_REQUEST_DEVICE_SYNC') {
        return { status: 'ok' };
      }
      chrome.storage.local.get([STORAGE_DEVICE], function (result) {
        if (chrome.runtime.lastError) {
          if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendResponse) {
            ShopRadarGuard.safeSendResponse(sendResponse, { status: 'ok', ok: false });
          } else {
            try {
              sendResponse({ status: 'ok', ok: false });
            } catch (sendErr) {
              try {
                if (chrome.runtime.lastError) {
                  console.log(
                    'Ignored extension runtime error:',
                    chrome.runtime.lastError.message
                  );
                }
              } catch (readErr) {
                /* port closed */
              }
            }
          }
          return;
        }
        var extId =
          result && result[STORAGE_DEVICE]
            ? String(result[STORAGE_DEVICE]).trim()
            : '';
        var webId = readWebDeviceId();
        reconcile(extId, webId);
        if (typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.safeSendResponse) {
          ShopRadarGuard.safeSendResponse(sendResponse, { status: 'ok', ok: true });
        } else {
          try {
            sendResponse({ status: 'ok', ok: true });
          } catch (sendErr) {
            try {
              if (chrome.runtime.lastError) {
                console.log(
                  'Ignored extension runtime error:',
                  chrome.runtime.lastError.message
                );
              }
            } catch (readErr) {
              /* port closed */
            }
          }
        }
      });
      return true;
    };

    chrome.runtime.onMessage.addListener(
      typeof ShopRadarGuard !== 'undefined' && ShopRadarGuard.wrapMessageListener
        ? ShopRadarGuard.wrapMessageListener(onDeviceSyncRequest)
        : onDeviceSyncRequest
    );
  } catch (listenerErr) {
    /* ignore */
  }
})();
