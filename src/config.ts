import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AppConfig } from './types.js';

const DEFAULT_CONTROL_PORT = 3333;
const DEFAULT_CDP_PORT = 9222;
const DEFAULT_CDP_READY_TIMEOUT_MS = 15_000;
const DEFAULT_PROFILE_NAME = 'default';
const DEFAULT_PROFILE_DIR = join(homedir(), '.ai-chrome-pilot', 'profiles');

function parsePort(raw: string | undefined, fallback: number, name: string): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return parsed;
}

function parse01(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (raw === '1') {
    return true;
  }
  if (raw === '0') {
    return false;
  }
  throw new Error(`${name} must be 0 or 1`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const controlPort = parsePort(env.CONTROL_PORT, DEFAULT_CONTROL_PORT, 'CONTROL_PORT');
  const cdpPort = parsePort(env.CDP_PORT, DEFAULT_CDP_PORT, 'CDP_PORT');

  return {
    controlHost: '127.0.0.1',
    controlPort,
    cdpHost: '127.0.0.1',
    cdpPort,
    headless: parse01(env.HEADLESS, false, 'HEADLESS'),
    noSandbox: parse01(env.NO_SANDBOX, false, 'NO_SANDBOX'),
    evaluateEnabled: parse01(env.EVALUATE_ENABLED, true, 'EVALUATE_ENABLED'),
    cdpReadyTimeoutMs: DEFAULT_CDP_READY_TIMEOUT_MS,
    profileName: env.PROFILE_NAME || DEFAULT_PROFILE_NAME,
    profileDir: env.PROFILE_DIR || DEFAULT_PROFILE_DIR,
    ephemeral: parse01(env.EPHEMERAL, false, 'EPHEMERAL'),
    relayEnabled: parse01(env.RELAY_ENABLED, false, 'RELAY_ENABLED'),
    relayAuthToken: env.RELAY_AUTH_TOKEN ?? '',
    ...(env.USER_DATA_DIR ? { userDataDir: env.USER_DATA_DIR } : {}),
    ...(env.CHROME_PATH ? { chromePath: env.CHROME_PATH } : {})
  };
}
