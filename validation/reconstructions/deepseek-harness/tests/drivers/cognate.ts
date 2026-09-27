import type { Locator, Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Driver, Expectations, LaunchOptions } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, "..", "..", "cognate");

/**
 * Driver implementation for the Cognate reconstruction (`validation/reconstructions/
 * deepseek-harness/cognate`). Mirrors drivers/reference.ts's shape and comments so the two
 * implementations stay easy to diff by eye; all Cognate-specific selectors live only in this
 * file. The Cognate app is a single-operator local app with no login/first-run-dialog sequence
 * (see APP/README.md "dev auth"), so `authenticate()` is just a navigate-and-settle.
 */
export class CognateDriver implements Driver {
  private proc: ChildProcess | null = null;
  private baseUrl: string | null = null;
  private homeDir = "";
  private port = 3180;

  async launch(options: LaunchOptions): Promise<void> {
    mkdirSync(options.homeDir, { recursive: true });
    this.homeDir = options.homeDir;
    this.port = options.port;
    this.baseUrl = `http://127.0.0.1:${options.port}`;
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("bun", ["src/server.ts"], {
        cwd: APP_DIR,
        env: { ...process.env, COGNATE_HARNESS_HOME: options.homeDir, PORT: String(options.port), ...options.env },
        // See ReferenceDriver.launch's doc comment on `detached: true` - defensive here too so a
        // same-port restart() never races a not-yet-reaped grandchild into EADDRINUSE.
        detached: true,
      });
      this.proc = proc;
      let buf = "";
      const onData = (chunk: Buffer) => {
        buf += chunk.toString();
        if (/listening on http:\/\//.test(buf)) {
          proc.stdout?.off("data", onData);
          resolve();
        }
      };
      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", (c) => (buf += c.toString()));
      proc.on("exit", (code) => {
        if (!buf.includes("listening on")) reject(new Error(`cognate server exited before printing its listen line (code ${code}): ${buf}`));
      });
      setTimeout(() => reject(new Error(`cognate server did not print its listen line within 15s. Output so far:\n${buf}`)), 15_000);
    });
  }

  async stop(): Promise<void> {
    if (this.proc && !this.proc.killed && this.proc.pid) {
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

  /** Navigate to the app shell only; leaves the first-run dialog pair up (for capturing
   *  `01-first-launch`) — mirrors `ReferenceDriver.authenticateRaw`. */
  async authenticateRaw(page: Page): Promise<void> {
    if (!this.baseUrl) throw new Error("launch() must be called before authenticate()");
    await page.goto(this.baseUrl, { waitUntil: "load" });
    await page.waitForTimeout(500);
  }

  /** Public wrapper so capture/journey scripts can dismiss a specific first-run dialog by its
   *  button name (`"Continue"` for the notice, `"Configure later"` for the API-key step). */
  async dismiss(page: Page, name: string): Promise<boolean> {
    return this.dismissIfPresent(page, name);
  }

  // `onboarding.dismiss` is a real `client.invoke` round trip (capability -> agent.config run ->
  // event -> live SSE dispatch -> the `onboarding` projection's `useSyncExternalStore` refresh), not
  // a synchronous local state update — a single click + short wait can race that round trip. Retry
  // like `ReferenceDriver.dismissIfPresent` (5 attempts, 300ms apart) so a slightly slow projection
  // refresh doesn't get misread as "the dialog never appeared".
  private async dismissIfPresent(page: Page, name: string): Promise<boolean> {
    const btn = page.getByRole("button", { name, exact: true });
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await btn.count().catch(() => 0);
      if (count === 0) return attempt > 0;
      const first = btn.first();
      const visible = await first.isVisible().catch(() => false);
      const enabled = visible && (await first.isEnabled().catch(() => false));
      if (visible && enabled) {
        await first.click().catch(() => {});
        await page.waitForTimeout(300);
        // Wait for the dialog to actually disappear (the projection round trip) before declaring
        // success, so a caller's next action doesn't race a still-open backdrop.
        await btn.first().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
        return true;
      }
      await page.waitForTimeout(300);
    }
    return false;
  }

  async openSettingsModels(page: Page): Promise<void> {
    await this.dismissIfPresent(page, "Continue");
    await this.dismissIfPresent(page, "Configure later");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.waitForTimeout(200);
  }

  async configureModel(
    page: Page,
    config: { baseUrl: string; apiKey: string; protocol: "openai-completions" },
    onFormOpen?: (page: Page) => Promise<void>,
  ): Promise<void> {
    // Settings -> Models must already be open (call openSettingsModels first).
    const existing = page.getByRole("button", { name: /^Edit mock-model/ });
    if ((await existing.count()) > 0) return; // already configured in this COGNATE_HARNESS_HOME

    await page.getByRole("button", { name: "Add model provider", exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole("tab", { name: "Custom model API", exact: true }).click();
    await page.waitForTimeout(150);
    if (onFormOpen) await onFormOpen(page);
    await page.getByLabel("Provider ID", { exact: true }).fill("mock-model");
    await page.getByLabel("Display name", { exact: true }).fill("Mock Model");
    await page.getByLabel("Base URL", { exact: true }).fill(config.baseUrl);
    // API protocol combobox already defaults to "OpenAI Chat Completions", matching
    // config.protocol === "openai-completions".
    await page.getByLabel("API key", { exact: true }).fill(config.apiKey);
    await page.getByRole("button", { name: "Add model", exact: true }).click();
    await page.waitForTimeout(100);
    await page.getByLabel("Model 1 ID", { exact: true }).fill("mock-model-1");
    await page.getByLabel("Model 1 display name", { exact: true }).fill("Mock Model 1");
    await page.getByRole("button", { name: "Create provider", exact: true }).click();
    await page.waitForTimeout(300);
  }

  async chooseWorkspace(page: Page, workspaceDir: string): Promise<void> {
    await page.getByLabel("Workspace directory path").fill(workspaceDir);
    await page.getByRole("button", { name: "Choose workspace", exact: true }).click();
    await page.waitForTimeout(500);
  }

  async newSession(page: Page): Promise<void> {
    await page.getByRole("button", { name: "New session", exact: true }).click();
    await page.waitForTimeout(200);
  }

  async send(page: Page, text: string): Promise<void> {
    await page.getByRole("textbox", { name: /Message or run a task|Select a workspace|describe your task/ }).fill(text);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
  }

  // J-E-plan: the plan review card's own buttons ("Request changes" / "Approve") are distinct from
  // the tool-approval card's ("Reject" / "Allow once", see `approve`/`deny` above).
  async approvePlan(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Approve", exact: true }).click();
  }

  async requestPlanChanges(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Request changes", exact: true }).click();
  }

  // J-F-delegation: the session banner's "N subagent(s)" disclosure button.
  async openSubagentPanel(page: Page): Promise<void> {
    await page.getByRole("button", { name: /^\d+ subagents?$/ }).click();
  }

  /** Driver interface name for openSubagentPanel (kept alongside it so tests/capture/cognate.capture.ts, written against the original name, keeps working). */
  async openSubagentList(page: Page): Promise<void> {
    await this.openSubagentPanel(page);
  }

  /**
   * See Driver.prepareApprovalTrigger. Cognate's default tool-loop access
   * mode ("read-only") already ranks below the `[[scenario:approval]]`
   * fixture's requested "workspace-write" (src/domain -- approvalGate), so
   * no preset/mode switch is needed before sending it - a plain `send()`
   * with the marker is already enough (see tests/capture/cognate.capture.ts
   * checkpoint "11-approval-pending", which does exactly this).
   */
  async prepareApprovalTrigger(_page: Page): Promise<void> {
    // no-op by design; see doc comment above.
  }

  /** `/plan ` is a literal command prefix Cognate's composer parses directly - no autocomplete step is needed (unlike the reference's `/plan` -> option-click flow). */
  async sendInPlanMode(page: Page, task: string): Promise<void> {
    await this.send(page, `/plan ${task}`);
  }

  expectations(): Expectations {
    return {
      // cognate/DEVIATIONS.md "Pending approvals survive a full server
      // restart; the reference does not (T8)": continuations are durable
      // SQLite-backed state by construction, a deliberate divergence from
      // the reference's silent-finalize-on-restart behavior.
      approvalSurvivesRestart: true,
      // cognate/DEVIATIONS.md "Provider-error code mapping is text-based,
      // not status-based, by construction": classifyModelFailure maps any
      // non-timeout failure (including the mock's scripted HTTP 500 used by
      // [[scenario:error]]) to "HTTP_500".
      providerErrorCode: "HTTP_500",
    };
  }

  async waitForIdle(page: Page, opts?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const settled = page.getByRole("button", { name: /^Took \d/ });
      const failed = page.getByText(/Failed|Something went wrong/i);
      const stopped = page.getByText(/^Stopped$/);
      if ((await settled.count()) > 0 || (await failed.count()) > 0 || (await stopped.count()) > 0) return;
      await page.waitForTimeout(250);
    }
  }

  async approve(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Allow once", exact: true }).click();
  }

  async deny(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Reject", exact: true }).click();
  }

  /** See ReferenceDriver.openSession's doc comment - same "0 = newest session" convention. */
  async openSession(page: Page, index: number): Promise<void> {
    await this.locators.sessionListItem(page, index).click();
    await page.waitForTimeout(200);
  }

  async reload(page: Page): Promise<void> {
    await page.reload({ waitUntil: "load" });
    // A hard reload remounts the whole client, replaying the tenant's full event stream from
    // position 0; every event dispatched triggers a refetch of *every* projection store
    // (`Engine.dispatch` in packages/client). On a session with many recorded turns/retries this can
    // burst dozens of overlapping `ReadProjection` calls, and `ProjectionStore.refresh()`'s
    // generation guard discards any response that resolves after a newer request has already been
    // issued — so a store's value can stay `undefined` well past a short fixed wait while that replay
    // burst is still in flight. A long-lived SSE connection (`follow: true`) means `networkidle`
    // never fires, so wait out a generous flat window instead — long enough for a session with dozens
    // of recorded events to fully settle (the last-issued refresh's generation only wins once no
    // further events are still arriving).
    await page.waitForTimeout(3000);
  }

  async restart(page: Page, options: LaunchOptions): Promise<void> {
    await this.stop();
    // See ReferenceDriver.restart's doc comment - a SIGKILL'd listener needs a moment to release
    // its port before relaunching on the same one.
    await new Promise((r) => setTimeout(r, 1000));
    await this.launch(options);
    void page;
  }

  locators = {
    composer: (page: Page) => page.getByRole("textbox", { name: /Message or run a task|Select a workspace/ }),
    sendButton: (page: Page) => page.getByRole("button", { name: "Send message", exact: true }),
    sessionList: (page: Page) => page.getByRole("tree", { name: "Sessions" }),
    // treeitem #0 is always the workspace-group header; +1 skips it so index 0 is the newest
    // SESSION (mirrors ReferenceDriver.locators.sessionListItem).
    sessionListItem: (page: Page, index: number) =>
      page.getByRole("tree", { name: "Sessions" }).getByRole("treeitem").nth(index + 1),
    toolCard: (page: Page, index = 0) => page.locator('[data-tool-card]').nth(index),
    approvalPanel: (page: Page) => page.locator('[data-approval-panel]').first(),
    approveButton: (page: Page) => page.getByRole("button", { name: /^Allow/i }).first(),
    denyButton: (page: Page) => page.getByRole("button", { name: /^Deny|^Reject/i }).first(),
    planPanel: (page: Page) => page.locator('[data-plan-panel]').first(),
    subagentCard: (page: Page) => page.locator('[data-subagent-card]').first(),
    themeToggle: (page: Page) => page.getByRole("button", { name: /theme/i }).first(),
    stopButton: (page: Page) => page.getByRole("button", { name: "Stop generating", exact: true }),
    retryButton: (page: Page) => page.getByRole("button", { name: /retry/i }).first(),
    errorBanner: (page: Page) => page.locator('[role="alert"]').first(),
  };
}
