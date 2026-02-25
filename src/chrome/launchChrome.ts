import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { waitForCdpReady } from '../cdp/waitForCdp.js';
import type { ChromeProcessHandle } from '../types.js';
import { assertPortAvailable } from '../utils/net.js';
import { resolveChromeExecutablePath } from './resolveChromePath.js';

interface LaunchChromeOptions {
  readonly host: string;
  readonly port: number;
  readonly headless: boolean;
  readonly noSandbox: boolean;
  readonly timeoutMs: number;
  readonly userDataDir?: string;
  readonly chromePath?: string;
}

function createUserDataDir(userDataDir?: string): string {
  if (userDataDir) {
    mkdirSync(userDataDir, { recursive: true });
    return userDataDir;
  }

  const parent = join(tmpdir(), 'openclaw-control-');
  return mkdtempSync(parent);
}

async function stopProcess(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    const start = Date.now();
    const maxWait = 3_000;

    const timer = setInterval(() => {
      try {
        process.kill(pid, 0);
      } catch {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - start >= maxWait) {
        clearInterval(timer);
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // ignore
        }
        resolve();
      }
    }, 100);
  });
}

export async function launchChrome(options: LaunchChromeOptions): Promise<ChromeProcessHandle> {
  await assertPortAvailable(options.port, options.host, 'CDP');

  const executablePath = resolveChromeExecutablePath(options.chromePath);
  const userDataDir = createUserDataDir(options.userDataDir);

  const args = [
    `--remote-debugging-address=${options.host}`,
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ];

  if (options.headless) {
    args.push('--headless=new', '--disable-gpu');
  }

  if (process.platform === 'linux') {
    args.push('--disable-dev-shm-usage');
  }

  if (options.noSandbox) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  const child = spawn(executablePath, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout?.on('data', (buf: Buffer) => {
    const text = buf.toString().trim();
    if (text.length > 0) {
      console.log(`[chrome] ${text}`);
    }
  });
  child.stderr?.on('data', (buf: Buffer) => {
    const text = buf.toString().trim();
    if (text.length > 0) {
      console.error(`[chrome] ${text}`);
    }
  });

  if (!child.pid) {
    throw new Error('Failed to spawn Chrome process');
  }

  try {
    await waitForCdpReady({
      host: options.host,
      port: options.port,
      timeoutMs: options.timeoutMs
    });
  } catch (error) {
    await stopProcess(child.pid);
    throw error;
  }

  return {
    userDataDir,
    cdpEndpoint: `http://${options.host}:${options.port}`,
    close: async () => {
      await stopProcess(child.pid as number);
    }
  };
}
