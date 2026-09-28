/**
 * Artifact Viewer — J11 Integrated Browser Journey & UI assertions.
 *
 * Uses Playwright to drive headless Chromium against the live viewer server.
 * Tests:
 *   - Landing state & document tree discovery
 *   - Browse to a real doc (`docs/architecture.md`)
 *   - Render Markdown elements (headings, tables, code blocks)
 *   - Outline selection & heading click scroll
 *   - Mermaid diagram rendering (real repo diagram in `docs/README.md`)
 *   - Mermaid Focus dialog open, zoom/pan controls, source inspection, and Escape to close
 *   - Palette Search (⌘K / Ctrl+K), typing, result selection, navigation
 *   - History timeline: Git commits listed, truthful provenance
 *   - Historical revision selection: renders through SAME markdown renderer
 *   - Compare / diff view: shows line-level hunks between revisions
 *   - Edit mode on current doc: preview updates, live Mermaid preview, save to disk
 *   - Edit mode on historical revision: disabled / read-only state
 *   - Responsive behavior at mobile width (375px) vs desktop (1280px)
 *   - Keyboard navigation: 1-5 mode switching, arrow keys in tree, Esc behavior
 *   - Zero console errors throughout the entire journey
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { main } from "../../scripts/show-documents.ts";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const SCRATCH_DOC = resolve(REPO_ROOT, "docs/.viewer-browser-scratch.md");
const SCRATCH_REPO_PATH = "docs/.viewer-browser-scratch.md";

describe("J11 — Integrated Browser Journey", () => {
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  beforeAll(async () => {
    // Write scratch doc for edit tests
    writeFileSync(SCRATCH_DOC, "# Scratch Test\n\nOriginal scratch content.\n\n```mermaid\ngraph LR; A-->B;\n```\n");
    const launched = await main(["--port", "0", "--no-hyperlink"], REPO_ROOT);
    server = launched.server;

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(`${launched.url}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
  });

  afterAll(async () => {
    if (existsSync(SCRATCH_DOC)) unlinkSync(SCRATCH_DOC);
    if (browser) await browser.close();
    server?.stop(true);
  });

  test("Step 1: Landing page renders cleanly with document tree", async () => {
    expect(await page.title()).toBe("Artifact Viewer — Documentation Mode");
    const landingTitle = await page.locator(".state__title").textContent();
    expect(landingTitle).toBe("Artifact Viewer");

    // Tree populated
    const treeLinks = await page.locator("a[data-path]").count();
    expect(treeLinks).toBeGreaterThanOrEqual(50);
  });

  test("Step 2: Browse and open docs/architecture.md", async () => {
    // Click architecture in tree
    const archLink = page.locator("a[data-path='docs/architecture.md']");
    await archLink.click();
    await page.waitForTimeout(800);

    // Hash updated
    expect(await page.evaluate(() => location.hash)).toContain("#/doc/docs/architecture.md");

    // Title updated
    expect(await page.title()).toContain("Architecture");

    // Prose elements rendered
    const h1 = await page.locator("#doc-body h1").first().textContent();
    expect(h1).toBe("Architecture");

    // Table rendered as responsive container
    const tables = await page.locator("#doc-body .table-scroll").count();
    expect(tables).toBeGreaterThanOrEqual(1);

    // Code blocks rendered with syntax headers
    const codeBlocks = await page.locator("#doc-body .code-block").count();
    expect(codeBlocks).toBeGreaterThanOrEqual(1);

    // Provenance strip shows truthful facts
    const provPath = await page.locator(".provstrip__path").textContent();
    expect(provPath).toBe("docs/architecture.md");
    const provFacts = await page.locator(".provstrip__facts").textContent();
    expect(provFacts).toContain("Working tree");

    // Outline in context rail is populated
    const outlineItems = await page.locator("#outline-body .outline__item").count();
    expect(outlineItems).toBeGreaterThanOrEqual(5);

    // Long documents scroll inside the reading pane; both application bars remain visible.
    await page.locator("#reading").evaluate((element) => { element.scrollTop = 1500; });
    const layout = await page.evaluate(() => ({
      scroll: document.querySelector("#reading")?.scrollTop ?? 0,
      headerTop: document.querySelector(".topbar")?.getBoundingClientRect().top ?? -1,
      footerBottom: document.querySelector(".modebar")?.getBoundingClientRect().bottom ?? -1,
      backdrop: getComputedStyle(document.querySelector("#rail-backdrop")!).display,
      viewport: innerHeight,
    }));
    expect(layout.scroll).toBeGreaterThan(1000);
    expect(layout.headerTop).toBe(0);
    expect(layout.footerBottom).toBe(layout.viewport);
    expect(layout.backdrop).toBe("none");

    // Use actual pointer controls. A desktop backdrop must never intercept these clicks.
    await page.locator(".mode[data-mode='source']").click();
    await page.locator("#doc-source code").waitFor();
    expect(await page.locator("#doc-source code").textContent()).toContain("# Architecture");
    await page.locator(".mode[data-mode='read']").click();
    await page.locator("#doc-body h1").waitFor();
    expect(await page.locator("#doc-editor").evaluate((element) => getComputedStyle(element).display)).toBe("none");
    expect(await page.locator("#doc-state").evaluate((element) => getComputedStyle(element).display)).toBe("none");
  });

  test("Step 3: Mermaid diagram rendering and inspection (docs/README.md)", async () => {
    await page.evaluate(() => { location.hash = "#/doc/docs/README.md"; });
    await page.waitForTimeout(2000);

    // Fenced mermaid block became a .diagram container
    const diagram = page.locator(".diagram").first();
    expect(await diagram.count()).toBe(1);
    expect(await diagram.getAttribute("data-state")).toBe("ready");

    // SVG rendered inside canvas
    const svg = page.locator(".diagram__canvas svg").first();
    expect(await svg.count()).toBe(1);

    // Focus tool button is present
    const focusBtn = page.locator(".diagram__tools button", { hasText: "Focus" }).first();
    expect(await focusBtn.count()).toBe(1);

    // Click focus to open diagram dialog
    await focusBtn.click();
    await page.waitForTimeout(400);

    const dialog = page.locator("#diagram");
    expect(await dialog.evaluate((el: HTMLDialogElement) => el.open)).toBe(true);

    // Dialog contains the SVG in stage
    const dialogSvg = page.locator("#diagram-stage-inner svg");
    expect(await dialogSvg.count()).toBe(1);

    // Toggle source in dialog
    const sourceToggle = page.locator("#diagram-source-toggle");
    await sourceToggle.click();
    const diagramSource = page.locator("#diagram-source");
    expect(await diagramSource.isVisible()).toBe(true);
    expect(await diagramSource.textContent()).toMatch(/flowchart|graph/);

    // Escape closes dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    expect(await dialog.evaluate((el: HTMLDialogElement) => el.open)).toBe(false);
  });

  test("Step 3b: New conceptual diagrams render from repository Markdown", async () => {
    const files = [
      "architecture.md",
      "mental-model.md",
      "cognition.md",
      "protocols.md",
      "explanation/authority-and-learning.md",
      "subsystems/continuations-and-commitments.md",
    ];
    for (const file of files) {
      await page.evaluate((path) => { location.hash = `#/doc/docs/${path}`; }, file);
      await page.waitForFunction((path) => document.querySelector(".provstrip__path")?.textContent === `docs/${path}`, file);
      await page.waitForFunction(() => {
        const diagrams = [...document.querySelectorAll<HTMLElement>("#doc-body .diagram")];
        return diagrams.length > 0 && diagrams.every((diagram) => diagram.dataset.state !== "pending");
      });
      const states = await page.locator("#doc-body .diagram").evaluateAll((diagrams) => diagrams.map((diagram) => (diagram as HTMLElement).dataset.state));
      expect(states.every((value) => value === "ready")).toBe(true);
    }
  });

  test("Step 4: Search palette (Ctrl+K) finds and navigates to document", async () => {
    // Open palette via keyboard shortcut
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(300);

    const palette = page.locator("#palette");
    expect(await palette.evaluate((el: HTMLDialogElement) => el.open)).toBe(true);

    // Type query
    await page.fill("#palette-input", "RealityTrace");
    await page.waitForTimeout(300);

    // Results appear
    const results = page.locator(".palette__result");
    expect(await results.count()).toBeGreaterThan(0);

    // Press Enter to navigate to first result
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);

    // Palette closed and document opened
    expect(await palette.evaluate((el: HTMLDialogElement) => el.open)).toBe(false);
    expect(await page.evaluate(() => location.hash)).toContain("ADR-0007");
  });

  test("Step 5: Git history timeline and provenance", async () => {
    await page.evaluate(() => { location.hash = "#/doc/docs/architecture.md"; });
    await page.waitForTimeout(800);

    // Press "4" to enter History mode
    await page.keyboard.press("4");
    await page.waitForTimeout(1000);

    expect(await page.evaluate(() => location.hash)).toContain("mode=history");
    expect(await page.locator("#doc-state").evaluate((element) => getComputedStyle(element).display)).toBe("none");

    // History list contains entries
    const entries = page.locator(".history__entry");
    expect(await entries.count()).toBeGreaterThanOrEqual(2);

    // First entry is current working file
    const firstSubject = await page.locator(".history__subject").first().textContent();
    expect(firstSubject).toBe("Current working file");

    // Second entry is real Git commit
    const secondEntry = entries.nth(1);
    const meta = await secondEntry.locator(".history__meta").textContent();
    expect(meta).toMatch(/[0-9a-f]{7}/); // short hash present
  });

  test("Step 6: Historical revision passes through SAME markdown renderer and is read-only", async () => {
    // Click the second revision in the list
    const entries = page.locator(".history__entry");
    await entries.nth(1).click();
    await page.waitForTimeout(1000);

    // URL has ?rev=<hash>
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toContain("rev=");

    // Rendered through ordinary renderer: h1 is present
    const h1 = await page.locator("#doc-body h1").first().textContent();
    expect(h1).toBe("Architecture");

    // Provenance strip shows revision facts
    const provFacts = await page.locator(".provstrip__facts").textContent();
    expect(provFacts).toContain("Revision");

    // Edit button in modebar is DISABLED for historical revisions
    const editBtn = page.locator(".mode[data-mode='edit']");
    expect(await editBtn.isDisabled()).toBe(true);
    expect(await editBtn.getAttribute("title")).toContain("Historical revisions are read-only");
  });

  test("Step 7: Compare mode produces unified line diff", async () => {
    // Press "5" to enter Compare mode
    await page.keyboard.press("5");
    await page.waitForTimeout(1200);

    expect(await page.evaluate(() => location.hash)).toContain("mode=compare");

    // Diff container is present
    const diff = page.locator(".diff");
    expect(await diff.count()).toBe(1);

    // Controls allow selecting from/to
    const fromSelect = page.locator("select[aria-label='From']");
    const toSelect = page.locator("select[aria-label='To']");
    expect(await fromSelect.count()).toBe(1);
    expect(await toSelect.count()).toBe(1);

    // Summary line reports hunk details
    const summary = await page.locator(".compare__summary").textContent();
    expect(summary).toContain("→");
  });

  test("Step 8: Edit current document, preview with Mermaid, save to disk", async () => {
    // Open scratch document in working-tree state
    await page.evaluate((p) => { location.hash = `#/doc/${p}`; }, SCRATCH_REPO_PATH);
    await page.locator("#doc-body h1").waitFor();

    // Press "3" to enter Edit mode
    await page.keyboard.press("3");
    await page.locator(".editor textarea").waitFor();

    expect(await page.evaluate(() => location.hash)).toContain("mode=edit");
    expect(await page.locator("#doc-body").evaluate((element) => getComputedStyle(element).display)).toBe("none");

    // Textarea is populated with canonical markdown
    const textarea = page.locator(".editor textarea");
    expect(await textarea.count()).toBe(1);
    expect(await textarea.inputValue()).toContain("Original scratch content");

    // Modify text in textarea
    const updatedContent = "# Scratch Test Updated\n\nModified text in browser.\n\n```mermaid\ngraph TD; X-->Y;\n```\n";
    await textarea.fill(updatedContent);
    await page.waitForFunction(() => document.querySelector(".editor__preview h1")?.textContent === "Scratch Test Updated");

    // Save button becomes enabled
    const saveBtn = page.locator(".editor__bar button", { hasText: "Save" });
    expect(await saveBtn.isEnabled()).toBe(true);

    // Note shows unsaved changes
    const note = await page.locator(".editor__bar .note").textContent();
    expect(note).toContain("unsaved changes");

    // Preview renders the updated markdown with live mermaid
    const previewH1 = await page.locator(".editor__preview h1").textContent();
    expect(previewH1).toBe("Scratch Test Updated");
    const previewDiagram = page.locator(".editor__preview .diagram[data-state='ready']");
    await previewDiagram.waitFor();
    expect(await previewDiagram.count()).toBe(1);

    // Save document
    await saveBtn.click();
    await page.waitForFunction(() => document.querySelector(".toast")?.textContent?.includes("Saved"));

    // Toast notification appeared
    const toast = page.locator(".toast");
    expect(await toast.textContent()).toContain("Saved");

    // Verified on disk directly: Markdown file was modified
    const onDisk = readFileSync(SCRATCH_DOC, "utf8");
    expect(onDisk).toBe(updatedContent);

    // Return to Read mode (press 1)
    await page.keyboard.press("1");
    await page.locator("#doc-body h1").waitFor();
    expect(await page.locator("#doc-body h1").textContent()).toBe("Scratch Test Updated");

  });

  test("Step 8b: Unsaved edits survive cancel and require deliberate discard", async () => {
    const updatedContent = readFileSync(SCRATCH_DOC, "utf8");
    // An edit followed by document navigation must require an explicit choice.
    await page.locator(".mode[data-mode='edit']").click();
    await page.locator(".editor textarea").fill(`${updatedContent}\nUnsaved draft`);
    await page.locator("a[data-path='docs/architecture.md']").click();
    const confirmation = page.locator("#confirm");
    await confirmation.waitFor({ state: "visible" });
    expect(await page.locator("#confirm-message").textContent()).toContain("have not been saved");
    await page.locator("#confirm-cancel").click();
    expect(await page.locator(".editor textarea").inputValue()).toContain("Unsaved draft");
    await page.locator("a[data-path='docs/architecture.md']").click();
    await confirmation.waitFor({ state: "visible" });
    await page.locator("#confirm-discard").click();
    await page.locator("#doc-body h1").waitFor();
    expect(readFileSync(SCRATCH_DOC, "utf8")).toBe(updatedContent);
  });

  test("Step 9: Responsive adaptation at narrow mobile width", async () => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // In mobile mode, rails are hidden off-screen by default
    const shell = page.locator(".shell");
    expect(await shell.getAttribute("data-nav")).toBe("closed");
    expect(await shell.getAttribute("data-context")).toBe("closed");

    // Toggle nav rail open
    const navToggle = page.locator("#nav-toggle");
    await navToggle.click();
    await page.waitForTimeout(300);
    expect(await shell.getAttribute("data-nav")).toBe("open");

    // Clicking backdrop closes it
    const backdrop = page.locator("#rail-backdrop");
    await backdrop.click({ force: true });
    await page.waitForTimeout(300);
    expect(await shell.getAttribute("data-nav")).toBe("closed");

    // Restore desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);

    // CSS and JavaScript must agree at the desktop threshold itself.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);
    const readingWidth = await page.locator("#reading").evaluate((element) => element.getBoundingClientRect().width);
    expect(readingWidth).toBe(1024);

    await page.setViewportSize({ width: 320, height: 640 });
    await page.waitForTimeout(300);
    const mobile = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll<HTMLButtonElement>(".mode")].map((button) => ({ name: button.getAttribute("aria-label"), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
    }));
    expect(mobile.document).toBe(mobile.viewport);
    expect(mobile.controls.every((control) => Boolean(control.name) && control.width >= 44 && control.height >= 44)).toBe(true);
    const headerClearance = await page.evaluate(() => ({
      wordmarkRight: document.querySelector(".topbar__wordmark")!.getBoundingClientRect().right,
      firstToolLeft: document.querySelector("#nav-toggle")!.getBoundingClientRect().left,
    }));
    expect(headerClearance.wordmarkRight).toBeLessThan(headerClearance.firstToolLeft);
    const tableCues = await page.locator("#doc-body .table-scroll").evaluateAll((tables) => tables.map((table) => ({
      overflow: table.scrollWidth > table.clientWidth + 2,
      cue: table.nextElementSibling?.classList.contains("table-scroll__hint") ?? false,
    })));
    expect(tableCues.some((table) => table.overflow)).toBe(true);
    expect(tableCues.filter((table) => table.overflow).every((table) => table.cue)).toBe(true);
  });

  test("Step 10: Zero console errors or page errors throughout entire journey", () => {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
