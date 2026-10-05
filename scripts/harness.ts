#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const HARNESS_DIR = join(REPO_ROOT, "validation", "reconstructions", "deepseek-harness");
const COGNATE_APP_DIR = join(HARNESS_DIR, "cognate");
const AIMOCK_FIXTURES = join(HARNESS_DIR, "fixtures", "aimock", "fixtures.json");
const WORKSPACE_SCRIPT = join(HARNESS_DIR, "fixtures", "workspace", "make-workspace.ts");
const APP_SERVER_SCRIPT = join(COGNATE_APP_DIR, "src", "server.ts");

/** The `llmock` bin (`@copilotkit/aimock`), a devDependency of the app package. */
function resolveLlmockBin(): string {
  const candidates = [
    join(COGNATE_APP_DIR, "node_modules", ".bin", "llmock"),
    join(REPO_ROOT, "node_modules", ".bin", "llmock"),
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return "llmock";
}

const TMP_DIR = join(REPO_ROOT, ".tmp", "harness");
const LOGS_DIR = join(TMP_DIR, "logs");
const STATE_FILE = join(TMP_DIR, "state.json");

interface HarnessState {
  readonly appPid: number;
  readonly mockPid: number;
  readonly appPort: number;
  readonly mockPort: number;
  readonly homeDir: string;
  readonly workspaceDir: string;
  readonly startedAt: string;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getPidsListeningOnPort(port: number): number[] {
  try {
    const res = spawnSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" });
    if (res.status === 0 && res.stdout) {
      return res.stdout
        .trim()
        .split("\n")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    }
  } catch {
    // fallback if lsof fails
  }
  return [];
}

async function waitForUrl(url: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function readState(): HarnessState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw) as HarnessState;
  } catch {
    return null;
  }
}

async function up(args: string[]): Promise<void> {
  const appPort = Number(process.env.PORT ?? 3180);
  const mockPort = Number(process.env.MOCK_MODEL_PORT ?? 4010);
  const homeDir = process.env.COGNATE_HARNESS_HOME ?? "/tmp/cg-home";
  const workspaceDir = process.env.COGNATE_HARNESS_WS ?? "/tmp/cg-ws";
  const freshWs = args.includes("--fresh-ws") || args.includes("--fresh");
  const freshHome = args.includes("--fresh-home") || args.includes("--fresh");

  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true });

  const existingState = readState();
  if (existingState) {
    const appAlive = isPidAlive(existingState.appPid);
    const mockAlive = isPidAlive(existingState.mockPid);
    if (appAlive && mockAlive) {
      console.log("Reconstruction harness is already running:");
      console.log(`  Console Web UI:   http://127.0.0.1:${existingState.appPort}/`);
      console.log(`  Health:           http://127.0.0.1:${existingState.appPort}/health`);
      console.log(`  Mock Model:       http://127.0.0.1:${existingState.mockPort}/v1`);
      console.log(`  Workspace:        ${existingState.workspaceDir}`);
      console.log(`  Harness Home:     ${existingState.homeDir}`);
      return;
    }
    await down();
  }

  // Also clean up any stale processes holding the target ports
  const occupiedAppPids = getPidsListeningOnPort(appPort);
  const occupiedMockPids = getPidsListeningOnPort(mockPort);
  for (const pid of [...occupiedAppPids, ...occupiedMockPids]) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  if (occupiedAppPids.length > 0 || occupiedMockPids.length > 0) {
    await new Promise((r) => setTimeout(r, 500));
  }

  if (freshHome && existsSync(homeDir)) {
    console.log(`[harness] Cleaning home directory: ${homeDir}`);
    rmSync(homeDir, { recursive: true, force: true });
  }
  mkdirSync(homeDir, { recursive: true });

  // Workspace setup
  if (!existsSync(workspaceDir) || freshWs) {
    console.log(`[harness] Initializing fixture workspace at ${workspaceDir}...`);
    const wsRes = spawnSync("bun", [WORKSPACE_SCRIPT, workspaceDir], {
      cwd: HARNESS_DIR,
      encoding: "utf8",
    });
    if (wsRes.status !== 0) {
      console.error(`[harness] Failed to initialize workspace: ${wsRes.stderr}`);
      process.exit(1);
    }
  } else {
    console.log(`[harness] Reusing existing workspace at ${workspaceDir}`);
  }

  const mockLogPath = join(LOGS_DIR, "aimock.log");
  const appLogPath = join(LOGS_DIR, "app.log");

  const mockLogFd = openSync(mockLogPath, "w");
  const appLogFd = openSync(appLogPath, "w");

  console.log(`[harness] Starting aimock (llmock) mock model on port ${mockPort}...`);
  const mockProc = spawn(resolveLlmockBin(), ["-f", AIMOCK_FIXTURES, "-p", String(mockPort)], {
    cwd: HARNESS_DIR,
    detached: true,
    stdio: ["ignore", mockLogFd, mockLogFd],
    env: { ...process.env },
  });
  mockProc.unref();
  closeSync(mockLogFd);

  const mockPid = mockProc.pid;
  if (!mockPid) {
    console.error("[harness] Failed to spawn mock model process.");
    process.exit(1);
  }

  console.log(`[harness] Starting Cognate Console app on port ${appPort}...`);
  const appProc = spawn("bun", [APP_SERVER_SCRIPT], {
    cwd: COGNATE_APP_DIR,
    detached: true,
    stdio: ["ignore", appLogFd, appLogFd],
    env: {
      ...process.env,
      PORT: String(appPort),
      COGNATE_HARNESS_HOME: homeDir,
    },
  });
  appProc.unref();
  closeSync(appLogFd);

  const appPid = appProc.pid;
  if (!appPid) {
    console.error("[harness] Failed to spawn app process.");
    try {
      process.kill(mockPid, "SIGTERM");
    } catch {}
    process.exit(1);
  }

  const state: HarnessState = {
    appPid,
    mockPid,
    appPort,
    mockPort,
    homeDir,
    workspaceDir,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");

  console.log("[harness] Waiting for services to become ready...");
  const [mockReady, appReady] = await Promise.all([
    waitForUrl(`http://127.0.0.1:${mockPort}/v1/models`, 15000),
    waitForUrl(`http://127.0.0.1:${appPort}/health`, 20000),
  ]);

  if (!mockReady || !appReady) {
    console.error("[harness] Service health check timed out!");
    if (!mockReady) {
      console.error(`  - Mock model failed to respond at http://127.0.0.1:${mockPort}/v1/models`);
      if (existsSync(mockLogPath)) {
        console.error("    Tail of aimock.log:\n" + readFileSync(mockLogPath, "utf8").slice(-1000));
      }
    }
    if (!appReady) {
      console.error(`  - Cognate Console failed to respond at http://127.0.0.1:${appPort}/health`);
      if (existsSync(appLogPath)) {
        console.error("    Tail of app.log:\n" + readFileSync(appLogPath, "utf8").slice(-1000));
      }
    }
    await down();
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log(" Cognate Reconstruction Harness is UP and READY");
  console.log("=======================================================");
  console.log(`  Console Web UI:   http://127.0.0.1:${appPort}/`);
  console.log(`  Health:           http://127.0.0.1:${appPort}/health`);
  console.log(`  Mock Model:       http://127.0.0.1:${mockPort}/v1`);
  console.log(`  Workspace Dir:    ${workspaceDir}`);
  console.log(`  Harness Home:     ${homeDir}`);
  console.log(`  Logs:             ${LOGS_DIR}`);
  console.log("-------------------------------------------------------");
  console.log(" To tear down when done:");
  console.log("   just harness-down");
  console.log("=======================================================\n");
}

async function down(): Promise<void> {
  const state = readState();
  let stoppedAny = false;

  if (state) {
    for (const [name, pid] of [["Cognate Console", state.appPid], ["Mock Model", state.mockPid]] as const) {
      if (isPidAlive(pid)) {
        console.log(`[harness] Stopping ${name} (PID ${pid})...`);
        try {
          process.kill(pid, "SIGTERM");
          stoppedAny = true;
        } catch {}
      }
    }

    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (!isPidAlive(state.appPid) && !isPidAlive(state.mockPid)) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    if (isPidAlive(state.appPid)) {
      try { process.kill(state.appPid, "SIGKILL"); } catch {}
    }
    if (isPidAlive(state.mockPid)) {
      try { process.kill(state.mockPid, "SIGKILL"); } catch {}
    }

    const remainingAppPids = getPidsListeningOnPort(state.appPort);
    const remainingMockPids = getPidsListeningOnPort(state.mockPort);
    for (const pid of [...remainingAppPids, ...remainingMockPids]) {
      try { process.kill(pid, "SIGKILL"); stoppedAny = true; } catch {}
    }

    if (existsSync(STATE_FILE)) {
      rmSync(STATE_FILE, { force: true });
    }
  } else {
    const appPids = getPidsListeningOnPort(3180);
    const mockPids = getPidsListeningOnPort(4010);
    for (const pid of [...appPids, ...mockPids]) {
      try {
        console.log(`[harness] Killing process ${pid} holding port 3180/4010...`);
        process.kill(pid, "SIGTERM");
        stoppedAny = true;
      } catch {}
    }
  }

  if (stoppedAny) {
    console.log("[harness] Cognate reconstruction harness stopped successfully.");
  } else {
    console.log("[harness] No running harness was found.");
  }
}

async function status(): Promise<void> {
  const state = readState();
  if (!state) {
    console.log("[harness] Status: NOT RUNNING (no state file).");
    return;
  }
  const appAlive = isPidAlive(state.appPid);
  const mockAlive = isPidAlive(state.mockPid);
  console.log("[harness] Status:");
  console.log(`  Cognate Console: ${appAlive ? `RUNNING (PID ${state.appPid})` : "STOPPED"} on port ${state.appPort}`);
  console.log(`  Mock Model:      ${mockAlive ? `RUNNING (PID ${state.mockPid})` : "STOPPED"} on port ${state.mockPort}`);
  console.log(`  Workspace:       ${state.workspaceDir}`);
  console.log(`  Home:            ${state.homeDir}`);
}

const command = process.argv[2];
const extraArgs = process.argv.slice(3);

if (command === "up") {
  await up(extraArgs);
} else if (command === "down") {
  await down();
} else if (command === "status") {
  await status();
} else {
  console.error("Usage: bun scripts/harness.ts <up|down|status> [options]");
  process.exit(1);
}
