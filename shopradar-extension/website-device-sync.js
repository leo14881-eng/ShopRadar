/**
 * 官网 ↔ 扩展 Device ID / Pro 状态同步
 * - 向 API 核实 isPro，避免仅本地缓存不一致
 * - 若仅官网 ID 已付费，写入扩展 storage（修复「网页已 Pro、插件未开通」）
 */
(function () {
  'use strict';

  var Auth = ShopRadarExtensionAuth;
  var KEYS = Auth.KEYS;
  var STORAGE_DEVICE = KEYS.DEVICE_ID;
  var STORAGE_PRO = KEYS.IS_PRO;
  var STORAGE_TOKEN = KEYS.ACCESS_TOKEN;
  var STORAGE_TOKEN_EXP = KEYS.TOKEN_EXPIRES;

  function getApiBase() {
    return Auth.getApiBase();
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

  function isPayloadDefinite(payload) {
    return Boolean(payload && typeof payload.isPro === 'boolean');
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
            if (!data || typeof data.isPro !== 'boolean') {
              return null;
            }
            return data;
          });
      })
      .catch(function () {
        return null;
      });
  }

  function tokenExpiresAt(payload) {
    return Auth.tokenExpiresAt(payload);
  }

  function publishToWebsite(deviceId, payload, meta) {
    if (!deviceId) {
      return;
    }
    var info = meta || {};
    try {
      localStorage.setItem(STORAGE_DEVICE, deviceId);
      if (isPayloadDefinite(payload)) {
        if (payload.isPro) {
          localStorage.setItem(STORAGE_PRO, '1');
        } else {
          localStorage.removeItem(STORAGE_PRO);
        }
      }
      if (payload && payload.isPro && payload.accessToken) {
        sessionStorage.setItem(STORAGE_TOKEN, String(payload.accessToken));
        var exp = tokenExpiresAt(payload);
        if (exp) {
          sessionStorage.setItem(STORAGE_TOKEN_EXP, String(exp));
        }
      } else if (isPayloadDefinite(payload) && !payload.isPro) {
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
            payloadDefinite: isPayloadDefinite(payload),
            extDeviceId: info.extDeviceId || '',
            webDeviceId: info.webDeviceId || '',
            idMerged: Boolean(info.idMerged),
            extensionAvailable: true,
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
    chrome.storage.session.get([KEYS.PAYMENT_PENDING], function (sess) {
      if (chrome.runtime.lastError) {
        callback(false);
        return;
      }
      var pendingAt = Number(
        sess && sess[KEYS.PAYMENT_PENDING] ? sess[KEYS.PAYMENT_PENDING] : 0
      );
      callback(pendingAt > 0 && Date.now() - pendingAt < 5 * 60 * 1000);
    });
  }

  function publishToExtension(deviceId, payload) {
    if (!deviceId || !chrome.storage || !chrome.storage.local) {
      return;
    }
    var nextPro = Boolean(payload && payload.isPro);
    var payloadKnown = isPayloadDefinite(payload);

    chrome.storage.local.get([STORAGE_DEVICE, STORAGE_PRO], function (current) {
      if (chrome.runtime.lastError) {
        return;
      }
      var curId =
        current && current[STORAGE_DEVICE]
          ? String(current[STORAGE_DEVICE]).trim()
          : '';
      var curPro = Boolean(current && current[STORAGE_PRO]);

      if (curId && curId !== deviceId && !nextPro) {
        return;
      }
      if (!curId && !nextPro && payloadKnown) {
        return;
      }

      isPaymentPending(function (paymentPending) {
        var patch = {};
        if (!curId || curId === deviceId || nextPro) {
          patch[STORAGE_DEVICE] = deviceId;
        }
        if (nextPro) {
          patch[STORAGE_PRO] = true;
        } else if (payloadKnown && !paymentPending) {
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
            Auth.saveAccessTokenFromPayload(payload).then(function () {
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
    var extKnown = isPayloadDefinite(extPayload);
    var webKnown = isPayloadDefinite(webPayload);
    var extPro = extKnown && extPayload.isPro;
    var webPro = webKnown && webPayload.isPro;
    var idMerged = Boolean(extId && webId && extId !== webId);

    if (extId && webId && extId === webId) {
      return {
        id: extId,
        payload: extPro || webPro ? extPayload || webPayload : extPayload || webPayload,
        idMerged: false,
      };
    }
    if (webPro && webId) {
      return { id: webId, payload: webPayload, idMerged: idMerged };
    }
    if (extPro && extId) {
      return { id: extId, payload: extPayload, idMerged: idMerged };
    }
    if (extKnown && extId) {
      return { id: extId, payload: extPayload, idMerged: idMerged };
    }
    if (webKnown && webId) {
      return { id: webId, payload: webPayload, idMerged: idMerged };
    }
    if (extId) {
      return { id: extId, payload: extPayload, idMerged: idMerged };
    }
    if (webId) {
      return { id: webId, payload: webPayload, idMerged: idMerged };
    }
    return { id: '', payload: null, idMerged: false };
  }

  function reconcile(extId, webId) {
    var queryId = readQueryDeviceId();
    if (queryId) {
      fetchProPayload(queryId).then(function (payload) {
        publishToWebsite(queryId, payload, {
          extDeviceId: extId,
          webDeviceId: webId || queryId,
          idMerged: Boolean(extId && extId !== queryId),
        });
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
        publishToWebsite(picked.id, picked.payload, {
          extDeviceId: extId,
          webDeviceId: webId,
          idMerged: picked.idMerged,
        });
        if (extId && picked.id !== extId && !Boolean(picked.payload && picked.payload.isPro)) {
          return;
        }
        publishToExtension(picked.id, picked.payload);
      }
    );
  }

  function runReconcileFromStorage() {
    chrome.storage.local.get([STORAGE_DEVICE], function (result) {
      if (chrome.runtime.lastError) {
        return;
      }
      var extId =
        result && result[STORAGE_DEVICE] ? String(result[STORAGE_DEVICE]).trim() : '';
      reconcile(extId, readWebDeviceId());
    });
  }

  if (!chrome.storage || !chrome.storage.local) {
    return;
  }

  runReconcileFromStorage();

  try {
    window.addEventListener('message', function (event) {
      if (event.source !== window) {
        return;
      }
      var data = event.data;
      if (!data || data.type !== 'SR_REQUEST_DEVICE_SYNC') {
        return;
      }
      runReconcileFromStorage();
    });
  } catch (msgBridgeErr) {
    /* ignore */
  }

  try {
    var onDeviceSyncRequest = function (message, sender, sendResponse) {
      if (!message || message.type !== 'SR_REQUEST_DEVICE_SYNC') {
        return { status: 'ok' };
      }
      runReconcileFromStorage();
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
