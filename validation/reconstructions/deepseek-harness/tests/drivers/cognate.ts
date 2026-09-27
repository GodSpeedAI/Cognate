import type { Locator, Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Driver, LaunchOptions } from "./types";

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
        env: { ...process.env, COGNATE_HARNESS_HOME: options.homeDir, PORT: String(options.port) },
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
    if (this.proc && !this.proc.killed) this.proc.kill("SIGKILL");
    this.proc = null;
  }

  async authenticate(page: Page): Promise<void> {
    if (!this.baseUrl) throw new Error("launch() must be called before authenticate()");
    await page.goto(this.baseUrl, { waitUntil: "load" });
    await page.waitForTimeout(500);
  }

  async openSettingsModels(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.waitForTimeout(200);
  }

  async configureModel(
    page: Page,
    config: { baseUrl: string; apiKey: string; protocol: "openai-completions" },
  ): Promise<void> {
    // Settings -> Models must already be open (call openSettingsModels first).
    await page.getByLabel("Base URL").fill(config.baseUrl);
    await page.getByLabel("Model").fill("mock-model-1");
    await page.getByLabel("API key").fill(config.apiKey);
    await page.getByRole("button", { name: "Save", exact: true }).click();
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

  async openSession(page: Page, index: number): Promise<void> {
    const items = page.getByRole("treeitem", { selected: undefined }).filter({ hasText: /.+/ });
    // Session rows are the treeitem buttons inside .session-rows; workspace header rows are also
    // role=treeitem, so restrict to buttons.
    const rows = page.locator(".session-row");
    await rows.nth(index).click();
    await page.waitForTimeout(200);
    void items;
  }

  async reload(page: Page): Promise<void> {
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(500);
  }

  async restart(page: Page, options: LaunchOptions): Promise<void> {
    await this.stop();
    await this.launch(options);
    void page;
  }

  locators = {
    composer: (page: Page) => page.getByRole("textbox", { name: /Message or run a task|Select a workspace/ }),
    sendButton: (page: Page) => page.getByRole("button", { name: "Send message", exact: true }),
    sessionList: (page: Page) => page.getByRole("tree", { name: "Sessions" }),
    sessionListItem: (page: Page, index: number) => page.locator(".session-row").nth(index),
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
