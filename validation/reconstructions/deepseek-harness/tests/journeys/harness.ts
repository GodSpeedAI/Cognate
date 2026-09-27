// Shared journey-suite plumbing (T13/Phase 6): system selection, isolation
// (fresh home dir + fresh workspace + own mock-model port per journey), and
// small polling/evidence helpers used by every journeys/*.spec.ts file.
//
// Every journey spec is parameterized by env SYSTEM=reference|cognate and
// otherwise talks only to the Driver interface (tests/drivers/types.ts) -
// see reference.ts/cognate.ts for where system-specific mechanics live.
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import type { Page, TestInfo } from "@playwright/test";
import { ReferenceDriver } from "../drivers/reference";
import { CognateDriver } from "../drivers/cognate";
import type { Driver, LaunchOptions } from "../drivers/types";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RECON_ROOT = join(HERE, "..", "..");
const REF_CLONE = join(RECON_ROOT, "..", "..", "..", ".tmp", "ref", "deepseek-harness");

// Playwright's test workers run under plain Node even when the CLI itself was
// invoked via `bun x playwright test`, so anything that uses Bun-only globals
// (`Bun.serve`, `Bun.spawn`) - the mock-model server and the workspace fixture
// script - must run as an actual `bun <file>` child process, not an in-process
// import, from here.
function runBunScript(scriptPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    proc.stderr?.on("data", (c) => (err += c.toString()));
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${scriptPath} exited ${code}: ${err}`))));
    proc.on("error", reject);
  });
}

async function makeWorkspace(targetDir: string): Promise<void> {
  await runBunScript(join(RECON_ROOT, "fixtures", "workspace", "make-workspace.ts"), [targetDir]);
}

interface MockModelHandle {
  port: number;
  stop(): void;
}

function startMockModel(port: number): Promise<MockModelHandle> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn("bun", [join(RECON_ROOT, "fixtures", "mock-model", "server.ts"), `--port=${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // see ReferenceDriver.launch's doc comment on detached process groups
    });
    let buf = "";
    const stop = () => {
      if (proc.killed || !proc.pid) return;
      try {
        process.kill(-proc.pid, "SIGKILL");
      } catch {
        proc.kill("SIGKILL");
      }
    };
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      if (/listening on/.test(buf)) {
        proc.stdout?.off("data", onData);
        resolve({ port, stop });
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", (c) => (buf += c.toString()));
    proc.on("exit", (code) => { if (!buf.includes("listening on")) reject(new Error(`mock-model exited ${code}: ${buf}`)); });
    setTimeout(() => reject(new Error(`mock-model did not start within 10s: ${buf}`)), 10_000);
  });
}

export type SystemName = "reference" | "cognate";

export function currentSystem(): SystemName {
  const s = process.env.SYSTEM;
  if (s !== "reference" && s !== "cognate") {
    throw new Error(`SYSTEM env var must be "reference" or "cognate" (got: ${JSON.stringify(s)})`);
  }
  return s;
}

export function makeDriver(system: SystemName): Driver {
  return system === "reference" ? new ReferenceDriver(REF_CLONE) : new CognateDriver();
}

// A monotonically increasing base avoids two journeys in the same worker
// process racing the same port before the previous server has fully closed;
// workers:1 (playwright.config.ts) means journeys never run concurrently,
// but the OS can still hold a just-closed port in TIME_WAIT briefly.
// Deliberately kept in the same low 41000s range this suite has always
// used (NOT a wide/high range like 45000+): this dev environment's sandbox
// appears to only permit binding a specific pre-approved port range, and
// anything picked outside it fails bind with EADDRINUSE-shaped errors that
// look like a port conflict but are actually a network-sandbox rejection.
// Orphaned processes from an ABORTED run (e.g. a `bash timeout` that killed
// this process without giving child processes a chance to exit - Node does
// not forward SIGTERM to grandchildren) must instead be cleaned up by hand
// (`pkill -f 'dsh web'`, `pkill -f mock-model/server.ts`) rather than dodged
// by moving to a different port range.
let nextPort = 41000 + (process.pid % 500) * 4;
export function allocatePorts(count: number): number[] {
  const start = nextPort;
  nextPort += count * 2;
  return Array.from({ length: count }, (_, i) => start + i * 2);
}

export interface JourneyEnv {
  system: SystemName;
  driver: Driver;
  homeDir: string;
  workspaceDir: string;
  mockModelPort: number;
  mockModelBaseUrl: string;
  appPort: number;
  mockModelServer: MockModelHandle;
  launchOptions: LaunchOptions;
}

/** Fresh home dir, fresh workspace, own mock-model port. Call once per test. */
export async function setupJourney(journeyId: string, opts?: { retryBackoffMs?: number }): Promise<JourneyEnv> {
  const system = currentSystem();
  const driver = makeDriver(system);
  const runDir = mkdtempSync(join(tmpdir(), `dsh-journey-${journeyId}-${system}-`));
  const homeDir = join(runDir, "home");
  const workspaceDir = join(runDir, "workspace");
  mkdirSync(homeDir, { recursive: true });
  await makeWorkspace(workspaceDir);

  const [mockModelPort, appPort] = allocatePorts(2);
  const mockModelServer = await startMockModel(mockModelPort);
  const mockModelBaseUrl = `http://127.0.0.1:${mockModelPort}/v1`;

  const env: Record<string, string> = {};
  if (opts?.retryBackoffMs !== undefined) env.MODEL_RETRY_BACKOFF_MS = String(opts.retryBackoffMs);

  const launchOptions: LaunchOptions = { homeDir, port: appPort, mockModelBaseUrl, env };
  try {
    await driver.launch(launchOptions);
  } catch (err) {
    // Don't leak the mock-model process if the app itself fails to start (observed: a couple of
    // orphaned mock-model processes survived a run with retried/flaky tests otherwise).
    mockModelServer.stop();
    throw err;
  }

  return { system, driver, homeDir, workspaceDir, mockModelPort, mockModelBaseUrl, appPort, mockModelServer, launchOptions };
}

export async function teardownJourney(env: JourneyEnv): Promise<void> {
  await env.driver.stop().catch(() => {});
  env.mockModelServer.stop();
}

/** Full onboarding through "workspace selected, composer ready": authenticate, configure the mock model, choose the workspace. Idempotent per fresh home dir. */
export async function bootToReadyComposer(page: Page, env: JourneyEnv): Promise<void> {
  await env.driver.authenticate(page);
  await env.driver.openSettingsModels(page);
  await env.driver.configureModel(page, { baseUrl: env.mockModelBaseUrl, apiKey: "dummy-key-12345", protocol: "openai-completions" });
  const closeSettings = page.getByRole("button", { name: /^Close(?: settings)?$/, exact: false });
  if ((await closeSettings.count()) > 0) await closeSettings.first().click().catch(() => {});
  await page.waitForTimeout(200);
  await env.driver.chooseWorkspace(page, env.workspaceDir);
}

/** Poll `check` up to `timeoutMs`, resolving true as soon as it does, false on timeout. */
export async function waitUntil(check: () => Promise<boolean>, timeoutMs: number, stepMs = 200): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}

/** Save a labeled evidence screenshot under test-results (Playwright attaches it to the report) and return its path. */
export async function evidence(page: Page, testInfo: TestInfo, label: string): Promise<string> {
  const path = testInfo.outputPath(`${label}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  await testInfo.attach(label, { path, contentType: "image/png" }).catch(() => {});
  return path;
}
