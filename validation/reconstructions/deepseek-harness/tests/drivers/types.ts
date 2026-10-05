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
  /** Extra process environment (e.g. MODEL_RETRY_BACKOFF_MS for the journey suite). */
  env?: Record<string, string>;
}

/**
 * Named, documented behavior differences between the two systems, backed by
 * reference-behavior-matrix.md / cognate/DEVIATIONS.md citations in each
 * driver implementation. Journey specs read these instead of branching on
 * `process.env.SYSTEM`, so the *assertion* stays identical for both systems
 * and only the *expected value* differs, with the citation living next to
 * the value that needs it.
 */
export interface Expectations {
  /**
   * Does a pending tool-approval continuation survive a full process
   * restart (kill + relaunch against the same home dir)? false for the
   * reference (reference-behavior-matrix.md §6.2, "Full process restart":
   * the turn silently finalizes as "Worked" with no approval card at all);
   * true for Cognate (cognate/DEVIATIONS.md "Pending approvals survive a
   * full server restart; the reference does not (T8)" - continuations are
   * durable SQLite-backed state by construction).
   */
  approvalSurvivesRestart: boolean;
  /**
   * The failure `code` shown for the deterministic scripted-500 provider
   * error ([[scenario:error]]). Cognate maps any non-timeout failure
   * message to "HTTP_500" (cognate/DEVIATIONS.md "Provider-error code
   * mapping is text-based, not status-based, by construction"). The
   * reference's own confirmed code vocabulary (reference-behavior-matrix.md
   * §8) was only observed for a genuine network timeout ("TIMEOUT"); its
   * code for a scripted HTTP 500 response is not separately confirmed, so
   * this is asserted loosely (see journeys/H-cancellation.spec.ts).
   */
  providerErrorCode: string;
}

export interface Driver {
  /** Start the underlying system process(es) and return once ready to navigate. */
  launch(options: LaunchOptions): Promise<void>;
  /** Stop the underlying system process(es). Idempotent. */
  stop(): Promise<void>;

  /** Navigate a fresh page to the authenticated entry point and land on the app shell. */
  authenticate(page: Page): Promise<void>;
  /** Navigate only, leaving any first-run dialog(s) up (for observing "initial UI" before dismissal). */
  authenticateRaw(page: Page): Promise<void>;
  /** Dismiss a named first-run dialog/button if present; returns whether it was dismissed. No-op (returns false) if not shown. */
  dismiss(page: Page, name: string): Promise<boolean>;

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

  /**
   * Do whatever system-specific setup is needed so that the *next* message
   * containing `[[scenario:approval]]` actually produces a pending
   * approval card, rather than a silent no-op. The reference needs the PTC
   * agent preset (registers `run_code`) plus a Read Only access mode (so
   * the scenario's requested "workspace-write" is a real escalation); see
   * drivers/reference.ts. Cognate's default read-only tool-loop mode
   * already ranks below "workspace-write", so this is a no-op there.
   */
  prepareApprovalTrigger(page: Page): Promise<void>;

  /** Enter plan mode and send `task` in it (system-specific mechanics, e.g. the reference's `/plan` autocomplete vs. Cognate's literal `/plan ` prefix). */
  sendInPlanMode(page: Page, task: string): Promise<void>;
  /** Approve a pending plan-review card. */
  approvePlan(page: Page): Promise<void>;
  /** Request changes on a pending plan-review card (stays in plan mode). */
  requestPlanChanges(page: Page): Promise<void>;
  /** Expand the "N subagent(s)" disclosure to reveal delegated child sessions. */
  openSubagentList(page: Page): Promise<void>;

  /** Read the current expectation values for this driver's system. */
  expectations(): Expectations;

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
