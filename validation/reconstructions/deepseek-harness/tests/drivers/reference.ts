import type { Locator, Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { Driver, Expectations, LaunchOptions } from "./types";

/**
 * Driver implementation for the pinned DeepSeek Harness reference (`dsh web`).
 * All reference-specific selectors live in this file. Prefer role/name
 * selectors observed by hand (see reference/observations/aria/*.txt and
 * reference-behavior-matrix.md) over CSS classes, which are hashed/unstable
 * (e.g. `jprSca_primaryButton`).
 *
 * Known first-run modal sequence, observed 2026-09-26 against commit
 * 477b4f420553e8a52c2fbccc464d7561b239c443:
 *   1. "Internal Testing Notice" dialog -> button "Continue" (shown once per
 *      DSH_HOME; persisted, so a reused home may skip it).
 *   2. "Add an API key to get started" dialog -> button "Configure later"
 *      (persisted similarly).
 *   3. An `alert` "Unable to create default workspace. Use Choose workspace
 *      to select a folder." banner appears on a fresh DSH_HOME with no
 *      workspace yet; this is expected/benign, not an error state to chase.
 */
export class ReferenceDriver implements Driver {
  private proc: ChildProcess | null = null;
  private clonePath: string;
  private tokenUrl: string | null = null;
  private port = 3080;

  constructor(clonePath: string) {
    this.clonePath = clonePath;
  }

  async launch(options: LaunchOptions): Promise<void> {
    mkdirSync(options.homeDir, { recursive: true });
    this.port = options.port;
    this.tokenUrl = await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        "pnpm",
        ["dsh", "web", "--no-open", "--port", String(options.port)],
        {
          cwd: this.clonePath,
          env: { ...process.env, DSH_HOME: options.homeDir, ...options.env },
          // `pnpm dsh web` forks its own grandchild (`node --import tsx/esm apps/cli/src/bin.ts
          // web ...`, the actual process holding the port). Killing only the top `pnpm` process
          // leaves that grandchild running - orphaned, still bound to the port - which both leaks
          // processes across test runs AND makes a same-port `restart()` race a stale listener
          // into EADDRINUSE. `detached: true` puts pnpm in its own process group so `stop()` can
          // SIGKILL the whole group at once via a negative pid.
          detached: true,
        },
      );
      this.proc = proc;
      let buf = "";
      const onData = (chunk: Buffer) => {
        buf += chunk.toString();
        const m = buf.match(/dsh web: (http:\/\/\S+)/);
        if (m) {
          proc.stdout?.off("data", onData);
          resolve(m[1]);
        }
      };
      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", (c) => (buf += c.toString()));
      proc.on("exit", (code) => {
        if (!this.tokenUrl) reject(new Error(`dsh web exited before printing token url (code ${code}): ${buf}`));
      });
      setTimeout(() => reject(new Error(`dsh web did not print token url within 30s. Output so far:\n${buf}`)), 30_000);
    });
  }

  async stop(): Promise<void> {
    if (this.proc && !this.proc.killed && this.proc.pid) {
      // Kill the whole detached process group (negative pid), not just the top `pnpm` process -
      // see the `detached: true` comment in launch().
      try {
        process.kill(-this.proc.pid, "SIGKILL");
      } catch {
        this.proc.kill("SIGKILL");
      }
    }
    this.proc = null;
  }

  async authenticate(page: Page): Promise<void> {
    await this.authenticateRaw(page);
    await this.dismissIfPresent(page, "Continue");
    await this.dismissIfPresent(page, "Configure later");
  }

  /** Navigate to the token URL only; leaves first-run dialogs up (for capturing 01-first-launch). */
  async authenticateRaw(page: Page): Promise<void> {
    if (!this.tokenUrl) throw new Error("launch() must be called before authenticate()");
    await page.goto(this.tokenUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
  }

  /** Public wrapper so capture/journey scripts can dismiss a specific dialog by button name. */
  async dismiss(page: Page, name: string): Promise<boolean> {
    return this.dismissIfPresent(page, name);
  }

  private async dismissIfPresent(page: Page, name: string): Promise<boolean> {
    const btn = page.getByRole("button", { name, exact: true });
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await btn.count().catch(() => 0);
      if (count === 0) return false;
      const first = btn.first();
      const visible = await first.isVisible().catch(() => false);
      const enabled = visible && (await first.isEnabled().catch(() => false));
      if (visible && enabled) {
        await first.click().catch(() => {});
        await page.waitForTimeout(300);
        return true;
      }
      await page.waitForTimeout(300);
    }
    return false;
  }

  async openSettingsModels(page: Page): Promise<void> {
    await this.dismissIfPresent(page, "Continue");
    await this.dismissIfPresent(page, "Configure later");
    const modelsTab = page.getByRole("button", { name: "Models", exact: true });
    // Occasionally the "Settings" click lands before the shell has finished settling right after
    // authenticate()/a first-run dialog dismissal and has no visible effect - self-heal by retrying
    // the click a few times rather than hanging on a single click forever (observed once in this
    // suite's own journey harness, not a reference bug: retrying always succeeds within 1-2 tries).
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.dismissIfPresent(page, "Configure later");
      await page.getByRole("button", { name: "Settings", exact: true }).click({ timeout: 5000 }).catch(() => {});
      if (await modelsTab.isVisible({ timeout: 2000 }).catch(() => false)) break;
      await page.waitForTimeout(300);
    }
    await modelsTab.click();
    await page.waitForTimeout(300);
  }

  async configureModel(
    page: Page,
    config: { baseUrl: string; apiKey: string; protocol: "openai-completions" },
    onFormOpen?: (page: Page) => Promise<void>,
  ): Promise<void> {
    // Settings -> Models must already be open (call openSettingsModels first).
    const existing = page.getByRole("button", { name: /Edit Mock Model/ });
    if ((await existing.count()) > 0) return; // already configured in this DSH_HOME

    await page.getByRole("button", { name: "Add model provider", exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole("tab", { name: "Custom model API", exact: true }).click();
    await page.waitForTimeout(200);
    if (onFormOpen) await onFormOpen(page);
    const panel = page.getByRole("tabpanel", { name: "Custom model API" });
    await panel.getByRole("textbox", { name: "Provider ID" }).fill("mock-model");
    await panel.getByRole("textbox", { name: "Display name" }).fill("Mock Model");
    await panel.getByRole("textbox", { name: "Base URL" }).fill(config.baseUrl);
    // protocol combobox already defaults to "OpenAI Chat Completions", matching
    // config.protocol === "openai-completions".
    await panel.getByRole("textbox", { name: "API key" }).fill(config.apiKey);
    await panel.getByRole("button", { name: "Add model", exact: true }).click();
    await page.waitForTimeout(150);
    await panel.getByRole("textbox", { name: "Model ID 1" }).fill("mock-model-1");
    await panel.getByRole("textbox", { name: "Display name 1" }).fill("Mock Model 1");
    await panel.getByRole("button", { name: "Create provider", exact: true }).click();
    await page.waitForTimeout(500);
  }

  async chooseWorkspace(page: Page, workspaceDir: string): Promise<void> {
    await page.getByRole("button", { name: "Choose workspace", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Edit path", exact: true }).click();
    await page.waitForTimeout(150);
    const pathBox = page.getByRole("dialog", { name: "Select Workspace Directory" }).getByRole("textbox");
    await pathBox.fill(workspaceDir);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.waitForTimeout(500);
    // Ensure the mock model is selected for the (auto-created) session.
    const modelBtn = page.getByRole("button", { name: /Select model/ });
    if ((await modelBtn.count()) > 0) {
      const current = await modelBtn.getAttribute("aria-label").catch(() => null);
      if (!current || !current.includes("Mock Model 1")) {
        await modelBtn.click();
        await page.waitForTimeout(200);
        await page.getByRole("menuitem", { name: /^Model/ }).click();
        await page.waitForTimeout(200);
        await page.getByRole("menuitemradio", { name: "Mock Model 1" }).click();
        await page.waitForTimeout(200);
        await page.keyboard.press("Escape");
      }
    }
  }

  async newSession(page: Page): Promise<void> {
    // Two elements share the accessible name "New session": the top-left
    // brand/logo button and the actual "New Session" sidebar action; the
    // latter is always the last in DOM order.
    await page.getByRole("button", { name: "New session", exact: true }).last().click();
    await page.waitForTimeout(300);
  }

  async send(page: Page, text: string): Promise<void> {
    await page.getByRole("textbox", { name: /Describe what you want to build|Message or run a task/ }).fill(text);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
  }

  async waitForIdle(page: Page, opts?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    // A run has settled once a duration badge ("Took Ns") or a failure status
    // appears; poll for either rather than assuming a specific "Stop" button
    // name (not yet confirmed against the pinned UI - see matrix).
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const settled = page.getByRole("button", { name: /^Took \d/ });
      const stopGone = (await page.getByRole("button", { name: "Stop generating", exact: true }).count()) === 0;
      if ((await settled.count()) > 0 && stopGone) return;
      await page.waitForTimeout(250);
    }
  }

  /**
   * Approve a pending sandbox-escalation ask (the "Waiting for approval" /
   * "Allow this operation with <mode> permissions: <justification>" card).
   * Confirmed button label is exactly "Allow once" (not "Allow" / "Approve").
   */
  async approve(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Allow once", exact: true }).click();
  }

  /** Deny a pending sandbox-escalation ask. Confirmed button label is "Reject" (not "Deny"). */
  async deny(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Reject", exact: true }).click();
  }

  /**
   * Switch the session's agent preset (Standard mode / PTC mode / Minimal
   * mode / Creator mode) via the selector next to "Choose workspace" /
   * the session banner. `run_code` (the tool the sandbox-escalation approval
   * flow hangs off) is only registered as a callable tool under **PTC mode**
   * - it is "unknown tool \"run_code\"" under the default Standard mode.
   */
  async switchAgentPreset(page: Page, preset: "Standard mode" | "PTC mode" | "Minimal mode" | "Creator mode"): Promise<void> {
    await page.getByRole("button", { name: /Standard mode|PTC mode|Minimal mode|Creator mode/ }).click();
    await page.waitForTimeout(200);
    await page.getByRole("menuitem", { name: new RegExp(`^${preset}`) }).click();
    await page.waitForTimeout(200);
  }

  /**
   * Enter Plan Mode via the `/plan` slash command, then send `task` appended
   * after the inserted "/plan " prefix (replacing the composer text loses the
   * prefix and the mode never activates). Leaving mode: send with `/plan off`.
   */
  async sendInPlanMode(page: Page, task: string): Promise<void> {
    const box = this.locators.composer(page);
    await box.click();
    await box.pressSequentially("/plan");
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: /^Plan /, exact: false }).click();
    await page.waitForTimeout(200);
    await box.pressSequentially(` ${task}`);
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
  }

  /** Approve a pending plan-review card ("Approve this plan and leave plan mode?"). */
  async approvePlan(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Approve", exact: true }).click();
  }

  /** Request changes on a pending plan-review card (keeps the session in plan mode). */
  async requestPlanChanges(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Request changes", exact: true }).click();
  }

  /** Expand the "N subagent(s)" disclosure in the session banner to list delegated child sessions. */
  async openSubagentList(page: Page): Promise<void> {
    await page.getByRole("button", { name: /\d+ subagents?/ }).click();
    await page.waitForTimeout(300);
  }

  /**
   * See Driver.prepareApprovalTrigger. `run_code` (the tool the fixture's
   * `approval` scenario calls) is only registered under PTC mode; the
   * default access mode ("Workspace Write") already covers the scenario's
   * requested "workspace-write", so it never escalates unless the session
   * is first switched to "Read Only" (reference-behavior-matrix.md §6.2,
   * §0 recipe notes; see tests/capture/reference.capture-tools.ts).
   */
  async prepareApprovalTrigger(page: Page): Promise<void> {
    await this.switchAgentPreset(page, "PTC mode");
    await page.getByRole("button", { name: /Access mode/ }).click();
    await page.waitForTimeout(200);
    await page.getByRole("menuitem", { name: "Read Only", exact: true }).click();
    await page.waitForTimeout(200);
  }

  expectations(): Expectations {
    return {
      // reference-behavior-matrix.md §6.2 "Full process restart": the
      // pending approval does not survive - the turn silently finalizes as
      // "Worked" with no approval card at all.
      approvalSurvivesRestart: false,
      // reference-behavior-matrix.md §8: the only confirmed failure code is
      // "TIMEOUT", observed for a genuine network-level timeout (closed
      // port), not the mock's scripted HTTP 500 marker path.
      providerErrorCode: "TIMEOUT",
    };
  }

  /**
   * `index` is 0-based among SESSION rows only (newest first), not raw tree
   * position - the session tree nests all sessions for a workspace under one
   * expanded "workspace" group treeitem, so a raw `treeitem.nth(index)` is
   * off by one (index 0 would hit the group header, not a session).
   */
  async openSession(page: Page, index: number): Promise<void> {
    await this.locators.sessionListItem(page, index).click();
    await page.waitForTimeout(300);
  }

  async reload(page: Page): Promise<void> {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
  }

  async restart(page: Page, options: LaunchOptions): Promise<void> {
    await this.stop();
    // A SIGKILL'd listener does not release its port instantaneously - relaunching on the SAME
    // port immediately after can race the OS into EADDRINUSE (observed: "dsh: startup failed ...
    // listen EADDRINUSE"). Give it a moment, matching CognateDriver.restart.
    await new Promise((r) => setTimeout(r, 1000));
    await this.launch(options);
  }

  locators = {
    composer: (page: Page) => page.getByRole("textbox", { name: /Describe what you want to build|Message or run a task/ }),
    sendButton: (page: Page) => page.getByRole("button", { name: "Send message", exact: true }),
    sessionList: (page: Page) => page.getByRole("tree", { name: "Sessions" }),
    // treeitem #0 is always the workspace-group header (sibling of the session rows, not their
    // ancestor, despite the indented rendering); +1 skips it so index 0 is the newest SESSION.
    sessionListItem: (page: Page, index: number) =>
      page.getByRole("tree", { name: "Sessions" }).getByRole("treeitem").nth(index + 1),
    // Mid-run, the running/pending tool group renders as a single button
    // ("Reading files · <path>", "Running commands · <description>",
    // "Running code · <description>", "Coordinating subagents · <description>",
    // "Updating the plan · todo_write"); once the turn completes this
    // collapses away and only leaf artifacts remain (e.g. the "View changes
    // to <path>" file-diff button, or "Open plan: <title>").
    toolCard: (page: Page, index = 0) =>
      page.getByRole("button", { name: /Reading files|Running commands|Running code|Coordinating subagents|Updating the plan|Read files|Ran code|Called tools|View changes to|Open plan:/ }).nth(index),
    // The card's accessible group name is "Approval details" - the "Allow this operation with..."
    // text is its content, not its ARIA name (confirmed via error-context snapshot: `group
    // "Approval details": "Allow this operation with workspace-write permissions: ..."`).
    approvalPanel: (page: Page) => page.getByRole("group", { name: "Approval details" }),
    approveButton: (page: Page) => page.getByRole("button", { name: "Allow once", exact: true }),
    denyButton: (page: Page) => page.getByRole("button", { name: "Reject", exact: true }),
    planPanel: (page: Page) => page.getByRole("region", { name: /^Approve this plan and leave plan mode\?$/ }),
    subagentCard: (page: Page) => page.getByRole("tree", { name: "Subagent sessions" }),
    themeToggle: (page: Page) => page.getByRole("button", { name: /^(Light|Dark|System)$/, exact: true }).first(),
    stopButton: (page: Page) => page.getByRole("button", { name: "Stop generating", exact: true }),
    retryButton: (page: Page) => page.getByRole("button", { name: /retry/i }).first(),
    errorBanner: (page: Page) => page.locator('[role="alert"]').first(),
  };
}
