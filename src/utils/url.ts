export function isAllowedNavigateUrl(value: string): boolean {
  if (value === 'about:blank') {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}
