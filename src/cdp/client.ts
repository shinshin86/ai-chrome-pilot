import { WebSocket } from 'ws';

interface CdpCommand {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface CdpResponse {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
}

export type CdpEventHandler = (params: Record<string, unknown>) => void;

export interface CdpTargetInfo {
  id: string;
  type: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
}

function isWebPageTarget(target: CdpTargetInfo): boolean {
  return typeof target.url === 'string' && /^https?:\/\//.test(target.url);
}

function choosePageTarget(targets: CdpTargetInfo[], targetId?: string): CdpTargetInfo | undefined {
  if (targetId) {
    return targets.find((target) => target.id === targetId);
  }

  const pages = targets.filter((target) => target.type === 'page');
  return (
    pages.find((target) => isWebPageTarget(target)) ??
    pages.find((target) => target.url === 'about:blank') ??
    pages[0]
  );
}

/**
 * Minimal CDP WebSocket client for direct protocol communication.
 * Used for Accessibility, DOM, Input, and Network domain commands
 * that don't require Playwright.
 */
export class CdpClient {
  private ws: WebSocket | undefined;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private closed = false;
  private eventListeners = new Map<string, Set<CdpEventHandler>>();

  private constructor(private readonly endpoint: string) {}

  static async connect(endpoint: string): Promise<CdpClient> {
    const client = new CdpClient(endpoint);
    await client.open();
    return client;
  }

  /**
   * Connect to the browser-level CDP endpoint via /json/version.
   * Used for browser-wide commands like Browser.close().
   */
  static async connectToBrowser(cdpHttpEndpoint: string): Promise<CdpClient> {
    const versionUrl = `${cdpHttpEndpoint}/json/version`;
    const res = await fetch(versionUrl);
    const info = (await res.json()) as { webSocketDebuggerUrl?: string };

    if (!info.webSocketDebuggerUrl) {
      throw new Error(`No browser WebSocket URL found at ${cdpHttpEndpoint}`);
    }

    return CdpClient.connect(info.webSocketDebuggerUrl);
  }

  static async listTargets(cdpHttpEndpoint: string): Promise<CdpTargetInfo[]> {
    const listUrl = `${cdpHttpEndpoint}/json/list`;
    const res = await fetch(listUrl);
    return (await res.json()) as CdpTargetInfo[];
  }

  static async resolvePageTarget(
    cdpHttpEndpoint: string,
    targetId?: string
  ): Promise<CdpTargetInfo> {
    const targets = await CdpClient.listTargets(cdpHttpEndpoint);
    const target = choosePageTarget(targets, targetId);

    if (!target?.webSocketDebuggerUrl) {
      throw new Error(`No suitable CDP target found at ${cdpHttpEndpoint}`);
    }

    return target;
  }

  /**
   * Connect to a specific page/target by fetching /json/list
   * and connecting to the first page target's webSocketDebuggerUrl.
   */
  static async connectToPage(cdpHttpEndpoint: string, targetId?: string): Promise<CdpClient> {
    const target = await CdpClient.resolvePageTarget(cdpHttpEndpoint, targetId);
    const endpoint = target.webSocketDebuggerUrl;
    if (!endpoint) {
      throw new Error(`No suitable CDP target found at ${cdpHttpEndpoint}`);
    }
    return CdpClient.connect(endpoint);
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.endpoint);

      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => {
        if (this.pending.size === 0 && !this.closed) {
          reject(err);
        }
      });

      this.ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString()) as CdpResponse;

        // CDP event (no id, has method)
        if (msg.id === undefined && msg.method) {
          const handlers = this.eventListeners.get(msg.method);
          if (handlers) {
            for (const handler of handlers) {
              handler(msg.params ?? {});
            }
          }
          return;
        }

        // CDP response (has id)
        if (msg.id === undefined) return;
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);

        if (msg.error) {
          pending.reject(new Error(`CDP error: ${msg.error.message} (${msg.error.code})`));
        } else {
          pending.resolve(msg.result ?? {});
        }
      });

      this.ws.on('close', () => {
        this.closed = true;
        for (const [, p] of this.pending) {
          p.reject(new Error('CDP WebSocket closed'));
        }
        this.pending.clear();
      });
    });
  }

  async send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.closed || !this.ws) {
      throw new Error('CDP client is not connected');
    }

    const id = this.nextId++;
    const cmd: CdpCommand = { id, method, ...(params ? { params } : {}) };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(cmd), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  on(method: string, handler: CdpEventHandler): void {
    let handlers = this.eventListeners.get(method);
    if (!handlers) {
      handlers = new Set();
      this.eventListeners.set(method, handlers);
    }
    handlers.add(handler);
  }

  off(method: string, handler: CdpEventHandler): void {
    const handlers = this.eventListeners.get(method);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventListeners.delete(method);
      }
    }
  }

  async closeBrowser(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.send('Browser.close', {});
    } catch {
      // Browser may already be closing; ignore errors
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ws?.close();
    for (const [, p] of this.pending) {
      p.reject(new Error('CDP client closed'));
    }
    this.pending.clear();
    this.eventListeners.clear();
  }

  get isConnected(): boolean {
    return !this.closed && this.ws?.readyState === WebSocket.OPEN;
  }
}
