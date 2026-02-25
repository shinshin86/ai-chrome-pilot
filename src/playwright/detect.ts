/**
 * Detect whether playwright-core is available at runtime.
 * Returns true if the module can be imported, false otherwise.
 */
export async function detectPlaywright(): Promise<boolean> {
  try {
    await import('playwright-core');
    return true;
  } catch {
    return false;
  }
}
