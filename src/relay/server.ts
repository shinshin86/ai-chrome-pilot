import type { Server as HttpServer } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';

import type { CdpEventHandler } from '../cdp/client.js';
import type { CdpClient } from '../cdp/client.js';

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
}

/**
 * Relay server that bridges Chrome extension ↔ REST API via WebSocket.
 *
 * The extension connects to `/relay?token=<auth>`, and relays CDP commands
 * to a real Chrome tab via `chrome.debugger`.
 *
 * Protocol (JSON over WebSocket):
 *  - Server → Extension: `{ id, method, params? }`   (CDP command)
 *  - Extension → Server: `{ id, result?, error? }`   (CDP response)
 *  - Extension → Server: `{ method, params }`         (CDP event, no id)
 */
export class RelayServer {
  private wss: WebSocketServer | undefined;
  private extensionWs: WebSocket | undefined;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private eventListeners = new Map<string, Set<CdpEventHandler>>();

  constructor(private readonly authToken: string) {}

  /**
   * Attach the relay WebSocket endpoint to an existing HTTP server.
   */
  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({ server: httpServer, path: '/relay' });

    this.wss.on('connection', (ws, req) => {
      // Authenticate via query parameter
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const token = url.searchParams.get('token');
      if (this.authToken && token !== this.authToken) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      // Only allow one extension connection at a time
      if (this.extensionWs && this.extensionWs.readyState === WebSocket.OPEN) {
        ws.close(4002, 'Another extension is already connected');
        return;
      }

      console.log('[relay] Extension connected');
      this.extensionWs = ws;

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as {
            id?: number;
            method?: string;
            params?: Record<string, unknown>;
            result?: Record<string, unknown>;
            error?: { code: number; message: string };
          };

          // CDP event from extension (no id, has method)
          if (msg.id === undefined && msg.method) {
            const handlers = this.eventListeners.get(msg.method);
            if (handlers) {
              for (const handler of handlers) {
                handler(msg.params ?? {});
              }
            }
            return;
          }

          // CDP response from extension (has id)
          if (msg.id !== undefined) {
            const pending = this.pending.get(msg.id);
            if (pending) {
              this.pending.delete(msg.id);
              if (msg.error) {
                pending.reject(new Error(`CDP error: ${msg.error.message} (${msg.error.code})`));
              } else {
                pending.resolve(msg.result ?? {});
              }
            }
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        console.log('[relay] Extension disconnected');
        if (this.extensionWs === ws) {
          this.extensionWs = undefined;
          // Reject all pending requests
          for (const [, p] of this.pending) {
            p.reject(new Error('Extension disconnected'));
          }
          this.pending.clear();
        }
      });
    });
  }

  /**
   * Return a CdpClient-compatible object that routes commands through the relay.
   */
  asCdpClient(): CdpClient {
    const send = (
      method: string,
      params?: Record<string, unknown>
    ): Promise<Record<string, unknown>> => {
      if (!this.extensionWs || this.extensionWs.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('No extension connected'));
      }

      const id = this.nextId++;
      const msg = { id, method, ...(params ? { params } : {}) };

      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.extensionWs!.send(JSON.stringify(msg), (err) => {
          if (err) {
            this.pending.delete(id);
            reject(err);
          }
        });
      });
    };

    const on = (method: string, handler: CdpEventHandler): void => {
      let handlers = this.eventListeners.get(method);
      if (!handlers) {
        handlers = new Set();
        this.eventListeners.set(method, handlers);
      }
      handlers.add(handler);
    };

    const off = (method: string, handler: CdpEventHandler): void => {
      const handlers = this.eventListeners.get(method);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventListeners.delete(method);
        }
      }
    };

    const close = (): void => {
      // no-op for relay client
    };

    const client = {
      send,
      on,
      off,
      close,
      get isConnected(): boolean {
        return false; // Overridden below
      }
    };

    Object.defineProperty(client, 'isConnected', {
      get: () => this.extensionWs?.readyState === WebSocket.OPEN
    });

    return client as unknown as CdpClient;
  }
}
