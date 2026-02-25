export interface DialogInfo {
  type: string;
  message: string;
  defaultValue?: string | undefined;
}

export interface BrowserSession {
  goto(url: string): Promise<{ url: string; title: string }>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  evaluate(js: string): Promise<unknown>;
  screenshot(): Promise<Buffer>;
  close(): Promise<void>;

  /** Wait for text or selector to appear on the page. */
  waitFor(options: {
    text?: string | undefined;
    selector?: string | undefined;
    timeout?: number | undefined;
  }): Promise<void>;

  /** Get the current pending dialog, if any. */
  getPendingDialog(): DialogInfo | undefined;

  /** Accept or dismiss the current pending dialog. */
  handleDialog(accept: boolean, promptText?: string): Promise<void>;
}
