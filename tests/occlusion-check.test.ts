import { describe, expect, test, vi } from 'vitest';

import type { CdpClient } from '../src/cdp/client.js';
import { checkOcclusion } from '../src/cdp/dom-helpers.js';

function createMockClient(callFunctionResult: string): CdpClient {
  const send = vi.fn((method: string, _params?: Record<string, unknown>) => {
    if (method === 'DOM.resolveNode') {
      return Promise.resolve({ object: { objectId: 'obj-1' } });
    }
    if (method === 'Runtime.callFunctionOn') {
      return Promise.resolve({ result: { value: callFunctionResult } });
    }
    return Promise.resolve({});
  });

  return {
    send,
    close: vi.fn(),
    get isConnected() {
      return true;
    },
    on: vi.fn(),
    off: vi.fn()
  } as unknown as CdpClient;
}

describe('checkOcclusion', () => {
  test('does not throw when element is not occluded (ok)', async () => {
    const client = createMockClient('ok');
    await expect(checkOcclusion(client, 42, 100, 200)).resolves.toBeUndefined();
  });

  test('does not throw when elementFromPoint returns no hit', async () => {
    const client = createMockClient('no-hit');
    await expect(checkOcclusion(client, 42, 100, 200)).resolves.toBeUndefined();
  });

  test('throws when element is occluded by another element', async () => {
    const client = createMockClient('occluded:DIV.overlay');
    await expect(checkOcclusion(client, 42, 100, 200)).rejects.toThrow(
      'Element is obscured by another element (DIV.overlay)'
    );
  });

  test('throws with coordinate info in error message', async () => {
    const client = createMockClient('occluded:DIV.modal');
    await expect(checkOcclusion(client, 42, 150.7, 250.3)).rejects.toThrow(
      'at coordinates (151, 250)'
    );
  });

  test('error message suggests overlay or popup', async () => {
    const client = createMockClient('occluded:DIV.popup');
    await expect(checkOcclusion(client, 42, 100, 200)).rejects.toThrow(
      'An overlay or popup may be covering the target'
    );
  });

  test('resolves the node before checking', async () => {
    const client = createMockClient('ok');
    await checkOcclusion(client, 42, 100, 200);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.send).toHaveBeenCalledWith('DOM.resolveNode', { backendNodeId: 42 });
  });

  test('passes coordinates to callFunctionOn as arguments', async () => {
    const client = createMockClient('ok');
    await checkOcclusion(client, 42, 100, 200);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.send).toHaveBeenCalledWith(
      'Runtime.callFunctionOn',
      expect.objectContaining({
        objectId: 'obj-1',
        arguments: [{ value: 100 }, { value: 200 }],
        returnByValue: true
      })
    );
  });
});
