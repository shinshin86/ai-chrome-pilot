import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { accessSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { platform } from 'node:process';

function canAccess(path: string): boolean {
  try {
    const mode = platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK;
    accessSync(path, mode);
    return true;
  } catch {
    return false;
  }
}

function findExistingPath(candidates: string[]): string | undefined {
  return candidates.find((candidate) => canAccess(candidate));
}

function resolveOnMac(): string | undefined {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
  return findExistingPath(candidates);
}

function resolveOnWindows(): string | undefined {
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env.LocalAppData
  ].filter((v): v is string => Boolean(v));

  const suffixes = [
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
    ['Chromium', 'Application', 'chrome.exe']
  ];

  const candidates: string[] = [];
  for (const root of roots) {
    for (const suffix of suffixes) {
      candidates.push(join(root, ...suffix));
    }
  }
  return findExistingPath(candidates);
}

function commandExists(command: string): string | undefined {
  const whichCommand = platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(whichCommand, [command], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  if (result.status !== 0) {
    return undefined;
  }

  const firstLine = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine && canAccess(firstLine) ? firstLine : undefined;
}

function resolveOnLinux(): string | undefined {
  const commands = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'brave-browser',
    'microsoft-edge'
  ];

  for (const command of commands) {
    const found = commandExists(command);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function candidateHint(): string {
  const pathEnv = process.env.PATH || '';
  return `PATH=${pathEnv.split(delimiter).slice(0, 5).join(delimiter)}...`;
}

export function resolveChromeExecutablePath(explicitPath?: string): string {
  if (explicitPath) {
    if (!canAccess(explicitPath)) {
      throw new Error(`CHROME_PATH is set but not executable: ${explicitPath}`);
    }
    return explicitPath;
  }

  const os = platform;
  let found: string | undefined;

  if (os === 'darwin') {
    found = resolveOnMac();
  } else if (os === 'win32') {
    found = resolveOnWindows();
  } else {
    found = resolveOnLinux();
  }

  if (!found) {
    throw new Error(
      `Chrome/Chromium executable not found for platform ${os}. Set CHROME_PATH explicitly. ${candidateHint()}`
    );
  }

  return found;
}
