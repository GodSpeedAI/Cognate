// Ad-hoc verification capture for the Hallmark/Impeccable redesign pass — not a permanent fixture.
// Run: bun validation/reconstructions/deepseek-harness/cognate/redesign/verify.ts
// Expects the app server already running on :3180 (COGNATE_HARNESS_HOME pointed at a scratch dir).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3180";
const OUT_DIR = join(import.meta.dirname, "screenshots");
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const consoleErrors: string[] = [];

async function newPage(viewport: { width: number; height: number }) {
  const page = await browser.newPage({ viewport });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[${viewport.width}x${viewport.height}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`[${viewport.width}x${viewport.height}] pageerror: ${err.message}`));
  return page;
}

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: join(OUT_DIR, name) });
  console.log(`captured ${name}`);
}

const desktop = await newPage({ width: 1440, height: 900 });
await desktop.goto(APP_URL);
await desktop.waitForTimeout(400);
await shot(desktop, "01-first-launch.png");

await desktop.getByRole("button", { name: "Continue" }).click();
await desktop.waitForTimeout(150);
await shot(desktop, "02-apikey-dialog.png");
await desktop.getByRole("button", { name: "Configure later" }).click();
await desktop.waitForTimeout(150);
await shot(desktop, "03-workspace-chooser.png");

// Settings modal — focus trap / aria-modal / typography check.
await desktop.getByRole("button", { name: "Settings" }).click();
await desktop.waitForTimeout(200);
await shot(desktop, "04-settings-models.png");
await desktop.getByRole("button", { name: "General" }).click();
await desktop.waitForTimeout(150);
await shot(desktop, "05-settings-general.png");
// Escape should now close the modal (new behavior from useModalFocus).
await desktop.keyboard.press("Escape");
await desktop.waitForTimeout(150);
await shot(desktop, "06-settings-closed-via-escape.png");

// Workspace selection -> hero landing.
const { mkdtemp } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const workspaceDir = await mkdtemp(join(tmpdir(), "cognate-console-verify-ws-"));
await desktop.getByLabel("Workspace directory path").fill(workspaceDir);
await desktop.getByRole("button", { name: "Choose workspace" }).click();
await desktop.waitForTimeout(400);
await shot(desktop, "07-hero-landing.png");

// Narrow viewport pass (Phase 7 spot-check, not a full adapt pass).
const narrow = await newPage({ width: 390, height: 844 });
await narrow.goto(APP_URL);
await narrow.waitForTimeout(400);
await shot(narrow, "08-narrow-first-launch.png");

await browser.close();

console.log("\n--- console/page errors ---");
if (consoleErrors.length === 0) {
  console.log("none");
} else {
  for (const e of consoleErrors) console.log(e);
}
