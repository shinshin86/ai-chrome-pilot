interface CdpVersionResponse {
  readonly webSocketDebuggerUrl?: string;
  readonly Browser?: string;
}

interface WaitForCdpOptions {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
  readonly intervalMs?: number;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForCdpReady(options: WaitForCdpOptions): Promise<CdpVersionResponse> {
  const intervalMs = options.intervalMs ?? 200;
  const deadline = Date.now() + options.timeoutMs;
  const endpoint = `http://${options.host}:${options.port}/json/version`;

  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(endpoint, Math.min(1_500, options.timeoutMs));
      if (response.ok) {
        const json = (await response.json()) as CdpVersionResponse;
        if (json.webSocketDebuggerUrl) {
          return json;
        }
      }
      lastError = new Error(`CDP endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for CDP at ${endpoint}: ${reason}`);
}
