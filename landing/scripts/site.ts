// Serve the built landing page in the background: `bun scripts/site.ts up|down|status [--port N] [--no-build]`.
// `up` picks the first free port at or above the requested one, so it never collides with another server.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const stateDir = join(root, ".site");
const stateFile = join(stateDir, "server.json");
const logFile = join(stateDir, "server.log");

type State = { pid: number; port: number; url: string };

const [command = "status", ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.includes(name);
const option = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

function readState(): State | undefined {
  try {
    return JSON.parse(readFileSync(stateFile, "utf8")) as State;
  } catch {
    return undefined;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });
}

async function freePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port++) if (await portFree(port)) return port;
  throw new Error(`no free port in ${start}-${start + 99}`);
}

async function waitForHttp(url: string, ms = 20_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {}
    await Bun.sleep(200);
  }
  return false;
}

async function up() {
  const running = readState();
  if (running && alive(running.pid)) {
    console.log(`landing already running at ${running.url} (pid ${running.pid})`);
    return;
  }
  if (!flag("--no-build")) {
    const build = Bun.spawnSync(["bun", "run", "build"], { cwd: root, stdout: "inherit", stderr: "inherit" });
    if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
  }
  const requested = Number(option("--port") ?? process.env.SITE_PORT ?? 4321);
  const port = await freePort(requested);
  if (port !== requested) console.log(`port ${requested} is in use; using ${port}`);

  mkdirSync(stateDir, { recursive: true });
  const log = openSync(logFile, "w");
  const child = spawn(
    process.execPath,
    [join(root, "scripts", "serve.ts"), "--port", String(port)],
    { cwd: root, detached: true, stdio: ["ignore", log, log] },
  );
  child.unref();
  const url = `http://127.0.0.1:${port}/`;
  writeFileSync(stateFile, JSON.stringify({ pid: child.pid!, port, url } satisfies State));

  if (!(await waitForHttp(url))) {
    console.error(`landing did not start; see ${logFile}`);
    await down();
    process.exit(1);
  }
  console.log(`landing running at ${url} (pid ${child.pid}); stop with \`just site-down\``);
}

async function down() {
  const state = readState();
  if (!state) {
    console.log("landing is not running");
    return;
  }
  if (alive(state.pid)) {
    try {
      process.kill(-state.pid, "SIGTERM"); // whole process group (astro may fork)
    } catch {
      process.kill(state.pid, "SIGTERM");
    }
  }
  rmSync(stateFile, { force: true });
  console.log(`landing stopped (was ${state.url})`);
}

function status() {
  const state = readState();
  if (state && alive(state.pid)) console.log(`landing running at ${state.url} (pid ${state.pid})`);
  else {
    if (state && existsSync(stateFile)) rmSync(stateFile, { force: true });
    console.log("landing is not running");
  }
}

if (command === "up") await up();
else if (command === "down") await down();
else if (command === "status") status();
else {
  console.error("usage: bun scripts/site.ts up|down|status [--port N] [--no-build]");
  process.exit(2);
}
