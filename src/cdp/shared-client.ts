import type { CdpClient } from './client.js';

/**
 * Create a non-closing proxy for the given CdpClient.
 * All methods delegate to the underlying client except close(),
 * which is a no-op.
 *
 * Used in CDP-only mode where a single persistent connection is shared
 * across routes that call `cdp.close()` in their finally blocks.
 */
export function createSharedProxy(client: CdpClient): CdpClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'close') {
        return () => {
          // no-op: shared connection must not be closed by individual routes
        };
      }
      return Reflect.get(target, prop, receiver) as unknown;
    }
  });
}
