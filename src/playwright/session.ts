import type { Browser, BrowserContext, Dialog, Page } from 'playwright-core';
import { chromium } from 'playwright-core';

import type { BrowserSession, DialogInfo } from './types.js';

async function getOrCreatePage(browser: Browser): Promise<Page> {
  let context: BrowserContext | undefined = browser.contexts()[0];
  if (!context) {
    context = await browser.newContext();
  }

  let page: Page | undefined = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(15_000);
  return page;
}

export class PlaywrightCdpSession implements BrowserSession {
  private readonly browser: Browser;
  private readonly page: Page;
  private closed = false;
  private pendingDialog: Dialog | undefined;

  private constructor(browser: Browser, page: Page) {
    this.browser = browser;
    this.page = page;
    this.browser.on('disconnected', () => {
      this.closed = true;
    });

    // Capture dialogs so they can be handled via the API
    this.page.on('dialog', (dialog: Dialog) => {
      this.pendingDialog = dialog;
    });
  }

  static async connect(cdpEndpoint: string): Promise<PlaywrightCdpSession> {
    const browser = await chromium.connectOverCDP(cdpEndpoint);
    const page = await getOrCreatePage(browser);
    return new PlaywrightCdpSession(browser, page);
  }

  private ensureOpen(): void {
    if (this.closed || !this.browser.isConnected()) {
      throw new Error('Browser connection is closed');
    }
  }

  async goto(url: string): Promise<{ url: string; title: string }> {
    this.ensureOpen();
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded'
    });
    return {
      url: this.page.url(),
      title: await this.page.title()
    };
  }

  async click(selector: string): Promise<void> {
    this.ensureOpen();
    await this.page.click(selector);
  }

  async type(selector: string, text: string): Promise<void> {
    this.ensureOpen();
    await this.page.fill(selector, text);
  }

  async evaluate(js: string): Promise<unknown> {
    this.ensureOpen();
    return await this.page.evaluate<unknown, string>((script) => {
      return (0, eval)(script) as unknown;
    }, js);
  }

  async screenshot(): Promise<Buffer> {
    this.ensureOpen();
    const result = await this.page.screenshot({
      type: 'png',
      fullPage: true
    });

    if (!Buffer.isBuffer(result)) {
      return Buffer.from(result);
    }
    return result;
  }

  async waitFor(options: { text?: string; selector?: string; timeout?: number }): Promise<void> {
    this.ensureOpen();
    const timeout = options.timeout ?? 10_000;

    if (options.text) {
      const text = options.text;
      await this.page.waitForFunction((t: string) => document.body?.innerText?.includes(t), text, {
        timeout
      });
    } else if (options.selector) {
      await this.page.waitForSelector(options.selector, { timeout });
    } else {
      throw new Error('Either "text" or "selector" must be provided');
    }
  }

  getPendingDialog(): DialogInfo | undefined {
    if (!this.pendingDialog) return undefined;
    return {
      type: this.pendingDialog.type(),
      message: this.pendingDialog.message(),
      defaultValue: this.pendingDialog.defaultValue() || undefined
    };
  }

  async handleDialog(accept: boolean, promptText?: string): Promise<void> {
    this.ensureOpen();
    if (!this.pendingDialog) {
      throw new Error('No pending dialog to handle');
    }
    const dialog = this.pendingDialog;
    this.pendingDialog = undefined;

    if (accept) {
      await dialog.accept(promptText);
    } else {
      await dialog.dismiss();
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    try {
      await this.browser.close();
    } catch {
      // ignore close error
    }
  }
}
