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
const COPILOT_DIR = join(REPO_ROOT, "validation", "reconstructions", "copilot");
const COGNATE_APP_DIR = join(COPILOT_DIR, "cognate");
const SERVER_SCRIPT = join(COGNATE_APP_DIR, "src", "server.ts");

const TMP_DIR = join(REPO_ROOT, ".tmp", "copilot-cognate");
const LOGS_DIR = join(TMP_DIR, "logs");
const STATE_FILE = join(TMP_DIR, "state.json");

interface CopilotState {
  readonly serverPid: number;
  readonly port: number;
  readonly homeDir: string;
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
    // fallback if lsof unavailable
  }
  return [];
}

async function waitForUrl(url: string, timeoutMs = 25000): Promise<boolean> {
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

function readState(): CopilotState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw) as CopilotState;
  } catch {
    return null;
  }
}

async function up(args: string[]): Promise<void> {
  const port = Number(process.env.PORT ?? 3190);
  const homeDir = process.env.COGNATE_COPILOT_HOME ?? join(TMP_DIR, "data");
  const freshHome = args.includes("--fresh-home") || args.includes("--fresh");

  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true });

  const existingState = readState();
  if (existingState) {
    const alive = isPidAlive(existingState.serverPid);
    if (alive) {
      console.log("Cognate Copilot reconstruction app is already running:");
      console.log(`  Console Web UI:   http://127.0.0.1:${existingState.port}/`);
      console.log(`  Health:           http://127.0.0.1:${existingState.port}/health`);
      console.log(`  AG-UI SSE:        http://127.0.0.1:${existingState.port}/agui`);
      console.log(`  Connect Service:  http://127.0.0.1:${existingState.port}/cognate.v1.RuntimeService/`);
      console.log(`  Data Directory:   ${existingState.homeDir}`);
      return;
    }
    await down();
  }

  // Clean up any stale processes holding target port
  const occupiedPids = getPidsListeningOnPort(port);
  for (const pid of occupiedPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  if (occupiedPids.length > 0) {
    await new Promise((r) => setTimeout(r, 500));
  }

  if (freshHome && existsSync(homeDir)) {
    console.log(`[copilot-cognate] Cleaning data directory: ${homeDir}`);
    rmSync(homeDir, { recursive: true, force: true });
  }
  mkdirSync(homeDir, { recursive: true });

  const serverLogPath = join(LOGS_DIR, "server.log");
  const serverLogFd = openSync(serverLogPath, "w");

  console.log(`[copilot-cognate] Starting Cognate Copilot server on port ${port}...`);

  const serverProc = spawn("bun", [SERVER_SCRIPT], {
    cwd: COGNATE_APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      COGNATE_HARNESS_HOME: homeDir,
    },
    stdio: ["ignore", serverLogFd, serverLogFd],
    detached: true,
  });

  const serverPid = serverProc.pid;
  if (!serverPid) {
    closeSync(serverLogFd);
    console.error("[copilot-cognate] Failed to spawn server process");
    process.exit(1);
  }
  serverProc.unref();
  closeSync(serverLogFd);

  console.log(`[copilot-cognate] Waiting for server health endpoint at http://127.0.0.1:${port}/health...`);
  const ready = await waitForUrl(`http://127.0.0.1:${port}/health`, 25000);

  if (!ready) {
    console.error("[copilot-cognate] Server failed to become healthy within 25 seconds.");
    if (existsSync(serverLogPath)) {
      console.error("[copilot-cognate] Server log excerpt:");
      const logContent = readFileSync(serverLogPath, "utf8");
      console.error(logContent.split("\n").slice(-30).join("\n"));
    }
    try {
      process.kill(serverPid, "SIGTERM");
    } catch {}
    process.exit(1);
  }

  const state: CopilotState = {
    serverPid,
    port,
    homeDir,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");

  console.log("\n=======================================================");
  console.log(" Cognate Copilot Reconstruction App is UP and READY");
  console.log("=======================================================");
  console.log(`  Console Web UI:    http://127.0.0.1:${port}/`);
  console.log(`  Health Endpoint:   http://127.0.0.1:${port}/health`);
  console.log(`  AG-UI SSE Stream:  http://127.0.0.1:${port}/agui`);
  console.log(`  Connect Service:   http://127.0.0.1:${port}/cognate.v1.RuntimeService/`);
  console.log(`  Log File:          ${serverLogPath}`);
  console.log("-------------------------------------------------------");
  console.log(" To tear down when done:");
  console.log("   just copilot-down");
  console.log("=======================================================\n");
}

async function down(): Promise<void> {
  const state = readState();
  const port = state?.port ?? Number(process.env.PORT ?? 3190);

  console.log("[copilot-cognate] Tearing down Cognate Copilot reconstruction app...");

  if (state && isPidAlive(state.serverPid)) {
    try {
      process.kill(state.serverPid, "SIGTERM");
    } catch {}
  }

  const remaining = getPidsListeningOnPort(port);
  for (const pid of remaining) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  // Wait for port to free
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (getPidsListeningOnPort(port).length === 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Force kill if lingering
  const lingering = getPidsListeningOnPort(port);
  for (const pid of lingering) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }

  if (existsSync(STATE_FILE)) {
    try {
      rmSync(STATE_FILE);
    } catch {}
  }

  console.log("[copilot-cognate] Cognate Copilot reconstruction app stopped successfully.");
}

async function status(): Promise<void> {
  const state = readState();
  const port = state?.port ?? Number(process.env.PORT ?? 3190);
  const pids = getPidsListeningOnPort(port);
  const alive = state ? isPidAlive(state.serverPid) : false;

  console.log("[copilot-cognate] Service status:");
  console.log(`  Port :${port}: ${pids.length > 0 ? `LISTENING (PID ${pids.join(", ")})` : "FREE"}`);
  console.log(`  Server process: ${alive ? `RUNNING (PID ${state!.serverPid})` : "STOPPED"}`);
  if (state) {
    console.log(`  Started: ${state.startedAt}`);
    console.log(`  Data:    ${state.homeDir}`);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "up":
    case "boot":
    case "start":
      await up(args);
      break;
    case "down":
    case "stop":
      await down();
      break;
    case "status":
      await status();
      break;
    default:
      console.error("Usage: bun scripts/copilot.ts <up|down|status>");
      process.exit(1);
  }
}

await main();
