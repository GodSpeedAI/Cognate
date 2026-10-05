// One-off Playwright capture script for T5 dev screenshots. Not part of `bun test`; run manually:
//   bun validation/reconstructions/deepseek-harness/cognate/screenshots/capture.ts
// Expects the app server (default :3180) and the mock model server (default :4010) already running.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3180";
const MOCK_URL = process.env.MOCK_MODEL_URL ?? "http://127.0.0.1:4010";
const OUT_DIR = join(import.meta.dirname, "dev");
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

async function shot(name: string) {
  await page.screenshot({ path: join(OUT_DIR, name) });
  console.log(`captured ${name}`);
}

await page.goto(APP_URL);
await page.waitForTimeout(500);
await shot("01-first-launch.png");

// Settings -> Models
await page.getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(200);
await shot("02-settings-models.png");
await page.getByLabel("Provider id").fill("mock");
await page.getByPlaceholder("http://127.0.0.1:4010/v1").fill(`${MOCK_URL}/v1`);
await page.getByPlaceholder("mock-model-1").fill("mock-model-1");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(300);
await shot("03-settings-models-saved.png");
await page.getByRole("button", { name: "Close" }).click();

// Workspace chooser
await page.waitForTimeout(200);
await shot("04-workspace-chooser.png");
const { mkdtemp } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const workspaceDir = await mkdtemp(join(tmpdir(), "dsh-screenshot-ws-"));
await page.getByLabel("Workspace directory path").fill(workspaceDir);
await page.getByRole("button", { name: "Choose workspace" }).click();
await page.waitForTimeout(400);
await shot("05-workspace-selected.png");

// A streamed plain answer
await page.getByLabel("Message").fill("[[scenario:plain]] summarize this project");
await page.getByRole("button", { name: "Send" }).click();
await page.waitForTimeout(150);
await shot("06-turn-streaming.png");
await page.waitForTimeout(2000);
await shot("07-turn-completed.png");

await browser.close();
console.log("done");
