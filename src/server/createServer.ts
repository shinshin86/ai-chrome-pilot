import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';

import type { CdpClient } from '../cdp/client.js';
import type { BrowserSession } from '../playwright/types.js';
import type { ActionName } from '../snapshot/actions.js';
import { executeAction } from '../snapshot/actions.js';
import type { SnapshotEngine } from '../snapshot/engine.js';
import { isAllowedNavigateUrl } from '../utils/url.js';

interface CreateControlServerOptions {
  /** Base CDP session (always available). */
  readonly session: BrowserSession;
  /** Optional Playwright session for enhanced operations (goto, click, type, dialog, wait). */
  readonly playwrightSession?: BrowserSession | undefined;
  readonly evaluateEnabled: boolean;
  readonly snapshotEngine: SnapshotEngine;
  /** Returns a connected CdpClient for the current page. */
  readonly getCdpClient: () => Promise<CdpClient>;
  /** HTTP endpoint for CDP, e.g. http://127.0.0.1:9222 */
  readonly cdpHttpEndpoint: string;
}

interface HttpErrorLike {
  status?: number;
  message?: string;
}

function asMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Unexpected error';
}

function statusFromError(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const maybeStatus = (error as HttpErrorLike).status;
    if (typeof maybeStatus === 'number' && maybeStatus >= 400 && maybeStatus <= 599) {
      return maybeStatus;
    }
  }

  const message = asMessage(error);
  if (/timeout/iu.test(message)) {
    return 504;
  }

  return 500;
}

function badRequest(message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  return error;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw badRequest(`${field} must be a non-empty string`);
  }
  return value;
}

function bodyOf(req: Request): Record<string, unknown> {
  if (typeof req.body !== 'object' || req.body === null) {
    return {};
  }
  return req.body as Record<string, unknown>;
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export function createControlServer(options: CreateControlServerOptions): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Playwright-preferred session: uses Playwright when available, falls back to CDP
  const preferred = options.playwrightSession ?? options.session;

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    '/goto',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const url = requireString(body.url, 'url');
      if (!isAllowedNavigateUrl(url)) {
        throw badRequest('url must be http(s) or about:blank');
      }

      const result = await preferred.goto(url);
      res.json({ ok: true, url: result.url, title: result.title });
    })
  );

  app.post(
    '/click',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const selector = requireString(body.selector, 'selector');
      await preferred.click(selector);
      res.json({ ok: true });
    })
  );

  app.post(
    '/type',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const selector = requireString(body.selector, 'selector');
      const text = requireString(body.text, 'text');
      await preferred.type(selector, text);
      res.json({ ok: true });
    })
  );

  app.post(
    '/eval',
    asyncHandler(async (req, res) => {
      if (!options.evaluateEnabled) {
        res.status(403).json({ error: '/eval is disabled by EVALUATE_ENABLED=0' });
        return;
      }

      const body = bodyOf(req);
      const js = requireString(body.js, 'js');
      const result = await options.session.evaluate(js);
      res.json({ ok: true, result });
    })
  );

  app.get(
    '/screenshot',
    asyncHandler(async (_req, res) => {
      const png = await options.session.screenshot();
      res.setHeader('Content-Type', 'image/png');
      res.status(200).send(png);
    })
  );

  // ─── Snapshot & Ref-based actions ───

  app.get(
    '/snapshot',
    asyncHandler(async (_req, res) => {
      const cdp = await options.getCdpClient();
      try {
        const result = await options.snapshotEngine.takeSnapshot(cdp);
        res.json({ ok: true, snapshot: result.snapshot, refs: result.refs });
      } finally {
        cdp.close();
      }
    })
  );

  app.post(
    '/act',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const refId = requireString(body.ref, 'ref');
      const action = requireString(body.action, 'action') as ActionName;
      const value = typeof body.value === 'string' ? body.value : undefined;
      const key = typeof body.key === 'string' ? body.key : undefined;
      const values = Array.isArray(body.values) ? (body.values as string[]) : undefined;

      const validActions = [
        'click',
        'type',
        'clear',
        'focus',
        'scroll',
        'hover',
        'drag',
        'select',
        'press'
      ];
      if (!validActions.includes(action)) {
        throw badRequest(`action must be one of: ${validActions.join(', ')}`);
      }

      const refEntry = options.snapshotEngine.getRef(refId);
      if (!refEntry) {
        throw badRequest(`ref "${refId}" not found. Take a /snapshot first.`);
      }

      // Resolve targetRef for drag action
      let targetRef;
      if (action === 'drag') {
        const targetRefId = typeof body.targetRef === 'string' ? body.targetRef : undefined;
        if (!targetRefId) throw badRequest('"targetRef" is required for drag action');
        targetRef = options.snapshotEngine.getRef(targetRefId);
        if (!targetRef) throw badRequest(`targetRef "${targetRefId}" not found.`);
      }

      const cdp = await options.getCdpClient();
      try {
        await executeAction(cdp, { ref: refEntry, action, value, targetRef, values, key });
        res.json({ ok: true });
      } finally {
        cdp.close();
      }
    })
  );

  // ─── Cookie management ───

  app.get(
    '/cookies',
    asyncHandler(async (_req, res) => {
      const cdp = await options.getCdpClient();
      try {
        const result = await cdp.send('Network.getAllCookies');
        res.json({ ok: true, cookies: result.cookies });
      } finally {
        cdp.close();
      }
    })
  );

  app.post(
    '/cookies',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const cookies = body.cookies;
      if (!Array.isArray(cookies)) {
        throw badRequest('cookies must be an array');
      }

      const cdp = await options.getCdpClient();
      try {
        for (const cookie of cookies) {
          await cdp.send('Network.setCookie', cookie as Record<string, unknown>);
        }
        res.json({ ok: true });
      } finally {
        cdp.close();
      }
    })
  );

  app.delete(
    '/cookies',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const name = typeof body.name === 'string' ? body.name : undefined;
      const domain = typeof body.domain === 'string' ? body.domain : undefined;

      const cdp = await options.getCdpClient();
      try {
        if (name) {
          await cdp.send('Network.deleteCookies', {
            name,
            ...(domain ? { domain } : {})
          });
        } else {
          // Clear all cookies
          await cdp.send('Network.clearBrowserCookies');
        }
        res.json({ ok: true });
      } finally {
        cdp.close();
      }
    })
  );

  // ─── Tab management ───

  app.get(
    '/tabs',
    asyncHandler(async (_req, res) => {
      const listUrl = `${options.cdpHttpEndpoint}/json/list`;
      const response = await fetch(listUrl);
      const targets = (await response.json()) as Array<{
        id: string;
        type: string;
        title: string;
        url: string;
      }>;
      const tabs = targets
        .filter((t) => t.type === 'page')
        .map((t) => ({ targetId: t.id, title: t.title, url: t.url }));
      res.json({ ok: true, tabs });
    })
  );

  app.post(
    '/tabs/open',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const url = typeof body.url === 'string' ? body.url : 'about:blank';
      const putUrl = `${options.cdpHttpEndpoint}/json/new?${encodeURIComponent(url)}`;
      const response = await fetch(putUrl, { method: 'PUT' });
      const target = (await response.json()) as { id: string; title: string; url: string };
      res.json({ ok: true, targetId: target.id, title: target.title, url: target.url });
    })
  );

  app.post(
    '/tabs/focus',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const targetId = requireString(body.targetId, 'targetId');
      const activateUrl = `${options.cdpHttpEndpoint}/json/activate/${targetId}`;
      await fetch(activateUrl);
      res.json({ ok: true });
    })
  );

  app.delete(
    '/tabs/:targetId',
    asyncHandler(async (req, res) => {
      const targetId = req.params.targetId;
      if (!targetId) throw badRequest('targetId is required');
      const closeUrl = `${options.cdpHttpEndpoint}/json/close/${targetId}`;
      await fetch(closeUrl);
      res.json({ ok: true });
    })
  );

  // ─── Dialog handling ───

  app.get('/dialog', (_req, res) => {
    const dialog = preferred.getPendingDialog();
    if (dialog) {
      res.json({ ok: true, pending: true, ...dialog });
    } else {
      res.json({ ok: true, pending: false });
    }
  });

  app.post(
    '/dialog',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const accept = body.accept !== false;
      const promptText = typeof body.promptText === 'string' ? body.promptText : undefined;
      await preferred.handleDialog(accept, promptText);
      res.json({ ok: true });
    })
  );

  // ─── Wait ───

  app.post(
    '/wait',
    asyncHandler(async (req, res) => {
      const body = bodyOf(req);
      const text = typeof body.text === 'string' ? body.text : undefined;
      const selector = typeof body.selector === 'string' ? body.selector : undefined;
      const timeout = typeof body.timeout === 'number' ? body.timeout : undefined;

      if (!text && !selector) {
        throw badRequest('Either "text" or "selector" must be provided');
      }

      await preferred.waitFor({ text, selector, timeout });
      res.json({ ok: true });
    })
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = statusFromError(error);
    res.status(status).json({ error: asMessage(error) });
  });

  return app;
}
