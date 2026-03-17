export interface AppConfig {
  readonly controlHost: string;
  readonly controlPort: number;
  readonly cdpHost: string;
  readonly cdpPort: number;
  readonly headless: boolean;
  readonly noSandbox: boolean;
  readonly userDataDir?: string;
  readonly chromePath?: string;
  readonly evaluateEnabled: boolean;
  readonly cdpReadyTimeoutMs: number;
  /** Profile name for session persistence. Default: "default" */
  readonly profileName: string;
  /** Base directory for profiles. Default: ~/.ai-chrome-pilot/profiles/ */
  readonly profileDir: string;
  /** If true, use ephemeral temp directory (no session persistence). */
  readonly ephemeral: boolean;
}

export interface ChromeProcessHandle {
  readonly userDataDir: string;
  readonly cdpEndpoint: string;
  close(): Promise<void>;
}
