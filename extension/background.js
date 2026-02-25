/** @type {WebSocket | null} */
let ws = null;

/** @type {{ tabId: number; debuggeeId: { tabId: number } } | null} */
let attachedTarget = null;

/**
 * Connect to the relay server.
 * @param {string} serverUrl - e.g. "ws://127.0.0.1:3333/relay?token=abc"
 */
function connectToServer(serverUrl) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  ws = new WebSocket(serverUrl);

  ws.addEventListener('open', () => {
    console.log('[relay] Connected to server');
    broadcastStatus();
  });

  ws.addEventListener('message', async (event) => {
    try {
      const msg = JSON.parse(event.data);

      // CDP command from server: { id, method, params? }
      if (msg.id !== undefined && msg.method) {
        await handleCdpCommand(msg);
      }
    } catch (err) {
      console.error('[relay] Error handling message:', err);
    }
  });

  ws.addEventListener('close', () => {
    console.log('[relay] Disconnected from server');
    ws = null;
    broadcastStatus();
  });

  ws.addEventListener('error', (err) => {
    console.error('[relay] WebSocket error:', err);
  });
}

/**
 * Handle a CDP command from the server by forwarding it to chrome.debugger.
 * @param {{ id: number; method: string; params?: object }} msg
 */
async function handleCdpCommand(msg) {
  if (!attachedTarget) {
    sendToServer({
      id: msg.id,
      error: { code: -1, message: 'No tab attached' }
    });
    return;
  }

  try {
    const result = await chrome.debugger.sendCommand(
      attachedTarget.debuggeeId,
      msg.method,
      msg.params || {}
    );
    sendToServer({ id: msg.id, result: result || {} });
  } catch (err) {
    sendToServer({
      id: msg.id,
      error: { code: -1, message: err.message || String(err) }
    });
  }
}

/**
 * Send a message to the relay server.
 * @param {object} msg
 */
function sendToServer(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Attach chrome.debugger to a tab.
 * @param {number} tabId
 */
async function attachToTab(tabId) {
  // Detach from previous tab if any
  if (attachedTarget) {
    try {
      await chrome.debugger.detach(attachedTarget.debuggeeId);
    } catch {
      // ignore
    }
  }

  const debuggeeId = { tabId };
  await chrome.debugger.attach(debuggeeId, '1.3');

  attachedTarget = { tabId, debuggeeId };

  // Enable Page events so the server receives navigation events etc.
  await chrome.debugger.sendCommand(debuggeeId, 'Page.enable');
  await chrome.debugger.sendCommand(debuggeeId, 'Runtime.enable');

  broadcastStatus();
}

/**
 * Detach from the current tab.
 */
async function detachFromTab() {
  if (attachedTarget) {
    try {
      await chrome.debugger.detach(attachedTarget.debuggeeId);
    } catch {
      // ignore
    }
    attachedTarget = null;
    broadcastStatus();
  }
}

// Forward chrome.debugger events to the server
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (attachedTarget && source.tabId === attachedTarget.tabId) {
    sendToServer({ method, params: params || {} });
  }
});

// Handle debugger detach (e.g. user closed the debugger bar)
chrome.debugger.onDetach.addListener((source) => {
  if (attachedTarget && source.tabId === attachedTarget.tabId) {
    attachedTarget = null;
    broadcastStatus();
  }
});

/**
 * Broadcast current status to popup.
 */
function broadcastStatus() {
  const status = {
    connected: ws !== null && ws.readyState === WebSocket.OPEN,
    attachedTabId: attachedTarget?.tabId ?? null
  };
  chrome.runtime.sendMessage({ type: 'status', ...status }).catch(() => {
    // popup not open, ignore
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'connect') {
    const { serverUrl, token } = msg;
    const url = token ? `${serverUrl}?token=${encodeURIComponent(token)}` : serverUrl;

    // Save settings
    chrome.storage.local.set({ serverUrl, token });

    connectToServer(url);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'disconnect') {
    if (ws) {
      ws.close();
      ws = null;
    }
    broadcastStatus();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'attach') {
    attachToTab(msg.tabId).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }

  if (msg.type === 'detach') {
    detachFromTab().then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }

  if (msg.type === 'getStatus') {
    sendResponse({
      connected: ws !== null && ws.readyState === WebSocket.OPEN,
      attachedTabId: attachedTarget?.tabId ?? null
    });
    return true;
  }

  return false;
});
