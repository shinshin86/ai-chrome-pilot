import { describe, expect, test } from 'vitest';

import { isAllowedNavigateUrl } from '../src/utils/url.js';

describe('isAllowedNavigateUrl', () => {
  test('http/https and about:blank are allowed', () => {
    expect(isAllowedNavigateUrl('http://example.com')).toBe(true);
    expect(isAllowedNavigateUrl('https://example.com/path')).toBe(true);
    expect(isAllowedNavigateUrl('about:blank')).toBe(true);
  });

  test('file/javascript/data are rejected', () => {
    expect(isAllowedNavigateUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedNavigateUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedNavigateUrl('data:text/html,hello')).toBe(false);
  });

  test('invalid strings are rejected', () => {
    expect(isAllowedNavigateUrl('not a url')).toBe(false);
    expect(isAllowedNavigateUrl('')).toBe(false);
  });
});
