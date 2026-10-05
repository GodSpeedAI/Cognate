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
import net from "node:net";
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
  // Kernel TCP probe, not an HTTP GET. Two observed reasons the HTTP form lied:
  //   - a SYN to a closed port on this host is DROPPED, so the connect times out
  //     instead of refusing, and the old `!refused` test read that timeout as
  //     "busy" - which reported all four ports as up while nothing listened;
  //   - aimock has no route for `/`, so an answer to `/` was never the question.
  // A completed handshake means a listener exists, whatever it serves.
  return await new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      try { s.destroy(); } catch { /* already gone */ }
      resolve(v);
    };
    const s = net.connect({ host: "127.0.0.1", port });
    s.setTimeout(1500, () => done(false));
    s.on("connect", () => done(true));
    s.on("error", () => done(false));
  });
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

  /* ---------------------------------------------------------------------- *
   * R1 - the remaining canonical journeys. Catalog names live in
   * .sea/interaction/canonical-journey-catalog.md; the prompt/fixture pairs
   * below are the ones the pinned columns actually declare for this surface.
   * ---------------------------------------------------------------------- */

  // J-E controlled rendering (R-A08): the starter registers pieChart through
  // useComponent (pending -> terminal card) and search_flights is a real backend
  // tool on the agent, so both legs of "renderer shows pending and terminal state
  // without a browser handler doing the work" are expressible.
  //   d4/chat.json[27] -> [13]  and  d4/chat.json[41] -> [21]
  "J-E": {
    turns: [
      {
        prompt: "revenue distribution by category",
        // The component renders on the tool call, BEFORE the result that carries this
        // text, so the mid-wait is the pending state and marker is the terminal one.
        mid: { waitFor: "Revenue by Category", shot: "J-E-01-controlled-genui-pending" },
        marker: "Pie chart rendered above \u2014 Electronics is the largest slice, followed by Clothing, Food, and Books.",
        shot: "J-E-02-controlled-genui-complete",
      },
      {
        prompt: "flights from SFO to JFK for next Tuesday",
        mid: { waitFor: "search_flights", shot: "J-E-03-backend-tool-pending" },
        marker: "Two flights shown above \u2014 United at $349 (08:00) and Delta at $289 (10:15), both on time.",
        shot: "J-E-04-backend-tool-complete",
      },
    ],
    initialShot: "J-E-00-initial",
    mobileShot: "J-E-05-after-backend-tool-mobile",
  },

  // J-F tool-based human decision (R-A09): d4/chat.json[40] asks the registered
  // scheduleTime action, the starter's MeetingTimePicker renders inline, and the
  // chosen slot's respond() carries the tool result that d4/chat.json[20] resolves.
  "J-F": {
    turns: [
      {
        prompt: "30-minute meeting to learn about CopilotKit",
        mid: {
          waitFor: "Pick a time that works for you",
          shot: "J-F-01-hitl-pending",
          clickRole: "button",
          clickText: "Tomorrow",
          clickShot: "J-F-02-hitl-slot-selected",
        },
        marker: "Meeting scheduled \u2014 calendar invite is on its way.",
        shot: "J-F-03-hitl-resolved",
      },
    ],
    initialShot: "J-F-00-initial",
    mobileShot: "J-F-04-after-hitl-mobile",
  },

  // J-H declarative UI (R-A11): generate_a2ui is a backend tool on the agent and
  // CopilotKit is mounted with a2ui={{ catalog: demonstrationCatalog }}, so the
  // declarative surface is catalog-resolved on the client.
  //   d6/gen-ui-declarative.json[2] -> [0] -> [1]
  "J-H": {
    turns: [
      {
        prompt: "Show me my sales dashboard for this quarter.",
        marker: "Here's your Q2 sales dashboard.",
        shot: "J-H-01-declarative-surface",
      },
    ],
    initialShot: "J-H-00-initial",
    mobileShot: "J-H-02-after-declarative-mobile",
  },

  // J-J rich thread (R-A05/R-A12-R-A13): one thread carrying text + generative UI +
  // shared state, then reload, new thread, switch back. Restoration is asserted on
  // re-rendered content, not on React-local state.
  "J-J": {
    turns: [
      {
        prompt: "good name for a goldfish",
        marker: "How about Bubbles?",
        shot: "J-J-01-after-text-turn",
      },
      {
        prompt: "revenue distribution by category",
        marker: "Pie chart rendered above \u2014 Electronics is the largest slice, followed by Clothing, Food, and Books.",
        shot: "J-J-02-after-genui-turn",
      },
      {
        prompt: "three todos about learning CopilotKit",
        marker: "Done \u2014 added three todos about learning CopilotKit to your task manager.",
        shot: "J-J-03-after-shared-state-turn",
      },
    ],
    initialShot: "J-J-00-initial",
    mobileShot: "J-J-04-mobile-after-mixed-turn",
    // Post-turn flow. Every step records what it observed, and `expects`/`absents` make a
    // wrong render fail the run instead of silently shooting a blank page.
    //
    // Measured on the reference before writing these: the threads drawer is a Lit custom
    // element in an OPEN shadow root, painted as a persistent LEFT SIDEBAR on desktop
    // (there is no header launcher and no [aria-label] anywhere in light DOM), with the
    // new-thread control at part="new-thread-button" and rows at li[data-thread-id].
    post: [
      {
        kind: "reload",
        waitMs: 180000,
        expects: [
          "How about Bubbles?",
          "Pie chart rendered above",
          "Done \u2014 added three todos about learning CopilotKit to your task manager.",
        ],
        shot: "J-J-05-restored-after-reload",
      },
      { kind: "captureThread", shot: "J-J-06-drawer-thread-list" },
      {
        kind: "clickSelector",
        selector: 'copilotkit-threads-drawer [part="new-thread-button"]',
        timeout: 20000,
        absents: ["How about Bubbles?"],
        absentMs: 6000,
        shot: "J-J-07-new-thread",
      },
      {
        kind: "switchBack",
        fromCaptured: true,
        timeout: 30000,
        expects: ["How about Bubbles?"],
        shot: "J-J-08-switched-back",
      },
    ],
    // The thread-LIFECYCLE half of J-J (reload restores, drawer creates and switches
    // threads) is observed on this surface and does NOT occur. Recorded, not skipped:
    // the capture runs, every step reports what it saw, and postMetrics counts the wire
    // calls that settle it. Turns above remain the evidence for the rich-thread half.
    postObservation: {
      scenario: "Reload restores the thread; the drawer creates a thread and switches back to a prior one.",
      observedInstead: [
        "After reload the page renders the welcome screen with no prior messages, and the drawer stays on \"Loading threads…\" with zero rows for the whole 40s capture window.",
        "During the post flow the agent logs no `GET /threads` (list) request at all, while `POST /threads` (create) succeeds elsewhere in the same session - the drawer never asks for the list.",
      ],
      inferredFromSource: [
        "CopilotThreadsDrawer.tsx:255/262/271/296 gates useThreads({ enabled: licensed }); licensed is false unless the runtime reports status \"valid\"/\"expiring\", and licensePending (status === null) is exactly the branch that shows the loading state rather than the locked view - so with no license configured the query is disabled AND the spinner never resolves.",
        "packages/react-core/src/v2 contains no localStorage/sessionStorage/cookie use (only v1-deprecated dev-console does), and page.tsx mounts CopilotChatConfigurationProvider with no threadId prop, so the active thread is in-memory and a reload mints a new one.",
      ],
      evidenceClass: "BLACK_BOX_REFERENCE",
      evidence: [
        "screenshots/J-J-05-restored-after-reload-desktop-1440x900.png (welcome screen after reload)",
        "screenshots/J-J-06-drawer-thread-list-desktop-1440x900.png (drawer pinned to Loading threads…)",
        "logs/runs/J-J.json -> post[].drawer.rows === [] and postMetrics.threadListRequests === 0",
      ],
    },
  },

  // Catalog journeys whose SCENARIO this pinned surface cannot express. Each is a
  // recorded gap, not a skipped test: `run` writes logs/runs/<J>.json with
  // outcome UNCOVERED and exits 0, and no gate may cite it as execution evidence.
  "J-D": {
    uncovered: {
      scenario: "Mounted UI supplies current context to the next run; unmount removes it.",
      reason:
        "The pinned canonical starter mounts no useAgentContext anywhere in examples/integrations/langgraph-js/src, " +
        "so no component can add or remove an entry of the AG-UI `context` array. The only context element observed " +
        "on the wire is CopilotKit's always-on A2UI catalog entry.",
      fixture: "showcase/aimock/d6/langgraph-typescript/agent-config.json",
      fixtureReachable: "the column matches (context: langgraph-typescript) but its replies are content, not context propagation",
      evidenceClass: "OFFICIAL_FIXTURE_REFERENCE",
      evidence: [
        "packages/react-core/src/v2/hooks/__tests__/use-agent-context-timing.test.tsx (21/21, 2026-09-28)",
        "validation/reconstructions/copilot/reference/logs/runs/run-req-J-A-00.json -> context[] holds only the A2UI catalog element",
      ],
    },
  },
  "J-G": {
    uncovered: {
      scenario: "Runtime reaches a mandatory checkpoint, pauses, exposes an interrupt, resumes or ends.",
      reason:
        "The pinned agent graph registers only query_data, manage_todos, get_todos, generate_a2ui and search_flights " +
        "(examples/integrations/langgraph-js/agent/src/agent.ts) with no interrupt() node, and the starter mounts no " +
        "interrupt UI. The interrupt fixtures drive a schedule_meeting action registered by a different showcase app, " +
        "so on this surface the tool call has no executor.",
      fixture: "showcase/aimock/d6/langgraph-typescript/{interrupt-headless,gen-ui-interrupt}.json",
      fixtureReachable: "prompts match the column; the schedule_meeting tool they return is unregistered on this surface",
      evidenceClass: "DOCUMENTED_REFERENCE",
      evidence: ["reference-behavior-matrix.md R-A10"],
    },
  },
  "J-K": {
    uncovered: {
      scenario: "Committed progress is delivered before terminalization; a resume from a cursor loses and duplicates nothing.",
      reason:
        "The canonical starter exposes no re-run/reconnect control on its chat surface, and the fixture columns named " +
        "for recovery (headless-simple, headless-complete) target the headless client rather than this UI. Mid-stream " +
        "socket loss was therefore not observable through the page.",
      fixture: "showcase/aimock/d6/langgraph-typescript/{headless-simple,headless-complete}.json",
      fixtureReachable: "headless fixtures match, but they drive a headless client, not the starter's chat surface",
      evidenceClass: "DOCUMENTED_REFERENCE",
      evidence: ["reference-behavior-matrix.md R-A03"],
    },
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

/**
 * Cold-restart the UI and prove it serves a CSS-valid page.
 *
 * Turbopack intermittently rewrites the compiled globals.css with an invalid escape
 * (`border-\[var(--\e 6T\)]`, reported at 2029:25 or 2041 depending on the cache) and
 * every route then answers 500 behind a Next build-error overlay - observed at boot,
 * mid-session after a filesystem cache compaction, AND after a mid-run page reload
 * (J-J). `.next` is the only remedy: the source file on disk is 125 lines and valid.
 * Returns the waitUrl result, or dies - a UI that never comes back makes every later
 * waitFor time out while looking like a reference failure.
 */
async function healUi(reason) {
  console.error(`[heal] ${reason}; cold-restarting the UI (known Turbopack CSS-parse degradation)`);
  const uiPid = recorded().ui;
  if (uiPid) {
    try { process.kill(-uiPid, "SIGKILL"); } catch { /* already gone */ }
    try { process.kill(uiPid, "SIGKILL"); } catch { /* already gone */ }
  }
  fs.rmSync(path.join(EXAMPLE, ".next"), { recursive: true, force: true });
  await sleep(1500);
  const uiEnv = { ...process.env };
  delete uiEnv.AGENT_URL;
  start("ui", process.execPath, [NEXT, "dev", "--turbopack", "-p", String(PORTS.ui), "-H", "127.0.0.1"], { cwd: EXAMPLE, env: uiEnv });
  // Require status < 500, not mere reachability: a healed-but-still-broken compile is
  // exactly the state waitUrl would otherwise accept.
  const recovered = await waitUrl(`http://127.0.0.1:${PORTS.ui}/`, 150, 2000, 45000);
  if (!recovered.up) die(`UI failed to recover from the CSS failure; see ${RUNLOG}/ui.log`);
  return recovered;
}

async function run(journey) {
  const spec = JOURNEYS[journey];
  if (!spec) die(`unknown journey ${journey}; known: ${Object.keys(JOURNEYS).join(", ")}`);
  // A declared gap is recorded, not driven: the record states which fixture exists
  // and why the scenario cannot be expressed here, so a reader can distinguish
  // "uncovered behaviour" from "capture that never ran". No stack needed.
  if (spec.uncovered) {
    const res = {
      journey,
      outcome: "UNCOVERED",
      ok: false,
      uncovered: spec.uncovered,
      recorded_at: new Date().toISOString(),
    };
    fs.mkdirSync(RUNLOG, { recursive: true });
    fs.writeFileSync(path.join(RUNLOG, `${journey}.json`), JSON.stringify(res, null, 1));
    console.log(JSON.stringify(res, null, 1));
    return res;
  }
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
    await healUi(`UI answered ${pageProbe ? pageProbe.status : "no response"}`);
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
      const step = { turn: i + 1, prompt: turn.prompt, ...sent };
      // Intermediate observation between send and terminal text. HITL and generative
      // surfaces render on the tool CALL, before the tool result that carries the
      // marker, so waiting only for the marker would never photograph the pending state
      // these journeys exist to prove.
      if (turn.mid) {
        step.midRendered = await has(turn.mid.waitFor, turn.mid.waitMs ?? 90000);
        if (turn.mid.shot) await shot(turn.mid.shot, "desktop");
        if (turn.mid.clickSelector || turn.mid.clickRole) {
          const target = turn.mid.clickSelector
            ? page.locator(turn.mid.clickSelector).first()
            : page.getByRole(turn.mid.clickRole, { name: new RegExp(turn.mid.clickText, "i") }).first();
          step.midClicked = await target
            .click({ timeout: turn.mid.clickMs ?? 20000 })
            .then(() => true)
            .catch((e) => { step.midClickError = String(e).split("\n")[0].slice(0, 160); return false; });
          await page.waitForTimeout(1200);
          if (turn.mid.clickShot) await shot(turn.mid.clickShot, "desktop");
        }
      }
      step.replyRendered = await has(turn.marker, turn.markerMs ?? 150000);
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

    // Thread-scoped flow (J-J). Runs back at desktop width: the off-canvas drawer is not
    // the surface under test here. Restoration is asserted on re-rendered CONTENT after a
    // real reload, never on React-local state the page would keep anyway.
    if (spec.post?.length) {
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.waitForTimeout(1200);
      res.post = [];
      // Wire evidence for the post flow: what the AGENT was actually asked for. The drawer
      // lists threads through a `GET /threads` it only issues while licensed, and a reload
      // that creates a thread (`POST /threads`) rather than replaying one is the direct
      // proof that nothing was restored. Offsets make the delta specific to this run.
      const agentLog = path.join(RUNLOG, "agent.log");
      const agentLogOffset = fs.existsSync(agentLog) ? fs.statSync(agentLog).size : 0;
      // Stable handle for "switch back to the thread I was in": a row's data-thread-id
      // captured while it is active. Thread names are model-generated, so matching on the
      // opening prompt's text is a guess; the id is not.
      let capturedThreadId = null;
      // The threads drawer is a Lit custom element in an OPEN shadow root; Playwright's
      // engines pierce it, but its interior is invisible to document.body.innerText, so
      // every step records the drawer's own text as evidence of what was actually there.
      const drawerState = () =>
        page.evaluate(() => {
          const el = document.querySelector("copilotkit-threads-drawer");
          const root = el?.shadowRoot;
          if (!root) return { mounted: false, visible: false, activeThreadId: null, rows: [], text: "" };
          const panel = root.querySelector('[part="root"]') ?? root.firstElementChild;
          const rect = panel?.getBoundingClientRect();
          const rows = [...root.querySelectorAll("li[data-thread-id]")].map((li) => ({
            id: li.getAttribute("data-thread-id"),
            active: li.classList.contains("active"),
            text: (li.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70),
          }));
          return {
            mounted: true,
            // `el.open` is the mobile off-canvas flag and reads false on desktop even
            // while the sidebar is painted - visibility, not the flag, is the question.
            visible: Boolean(rect && rect.width > 0 && rect.height > 0),
            activeThreadId: rows.find((r) => r.active)?.id ?? null,
            rows,
            text: (root.textContent || "").replace(/\s+/g, " ").slice(0, 700),
          };
        });
      const openComposer = async (ms) =>
        page
          .locator("textarea")
          .first()
          .waitFor({ state: "visible", timeout: ms })
          .then(() => true)
          .catch(() => false);
      for (const action of spec.post) {
        const rec = { kind: action.kind };
        try {
          if (action.kind === "reload") {
            // The reload itself can hang: Turbopack recompiles `/` on navigation and the
            // corrupted globals.css turns that into a 2.3min compile ending in a 500, so
            // domcontentloaded may never fire inside the timeout. A thrown reload would
            // skip the heal below and leave every later step shooting an error overlay,
            // so the timeout is recorded and routed to the same remedy as a 500.
            try {
              const resp = await page.reload({ waitUntil: "domcontentloaded", timeout: action.waitMs ?? 300000 });
              rec.reloadStatus = resp?.status?.() ?? 0;
            } catch (e) {
              rec.reloadStatus = 0;
              rec.reloadError = String(e).split("\n")[0].slice(0, 160);
            }
            let up =
              rec.reloadStatus > 0 &&
              rec.reloadStatus < 500 &&
              (await openComposer(rec.reloadStatus ? 60000 : 1000));
            if (!up) {
              await healUi(`reload status ${rec.reloadStatus}${rec.reloadError ? ` (${rec.reloadError})` : ""} or no composer`);
              rec.healed = true;
              const rt = page
                .waitForResponse((r) => r.url().includes("/api/copilotkit/"), { timeout: 300000 })
                .catch(() => null);
              await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 300000 });
              await rt;
              up = await openComposer(240000);
            }
            if (!up) rec.error = rec.error ?? "composer never became visible after reload";
            await page.waitForTimeout(6000);
          } else if (action.kind === "clickSelector") {
            await page.locator(action.selector).first().click({ timeout: action.timeout ?? 20000 });
            await page.waitForTimeout(action.settleMs ?? 2500);
          } else if (action.kind === "clickText") {
            await page.getByText(action.text, { exact: false }).first().click({ timeout: action.timeout ?? 20000 });
            await page.waitForTimeout(action.settleMs ?? 2500);
          } else if (action.kind === "captureThread") {
            // Thread NAMES are model-generated and not guaranteed to match the opening
            // prompt, so the stable handle is the row's data-thread-id captured while it
            // is still the active thread - later steps address it by id, never by text.
            // The drawer fetches asynchronously ("Loading threads…"), so wait for rows;
            // if no row is marked active after the reload, fall back to the first row and
            // SAY SO, because that fallback is an inference the record must not hide.
            const deadline = Date.now() + (action.waitMs ?? 40000);
            let d = await drawerState();
            while ((!d.rows || d.rows.length === 0) && Date.now() < deadline) {
              await page.waitForTimeout(1000);
              d = await drawerState();
            }
            rec.rows = d.rows;
            rec.activeThreadId = d.activeThreadId;
            capturedThreadId = d.activeThreadId ?? d.rows?.[0]?.id ?? null;
            rec.capturedVia = d.activeThreadId ? "active" : capturedThreadId ? "firstRow" : "none";
          } else if (action.kind === "switchBack") {
            const selector = action.fromCaptured
              ? `copilotkit-threads-drawer li[data-thread-id="${capturedThreadId}"]`
              : action.selector;
            if (action.fromCaptured && !capturedThreadId) throw new Error("no captured thread id to switch back to");
            rec.targetThreadId = capturedThreadId;
            await page.locator(selector).first().click({ timeout: action.timeout ?? 30000 });
            await page.waitForTimeout(action.settleMs ?? 4000);
          } else {
            rec.error = `unknown action kind ${action.kind}`;
          }
        } catch (e) {
          rec.error = String(e).split("\n")[0].slice(0, 200);
        }
        if (action.expects?.length) {
          rec.expects = [];
          for (const t of action.expects) rec.expects.push({ text: t.slice(0, 60), rendered: await has(t, action.expectMs ?? 45000) });
          rec.expectOk = rec.expects.every((e) => e.rendered);
        }
        if (action.absents?.length) {
          rec.absents = [];
          for (const t of action.absents) rec.absents.push({ text: t.slice(0, 60), rendered: await has(t, action.absentMs ?? 12000) });
          rec.absentOk = rec.absents.every((e) => !e.rendered);
        }
        rec.drawer = await drawerState();
        if (action.shot) await shot(action.shot, "desktop");
        res.post.push(rec);
      }
      // Count what the agent was asked for DURING the post flow only.
      let postAgentLog = "";
      try {
        postAgentLog = fs.readFileSync(agentLog, "utf8").slice(agentLogOffset);
      } catch { /* agent.log missing: report zeros rather than throw */ }
      res.postMetrics = {
        threadListRequests: (postAgentLog.match(/GET \/threads(\?| |\[)/g) || []).length,
        threadCreates: (postAgentLog.match(/POST \/threads(\?| |\[)/g) || []).length,
        note: "list = GET /threads with no id; creates = POST /threads with no id",
      };
    }

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
    const postProblem = (res.post ?? []).some((p) => p.error || p.expectOk === false || p.absentOk === false);
    const turnsOk =
      res.steps.every((s) => s.cleared && s.replyRendered && s.midRendered !== false && s.midClicked !== false) &&
      res.misses === 0 &&
      res.hits > 0 &&
      (!spec.canvasShot || Boolean(res.canvas?.agentWriteVisible && res.canvas?.canvasWriteVisible));
    // A journey may declare up front that its post flow can only be OBSERVED. When the
    // steps fail as declared, the failure IS the evidence: it is recorded as
    // OBSERVED_ABSENT with the measured reason and does not fail the capture, because the
    // capture ran and recorded what the reference does instead. If the flow unexpectedly
    // succeeds, it is reported GREEN and the pre-written observation is dropped rather
    // than cited against a run that contradicts it.
    if (spec.postObservation) {
      if (postProblem) {
        res.postOutcome = "OBSERVED_ABSENT";
        res.postObservation = spec.postObservation;
      } else {
        res.postOutcome = "GREEN";
      }
    }
    res.ok = turnsOk && (spec.postObservation ? true : !postProblem);
    res.outcome = res.ok ? "GREEN" : "FAILED";
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
  // Exit 0 for GREEN and for a RECORDED UNCOVERED gap (the gap is the evidence, and the
  // record names the reason); only a capture that ran and failed is a failure. Callers
  // must read `outcome`, never the code alone, to tell "proven" from "declared missing".
  process.exit(r.outcome === "FAILED" ? 1 : 0);
} else if (cmd === "heal") {
  // Cold-restart only the UI: Turbopack's corrupted globals.css makes every route 500
  // until `.next` is rebuilt, and `boot` would take down a healthy mock/agent with it.
  const r = await healUi(argv[1] ?? "manual heal");
  console.log(JSON.stringify(r, null, 1));
  process.exit(0);
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
      `  run <journey>   drive one reference journey: ${Object.keys(JOURNEYS).join(" ")}`,
      "                  writes screenshots + logs/<journey>.json with outcome",
      "                  GREEN (exit 0) | UNCOVERED (exit 0, gap recorded, no stack needed)",
      "                  | FAILED (exit 1)",
      "  status          recorded pids and port occupancy",
      "  shots           captured reference screenshots with sizes",
      "  down            stop every recorded process and verify the ports are free",
    ].join("\n"),
  );
}


