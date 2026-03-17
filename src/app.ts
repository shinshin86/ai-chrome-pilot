import type { Server } from 'node:http';
import { join } from 'node:path';

import { CdpClient } from './cdp/client.js';
import { CdpBrowserSession } from './cdp/session.js';
import { createSharedProxy } from './cdp/shared-client.js';
import { launchChrome } from './chrome/launchChrome.js';
import { detectPlaywright } from './playwright/detect.js';
import type { BrowserSession } from './playwright/types.js';
import { createControlServer } from './server/createServer.js';
import { SnapshotEngine } from './snapshot/engine.js';
import type { AppConfig, ChromeProcessHandle } from './types.js';

export class App {
  private chrome: ChromeProcessHandle | undefined;
  private session: BrowserSession | undefined;
  private playwrightSession: BrowserSession | undefined;
  private server: Server | undefined;
  private stopping = false;
  private readonly snapshotEngine = new SnapshotEngine();
  private sharedClient: CdpClient | undefined;

  constructor(private readonly config: AppConfig) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    try {
      await this.startChromeMode();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private async startChromeMode(): Promise<void> {
    // Resolve the user data directory
    let userDataDir = this.config.userDataDir;
    if (!userDataDir && !this.config.ephemeral) {
      userDataDir = join(this.config.profileDir, this.config.profileName);
    }

    const launchOptions = {
      host: this.config.cdpHost,
      port: this.config.cdpPort,
      headless: this.config.headless,
      noSandbox: this.config.noSandbox,
      timeoutMs: this.config.cdpReadyTimeoutMs,
      ...(userDataDir ? { userDataDir } : {}),
      ...(this.config.chromePath ? { chromePath: this.config.chromePath } : {})
    };

    this.chrome = await launchChrome(launchOptions);
    const cdpEndpoint = this.chrome.cdpEndpoint;

    let selectedTargetId: string | undefined;

    // Auto-detect Playwright and use its selected page as the canonical target when available
    const playwrightAvailable = await detectPlaywright();
    if (playwrightAvailable) {
      try {
        const { PlaywrightCdpSession } = await import('./playwright/session.js');
        const playwrightSession = await PlaywrightCdpSession.connect(cdpEndpoint);
        selectedTargetId = playwrightSession.getTargetId();
        this.playwrightSession = playwrightSession;
      } catch {
        // Playwright import succeeded but connection failed — continue without it
        console.warn('[startup] Playwright detected but connection failed, using CDP-only');
      }
    }

    if (!selectedTargetId) {
      selectedTargetId = (await CdpClient.resolvePageTarget(cdpEndpoint)).id;
    }

    // Keep all CDP-based routes on the same target as the chosen browser page
    this.session = await CdpBrowserSession.connect(cdpEndpoint, selectedTargetId);
    this.sharedClient = await CdpClient.connectToPage(cdpEndpoint, selectedTargetId);
    const sharedProxy = createSharedProxy(this.sharedClient);

    const mode = this.playwrightSession ? 'hybrid (Playwright available)' : 'CDP-only';

    const expressApp = createControlServer({
      session: this.session,
      playwrightSession: this.playwrightSession,
      evaluateEnabled: this.config.evaluateEnabled,
      snapshotEngine: this.snapshotEngine,
      getCdpClient: () => Promise.resolve(sharedProxy),
      cdpHttpEndpoint: cdpEndpoint
    });

    await this.listenServer(expressApp);

    console.log(
      `[startup] Control server: http://${this.config.controlHost}:${this.config.controlPort}`
    );
    console.log(`[startup] CDP endpoint: ${this.chrome.cdpEndpoint}`);
    console.log(`[startup] userDataDir: ${this.chrome.userDataDir}`);
    console.log(`[startup] Mode: ${mode}`);
    if (!this.config.ephemeral) {
      console.log(`[startup] Profile: ${this.config.profileName} (persistent)`);
    } else {
      console.log(`[startup] Profile: ephemeral (session will not persist)`);
    }
  }

  private async listenServer(expressApp: ReturnType<typeof createControlServer>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const server = expressApp.listen(this.config.controlPort, this.config.controlHost, () => {
        this.server = server;
        resolve();
      });
      server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      return;
    }
    this.stopping = true;

    const closeTasks: Array<Promise<unknown>> = [];

    if (this.server) {
      closeTasks.push(
        new Promise<void>((resolve) => {
          this.server?.close(() => resolve());
        })
      );
    }

    if (this.playwrightSession) {
      closeTasks.push(this.playwrightSession.close());
    }

    if (this.session) {
      closeTasks.push(this.session.close());
    }

    if (this.sharedClient) {
      this.sharedClient.close();
    }

    // Gracefully close browser via CDP before killing the process
    if (this.chrome) {
      try {
        const browserClient = await CdpClient.connectToBrowser(this.chrome.cdpEndpoint);
        await browserClient.closeBrowser();
        browserClient.close();
      } catch {
        // If CDP close fails, fall back to process kill
      }
      closeTasks.push(this.chrome.close());
    }

    await Promise.allSettled(closeTasks);

    this.server = undefined;
    this.playwrightSession = undefined;
    this.session = undefined;
    this.sharedClient = undefined;
    this.chrome = undefined;
    this.stopping = false;
  }
}
