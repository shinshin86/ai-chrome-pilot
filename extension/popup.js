const serverUrlInput = document.getElementById('serverUrl');
const tokenInput = document.getElementById('token');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusBadge = document.getElementById('statusBadge');
const tabListEl = document.getElementById('tabList');
const errorEl = document.getElementById('error');

let currentAttachedTabId = null;

// Load saved settings
chrome.storage.local.get(['serverUrl', 'token'], (data) => {
  if (data.serverUrl) serverUrlInput.value = data.serverUrl;
  if (data.token) tokenInput.value = data.token;
});

// Get initial status
chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
  if (response) {
    updateUI(response.connected, response.attachedTabId);
  }
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status') {
    updateUI(msg.connected, msg.attachedTabId);
  }
});

connectBtn.addEventListener('click', () => {
  const serverUrl = serverUrlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!serverUrl) {
    showError('Server URL is required');
    return;
  }

  hideError();
  chrome.runtime.sendMessage({ type: 'connect', serverUrl, token }, () => {
    // Status will be updated via broadcast
  });
});

disconnectBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'disconnect' });
});

function updateUI(connected, attachedTabId) {
  currentAttachedTabId = attachedTabId;

  if (connected) {
    statusBadge.textContent = 'Connected';
    statusBadge.className = 'status connected';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'inline-block';
    loadTabs();
  } else {
    statusBadge.textContent = 'Disconnected';
    statusBadge.className = 'status disconnected';
    connectBtn.style.display = 'inline-block';
    disconnectBtn.style.display = 'none';
    tabListEl.innerHTML = '<div style="color:#999;font-size:12px">Connect to server first</div>';
  }
}

async function loadTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    tabListEl.innerHTML = '';

    for (const tab of tabs) {
      // Skip chrome:// and extension pages
      if (
        tab.url &&
        (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))
      ) {
        continue;
      }

      const item = document.createElement('div');
      item.className = 'tab-item' + (tab.id === currentAttachedTabId ? ' attached' : '');

      const icon = document.createElement('img');
      icon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      icon.onerror = () => {
        icon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      };

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || tab.url || 'Untitled';
      title.title = tab.url || '';

      item.appendChild(icon);
      item.appendChild(title);

      if (tab.id === currentAttachedTabId) {
        const detachBtn = document.createElement('button');
        detachBtn.className = 'btn-danger';
        detachBtn.textContent = 'Detach';
        detachBtn.style.fontSize = '11px';
        detachBtn.style.padding = '2px 8px';
        detachBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: 'detach' });
        });
        item.appendChild(detachBtn);
      } else {
        const attachBtn = document.createElement('button');
        attachBtn.className = 'btn-secondary';
        attachBtn.textContent = 'Attach';
        attachBtn.style.fontSize = '11px';
        attachBtn.style.padding = '2px 8px';
        attachBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: 'attach', tabId: tab.id }, (response) => {
            if (response && !response.ok) {
              showError(response.error || 'Failed to attach');
            }
          });
        });
        item.appendChild(attachBtn);
      }

      tabListEl.appendChild(item);
    }

    if (tabListEl.children.length === 0) {
      tabListEl.innerHTML = '<div style="color:#999;font-size:12px">No attachable tabs</div>';
    }
  } catch (err) {
    tabListEl.innerHTML = `<div style="color:#c5221f;font-size:12px">Error loading tabs: ${err.message}</div>`;
  }
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
}

function hideError() {
  errorEl.style.display = 'none';
}
