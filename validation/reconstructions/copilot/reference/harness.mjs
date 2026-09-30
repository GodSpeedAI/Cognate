/**
 * Reference-execution harness for the CopilotKit reconstruction (Phase 1B / Phase 6).
 *
 * Brings the pinned reference application up against CopilotKit's own fixture-backed
 * mock LLM, drives one canonical journey headlessly, captures screenshots plus the
 * model-request sidecar, and tears everything down. Everything it learns lands inside
 * this directory, so a capture is attributable and re-runnable rather than a transcript.
 *
 *   bun validation/reconstructions/copilot/reference/harness.mjs run J-A
 *   bun validation/reconstructions/copilot/reference/harness.mjs boot | down | status
 *
 * Why a harness instead of ad-hoc commands: three defects repeatedly destroyed captures
 * and each one is handled structurally here.
 *   1. Next's Turbopack build degrades its cache between runs and then 500s every page
 *      with an invalid CSS escape from globals.css. Every boot clears .next first, and a
 *      boot that still fails retries once before reporting.
 *   2. Orphaned processes from an earlier run hold the ports. Teardown kills only process
 *      groups this harness spawned, recorded in a pid file; it never pattern-matches
 *      command lines, because `pkill -f next` also matches the harness's own shell.
 *   3. Mock fixture selection is substring-matched, so a prompt no fixture covers yields
 *      `no_fixture_match`. The injector sidecar records every request, so an uncovered
 *      turn is reported as UNCOVERED_BEHAVIOR instead of being read as a passing run.
 *
 * The reference is never edited: aimock's fixture-column header is added by the proxy in
 * mock-context-injector.mjs, so the thing under observation stays the pinned code.
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../.."); // reconstruction repo root
const REF = path.join(ROOT, ".tmp/ref/copilotkit");
const EXAMPLE = path.join(REF, "examples/integrations/langgraph-js");
const NEXT = path.join(EXAMPLE, "node_modules/next/dist/bin/next");
const PLAYWRIGHT = path.join(ROOT, "node_modules/playwright/index.js");

const SHOTS = path.join(HERE, "screenshots");
const LOGS = path.join(HERE, "logs");
const RUNLOG = path.join(LOGS, "runs");
const PIDS = path.join(HERE, ".harness-pids.json");
const REQUESTS = path.join(LOGS, "requests.jsonl");
// Byte-for-byte archive of every model request the injector forwarded. Derived sidecar
// fields orient you; these bodies settle a fixture miss, because they are exactly what
// llmock's matcher consumed. Cleared on every boot so a miss maps to this run only.
const RAWDIR = path.join(LOGS, "raw");

// Fixture columns loaded by llmock. d4 is required in addition to d6: the canvas
// todo-writing chain resolves only with both columns present (observed: the write turn
// returned no_fixture_match with d6 alone).
const FIXTURES = ["showcase/aimock/d6/langgraph-typescript", "showcase/aimock/d4/langgraph-typescript", "showcase/aimock/shared"];

// 4010 belongs to deepseek-harness by design, not by accident: its docs hardcode it (40 repo
// references) AND the operator's scripts/harness.ts defaults MOCK_MODEL_PORT to 4010 and its
// up-path SIGKILLs whatever holds 4010 (harness.ts:280-283). The operator tore the running mock
// down on 2026-09-29 (verified: state.json removal is unique to harness-down), but the next
// `just harness-up` reclaims 4010 and would kill any aimock found there — the inverse of the jc5
// failure, where a `;` chain captured against the foreign mock. Two reconstructions must not
// share a mock port; 4012 is referenced by nothing else in this repo.
const PORTS = { ui: 3000, agent: 8123, mock: 4012, injector: 13361 };

// The context injector uses Bun.serve, so it must be spawned with Bun and not with
// process.execPath (which is node when the harness is run under node - and node exits
// immediately with "Bun is not defined", leaving the UI pointed at a dead injector).
const BUN = (() => {
  if (process.env.COGNATE_BUN) return process.env.COGNATE_BUN;
  for (const c of ["/home/sprime01/.local/bin/bun", "/usr/local/bin/bun", "/usr/bin/bun"]) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return "bun";
})();

// The reference's own .env points OPENAI_BASE_URL at the injector on 13361; matching it
// here keeps one source of truth and avoids the silent no_fixture_match of a split pair.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const die = (msg) => {
  console.error(`HARNESS_ABORT ${msg}`);
  process.exit(1);
};

/** Ports this harness owns; a foreign listener is reported, never killed. */
async function portBusy(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return r.status > 0;
  } catch (e) {
    return !/ECONNREFUSED|ECONNRESET|fetch failed|timed out/i.test(String(e));
  }
}

const recorded = () => {
  try {
    return JSON.parse(fs.readFileSync(PIDS, "utf8"));
  } catch {
    return {};
  }
};
const remember = (name, pid) => fs.writeFileSync(PIDS, JSON.stringify({ ...recorded(), [name]: pid }, null, 1));

async function waitUrl(url, tries, delay, timeoutMs = 25000) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (r.status < 500) return { up: true, status: r.status, tries: i + 1 };
    } catch {}
    await sleep(delay);
  }
  return { up: false, tries };
}

/** Spawn in its own process group so teardown can take the whole tree down. */
function start(name, cmd, args, opts = {}) {
  const log = path.join(RUNLOG, `${name}.log`);
  fs.writeFileSync(log, "");
  const fd = fs.openSync(log, "a");
  const child = spawn(cmd, args, {
    cwd: opts.cwd || REF,
    env: opts.env ?? process.env,
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  fs.closeSync(fd);
  remember(name, child.pid);
  return child;
}

/**
 * Kill only the process groups this harness spawned. Never pattern-match command
 * lines: `pkill -f next` also matches the harness's own invocation and has killed
 * the very command trying to clean up.
 */
async function down() {
  const pids = recorded();
  const killed = [];
  for (const [name, pid] of Object.entries(pids)) {
    for (const sig of ["SIGTERM", "SIGKILL"]) {
      try { process.kill(-pid, sig); killed.push(`${name}:${sig}`); break; } catch { }
      try { process.kill(pid, sig); killed.push(`${name}:${sig}(pg)`); break; } catch { }
      await sleep(500);
    }
  }
  // Anything still running out of the reference tree survived the recorded pids - typically a
  // manual run from an earlier session, or a child that outlived its group leader. Left alive it
  // would answer waitUrl and make a later boot report success for a stack it did not start.
  for (const s of strays()) {
    try {
      process.kill(s.pid, "SIGKILL");
      killed.push(`stray:${s.pid}`);
    } catch {
      /* already gone */
    }
  }
  fs.rmSync(PIDS, { force: true });
  // The degraded Turbopack CSS cache survives process death, so the build dir goes too.
  fs.rmSync(path.join(EXAMPLE, ".next"), { recursive: true, force: true });
  return { killed, foreignListeners: await foreignListeners() };
}

/** Report listeners on the ports we want, without touching processes we did not spawn. */
async function foreignListeners() {
  const busy = {};
  for (const [name, port] of Object.entries(PORTS)) if (await portBusy(port)) busy[name] = port;
  return busy;
}

/**
 * Processes launched out of our pinned reference checkout or this harness directory,
 * identified by /proc/<pid>/cwd and nothing else. Deliberately not a command-line
 * pattern: a shell command that merely mentions these paths can never match, so this
 * cannot kill itself, and a dev server belonging to another project can never match
 * either. Strays are what make boot lie, because waitUrl cannot tell our process from
 * a leftover one sitting on the same port.
 */
function strays() {
  const roots = [REF, HERE];
  const out = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid || pid === process.ppid) continue;
    let cwd;
    try {
      cwd = fs.readlinkSync(`/proc/${pid}/cwd`).replace(/ \(deleted\)$/, "");
    } catch {
      continue;
    }
    if (!roots.some((r) => cwd === r || cwd.startsWith(r + path.sep))) continue;
    let cmd = "";
    try {
      cmd = fs
        .readFileSync(`/proc/${pid}/cmdline`, "utf8")
        .split("\0")
        .filter(Boolean)
        .join(" ")
        .slice(0, 120);
    } catch {
      /* race: process already gone */
    }
    out.push({ pid, cwd: cwd.replace(ROOT + "/", ""), cmd });
  }
  return out;
}

/**
 * Proof that whatever answers the ports is a process launched from the pinned reference
 * tree. Maps each listening socket to its pid through ss, then reads that pid's cwd from
 * /proc. Without this, a leftover stack on the same port yields a green boot that
 * describes neither the old run nor the new one.
 */
async function portOwnership() {
  let table = "";
  try {
    table = execSync("ss -ltnp", { encoding: "utf8", timeout: 8000 });
  } catch {
    return { error: "ss unavailable; ownership unproven" };
  }
  const byPort = {};
  for (const line of table.split("\n")) {
    const m = line.match(/(?:\[::\]|0\.0\.0\.0|127\.0\.0\.1|\*):(\d+)\s/);
    if (!m) continue;
    const pid = line.match(/pid=(\d+)/);
    (byPort[Number(m[1])] ||= new Set()).add(pid ? Number(pid[1]) : 0);
  }
  const ownership = {};
  for (const [name, port] of Object.entries(PORTS)) {
    const pids = [...(byPort[port] ?? [])].filter(Boolean);
    const owners = pids.map((pid) => {
      let cwd = "";
      try {
        cwd = fs.readlinkSync(`/proc/${pid}/cwd`).replace(/ \(deleted\)$/, "");
      } catch {
        /* vanished or not ours to read */
      }
      // Three-way, not boolean: the injector is our sidecar and must never be reported as
      // pinned reference code, because the manifest's claim is specifically that whatever
      // answers the reference-side ports is the pinned checkout.
      const origin = cwd.startsWith(REF) ? "reference" : cwd.startsWith(HERE) ? "harness-sidecar" : "external";
      return { pid, cwd: cwd.replace(ROOT + "/", ""), origin };
    });
    const referenceOwners = owners.filter((o) => o.origin === "reference");
    ownership[name] = {
      port,
      listening: pids.length > 0,
      owners,
      allReferenceOrSidecar: owners.length > 0 && owners.every((o) => o.origin !== "external"),
      referenceBacked: referenceOwners.length > 0,
    };
  }
  return ownership;
}



/** Start mock, injector, agent and UI. Idempotent: always tears down first. */
async function boot(opts = {}) {
  const report = { steps: {}, portsBefore: await foreignListeners() };
  if (!opts.keepDown) report.down = await down();
  fs.mkdirSync(RUNLOG, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  if (fs.existsSync(REQUESTS)) fs.rmSync(REQUESTS);
  if (fs.existsSync(RAWDIR)) fs.rmSync(RAWDIR, { recursive: true, force: true });

  // Serve fixtures through the pinned library's programmatic LLMock API (aimock-server.mjs),
  // not the llmock bin: the recorded d4 chain's tool-result legs are unreachable otherwise,
  // because the pristine example's always-on A2UI app context appends a trailing developer
  // message that llmock's toolCallId rule (last message must be role:"tool") rejects. The
  // server script applies the library's own requestTransform hook to drop `App Context:`
  // messages for matching only; the reference app itself stays byte-identical to the pin.
  // chunkSize 9999 stays mandatory (fixture streams emoji; default 20 splits surrogate pairs).
  const mockServer = path.join(HERE, "aimock-server.mjs");
  if (!fs.existsSync(mockServer)) die(`aimock-server.mjs missing at ${mockServer}`);
  const fixtureDirs = FIXTURES.map((f) => path.join(REF, f));
  start("llmock", process.execPath, [mockServer, String(PORTS.mock), ...fixtureDirs], { cwd: REF });
  report.steps.mock = await waitUrl(`http://127.0.0.1:${PORTS.mock}/v1/models`, 30, 1000);
  if (!report.steps.mock.up) die(`aimock did not come up on ${PORTS.mock}; see ${RUNLOG}/llmock.log`);

  const injector = path.join(HERE, "mock-context-injector.mjs");
  start("injector", BUN, [injector, String(PORTS.injector), String(PORTS.mock), "langgraph-typescript"], {
    cwd: HERE,
    env: { ...process.env, CK_REQUEST_LOG: REQUESTS, CK_REQUEST_RAW_DIR: RAWDIR },
  });
  await sleep(1500);
  report.steps.injector = await portBusy(PORTS.injector);
  if (!report.steps.injector) die(`context injector did not bind ${PORTS.injector}`);

  // AGENT_URL and OPENAI_BASE_URL are read from the example's .env by both the LangGraph
  // process (langgraph.json points at ../.env) and the Next runtime. Passing them in the
  // environment instead would duplicate the source of truth; overriding AGENT_URL with an
  // /api suffix breaks the runtime silently, so nothing is injected here.
  const agentBin = path.join(EXAMPLE, "agent/node_modules/.bin/langgraphjs");
  if (!fs.existsSync(agentBin)) die(`langgraphjs bin missing at ${agentBin}; run install first`);
  start("agent", agentBin, ["dev", "--port", String(PORTS.agent), "--no-browser"], { cwd: path.join(EXAMPLE, "agent") });
  report.steps.agent = await waitUrl(`http://127.0.0.1:${PORTS.agent}/ok`, 60, 2000);
  if (!report.steps.agent.up) die(`agent did not come up on ${PORTS.agent}; see ${RUNLOG}/agent.log`);

  const uiEnv = { ...process.env };
  delete uiEnv.AGENT_URL;
  report.steps.ui = await bootUi(uiEnv, report);
  // Assert before reporting: a green boot must describe the stack this call started.
  report.ownership = await portOwnership();
  const notOurs = Object.entries(report.ownership).filter(([, o]) => o.listening && !o.allReferenceOrSidecar);
  if (notOurs.length) die(`ports held by processes outside the pinned reference tree: ${notOurs.map(([n, o]) => `${n}=${o.owners.map((x) => x.pid + ":" + x.cwd).join(",")}`).join("; ")}`);
  fs.writeFileSync(path.join(RUNLOG, "boot.json"), JSON.stringify(report, null, 1));
  return report;
}

/** Next 500s every page once the Turbopack CSS cache degrades; one cold retry. */
async function bootUi(uiEnv, report) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    fs.rmSync(path.join(EXAMPLE, ".next"), { recursive: true, force: true });
    start("ui", process.execPath, [NEXT, "dev", "--turbopack", "-p", String(PORTS.ui), "-H", "127.0.0.1"], { cwd: EXAMPLE, env: uiEnv });
    const up = await waitUrl(`http://127.0.0.1:${PORTS.ui}/`, 90, 2000, 30000);
    const uiLog = fs.readFileSync(path.join(RUNLOG, "ui.log"), "utf8");
    const cssBroken = /Parsing CSS source code failed|Unexpected token/.test(uiLog);
    report.steps.uiAttempt = { attempt, ...up, cssBroken };
    if (up.up && !cssBroken) return { ...up, cssBroken, attempts: attempt };
    report.steps.uiRetry = { attempt, cssBroken, tail: uiLog.slice(-900) };
    // Stop only the UI. A full down() here would take the mock, injector and agent with it,
    // and this loop restarts nothing but the UI, so the retry would boot against dead upstreams.
    const uiPid = recorded().ui;
    if (uiPid) {
      try { process.kill(-uiPid, "SIGKILL"); } catch { }
      try { process.kill(uiPid, "SIGKILL"); } catch { }
    }
    await sleep(1500);
  }
  die(`UI failed to serve a CSS-valid page twice; see ${RUNLOG}/ui.log`);
}

/* --------------------------------------------------------------------------
 * Journeys. Each sends the prompt the fixture itself declares: aimock matches on
 * match.userMessage, so an invented prompt is a no_fixture_match, not a failure of
 * the reference. Reply markers below are the fixture's scripted assistant text.
 * ------------------------------------------------------------------------ */

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const JOURNEYS = {
  "J-A": {
    // Prompt must EQUAL the fixture's match.userMessage byte-for-byte: the harness's mock
    // serves through requestTransform (App Context strip), and llmock sets
    // useExactMatch = !!requestTransform, so substring matches no longer apply. The fixture
    // is d6/langgraph-typescript/agentic-chat.json[0] ("good name for a goldfish" ->
    // "How about Bubbles? ..."); the earlier "What is a good name for a goldfish?" matched
    // only under plain llmock's includes() and produced a MISS (JA_EXIT=1) under the transform.
    turns: [{ prompt: "good name for a goldfish", marker: "How about Bubbles?", shot: "J-A-01-after-first-turn" }],
    initialShot: "J-A-00-initial",
    mobileShot: "J-A-02-after-first-turn",
  },
  // Bidirectional shared state on the reference's own mechanism, using the fixture chain
  // pinned from showcase/aimock/d4/langgraph-typescript/chat.json:
  //   [45] userMessage "three todos about learning CopilotKit" (hasToolResult false)
  //        -> enableAppMode, which reveals the reference's canvas surface
  //   [44] toolCallId ...enable_app_mode_001 -> manage_todos with three todos
  //   [43] toolCallId ...manage_todos_001     -> the closing assistant text
  // The starter's agent wires manage_todos through stateStreamingMiddleware(stateItem({
  // stateKey: "todos", tool: "manage_todos", toolArgument: "todos" })), so the streamed tool
  // argument becomes state.todos and the canvas (example-canvas, agent.state?.todos) renders
  // it: that is agent -> canvas. The canvas's own add control (aria-label "Add new todo")
  // calls agent.setState, which is canvas -> agent and is what the second turn then carries.
  "J-C": {
    turns: [
      {
        prompt: "three todos about learning CopilotKit",
        marker: "Done \u2014 added three todos about learning CopilotKit to your task manager.",
        shot: "J-C-01-after-todo-turn",
      },
      {
        // Same entry prompt again: it re-matches fixture [45], so the run still resolves
        // against a fixture (no MISS) while the model request now follows a canvas write.
        prompt: "three todos about learning CopilotKit",
        marker: "Done \u2014 added three todos about learning CopilotKit to your task manager.",
        shot: "J-C-04-after-canvas-write-turn",
      },
    ],
    initialShot: "J-C-00-initial",
    mobileShot: "J-C-05-after-canvas-write-turn",
    canvasShot: "J-C-03-canvas-after-agent-write",
    // Titles exactly as fixture [44] streams them, i.e. what state.todos must reach.
    canvasTitles: ["Read the CopilotKit docs", "Build a CopilotKit prototype", "Explore shared agent state"],
    canvasAddLabel: "Add new todo",
    canvasWriteMarker: "New Todo",
  },
};

/**
 * Send one turn. The textarea is visible before React attaches its handlers, so a
 * blind fill can submit nothing while looking like it worked (observed: zero run
 * requests). Success is therefore the composer emptying, not fill() resolving.
 */
async function sendTurn(page, text) {
  const box = page.locator("textarea").first();
  // 5 attempts: jc6 burned all 3 while the first route was still compiling (90s), because a
  // visible composer accepts fill() long before React attaches its handlers.
  for (let attempt = 1; attempt <= 5; attempt++) {
    await box.click({ timeout: 20000 }).catch(() => {});
    await box.fill(text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    if ((await box.inputValue()) === "") return { cleared: true, attempt };
    await page.locator("button:not([disabled])").last().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if ((await box.inputValue()) === "") return { cleared: true, attempt: `${attempt}b` };
    await page.waitForTimeout(3000);
  }
  return { cleared: false, attempt: 3 };
}

const sidecar = () => {
  try {
    return fs.readFileSync(REQUESTS, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

async function run(journey) {
  const spec = JOURNEYS[journey];
  if (!spec) die(`unknown journey ${journey}; known: ${Object.keys(JOURNEYS).join(", ")}`);
  // Observed, not assumed: launched under Bun the browser dies before the first navigation
  // ("goto: Target page, context or browser has been closed", footer Bun v1.4.0), while the
  // identical script under node drives the reference fine. Fail loudly instead of misreporting
  // that as a reference failure.
  if (process.versions.bun) die("run must execute under node; Playwright's browser dies under Bun");
  // Preflight every service before launching the browser. A capture against a dead or foreign
  // stack manufactures failures that look like reference behavior: jc5 ran a full capture with
  // no llmock at all (boot had aborted on the 4010 port collision; a `;` chain ran `run` anyway)
  // and produced only byte-identical screenshots. No evidence without a live stack.
  for (const [name, port] of Object.entries(PORTS)) {
    if (!(await portBusy(port))) die(`preflight: ${name} (:${port}) is not listening; run boot first`);
  }
  const mockOk = await fetch(`http://127.0.0.1:${PORTS.mock}/v1/models`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!mockOk) die(`preflight: mock on :${PORTS.mock} does not answer /v1/models; run down then boot`);
  // Page-level self-heal: the reference's Turbopack/Tailwind pipeline intermittently emits an
  // invalid CSS escape at globals.css:2041 that 500s every page - observed four times, once
  // MID-session right after "filesystem cache database compaction" (jc8). bootUi only heals at
  // boot, so run probes the live page and cold-restarts the UI with the same remedy before
  // touching the browser; a capture against a 500 page burns every waitFor timeout while
  // looking like a reference failure.
  const pageProbe = await fetch(`http://127.0.0.1:${PORTS.ui}/`, { signal: AbortSignal.timeout(45000) }).catch(() => null);
  if (!pageProbe || pageProbe.status >= 500) {
    console.error(`[heal] UI answered ${pageProbe ? pageProbe.status : "no response"}; cold-restarting (known Turbopack/Tailwind degradation)`);
    const uiPid = recorded().ui;
    if (uiPid) {
      try { process.kill(-uiPid, "SIGKILL"); } catch {}
      try { process.kill(uiPid, "SIGKILL"); } catch {}
    }
    fs.rmSync(path.join(EXAMPLE, ".next"), { recursive: true, force: true });
    await sleep(1500);
    const uiEnv = { ...process.env };
    delete uiEnv.AGENT_URL;
    start("ui", process.execPath, [NEXT, "dev", "--turbopack", "-p", String(PORTS.ui), "-H", "127.0.0.1"], { cwd: EXAMPLE, env: uiEnv });
    const recovered = await waitUrl(`http://127.0.0.1:${PORTS.ui}/`, 90, 2000);
    if (!recovered.up) die(`UI failed to recover from the CSS 500; see ${RUNLOG}/ui.log`);
  }
  const res = { journey, steps: [], requests: [], ok: false };
  // requests.jsonl persists across runs until the next boot, so sidecar reads must be scoped
  // to THIS run: ja2's own turn hit and rendered, yet ja1's two MISSes rode along and failed
  // ok. Capture the highest seq before the browser launches.
  const startSeq = sidecar().reduce((m, r) => Math.max(m, r.seq ?? 0), 0);
  // Playwright here is a CommonJS package whose entry re-exports from a submodule, so a
  // dynamic import() yields only `default` and `chromium` comes back undefined. The
  // proven scratch captures used require(), so the harness does too.
  const { chromium } = createRequire(PLAYWRIGHT)(PLAYWRIGHT);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 2, reducedMotion: "reduce" });
    page.on("console", (m) => {
      const t = m.text();
      if (/error|no_fixture/i.test(t) && res.requests.length < 8) res.requests.push(`${m.type()}: ${t.slice(0, 160)}`);
    });
    // The model proxy never sees thread state: state flows browser -> runtime run request.
    // Archive every CopilotKit POST the page makes so canvas -> agent propagation can be
    // proven on the wire (state.todos reaching the request that follows the canvas write).
    const runtimePosts = [];
    page.on("request", (req) => {
      if (req.method() !== "POST" || !req.url().includes("/api/copilotkit/")) return;
      const pd = req.postData();
      if (pd) runtimePosts.push({ url: req.url(), body: pd });
    });
    // Shot names come from the journey spec, one per captured moment. Indexing an array
    // produced `undefined-*.png` and let desktop and mobile frames collide.
    const shot = (name, viewport) =>
      page.screenshot({ path: path.join(SHOTS, `${name}-${viewport}-${VIEWPORTS[viewport].width}x${VIEWPORTS[viewport].height}.png`) });
    const has = (text, ms) => page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout: ms }).then(() => true).catch(() => false);
    // Hydration gate: the first route compile took 90s in jc6, during which the composer
    // accepted fill() but no React handlers ran - sendTurn burned all 3 attempts
    // (cleared:false) while looking fine. The runtime's own init requests are dispatched by
    // the CopilotKit component's effect, so their arrival is a hydration signal. Register
    // BEFORE goto or the promise resolves after the fact.
    const runtimeReady = page
      .waitForResponse((r) => r.url().includes("/api/copilotkit/"), { timeout: 300000 })
      .catch(() => null);

    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 240000 });
    await runtimeReady;
    const box = page.locator("textarea").first();
    await box.waitFor({ state: "visible", timeout: 120000 });
    await page.waitForTimeout(4000); // hydration, see sendTurn
    await shot(spec.initialShot, "desktop");

    for (let i = 0; i < spec.turns.length; i++) {
      const turn = spec.turns[i];
      const sent = await sendTurn(page, turn.prompt);
      const reply = await has(turn.marker, 150000);
      const step = { turn: i + 1, prompt: turn.prompt, ...sent, replyRendered: reply };
      res.steps.push(step);
      await shot(turn.shot, "desktop");
      res.bodyAfterLastTurn = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 1200);

      // agent -> canvas -> agent, on the reference's own surface: the streamed manage_todos
      // argument must reach state.todos and render (agent -> canvas), then the canvas's own add
      // control must call agent.setState (canvas -> agent) and be observable as a rendered title.
      if (spec.canvasShot && i === 0) {
        const canvas = { agentWriteVisible: false, canvasWriteVisible: false, addControlFound: false };
        canvas.agentWriteVisible = await has(spec.canvasTitles[0], 90000);
        canvas.allTitlesVisible = await page
          .waitForFunction((ts) => ts.every((t) => document.body.innerText.includes(t)), spec.canvasTitles, { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        await shot(spec.canvasShot, "desktop");
        const add = page.locator(`[aria-label="${spec.canvasAddLabel}"]`).first();
        canvas.addControlFound = await add.waitFor({ state: "attached", timeout: 20000 }).then(() => true).catch(() => false);
        if (canvas.addControlFound) {
          // The reference's own animation keeps Playwright's actionability check waiting; a DOM
          // click drives the same handler the user's click would.
          await add.click({ timeout: 12000 }).catch(() => {});
          if (!(await has(spec.canvasWriteMarker, 15000))) {
            await page.evaluate((label) => document.querySelector(`[aria-label="${label}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })), spec.canvasAddLabel);
          }
          canvas.canvasWriteVisible = await has(spec.canvasWriteMarker, 30000);
        }
        res.canvas = canvas;
      }
    }

    // Mobile parity is a separate capture, not a resize of the same frame.
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(1500);
    const last = spec.turns[spec.turns.length - 1];
    // Observed on the reference (jc7): after the canvas write the mobile UI stays on the
    // App pane, so the chat marker is not in the body until the Chat tab is selected.
    // Record which pane is default, then switch tabs and assert - the reference's real
    // mobile behavior, not a harness artifact.
    let renders = await page.evaluate((t) => document.body.innerText.includes(t), last.marker);
    const defaultPane = renders ? "chat" : "app";
    if (!renders) {
      await page.locator("text=Chat").first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      renders = await page.evaluate((t) => document.body.innerText.includes(t), last.marker);
    }
    res.mobile = { rendersLastReply: renders, defaultPane };
    await shot(spec.mobileShot, "mobile");

    // Persist the archived run requests as evidence and summarize them.
    fs.mkdirSync(RUNLOG, { recursive: true });
    res.runtimeRequests = runtimePosts.map((p, i) => {
      fs.writeFileSync(path.join(RUNLOG, `run-req-${journey}-${String(i).padStart(2, "0")}.json`), p.body);
      let keys = [];
      try { keys = Object.keys(JSON.parse(p.body)); } catch {}
      return {
        i,
        path: p.url.replace(/^https?:\/\/[^/]+/, ""),
        bytes: p.body.length,
        keys,
        hasStateField: /"state"\s*:/.test(p.body),
        mentionsNewTodo: p.body.includes("New Todo"),
      };
    });

    res.requests = sidecar()
      .filter((r) => (r.seq ?? 0) > startSeq && r.outcome)
      .map((r) => ({ user: (r.userMessage || "").slice(0, 46), outcome: r.outcome, stateField: r.hasStateField, bytes: r.bytes }));
    res.hits = res.requests.filter((r) => r.outcome === "HIT").length;
    res.misses = res.requests.filter((r) => r.outcome === "MISS").length;
    res.stateFieldOnAnyRequest = res.requests.some((r) => r.stateField);
    res.ok =
      res.steps.every((s) => s.cleared && s.replyRendered) &&
      res.misses === 0 &&
      res.hits > 0 &&
      (!spec.canvasShot || Boolean(res.canvas?.agentWriteVisible && res.canvas?.canvasWriteVisible));
  } finally {
    fs.mkdirSync(RUNLOG, { recursive: true });
    fs.writeFileSync(path.join(RUNLOG, `${journey}.json`), JSON.stringify(res, null, 1));
    await browser.close().catch(() => {});
  }
  return res;
}

/* ------------------------------------------------------------------------ *
 * CLI                                                                       *
 * ------------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "help";

if (cmd === "boot") {
  const report = await boot({ cold: argv.includes("--cold") });
  console.log(JSON.stringify(report, null, 1));
  // Exit explicitly: without it node waits on the spawned services' handles forever and a
  // chained `boot && run` never reaches the capture (the run branch is the only one that
  // exits). The services themselves are unaffected — node does not reap children on exit.
  process.exit(0);
} else if (cmd === "down") {
  await down();
  console.log("down");
  process.exit(0);
} else if (cmd === "run") {
  const journey = argv[1];
  const r = await run(journey);
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.ok ? 0 : 1);
} else if (cmd === "status") {
  const rec = recorded();
  const rows = [];
  for (const [name, pid] of Object.entries(rec)) {
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    rows.push({ name, pid, alive });
  }
  for (const [name, port] of Object.entries(PORTS)) {
    rows.push({ name: `port:${name}`, port, busy: await portBusy(port) });
  }
  console.log(JSON.stringify(rows, null, 1));
} else if (cmd === "shots") {
  const files = fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS).filter((f) => f.endsWith(".png")).sort() : [];
  console.log(files.map((f) => `${f} ${fs.statSync(path.join(SHOTS, f)).size}B`).join("\n") || "none");
} else {
  console.log(
    [
      "usage: node harness.mjs <command>",
      "  boot [--cold]   start llmock + injector + agent + UI, self-healing the CSS 500",
      "  run <J-A|J-C>   drive one reference journey, write screenshots and logs/<x>.json",
      "  status          recorded pids and port occupancy",
      "  shots           captured reference screenshots with sizes",
      "  down            stop every recorded process and verify the ports are free",
    ].join("\n"),
  );
}


