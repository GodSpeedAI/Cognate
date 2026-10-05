/**
 * Usage-features capture/probe pass for the pinned DeepSeek Harness reference (U0,
 * plan: .agents/plans/deepseek-harness-usage-features.md). Stage-driven against the
 * re-cloned pinned SHA; produces the `22*`-`26*` checkpoints recorded in
 * reference-behavior-matrix.md SS11-15. Writes aria + screenshots to /tmp/u0/ - the
 * committed artifacts under reference/{screenshots/desktop,observations/aria} were
 * copied from the 2026-09-30 run of these stages (mock model on :4010, DSH_HOME at
 * /tmp/u0-dsh-home, fixture workspaces /tmp/u0-ws-a and /tmp/u0-ws-b).
 *
 *   bun run tests/capture/reference.capture-usage.ts <stage>
 *
 * Stages: setup | general | workspaces | workspaces2 | trajectory | trajectory2 |
 *         plugins | plugins2 | presets | details
 * Requires: mock model already running at http://127.0.0.1:4010/v1, and the pinned
 * reference built at .tmp/ref/deepseek-harness (pnpm run build).
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ReferenceDriver } from "../drivers/reference";

const ROOT = "/home/sprime01/projects/cognate/validation/reconstructions/deepseek-harness";
const OUT = "/tmp/u0";
const HOME = "/tmp/u0-dsh-home";
const PORT = 3080;
const stage = process.argv[2] ?? "setup";

mkdirSync(OUT, { recursive: true });

const DISABLE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
`;

async function dump(page: Page, name: string, shot = true): Promise<void> {
  const snap = await page.locator("body").ariaSnapshot();
  await Bun.write(`${OUT}/${name}.txt`, snap);
  if (shot) await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`[probe] dumped ${name}`);
}

async function clickIfPresent(page: Page, name: string | RegExp, opts?: { exact?: boolean }): Promise<boolean> {
  const btn = page.getByRole("button", { name, exact: opts?.exact }).first();
  if ((await btn.count().catch(() => 0)) > 0 && (await btn.isVisible().catch(() => false))) {
    await btn.click().catch((e) => console.log(`[probe] click ${String(name)} failed: ${e}`));
    await page.waitForTimeout(300);
    return true;
  }
  console.log(`[probe] NOT FOUND: button ${String(name)}`);
  return false;
}

const driver = new ReferenceDriver(`${ROOT}/../../../.tmp/ref/deepseek-harness`);
await driver.launch({ homeDir: HOME, port: PORT, mockModelBaseUrl: "http://127.0.0.1:4010/v1" });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: "en-US",
  timezoneId: "UTC",
  reducedMotion: "reduce",
  colorScheme: "light",
});
await ctx.addInitScript((css) => {
  window.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  });
}, DISABLE_ANIMATIONS_CSS);
const page = await ctx.newPage();

try {
  await driver.authenticate(page); // token URL + dismiss first-run dialogs
  await page.waitForTimeout(1000);
  await dump(page, "00-after-auth", false);

  // Generic dismissal loop: any visible enabled button inside the topmost open dialog gets
  // clicked (max 4 rounds) until no dialog overlay remains.
  for (let round = 0; round < 4; round++) {
    const dialogs = page.getByRole("dialog");
    const dN = await dialogs.count().catch(() => 0);
    if (dN === 0) break;
    const dlg = dialogs.last();
    if (!(await dlg.isVisible().catch(() => false))) break;
    const btns = dlg.getByRole("button");
    const bN = await btns.count().catch(() => 0);
    console.log(`[probe] dialog round ${round}: ${bN} buttons in topmost dialog`);
    let clicked = false;
    for (let i = bN - 1; i >= 0; i--) {
      const b = btns.nth(i);
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        const label = (await b.innerText().catch(() => "")).trim();
        await b.click().catch(() => {});
        console.log(`[probe] dismissed dialog button: ${label}`);
        clicked = true;
        await page.waitForTimeout(400);
        break;
      }
    }
    if (!clicked) break;
  }
  await dump(page, "00b-dialogs-cleared", false);

  if (stage === "setup") {
    await driver.openSettingsModels(page);
    await driver.configureModel(page, { baseUrl: "http://127.0.0.1:4010/v1", apiKey: "dummy-key-12345", protocol: "openai-completions" });
    await clickIfPresent(page, "Close", { exact: true });
    await driver.chooseWorkspace(page, "/tmp/u0-ws-a");
    await page.waitForTimeout(500);
    await dump(page, "01-shell-one-workspace");
  }

  if (stage === "general") {
    // Settings -> General, full inventory before touching anything
    await clickIfPresent(page, "Settings", { exact: true });
    await page.waitForTimeout(400);
    await clickIfPresent(page, "General", { exact: true });
    await page.waitForTimeout(400);
    await dump(page, "02-general-fresh");

    // Each setting's control is a button labelled with its CURRENT VALUE.
    for (const [name, label, out] of [
      ["permission", "Workspace Write", "02b-permission-menu"],
      ["performance", "Detailed", "02c-performance-menu"],
      ["send-behavior", "Queue", "02d-send-behavior-menu"],
      ["language", "English", "02f-language-menu"],
      ["work-details", "Standard", "02g-work-details-menu"],
    ] as const) {
      const btn = page.getByRole("button", { name: label, exact: true }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
        await dump(page, out);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      } else {
        console.log(`[probe] ${name} button "${label}" not visible`);
      }
    }

    // Font size stepper: increase twice, observe the reported px + conversation font
    await clickIfPresent(page, "Increase font size");
    await clickIfPresent(page, "Increase font size");
    await page.waitForTimeout(300);
    await dump(page, "02h-font-size-increased", false);
    await clickIfPresent(page, "Decrease font size");
    await clickIfPresent(page, "Decrease font size");
    await page.waitForTimeout(200);

    // Keyboard shortcuts editor (dialog over the settings dialog)
    await clickIfPresent(page, "Edit shortcuts");
    await page.waitForTimeout(500);
    await dump(page, "02e-keyboard-shortcuts");
    await clickIfPresent(page, "Close keyboard shortcuts");
    await page.waitForTimeout(300);

    // Coding Tools OFF: effect on a NEW chat's session chrome (tab bar)
    const codingTools = page.getByRole("switch", { name: "Coding Tools" }).first();
    await codingTools.click();
    await page.waitForTimeout(300);
    await dump(page, "02i-coding-tools-off", false);
    await clickIfPresent(page, "Close", { exact: true });
    await page.waitForTimeout(300);
    await driver.newSession(page);
    await driver.send(page, "[[scenario:plain]] coding tools off probe");
    await driver.waitForIdle(page);
    await dump(page, "02j-session-with-coding-tools-off");
    // and back ON for later stages
    await clickIfPresent(page, "Settings", { exact: true });
    await page.waitForTimeout(400);
    await page.getByRole("switch", { name: "Coding Tools" }).click();
    await page.waitForTimeout(300);
    await clickIfPresent(page, "Close", { exact: true });
    await page.waitForTimeout(300);
  }

  if (stage === "workspaces") {
    // What does the sidebar's Workspaces header area expose? Dump current shell first.
    await dump(page, "03-shell-before-second-ws");
    // Re-choose workspace -> the §3 unresolved question: dropdown vs file browser when one exists
    await clickIfPresent(page, "Choose workspace", { exact: true });
    await page.waitForTimeout(500);
    await dump(page, "03b-choose-workspace-existing");

    // The Workspaces header's icon buttons (search / view options / add)
    const searchBtn = page.getByRole("button", { name: /search/i }).first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(300);
      await dump(page, "03c-workspace-search-open");
      const box = page.getByRole("textbox", { name: /search/i }).first();
      if (await box.isVisible().catch(() => false)) {
        await box.fill("u0-ws");
        await page.waitForTimeout(300);
        await dump(page, "03d-workspace-search-filled");
      }
      await page.keyboard.press("Escape");
    }
    const addBtn = page.getByRole("button", { name: /add workspace|new workspace/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await dump(page, "03e-add-workspace-surface");
      await page.keyboard.press("Escape");
    }

    // Add the second workspace via the sidebar "Add workspace" button -> directory dialog
    await clickIfPresent(page, "Add workspace", { exact: true });
    await page.waitForTimeout(500);
    await dump(page, "03f-directory-dialog");
    await clickIfPresent(page, "Edit path", { exact: true });
    const pathBox = page.getByRole("dialog", { name: "Select Workspace Directory" }).getByRole("textbox");
    await pathBox.fill("/tmp/u0-ws-b");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await clickIfPresent(page, "Open", { exact: true });
    await page.waitForTimeout(500);
    await dump(page, "03g-two-workspaces");

    // Session in ws-b, then switch back to ws-a via its sidebar treeitem
    await driver.send(page, "[[scenario:plain]] hello from ws-b");
    await driver.waitForIdle(page);
    await dump(page, "03h-ws-b-session");

    const items = page.getByRole("tree", { name: "Sessions" }).getByRole("treeitem");
    const n = await items.count();
    for (let i = 0; i < n; i++) console.log(`[probe] treeitem[${i}]: ${(await items.nth(i).innerText().catch(() => "?")).replace(/\n/g, " | ")}`);
    await dump(page, "03i-sidebar-tree-raw");

    // switch back to ws-a by clicking its treeitem
    const wsA = page.getByRole("treeitem", { name: /^u0-ws-a/ }).first();
    if (await wsA.isVisible().catch(() => false)) {
      await wsA.click();
      await page.waitForTimeout(600);
      await dump(page, "03j-switched-back-to-ws-a");
    }

    // reload persistence
    await driver.reload(page);
    await page.waitForTimeout(800);
    await dump(page, "03k-after-reload");
  }

  if (stage === "workspaces2") {
    await dump(page, "03m-start");
    // 1) the "Workspace actions for <name>" menu
    const actions = page.getByRole("button", { name: /Workspace actions for u0-ws-a/ }).first();
    if (await actions.isVisible().catch(() => false)) {
      await actions.click();
      await page.waitForTimeout(400);
      await dump(page, "03n-workspace-actions-menu");
      const items2 = page.getByRole("menuitem");
      const n2 = await items2.count().catch(() => 0);
      for (let i = 0; i < n2; i++) console.log(`[probe] actions-menu item[${i}]: ${(await items2.nth(i).innerText().catch(() => "?")).replace(/\n/g, " | ")}`);
      await page.keyboard.press("Escape");
    } else {
      console.log("[probe] no Workspace actions button visible (maybe only on hover/active)");
    }

    // 2) switching the active workspace via Choose workspace dropdown
    await clickIfPresent(page, "Choose workspace", { exact: true });
    await page.waitForTimeout(400);
    await dump(page, "03o-choose-workspace-menu");
    const mItem = page.getByRole("menuitem", { name: "u0-ws-a", exact: true }).first();
    if (await mItem.isVisible().catch(() => false)) {
      await mItem.click();
      await page.waitForTimeout(600);
      await dump(page, "03p-switched-to-ws-a");
    }

    // 3) View options
    const viewOpts = page.getByRole("button", { name: "View options", exact: true }).first();
    if (await viewOpts.isVisible().catch(() => false)) {
      await viewOpts.click();
      await page.waitForTimeout(400);
      await dump(page, "03q-view-options");
      await page.keyboard.press("Escape");
    }
  }

  if (stage === "trajectory") {
    await driver.newSession(page);
    await driver.send(page, "[[scenario:multi]] review and fix the greeting");
    await driver.waitForIdle(page);
    await page.waitForTimeout(500);
    await dump(page, "04-session-complete-chat-tab");

    const trajTab = page.getByRole("tab", { name: /trajectory/i }).first();
    if (await trajTab.isVisible().catch(() => false)) {
      await trajTab.click();
      await page.waitForTimeout(500);
      await dump(page, "04b-trajectory");

      // probe every button/treeitem/row inside the trajectory view, one at a time
      const trajRegion = page.locator("[role=tabpanel], main").filter({ hasText: /trajectory|turn/i }).first();
      void trajRegion;
      // Try clicking the first few treeitems / listitems / buttons that look like steps
      const candidates = page.getByRole("treeitem");
      const cN = await candidates.count().catch(() => 0);
      console.log(`[probe] trajectory treeitems: ${cN}`);
      for (let i = 0; i < Math.min(cN, 8); i++) {
        const label = (await candidates.nth(i).innerText().catch(() => "?")).replace(/\n/g, " | ");
        console.log(`[probe] traj treeitem[${i}]: ${label.slice(0, 160)}`);
      }
      if (cN > 0) {
        await candidates.nth(Math.min(cN - 1, 2)).click();
        await page.waitForTimeout(500);
        await dump(page, "04c-trajectory-step-selected");
      }
      // tablist inside trajectory (Summary/Payload/...?)
      const tabs = page.getByRole("tab");
      const tN = await tabs.count().catch(() => 0);
      for (let i = 0; i < tN; i++) console.log(`[probe] tab[${i}]: ${await tabs.nth(i).innerText().catch(() => "?")}`);
    } else {
      console.log("[probe] NO Trajectory tab visible");
    }

    // live mid-run
    await driver.newSession(page);
    await driver.send(page, "[[scenario:multi]] another task");
    await page.waitForTimeout(1200);
    const trajTab2 = page.getByRole("tab", { name: /trajectory/i }).first();
    if (await trajTab2.isVisible().catch(() => false)) {
      await trajTab2.click();
      await page.waitForTimeout(400);
      await dump(page, "04d-trajectory-live");
    }
    await driver.waitForIdle(page);
    // reload persistence of the trajectory view
    await driver.reload(page);
    await page.waitForTimeout(800);
    const trajTab3 = page.getByRole("tab", { name: /trajectory/i }).first();
    if (await trajTab3.isVisible().catch(() => false)) {
      await trajTab3.click();
      await page.waitForTimeout(500);
      await dump(page, "04e-trajectory-after-reload");
    }
  }

  if (stage === "trajectory2") {
    // open the last multi session's trajectory
    const sess = page.getByRole("treeitem", { name: /\[\[scenario:multi\]\] review and fix the/ }).first();
    if (await sess.isVisible().catch(() => false)) {
      await sess.click();
      await page.waitForTimeout(500);
    }
    await page.getByRole("tab", { name: "Trajectory" }).click();
    await page.waitForTimeout(500);
    await dump(page, "05-start-trajectory");

    // Request #1 detail
    await page.getByRole("button", { name: "Request #1", exact: true }).first().click();
    await page.waitForTimeout(500);
    await dump(page, "05b-request1-detail");

    // a TOOL row click
    const toolRow = page.getByRole("row", { name: /^TOOL, read/ }).first();
    if (await toolRow.isVisible().catch(() => false)) {
      await toolRow.click();
      await page.waitForTimeout(500);
      await dump(page, "05c-tool-row-selected");
    }

    // toolbar toggles
    await clickIfPresent(page, "Collapse turns");
    await dump(page, "05d-turns-collapsed");
    await clickIfPresent(page, "Collapse calls");
    await dump(page, "05e-calls-collapsed");
    await clickIfPresent(page, "Use actual duration");
    await dump(page, "05f-duration-toggled");
    // toggle back
    await clickIfPresent(page, "Use actual duration");
    await clickIfPresent(page, "Collapse calls");
    await clickIfPresent(page, "Collapse turns");

    // search
    const sbox = page.getByRole("searchbox", { name: "Search trajectory" });
    if (await sbox.isVisible().catch(() => false)) {
      await sbox.fill("edit");
      await page.waitForTimeout(400);
      await dump(page, "05g-trajectory-search-edit");
      await sbox.fill("");
      await page.waitForTimeout(300);
    }
  }

  if (stage === "plugins") {
    await clickIfPresent(page, "Settings", { exact: true });
    await page.waitForTimeout(400);
    await clickIfPresent(page, "Built-in plugins", { exact: true });
    await page.waitForTimeout(500);
    await dump(page, "05-builtin-plugins");

    // any switches/toggles inside?
    const switches = page.getByRole("switch");
    const sN = await switches.count().catch(() => 0);
    console.log(`[probe] plugin switches: ${sN}`);
    for (let i = 0; i < Math.min(sN, 10); i++) {
      const swLabel = (await switches.nth(i).getAttribute("aria-label").catch(() => null)) ?? (await switches.nth(i).innerText().catch(() => "?"));
      console.log(`[probe] switch[${i}]: ${swLabel}`);
    }
    if (sN > 0) {
      await switches.first().click();
      await page.waitForTimeout(400);
      await dump(page, "05b-plugin-toggled");
      await switches.first().click(); // restore
      await page.waitForTimeout(300);
    }
    // sidebar Plugins nav present?
    await clickIfPresent(page, "Close", { exact: true });
    await dump(page, "05c-shell-after-plugins");
    const pluginsNav = page.getByRole("button", { name: "Plugins", exact: true });
    console.log(`[probe] sidebar Plugins nav visible: ${await pluginsNav.isVisible().catch(() => false)}`);
  }

  if (stage === "details") {
    // workspace hover actions menu (the "…" button appears on hover)
    const wsRow = page.getByRole("treeitem", { name: /^u0-ws-a/ }).first();
    await wsRow.hover();
    await page.waitForTimeout(400);
    const actionsBtn = page.getByRole("button", { name: /Workspace actions for u0-ws-a/ }).first();
    if (await actionsBtn.isVisible().catch(() => false)) {
      await actionsBtn.click();
      await page.waitForTimeout(400);
      await dump(page, "07-workspace-actions-menu");
      const items2 = page.getByRole("menuitem");
      const n2 = await items2.count().catch(() => 0);
      for (let i = 0; i < n2; i++) console.log(`[probe] ws-actions item[${i}]: ${(await items2.nth(i).innerText().catch(() => "?")).replace(/\n/g, " | ")}`);
      await page.keyboard.press("Escape");
    } else {
      console.log("[probe] workspace actions button not visible after hover");
    }

    // preset "View configuration" target
    await clickIfPresent(page, "Settings", { exact: true });
    await page.waitForTimeout(400);
    await clickIfPresent(page, "Agent presets", { exact: true });
    await page.waitForTimeout(400);
    await clickIfPresent(page, "View configuration: Standard mode");
    await page.waitForTimeout(500);
    await dump(page, "07b-preset-configuration");
    await clickIfPresent(page, "Close", { exact: true });

    // plugin "View Agent Teams" detail target
    await page.getByRole("navigation", { name: "Global panels" }).getByRole("button", { name: "Plugins" }).click();
    await page.waitForTimeout(600);
    await clickIfPresent(page, "View Agent Teams");
    await page.waitForTimeout(500);
    await dump(page, "07c-plugin-detail");
  }

  if (stage === "plugins2") {
    await clickIfPresent(page, "Settings", { exact: true });
    await page.waitForTimeout(400);
    await clickIfPresent(page, "Built-in plugins", { exact: true });
    await page.waitForTimeout(500);
    await dump(page, "06-start-plugins");

    await clickIfPresent(page, "Session plugins");
    await page.waitForTimeout(500);
    await dump(page, "06b-session-plugins-expanded");

    // preset filter dropdown in the plugins panel
    await clickIfPresent(page, "Choose the agent preset to inspect");
    await page.waitForTimeout(400);
    await dump(page, "06c-preset-inspect-menu");
    const mi = page.getByRole("menuitem", { name: /PTC mode/ }).first();
    if (await mi.isVisible().catch(() => false)) {
      await mi.click();
      await page.waitForTimeout(500);
      await dump(page, "06d-session-plugins-ptc");
    }

    await clickIfPresent(page, "Global plugins");
    await page.waitForTimeout(500);
    await dump(page, "06e-global-plugins-expanded");

    // search
    const ps = page.getByRole("searchbox", { name: "Search plugins" });
    if (await ps.isVisible().catch(() => false)) {
      await ps.fill("terminal");
      await page.waitForTimeout(400);
      await dump(page, "06f-plugins-search-terminal");
      await ps.fill("");
    }
    await clickIfPresent(page, "Close", { exact: true });

    // sidebar "Plugins" global panel
    await page.getByRole("navigation", { name: "Global panels" }).getByRole("button", { name: "Plugins" }).click();
    await page.waitForTimeout(600);
    await dump(page, "06g-plugins-global-panel");
  }

  if (stage === "presets") {
    // the in-session preset selector first
    const presetBtn = page.getByRole("button", { name: /Standard mode|PTC mode|Minimal mode|Creator mode/ }).first();
    if (await presetBtn.isVisible().catch(() => false)) {
      await presetBtn.click();
      await page.waitForTimeout(300);
      await dump(page, "06-preset-selector-menu");
      await page.keyboard.press("Escape");
    }
    await clickIfPresent(page, "Settings", { exact: true });
    await page.waitForTimeout(400);
    await clickIfPresent(page, "Agent presets", { exact: true });
    await page.waitForTimeout(500);
    await dump(page, "06b-agent-presets-panel");
    // buttons inside the presets panel
    const btns = page.getByRole("button");
    const bN = await btns.count().catch(() => 0);
    for (let i = 0; i < bN; i++) {
      const label = (await btns.nth(i).innerText().catch(() => "")).replace(/\n/g, " | ").trim();
      const vis = await btns.nth(i).isVisible().catch(() => false);
      if (label && vis) console.log(`[probe] btn[${i}]: ${label.slice(0, 120)}`);
    }
    await clickIfPresent(page, "Close", { exact: true });
  }
} finally {
  await browser.close();
  await driver.stop();
}
console.log(`[probe] stage ${stage} done`);
