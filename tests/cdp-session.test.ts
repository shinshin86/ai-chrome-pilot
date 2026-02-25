import { describe, expect, test, vi } from 'vitest';

import type { CdpEventHandler } from '../src/cdp/client.js';
import type { CdpClient } from '../src/cdp/client.js';
import { CdpBrowserSession } from '../src/cdp/session.js';

function createMockClient(): CdpClient & {
  _send: ReturnType<typeof vi.fn>;
  _handlers: Map<string, Set<CdpEventHandler>>;
  _triggerEvent: (method: string, params: Record<string, unknown>) => void;
} {
  const handlers = new Map<string, Set<CdpEventHandler>>();

  const send = vi.fn((_method: string, _params?: Record<string, unknown>) => Promise.resolve({}));

  const client = {
    send,
    _send: send,
    _handlers: handlers,
    close: vi.fn(),
    get isConnected() {
      return true;
    },
    on(method: string, handler: CdpEventHandler) {
      let set = handlers.get(method);
      if (!set) {
        set = new Set();
        handlers.set(method, set);
      }
      set.add(handler);
    },
    off(method: string, handler: CdpEventHandler) {
      const set = handlers.get(method);
      if (set) {
        set.delete(handler);
      }
    },
    _triggerEvent(method: string, params: Record<string, unknown>) {
      const set = handlers.get(method);
      if (set) {
        for (const h of set) h(params);
      }
    }
  };

  return client as unknown as CdpClient & {
    _send: ReturnType<typeof vi.fn>;
    _handlers: Map<string, Set<CdpEventHandler>>;
    _triggerEvent: (method: string, params: Record<string, unknown>) => void;
  };
}

describe('CdpBrowserSession', () => {
  test('fromClient enables domains', async () => {
    const client = createMockClient();
    await CdpBrowserSession.fromClient(client as unknown as CdpClient);

    expect(client._send).toHaveBeenCalledWith('Page.enable');
    expect(client._send).toHaveBeenCalledWith('Runtime.enable');
    expect(client._send).toHaveBeenCalledWith('DOM.enable');
  });

  test('goto navigates and returns url + title', async () => {
    const client = createMockClient();

    client._send.mockImplementation((method: string) => {
      if (method === 'Page.navigate') {
        // Trigger domContentEventFired shortly after navigate
        setTimeout(() => {
          client._triggerEvent('Page.domContentEventFired', {});
        }, 10);
        return Promise.resolve({});
      }
      if (method === 'Runtime.evaluate') {
        // First call = URL, second call = title
        const calls = client._send.mock.calls.filter((c: unknown[]) => c[0] === 'Runtime.evaluate');
        if (calls.length <= 1) {
          return Promise.resolve({ result: { value: 'https://example.com' } });
        }
        return Promise.resolve({ result: { value: 'Example' } });
      }
      return Promise.resolve({});
    });

    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);
    const result = await session.goto('https://example.com');

    expect(result.url).toBe('https://example.com');
    expect(result.title).toBe('Example');
    expect(client._send).toHaveBeenCalledWith('Page.navigate', { url: 'https://example.com' });
  });

  test('evaluate runs expression and returns value', async () => {
    const client = createMockClient();
    client._send.mockImplementation((method: string) => {
      if (method === 'Runtime.evaluate') {
        return Promise.resolve({ result: { value: 42 } });
      }
      return Promise.resolve({});
    });

    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);
    const result = await session.evaluate('1 + 1');

    expect(result).toBe(42);
  });

  test('evaluate throws on exception', async () => {
    const client = createMockClient();
    client._send.mockImplementation((method: string) => {
      if (method === 'Runtime.evaluate') {
        return Promise.resolve({
          exceptionDetails: { text: 'ReferenceError: x is not defined' }
        });
      }
      return Promise.resolve({});
    });

    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);

    await expect(session.evaluate('x')).rejects.toThrow('ReferenceError');
  });

  test('screenshot returns a Buffer from base64', async () => {
    const client = createMockClient();
    const fakeBase64 = Buffer.from('fakepng').toString('base64');
    client._send.mockImplementation((method: string) => {
      if (method === 'Page.captureScreenshot') {
        return Promise.resolve({ data: fakeBase64 });
      }
      return Promise.resolve({});
    });

    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);
    const buf = await session.screenshot();

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('fakepng');
  });

  test('dialog lifecycle: detect, get, handle', async () => {
    const client = createMockClient();
    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);

    // Initially no dialog
    expect(session.getPendingDialog()).toBeUndefined();

    // Simulate dialog event
    client._triggerEvent('Page.javascriptDialogOpening', {
      type: 'alert',
      message: 'Hello!'
    });

    const dialog = session.getPendingDialog();
    expect(dialog).toEqual({
      type: 'alert',
      message: 'Hello!',
      defaultValue: undefined
    });

    // Handle dialog
    await session.handleDialog(true);

    expect(client._send).toHaveBeenCalledWith('Page.handleJavaScriptDialog', { accept: true });
    expect(session.getPendingDialog()).toBeUndefined();
  });

  test('handleDialog throws when no pending dialog', async () => {
    const client = createMockClient();
    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);

    await expect(session.handleDialog(true)).rejects.toThrow('No pending dialog');
  });

  test('close does not close client when created via fromClient', async () => {
    const client = createMockClient();
    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);

    await session.close();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.close).not.toHaveBeenCalled();
  });

  test('close removes dialog listener', async () => {
    const client = createMockClient();
    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);

    // Should have dialog listener
    expect(client._handlers.get('Page.javascriptDialogOpening')?.size).toBe(1);

    await session.close();

    // Listener should be removed
    expect(client._handlers.get('Page.javascriptDialogOpening')?.size ?? 0).toBe(0);
  });

  test('methods throw after close', async () => {
    const client = createMockClient();
    // Override isConnected to return false after close
    let connected = true;
    Object.defineProperty(client, 'isConnected', {
      get() {
        return connected;
      }
    });

    const session = await CdpBrowserSession.fromClient(client as unknown as CdpClient);
    await session.close();
    connected = false;

    await expect(session.goto('https://example.com')).rejects.toThrow('closed');
    await expect(session.evaluate('1')).rejects.toThrow('closed');
    await expect(session.screenshot()).rejects.toThrow('closed');
  });
});
