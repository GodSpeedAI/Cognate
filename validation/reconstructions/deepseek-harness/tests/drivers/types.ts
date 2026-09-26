import type { Locator, Page } from "@playwright/test";

/**
 * System-agnostic driver interface for the DeepSeek Harness reconstruction
 * parity suite. One implementation targets the pinned reference
 * (drivers/reference.ts); a future implementation targets the Cognate
 * reconstruction. Journey/capture code is written once against this
 * interface so the same scenario script runs against both systems -
 * differences that are purely branding/selector differences are absorbed
 * here, never by weakening assertions in the caller.
 */
export interface LaunchOptions {
  /** Isolated data-home directory for this run (DSH_HOME equivalent). */
  homeDir: string;
  /** Port to bind the web server to. */
  port: number;
  /** Base URL of a running OpenAI-completions-compatible mock model server. */
  mockModelBaseUrl: string;
}

export interface Driver {
  /** Start the underlying system process(es) and return once ready to navigate. */
  launch(options: LaunchOptions): Promise<void>;
  /** Stop the underlying system process(es). Idempotent. */
  stop(): Promise<void>;

  /** Navigate a fresh page to the authenticated entry point and land on the app shell. */
  authenticate(page: Page): Promise<void>;

  /** Open Settings -> Models (or equivalent) from the current shell. */
  openSettingsModels(page: Page): Promise<void>;
  /**
   * Configure a custom/OpenAI-completions-compatible model pointing at the
   * mock model server, then save.
   */
  configureModel(
    page: Page,
    config: { baseUrl: string; apiKey: string; protocol: "openai-completions" },
  ): Promise<void>;

  /** Choose/select a workspace directory, creating a new entry if needed. */
  chooseWorkspace(page: Page, workspaceDir: string): Promise<void>;

  /** Create a new session in the currently selected workspace. */
  newSession(page: Page): Promise<void>;

  /** Type and submit a message in the composer. */
  send(page: Page, text: string): Promise<void>;

  /** Wait until the run/stream has settled (no pending stream/tool activity). */
  waitForIdle(page: Page, opts?: { timeoutMs?: number }): Promise<void>;

  /** Approve the currently pending approval-gated action, if one is shown. */
  approve(page: Page): Promise<void>;
  /** Deny the currently pending approval-gated action, if one is shown. */
  deny(page: Page): Promise<void>;

  /** Open an existing session by index/id from the session list. */
  openSession(page: Page, index: number): Promise<void>;

  /** Reload the current page (soft reload, process kept alive). */
  reload(page: Page): Promise<void>;
  /** Stop and relaunch the underlying process(es); page must be re-navigated after. */
  restart(page: Page, options: LaunchOptions): Promise<void>;

  // --- Locators. Each should prefer role/name selectors; reference-specific
  // selector strings live only inside the implementation, never in callers. ---
  locators: {
    composer(page: Page): Locator;
    sendButton(page: Page): Locator;
    sessionList(page: Page): Locator;
    sessionListItem(page: Page, index: number): Locator;
    toolCard(page: Page, index?: number): Locator;
    approvalPanel(page: Page): Locator;
    approveButton(page: Page): Locator;
    denyButton(page: Page): Locator;
    planPanel(page: Page): Locator;
    subagentCard(page: Page): Locator;
    themeToggle(page: Page): Locator;
    stopButton(page: Page): Locator;
    retryButton(page: Page): Locator;
    errorBanner(page: Page): Locator;
  };
}
