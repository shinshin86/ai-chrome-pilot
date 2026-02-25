import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

import type { CdpClient } from '../src/cdp/client.js';
import type { BrowserSession } from '../src/playwright/types.js';
import { createControlServer } from '../src/server/createServer.js';
import { SnapshotEngine } from '../src/snapshot/engine.js';

function createSessionMock(label: string) {
  return {
    goto: vi.fn((url: string) => Promise.resolve({ url, title: `${label} Title` })),
    click: vi.fn(() => Promise.resolve()),
    type: vi.fn(() => Promise.resolve()),
    evaluate: vi.fn(() => Promise.resolve(`${label} result`)),
    screenshot: vi.fn(() => Promise.resolve(Buffer.from('png', 'utf-8'))),
    close: vi.fn(() => Promise.resolve()),
    waitFor: vi.fn(() => Promise.resolve()),
    getPendingDialog: vi.fn(() => undefined),
    handleDialog: vi.fn(() => Promise.resolve())
  } satisfies BrowserSession;
}

function createMockCdpClient(): CdpClient {
  return {
    send: vi.fn(() => Promise.resolve({})),
    close: vi.fn(() => Promise.resolve()),
    isConnected: true
  } as unknown as CdpClient;
}

async function requestLocal(app: ReturnType<typeof createControlServer>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  const agent = request(`http://127.0.0.1:${address.port}`);
  return {
    agent,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}

describe('hybrid routing (playwrightSession provided)', () => {
  function createHybridServer() {
    const cdpSession = createSessionMock('cdp');
    const pwSession = createSessionMock('pw');
    const mockCdp = createMockCdpClient();

    const app = createControlServer({
      session: cdpSession,
      playwrightSession: pwSession,
      evaluateEnabled: true,
      snapshotEngine: new SnapshotEngine(),
      getCdpClient: () => Promise.resolve(mockCdp),
      cdpHttpEndpoint: 'http://127.0.0.1:19999'
    });

    return { app, cdpSession, pwSession };
  }

  test('POST /goto uses playwrightSession when available', async () => {
    const { app, cdpSession, pwSession } = createHybridServer();
    const local = await requestLocal(app);

    const res = await local.agent.post('/goto').send({ url: 'https://example.com' });
    await local.close();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, url: 'https://example.com', title: 'pw Title' });
    expect(pwSession.goto).toHaveBeenCalledWith('https://example.com');
    expect(cdpSession.goto).not.toHaveBeenCalled();
  });

  test('POST /click uses playwrightSession when available', async () => {
    const { app, cdpSession, pwSession } = createHybridServer();
    const local = await requestLocal(app);

    await local.agent.post('/click').send({ selector: '#btn' });
    await local.close();

    expect(pwSession.click).toHaveBeenCalledWith('#btn');
    expect(cdpSession.click).not.toHaveBeenCalled();
  });

  test('POST /type uses playwrightSession when available', async () => {
    const { app, cdpSession, pwSession } = createHybridServer();
    const local = await requestLocal(app);

    await local.agent.post('/type').send({ selector: '#input', text: 'hello' });
    await local.close();

    expect(pwSession.type).toHaveBeenCalledWith('#input', 'hello');
    expect(cdpSession.type).not.toHaveBeenCalled();
  });

  test('POST /eval always uses CDP session', async () => {
    const { app, cdpSession, pwSession } = createHybridServer();
    const local = await requestLocal(app);

    await local.agent.post('/eval').send({ js: '1+1' });
    await local.close();

    expect(cdpSession.evaluate).toHaveBeenCalledWith('1+1');
    expect(pwSession.evaluate).not.toHaveBeenCalled();
  });

  test('GET /screenshot always uses CDP session', async () => {
    const { app, cdpSession, pwSession } = createHybridServer();
    const local = await requestLocal(app);

    await local.agent.get('/screenshot');
    await local.close();

    expect(cdpSession.screenshot).toHaveBeenCalledTimes(1);
    expect(pwSession.screenshot).not.toHaveBeenCalled();
  });

  test('POST /wait uses playwrightSession when available', async () => {
    const { app, cdpSession, pwSession } = createHybridServer();
    const local = await requestLocal(app);

    await local.agent.post('/wait').send({ text: 'hello' });
    await local.close();

    expect(pwSession.waitFor).toHaveBeenCalled();
    expect(cdpSession.waitFor).not.toHaveBeenCalled();
  });

  test('GET /dialog uses playwrightSession when available', async () => {
    const { app, cdpSession, pwSession } = createHybridServer();
    const local = await requestLocal(app);

    await local.agent.get('/dialog');
    await local.close();

    expect(pwSession.getPendingDialog).toHaveBeenCalled();
    expect(cdpSession.getPendingDialog).not.toHaveBeenCalled();
  });
});

describe('CDP-only fallback (no playwrightSession)', () => {
  function createCdpOnlyServer() {
    const cdpSession = createSessionMock('cdp');
    const mockCdp = createMockCdpClient();

    const app = createControlServer({
      session: cdpSession,
      // playwrightSession not provided
      evaluateEnabled: true,
      snapshotEngine: new SnapshotEngine(),
      getCdpClient: () => Promise.resolve(mockCdp),
      cdpHttpEndpoint: 'http://127.0.0.1:19999'
    });

    return { app, cdpSession };
  }

  test('POST /goto falls back to CDP session', async () => {
    const { app, cdpSession } = createCdpOnlyServer();
    const local = await requestLocal(app);

    const res = await local.agent.post('/goto').send({ url: 'https://example.com' });
    await local.close();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, url: 'https://example.com', title: 'cdp Title' });
    expect(cdpSession.goto).toHaveBeenCalledWith('https://example.com');
  });

  test('POST /click falls back to CDP session', async () => {
    const { app, cdpSession } = createCdpOnlyServer();
    const local = await requestLocal(app);

    await local.agent.post('/click').send({ selector: '#btn' });
    await local.close();

    expect(cdpSession.click).toHaveBeenCalledWith('#btn');
  });

  test('POST /wait falls back to CDP session', async () => {
    const { app, cdpSession } = createCdpOnlyServer();
    const local = await requestLocal(app);

    await local.agent.post('/wait').send({ selector: '.done' });
    await local.close();

    expect(cdpSession.waitFor).toHaveBeenCalled();
  });
});
