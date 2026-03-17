import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { CdpClient } from '../src/cdp/client.js';
import type { BrowserSession } from '../src/playwright/types.js';
import { createControlServer } from '../src/server/createServer.js';
import { SnapshotEngine } from '../src/snapshot/engine.js';

interface SessionMocks {
  readonly goto: ReturnType<typeof vi.fn>;
  readonly click: ReturnType<typeof vi.fn>;
  readonly type: ReturnType<typeof vi.fn>;
  readonly evaluate: ReturnType<typeof vi.fn>;
  readonly screenshot: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
}

function createSessionMock(): { session: BrowserSession; mocks: SessionMocks } {
  const goto = vi.fn((url: string) => Promise.resolve({ url, title: 'Test Title' }));
  const click = vi.fn(() => Promise.resolve());
  const type = vi.fn(() => Promise.resolve());
  const evaluate = vi.fn(() => Promise.resolve({ hello: 'world' }));
  const screenshot = vi.fn(() => Promise.resolve(Buffer.from('89504e470d0a1a0a', 'hex')));
  const close = vi.fn(() => Promise.resolve());
  const waitFor = vi.fn(() => Promise.resolve());
  const getPendingDialog = vi.fn(() => undefined);
  const handleDialog = vi.fn(() => Promise.resolve());

  return {
    session: {
      goto,
      click,
      type,
      evaluate,
      screenshot,
      close,
      waitFor,
      getPendingDialog,
      handleDialog
    },
    mocks: { goto, click, type, evaluate, screenshot, close }
  };
}

function createMockCdpClient(): CdpClient {
  return {
    send: vi.fn(() => Promise.resolve({})),
    close: vi.fn(() => Promise.resolve()),
    isConnected: true
  } as unknown as CdpClient;
}

function createServerOptions(overrides?: { evaluateEnabled?: boolean }) {
  const { session, mocks } = createSessionMock();
  const snapshotEngine = new SnapshotEngine();
  const mockCdp = createMockCdpClient();

  const app = createControlServer({
    session,
    evaluateEnabled: overrides?.evaluateEnabled ?? true,
    snapshotEngine,
    getCdpClient: () => Promise.resolve(mockCdp),
    cdpHttpEndpoint: 'http://127.0.0.1:19999'
  });

  return { app, session, mocks, snapshotEngine, mockCdp };
}

async function requestLocal(
  app: ReturnType<typeof createControlServer>
): Promise<{ agent: ReturnType<typeof request>; close: () => Promise<void> }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  const agent = request(`http://127.0.0.1:${address.port}`);
  return {
    agent,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

describe('control server routes', () => {
  let mocks: SessionMocks;
  let app: ReturnType<typeof createControlServer>;

  beforeEach(() => {
    const opts = createServerOptions();
    mocks = opts.mocks;
    app = opts.app;
  });

  test('GET /health returns ok', async () => {
    const local = await requestLocal(app);
    const res = await local.agent.get('/health');
    await local.close();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST /goto validates and returns shape', async () => {
    const local = await requestLocal(app);

    const bad = await local.agent.post('/goto').send({ url: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'url must be http(s) or about:blank' });

    const ok = await local.agent.post('/goto').send({ url: 'https://example.com' });
    await local.close();

    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, url: 'https://example.com', title: 'Test Title' });
    expect(mocks.goto).toHaveBeenCalledWith('https://example.com');
  });

  test('POST /eval returns 403 when disabled', async () => {
    const opts = createServerOptions({ evaluateEnabled: false });
    const local = await requestLocal(opts.app);

    const res = await local.agent.post('/eval').send({ js: '1+1' });
    await local.close();

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: '/eval is disabled by EVALUATE_ENABLED=0' });
    expect(opts.mocks.evaluate).not.toHaveBeenCalled();
  });

  test('POST /eval executes when enabled', async () => {
    const local = await requestLocal(app);

    const res = await local.agent.post('/eval').send({ js: '1+1' });
    await local.close();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, result: { hello: 'world' } });
    expect(mocks.evaluate).toHaveBeenCalledWith('1+1');
  });

  test('GET /screenshot returns png', async () => {
    const local = await requestLocal(app);

    const res = await local.agent.get('/screenshot');
    await local.close();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(mocks.screenshot).toHaveBeenCalledTimes(1);
  });

  test('POST /act returns 400 for missing ref', async () => {
    const local = await requestLocal(app);

    const res = await local.agent.post('/act').send({ ref: 'e999', action: 'click' });
    await local.close();

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('ref "e999" not found');
  });

  test('POST /act returns 400 for invalid action', async () => {
    const local = await requestLocal(app);

    const res = await local.agent.post('/act').send({ ref: 'e1', action: 'destroy' });
    await local.close();

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('action must be one of');
  });

  test('POST /file-input returns 400 when files is missing', async () => {
    const local = await requestLocal(app);

    const res = await local.agent.post('/file-input').send({});
    await local.close();

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('"files" must be a non-empty array');
  });

  test('POST /file-input returns 400 when files is empty array', async () => {
    const local = await requestLocal(app);

    const res = await local.agent.post('/file-input').send({ files: [] });
    await local.close();

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('"files" must be a non-empty array');
  });

  test('POST /file-input returns 400 when files contains non-string', async () => {
    const local = await requestLocal(app);

    const res = await local.agent.post('/file-input').send({ files: [123] });
    await local.close();

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('must be a string path');
  });

  test('POST /file-input calls CDP DOM commands', async () => {
    const opts = createServerOptions();
    const mockCdp = opts.mockCdp;
    const sendMock = mockCdp.send as ReturnType<typeof vi.fn>;

    // Mock DOM.getDocument to return a root node
    sendMock.mockImplementation((method: string) => {
      if (method === 'DOM.getDocument') {
        return Promise.resolve({ root: { nodeId: 1 } });
      }
      if (method === 'DOM.querySelector') {
        return Promise.resolve({ nodeId: 42 });
      }
      if (method === 'DOM.setFileInputFiles') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const local = await requestLocal(opts.app);
    const res = await local.agent
      .post('/file-input')
      .send({ files: ['/tmp/test.png'] });
    await local.close();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith('DOM.getDocument', { depth: 0 });
    expect(sendMock).toHaveBeenCalledWith('DOM.querySelector', {
      nodeId: 1,
      selector: 'input[type=file]'
    });
    expect(sendMock).toHaveBeenCalledWith('DOM.setFileInputFiles', {
      files: ['/tmp/test.png'],
      nodeId: 42
    });
  });

  test('POST /file-input returns 400 when element not found', async () => {
    const opts = createServerOptions();
    const sendMock = opts.mockCdp.send as ReturnType<typeof vi.fn>;

    sendMock.mockImplementation((method: string) => {
      if (method === 'DOM.getDocument') {
        return Promise.resolve({ root: { nodeId: 1 } });
      }
      if (method === 'DOM.querySelector') {
        return Promise.resolve({ nodeId: 0 });
      }
      return Promise.resolve({});
    });

    const local = await requestLocal(opts.app);
    const res = await local.agent
      .post('/file-input')
      .send({ files: ['/tmp/test.png'], selector: '#nonexistent' });
    await local.close();

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('No element found');
  });
});
