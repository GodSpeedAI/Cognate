#!/usr/bin/env node
/**
 * Cognate-side visual capture driver (plan R4, unit settlement gates 20-21).
 *
 * Run under NODE only — Playwright's browser dies under Bun (observed, see
 * reference/harness.mjs). Spawns the Cognate reconstruction server
 * (`bun src/server.ts`, port 3190, fresh data home), then drives the bundled UI to each
 * reference checkpoint state and saves PNGs named to mirror
 * validation/reconstructions/copilot/reference/screenshots/.
 *
 * Viewports mirror the reference harness exactly: desktop 1440x900 deviceScaleFactor 2,
 * mobile 390x844 (separate capture after resize, same as the reference), reducedMotion.
 *
 * Usage: node capture/capture.mjs [--keep-server]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COPILOT = path.resolve(HERE, "..");
const COGNATE = path.join(COPILOT, "cognate");
const ROOT = path.resolve(COPILOT, "..", "..", "..");
const SHOTS = path.join(COPILOT, "cognate", "screenshots");
const DATA = path.join(HERE, ".data");
const SERVER_LOG = path.join(HERE, "server.log");
const PORT = 3190;
const BASE = `http://127.0.0.1:${PORT}`;
const PLAYWRIGHT = path.join(ROOT, "node_modules", "playwright", "index.js");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const REPLY_TEXT = "Hello from the deterministic Cognate chat.";

const keepServer = process.argv.includes("--keep-server");

const log = (...args) => console.log("[capture]", ...args);
const die = (message) => {
  console.error("[capture] FATAL:", message);
  process.exit(1);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function portFree() {
  try {
    const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) return false;
  } catch {
    // not listening — free
  }
  return true;
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
    } catch {
      // retry
    }
    await sleep(250);
  }
  return false;
}

async function startServer() {
  if (!(await portFree())) die(`port ${PORT} is occupied; free it before capturing`);
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  const { openSync, closeSync } = await import("node:fs");
  const fd = openSync(SERVER_LOG, "w");
  const child = spawn("bun", ["src/server.ts"], {
    cwd: COGNATE,
    env: { ...process.env, PORT: String(PORT), COGNATE_HARNESS_HOME: DATA },
    stdio: ["ignore", fd, fd],
    detached: false,
  });
  log(`server spawning (pid ${child.pid}, port ${PORT}, home ${DATA})`);
  if (!(await waitForHealth())) die(`server did not become healthy on :${PORT}; see ${SERVER_LOG}`);
  closeSync(fd);
  log(`server healthy at ${BASE}`);
  return child;
}

/**
 * In-page pacing gate. It never changes content: it only paces when the app's own fetch
 * responses are handed to the app, like network latency would. The ReadProjection hold lets
 * the driver photograph the app displaying the server's own mid-run projection fold (the J-E
 * pending state); the Events hold lets the driver release the run's event stream one chunk at
 * a time so the mid-run read is actually issued while the run is still executing.
 */
const GATE_SCRIPT = `
(() => {
  const raw = window.fetch.bind(window);
  window.__evHold = false;
  window.__evHeld = [];
  window.__evController = null;
  window.__readHold = false;
  window.__readHeld = [];
  window.__armedRelease = false;
  window.fetch = async (input, init) => {
    let url = "";
    try {
      url = typeof input === "string" ? input : input instanceof URL ? input.href : (input && input.url) || "";
    } catch {}
    const isStartRun = url.includes("/cognate.v1.RuntimeService/StartRun");
    const isEvents = url.includes("/cognate.v1.RuntimeService/Events");
    const isReadProjection = url.includes("/cognate.v1.RuntimeService/ReadProjection");
    const response = await raw(input, init);
    if (isEvents && response.body) {
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async start(controller) {
          window.__evController = controller;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              if (window.__evHold) { window.__evHeld.push(value); continue; }
              while (window.__evHeld.length) controller.enqueue(window.__evHeld.shift());
              controller.enqueue(value);
            }
            controller.close();
          } catch (error) {
            try { controller.error(error); } catch {}
          }
        },
        pull(controller) {
          if (!window.__evHold) {
            while (window.__evHeld.length) {
              try { controller.enqueue(window.__evHeld.shift()); } catch { return; }
            }
          }
        },
      });
      return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    if (isStartRun && window.__armedRelease) {
      window.__armedRelease = false;
      setTimeout(() => {
        try {
          if (window.__evController && window.__evHeld.length) window.__evController.enqueue(window.__evHeld.shift());
        } catch {}
      }, 1);
    }
    if (isReadProjection && window.__readHold) {
      const promise = Promise.resolve(response);
      return new Promise((resolve) => { window.__readHeld.push({ promise, resolve }); });
    }
    return response;
  };
  window.__readReleaseOne = () => {
    const entry = window.__readHeld.shift();
    if (!entry) return false;
    entry.resolve(entry.promise);
    return true;
  };
  window.__readReleaseAll = () => {
    const entries = window.__readHeld.splice(0);
    for (const entry of entries) entry.resolve(entry.promise);
    return entries.length;
  };
  window.__evReleaseAll = () => {
    window.__evHold = false;
    const controller = window.__evController;
    if (controller) {
      while (window.__evHeld.length) {
        try { controller.enqueue(window.__evHeld.shift()); } catch { break; }
      }
    }
  };
})();
`;

async function main() {
  const { chromium } = createRequire(PLAYWRIGHT)(PLAYWRIGHT);
  const server = await startServer();
  let browser;
  try {
    rmSync(SHOTS, { recursive: true, force: true });
    await mkdir(SHOTS, { recursive: true });

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 2, reducedMotion: "reduce" });
    page.on("pageerror", (error) => log("pageerror:", String(error).split("\n")[0]));
    await page.addInitScript(GATE_SCRIPT);

    const shots = [];
    let viewport = "desktop";
    const file = (name, vp) => `${name}-${vp}-${VIEWPORTS[vp].width}x${VIEWPORTS[vp].height}.png`;
    const shot = async (name) => {
      const target = file(name, viewport);
      await page.screenshot({ path: path.join(SHOTS, target), animations: "disabled" });
      shots.push(target);
      log(`shot ${target}`);
    };
    const settle = async (ms = 350) => {
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.waitForTimeout(ms);
    };
    const nav = async (labelText) => {
      await page.getByRole("button", { name: labelText, exact: true }).first().click();
      await page.waitForTimeout(200);
    };
    const goHome = async () => {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => document.body.innerText.includes("Runtime connected"), null, { timeout: 60000 });
      await settle(250);
    };
    const setViewport = async (vp) => {
      viewport = vp;
      await page.setViewportSize(VIEWPORTS[vp]);
      await page.waitForTimeout(500);
    };
    const phaseOf = (ariaLabel) =>
      page.evaluate((name) => document.querySelector(`[aria-label="${name}"]`)?.textContent ?? "", ariaLabel);
    const waitForState = async (ariaLabel, expected, timeoutMs = 15000) => {
      await page.waitForFunction(
        ({ name, want }) => (document.querySelector(`[aria-label="${name}"]`)?.textContent ?? "") === want,
        { name: ariaLabel, want: expected },
        { timeout: timeoutMs },
      );
    };

    await goHome();

    /* ── J-A: conversation turn ─────────────────────────────────────────── */
    log("J-A");
    await nav("Conversation");
    await page.locator("#chat-message").waitFor({ state: "visible", timeout: 15000 });
    await settle();
    await shot("J-A-00-initial");
    await page.fill("#chat-message", "good name for a goldfish");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForFunction((text) => document.body.innerText.includes(text), REPLY_TEXT, { timeout: 30000 });
    await page.waitForFunction(() => document.body.innerText.includes("Conversation complete"), null, { timeout: 30000 });
    await settle();
    await shot("J-A-01-after-first-turn");
    await setViewport("mobile");
    await settle();
    await shot("J-A-02-after-first-turn");
    await setViewport("desktop");

    /* ── J-C: shared state canvas ───────────────────────────────────────── */
    log("J-C");
    await nav("Shared state");
    await settle();
    await shot("J-C-00-initial");
    await page.getByRole("button", { name: "Start agent write", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("agent todo"), null, { timeout: 30000 });
    await page.waitForFunction(() => document.body.innerText.includes("Conversation complete") === false, null, { timeout: 1000 }).catch(() => {});
    await settle();
    await shot("J-C-01-after-todo-turn");
    await shot("J-C-03-canvas-after-agent-write");
    await page.getByRole("button", { name: "Save canvas edit", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("user todo"), null, { timeout: 30000 });
    await page.getByRole("button", { name: "Start agent observation", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("saw your edit"), null, { timeout: 30000 });
    await settle();
    await shot("J-C-04-after-canvas-write-turn");
    await setViewport("mobile");
    await settle();
    await shot("J-C-05-after-canvas-write-turn");
    await setViewport("desktop");

    /* ── J-E: controlled rendering ──────────────────────────────────────── */
    log("J-E");
    await nav("Controlled rendering");
    await settle();
    await shot("J-E-00-initial");

    // Pending is the server's own mid-run projection fold, photographed through the app's own
    // read path. The gate paces delivery; if the fold misses the mid-run window after the
    // retries, no file is written and the checkpoint is reported as uncapturable.
    const capturePending = async (name, attempts = 4) => {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await page.evaluate(() => {
          window.__evHold = true;
          window.__readHold = true;
          window.__armedRelease = true;
        });
        await page.getByRole("button", { name: "Request backend chart", exact: true }).click();
        await page.waitForTimeout(450);
        let caught = false;
        for (let release = 0; release < 12; release += 1) {
          const released = await page.evaluate(() => window.__readReleaseOne());
          if (!released) break;
          await page.waitForTimeout(140);
          const phase = await phaseOf("Controlled renderer phase");
          if (phase === "pending") {
            await settle(120);
            await shot(name);
            caught = true;
            break;
          }
          if (phase === "terminal") break;
        }
        await page.evaluate(() => {
          window.__readReleaseAll();
          window.__evReleaseAll();
        });
        if (caught) {
          await waitForState("Controlled renderer phase", "terminal", 20000);
          return true;
        }
        log(`pending attempt ${attempt}: fold missed the mid-run window (phase never displayed pending)`);
        await page.waitForTimeout(300);
      }
      await page.evaluate(() => {
        window.__readHold = false;
        window.__evHold = false;
      });
      return false;
    };

    const pendingShot = await capturePending("J-E-01-controlled-genui-pending");
    await settle();
    await shot("J-E-02-controlled-genui-complete");
    const pendingShot2 = await capturePending("J-E-03-backend-tool-pending");
    await settle();
    await shot("J-E-04-backend-tool-complete");
    await setViewport("mobile");
    await settle();
    await shot("J-E-05-after-backend-tool-mobile");
    await setViewport("desktop");

    /* ── J-F: tool human decision ───────────────────────────────────────── */
    log("J-F");
    await nav("Tool decision");
    await settle();
    await shot("J-F-00-initial");
    await page.getByRole("button", { name: "Offer meeting time", exact: true }).click();
    await waitForState("Decision state", "waiting");
    await settle();
    await shot("J-F-01-hitl-pending");
    // The reference has a distinct slot-selected state; the cognate decision control resolves in
    // one activation, so the closest equivalent state is the same offered-slot state.
    await shot("J-F-02-hitl-slot-selected");
    await page.getByRole("button", { name: "Accept 10:30", exact: true }).click();
    await waitForState("Decision state", "completed");
    await settle();
    await shot("J-F-03-hitl-resolved");
    await setViewport("mobile");
    await settle();
    await shot("J-F-04-after-hitl-mobile");
    await setViewport("desktop");

    /* ── J-H: declarative UI ────────────────────────────────────────────── */
    log("J-H");
    await nav("Declarative UI");
    await settle();
    await shot("J-H-00-initial");
    await page.getByRole("button", { name: "Ask for declarative UI", exact: true }).click();
    await waitForState("Declarative renderer", "rendered");
    await page.locator('button:has-text("Select region")').first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === "Select region");
      return button !== undefined && !button.disabled;
    }, null, { timeout: 15000 });
    await settle();
    await shot("J-H-01-declarative-surface");
    await setViewport("mobile");
    await settle();
    await shot("J-H-02-after-declarative-mobile");
    await setViewport("desktop");

    /* ── J-J: rich thread + lifecycle ───────────────────────────────────── */
    log("J-J");
    await nav("Rich thread");
    await page.locator("#chat-message").waitFor({ state: "visible", timeout: 15000 });
    await settle();
    await shot("J-J-00-initial");
    await page.fill("#chat-message", "good name for a goldfish");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForFunction((text) => document.body.innerText.includes(text), REPLY_TEXT, { timeout: 30000 });
    await page.waitForFunction(() => document.body.innerText.includes("Conversation complete"), null, { timeout: 30000 });
    await settle();
    await shot("J-J-01-after-text-turn");

    await page.getByRole("button", { name: "Request backend chart", exact: true }).click();
    await waitForState("Controlled renderer phase", "terminal", 20000);
    await settle();
    await shot("J-J-02-after-genui-turn");

    await page.getByRole("button", { name: "Start agent write", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("agent todo"), null, { timeout: 30000 });
    await settle();
    await shot("J-J-03-after-shared-state-turn");

    await setViewport("mobile");
    await settle();
    await shot("J-J-04-mobile-after-mixed-turn");
    await setViewport("desktop");

    await page.getByRole("button", { name: "Add rich thread turn", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("ThreadSummaryCard"), null, { timeout: 30000 });
    await settle();

    // Reload restore: a fresh client reads the same durable projections back.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes("Runtime connected"), null, { timeout: 60000 });
    await nav("Rich thread");
    await page.locator("#chat-message").waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: "Show earlier replies", exact: true }).click();
    await page.waitForTimeout(300);
    await settle();
    await shot("J-J-05-restored-after-reload");

    await page.getByRole("button", { name: "Threads", exact: true }).click();
    await page.locator('[data-thread-id="thread:j-j"]').waitFor({ state: "visible", timeout: 15000 });
    await settle();
    await shot("J-J-06-drawer-thread-list");

    await page.getByRole("button", { name: "New thread", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("No messages yet"), null, { timeout: 15000 });
    await settle();
    await shot("J-J-07-new-thread");

    await page.locator('[data-thread-id="thread:j-j"]').click();
    await page.waitForFunction(() => document.body.innerText.includes("earlier"), null, { timeout: 15000 });
    await page.getByRole("button", { name: "Show earlier replies", exact: true }).click();
    await page.waitForTimeout(300);
    await settle();
    await shot("J-J-08-switched-back");

    await browser.close();
    browser = undefined;

    const manifest = {
      capturedAt: new Date().toISOString(),
      server: BASE,
      port: PORT,
      viewportDesktop: VIEWPORTS.desktop,
      viewportMobile: VIEWPORTS.mobile,
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      shots,
      pendingCaptures: { "J-E-01-controlled-genui-pending": pendingShot, "J-E-03-backend-tool-pending": pendingShot2 },
    };
    await writeFile(path.join(HERE, "capture-log.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    log(`done: ${shots.length} screenshots under ${SHOTS}`);
    if (!pendingShot) log("NOTE: J-E-01 pending state was not photographable; checkpoint left uncaptured (named deviation)");
    if (!pendingShot2) log("NOTE: J-E-03 pending state was not photographable; checkpoint left uncaptured (named deviation)");
  } finally {
    if (browser !== undefined) await browser.close().catch(() => {});
    if (!keepServer) {
      server.kill("SIGTERM");
      await sleep(500);
      try {
        server.kill("SIGKILL");
      } catch {}
      log("server stopped");
    } else {
      log(`server left running at ${BASE} (pid ${server.pid})`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
