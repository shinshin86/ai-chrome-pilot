import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CdpClient } from '../src/cdp/client.js';

describe('CdpClient.connectToPage', () => {
  const originalFetch = globalThis.fetch;
  let connectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    // Spy on CdpClient.connect to capture the endpoint and prevent actual WebSocket
    connectSpy = vi.spyOn(CdpClient, 'connect').mockResolvedValue({} as CdpClient);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    connectSpy.mockRestore();
  });

  test('prefers non-about:blank page when multiple pages exist', async () => {
    const targets = [
      {
        id: 'target-1',
        type: 'page',
        url: 'about:blank',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-1'
      },
      {
        id: 'target-2',
        type: 'page',
        url: 'https://x.com/home',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-2'
      }
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(targets)
    } as Response);

    await CdpClient.connectToPage('http://127.0.0.1:9222');

    expect(connectSpy).toHaveBeenCalledWith(
      'ws://127.0.0.1:9222/devtools/page/target-2'
    );
  });

  test('falls back to about:blank when it is the only page', async () => {
    const targets = [
      {
        id: 'target-1',
        type: 'page',
        url: 'about:blank',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-1'
      }
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(targets)
    } as Response);

    await CdpClient.connectToPage('http://127.0.0.1:9222');

    expect(connectSpy).toHaveBeenCalledWith(
      'ws://127.0.0.1:9222/devtools/page/target-1'
    );
  });

  test('uses specified targetId when provided', async () => {
    const targets = [
      {
        id: 'target-1',
        type: 'page',
        url: 'https://x.com/home',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-1'
      },
      {
        id: 'target-2',
        type: 'page',
        url: 'about:blank',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-2'
      }
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(targets)
    } as Response);

    // Explicitly request target-2 (about:blank) — should respect the explicit targetId
    await CdpClient.connectToPage('http://127.0.0.1:9222', 'target-2');

    expect(connectSpy).toHaveBeenCalledWith(
      'ws://127.0.0.1:9222/devtools/page/target-2'
    );
  });

  test('throws when no page targets exist', async () => {
    const targets = [
      {
        id: 'target-1',
        type: 'background_page',
        url: 'chrome-extension://abc/background.html'
      }
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(targets)
    } as Response);

    await expect(CdpClient.connectToPage('http://127.0.0.1:9222')).rejects.toThrow(
      'No suitable CDP target found'
    );
  });

  test('prefers about:blank over chrome:// internal pages', async () => {
    const targets = [
      {
        id: 'omnibox',
        type: 'page',
        url: 'chrome://omnibox-popup.top-chrome/',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/omnibox'
      },
      {
        id: 'blank',
        type: 'page',
        url: 'about:blank',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/blank'
      }
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(targets)
    } as Response);

    await CdpClient.connectToPage('http://127.0.0.1:9222');

    // Should connect to about:blank, not chrome:// internal page
    expect(connectSpy).toHaveBeenCalledWith(
      'ws://127.0.0.1:9222/devtools/page/blank'
    );
  });

  test('prefers https page over chrome:// and about:blank', async () => {
    const targets = [
      {
        id: 'omnibox',
        type: 'page',
        url: 'chrome://omnibox-popup.top-chrome/',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/omnibox'
      },
      {
        id: 'blank',
        type: 'page',
        url: 'about:blank',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/blank'
      },
      {
        id: 'real',
        type: 'page',
        url: 'https://x.com/notifications',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/real'
      }
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(targets)
    } as Response);

    await CdpClient.connectToPage('http://127.0.0.1:9222');

    expect(connectSpy).toHaveBeenCalledWith(
      'ws://127.0.0.1:9222/devtools/page/real'
    );
  });

  test('skips non-page targets when selecting', async () => {
    const targets = [
      {
        id: 'bg',
        type: 'background_page',
        url: 'chrome-extension://abc/bg.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/bg'
      },
      {
        id: 'blank',
        type: 'page',
        url: 'about:blank',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/blank'
      },
      {
        id: 'real',
        type: 'page',
        url: 'https://example.com',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/real'
      }
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(targets)
    } as Response);

    await CdpClient.connectToPage('http://127.0.0.1:9222');

    // Should connect to the real page, not the background_page or about:blank
    expect(connectSpy).toHaveBeenCalledWith(
      'ws://127.0.0.1:9222/devtools/page/real'
    );
  });
});
