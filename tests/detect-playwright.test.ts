import { describe, expect, test } from 'vitest';

import { detectPlaywright } from '../src/playwright/detect.js';

describe('detectPlaywright', () => {
  test('returns true when playwright-core is installed', async () => {
    // playwright-core is in optionalDependencies and should be installed in dev
    const result = await detectPlaywright();
    expect(result).toBe(true);
  });
});
