// CG-E2E-001 (spec §36): the initial end-to-end journey, verifying authoritative state independently of the UI.
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const verify = (...runIds: string[]) => JSON.parse(execFileSync("bun", ["verify.ts", process.env.COGNATE_E2E_DB!, ...runIds], { cwd: import.meta.dirname, encoding: "utf8" }));

test("semantic load → run → capability → streamed UI → continuation → artifact → events → observation → recall → RVF", async ({ page, request }) => {
  // Launch + DomainForge-derived semantic projection + mounted components.
  const health = await (await request.get("/health")).json();
  expect(health).toMatchObject({ ok: true, semantic: { objects: 4 }, components: expect.arrayContaining(["refund-desk"]) });

  // Open the Astryx UI and start an agent run.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Refund copilot" })).toBeVisible();
  await page.getByRole("textbox").fill("I was charged twice for order 7");
  await page.getByRole("textbox").press("Enter");

  // Backend capability result streams into the UI; the run opens a continuation.
  await expect(page.getByText("Quote: 14")).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve" });
  await expect(approve).toBeVisible();

  // A human resolves the continuation; the run resumes and produces an artifact that the user opens.
  await approve.click();
  await expect(page.getByText("completed").first()).toBeVisible();
  await page.getByRole("link", { name: /refund-receipt/ }).click();
  await expect(page.getByRole("table")).toContainText("approved");
  const firstRun = await page.getByTestId("run-id").textContent();

  // A new related run recalls the prior interaction.
  await page.goto("/");
  await page.getByRole("textbox").fill("Duplicate charge again, order 9");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByText(/Recalled 1 prior interaction/)).toBeVisible();
  const secondRun = await page.getByTestId("run-id").textContent();

  // RVF snapshot of cognition.
  const snapshot = await (await request.post("/admin/rvf-snapshot")).json();
  expect(snapshot).toMatchObject({ format: "cognate.rvf.v1", checkpoint: { partial: false } });

  // Authoritative verification from the SQLite file, not the UI.
  const state = verify(firstRun!, secondRun!);
  const [first] = state.runs;
  expect(first.types[0]).toBe("run.started");
  expect(first.types).toContain("run.waiting");
  expect(first.types.at(-1)).toBe("run.completed");
  expect(first.invocations[0].semanticRef).toMatchObject({ id: expect.stringContaining("flow("), source: { digest: expect.stringMatching(/^sha256:/) } });
  expect(state.observations.some((o: { eventId: string; state: string }) => o.eventId === first.invocations[0].eventId && ["accepted", "duplicate"].includes(o.state))).toBe(true);
  expect(state.runs[1].output.recalled).toContain(`run:${firstRun}`);
  expect(state.artifacts.length).toBeGreaterThan(0);
  expect(state.snapshots.length).toBe(1);
});
