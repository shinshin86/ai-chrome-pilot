import type { BrowserSession, DialogInfo } from '../playwright/types.js';
import type { CdpEventHandler } from './client.js';
import { CdpClient } from './client.js';
import { checkOcclusion, getElementCenter, resolveNode, scrollIntoView } from './dom-helpers.js';

/**
 * CDP-only BrowserSession implementation.
 * Uses raw CDP commands without requiring Playwright.
 */
export class CdpBrowserSession implements BrowserSession {
  private closed = false;
  private pendingDialog: DialogInfo | undefined;
  private dialogHandler: CdpEventHandler | undefined;
  private readonly ownsClient: boolean;

  private constructor(
    private readonly client: CdpClient,
    ownsClient: boolean
  ) {
    this.ownsClient = ownsClient;
    this.setupDialogListener();
  }

  /**
   * Connect directly to a CDP HTTP endpoint (e.g. http://127.0.0.1:9222).
   * The session owns the client and will close it on session.close().
   */
  static async connect(cdpHttpEndpoint: string): Promise<CdpBrowserSession> {
    const client = await CdpClient.connectToPage(cdpHttpEndpoint);
    const session = new CdpBrowserSession(client, true);
    await session.enableDomains();
    return session;
  }

  /**
   * Create a session from an existing CdpClient (e.g. from relay mode).
   * The session does NOT own the client and will not close it.
   */
  static async fromClient(client: CdpClient): Promise<CdpBrowserSession> {
    const session = new CdpBrowserSession(client, false);
    await session.enableDomains();
    return session;
  }

  private async enableDomains(): Promise<void> {
    await this.client.send('Page.enable');
    await this.client.send('Runtime.enable');
    await this.client.send('DOM.enable');
  }

  private setupDialogListener(): void {
    this.dialogHandler = (params) => {
      this.pendingDialog = {
        type: params.type as string,
        message: params.message as string,
        defaultValue: (params.defaultPrompt as string) || undefined
      };
    };
    this.client.on('Page.javascriptDialogOpening', this.dialogHandler);
  }

  private ensureOpen(): void {
    if (this.closed || !this.client.isConnected) {
      throw new Error('Browser connection is closed');
    }
  }

  async goto(url: string): Promise<{ url: string; title: string }> {
    this.ensureOpen();

    // Navigate and wait for DOMContentLoaded
    const loadPromise = new Promise<void>((resolve) => {
      const handler: CdpEventHandler = () => {
        this.client.off('Page.domContentEventFired', handler);
        resolve();
      };
      this.client.on('Page.domContentEventFired', handler);
    });

    const result = await this.client.send('Page.navigate', { url });
    if (result.errorText) {
      throw new Error(`Navigation failed: ${result.errorText as string}`);
    }

    // Wait for domContentEventFired with a timeout
    await Promise.race([
      loadPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Navigation timeout')), 15_000)
      )
    ]);

    // Get current URL and title
    const evalUrl = await this.client.send('Runtime.evaluate', {
      expression: 'document.location.href',
      returnByValue: true
    });
    const evalTitle = await this.client.send('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    });

    return {
      url: ((evalUrl.result as Record<string, unknown>)?.value as string) ?? url,
      title: ((evalTitle.result as Record<string, unknown>)?.value as string) ?? ''
    };
  }

  async click(selector: string): Promise<void> {
    this.ensureOpen();

    const doc = await this.client.send('DOM.getDocument', { depth: 0 });
    const nodeResult = await this.client.send('DOM.querySelector', {
      nodeId: (doc.root as Record<string, unknown>).nodeId as number,
      selector
    });
    const nodeId = nodeResult.nodeId as number;
    if (!nodeId) {
      throw new Error(`No element found for selector: ${selector}`);
    }

    // Get backendNodeId from nodeId
    const desc = await this.client.send('DOM.describeNode', { nodeId });
    const node = desc.node as Record<string, unknown>;
    const backendNodeId = node.backendNodeId as number;

    const objectId = await resolveNode(this.client, backendNodeId);
    await scrollIntoView(this.client, objectId);
    await new Promise((r) => setTimeout(r, 50));

    const { x, y } = await getElementCenter(this.client, backendNodeId);
    await checkOcclusion(this.client, backendNodeId, x, y);
    await this.client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
    await this.client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
  }

  async type(selector: string, text: string): Promise<void> {
    this.ensureOpen();

    const doc = await this.client.send('DOM.getDocument', { depth: 0 });
    const nodeResult = await this.client.send('DOM.querySelector', {
      nodeId: (doc.root as Record<string, unknown>).nodeId as number,
      selector
    });
    const nodeId = nodeResult.nodeId as number;
    if (!nodeId) {
      throw new Error(`No element found for selector: ${selector}`);
    }

    const desc = await this.client.send('DOM.describeNode', { nodeId });
    const node = desc.node as Record<string, unknown>;
    const backendNodeId = node.backendNodeId as number;

    const objectId = await resolveNode(this.client, backendNodeId);
    await scrollIntoView(this.client, objectId);

    // Focus the element
    await this.client.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function() { this.focus(); }`,
      awaitPromise: false
    });

    // Clear existing content
    await this.client.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function() {
        if ('value' in this) { this.value = ''; }
        else if (this.isContentEditable) { this.textContent = ''; }
      }`,
      awaitPromise: false
    });

    // Insert text
    await this.client.send('Input.insertText', { text });
  }

  async evaluate(js: string): Promise<unknown> {
    this.ensureOpen();

    const result = await this.client.send('Runtime.evaluate', {
      expression: js,
      returnByValue: true,
      awaitPromise: true
    });

    const exceptionDetails = result.exceptionDetails as Record<string, unknown> | undefined;
    if (exceptionDetails) {
      const text =
        (exceptionDetails.text as string) ??
        ((exceptionDetails.exception as Record<string, unknown>)?.description as string) ??
        'Evaluation failed';
      throw new Error(text);
    }

    return (result.result as Record<string, unknown>)?.value;
  }

  async screenshot(): Promise<Buffer> {
    this.ensureOpen();

    const result = await this.client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    return Buffer.from(result.data as string, 'base64');
  }

  async waitFor(options: { text?: string; selector?: string; timeout?: number }): Promise<void> {
    this.ensureOpen();

    const timeout = options.timeout ?? 10_000;
    const interval = 200;
    const deadline = Date.now() + timeout;

    if (options.text) {
      const text = options.text;
      while (Date.now() < deadline) {
        const result = await this.client.send('Runtime.evaluate', {
          expression: `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`,
          returnByValue: true
        });
        if ((result.result as Record<string, unknown>)?.value === true) return;
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new Error(`Timeout waiting for text: "${text}"`);
    } else if (options.selector) {
      const selector = options.selector;
      while (Date.now() < deadline) {
        const result = await this.client.send('Runtime.evaluate', {
          expression: `!!document.querySelector(${JSON.stringify(selector)})`,
          returnByValue: true
        });
        if ((result.result as Record<string, unknown>)?.value === true) return;
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new Error(`Timeout waiting for selector: "${selector}"`);
    } else {
      throw new Error('Either "text" or "selector" must be provided');
    }
  }

  getPendingDialog(): DialogInfo | undefined {
    return this.pendingDialog;
  }

  async handleDialog(accept: boolean, promptText?: string): Promise<void> {
    this.ensureOpen();
    if (!this.pendingDialog) {
      throw new Error('No pending dialog to handle');
    }
    this.pendingDialog = undefined;

    await this.client.send('Page.handleJavaScriptDialog', {
      accept,
      ...(promptText !== undefined ? { promptText } : {})
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;

    if (this.dialogHandler) {
      this.client.off('Page.javascriptDialogOpening', this.dialogHandler);
    }

    if (this.ownsClient) {
      this.client.close();
    }

    return Promise.resolve();
  }
}
