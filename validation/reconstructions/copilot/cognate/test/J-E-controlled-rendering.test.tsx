import "./setup-dom.ts";
import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { createClient, type CognateClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import { alice } from "@cognate/runtime-api/conformance";
import type { Json, StoredEvent } from "@cognate/events";
import type { ProjectionState, ProjectionWrite } from "@cognate/projections";
import { CONTROLLED_RENDER_COMPONENT, controlledRenderProjection, createRemainingJourneysApp, JOURNEY_E_AGENT } from "../src/remaining-journeys.ts";
import { ControlledRenderingSurface } from "../src/ui/RemainingSurfaces.tsx";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

/** The renderer is a fold over durable events: fold a prefix and you get the pending row. */
function fold(events: readonly StoredEvent[]): Map<string, Json> {
  const state = new Map<string, Json>();
  for (const event of events) {
    const writes = controlledRenderProjection.apply(event, state as ProjectionState) as readonly ProjectionWrite[];
    for (const write of writes) state.set(write.key, write.value);
  }
  return state;
}

test("J-E-controlled-rendering derives pending and terminal from recorded invocation events alone", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-e-"));
  const journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  close = async () => {
    await client.close();
    await journey.close();
    rmSync(directory, { recursive: true, force: true });
  };

  let runId: string | undefined;
  const ui = render(
    createElement(CognateProvider, {
      client,
      children: createElement(ControlledRenderingSurface, {
        onRunStarted: (id: string) => {
          runId = id;
        },
      }),
    }),
  );
  fireEvent.click(ui.getByRole("button", { name: "Request backend chart" }));
  await waitFor(() => expect(ui.getByLabelText("Controlled renderer phase").textContent).toBe("terminal"), { timeout: 5_000 });

  expect(ui.getByLabelText("Controlled renderer component").textContent).toBe(CONTROLLED_RENDER_COMPONENT);
  expect(ui.getByLabelText("Controlled renderer cards").textContent).toBe("2");

  const runs = await journey.runtime.service.listRuns(alice, { agent: JOURNEY_E_AGENT });
  expect(runs).toHaveLength(1);
  const run = runs[0]!;
  runId ??= run.runId;
  expect(run.status).toBe("completed");

  const events = await Array.fromAsync(journey.runtime.service.events(alice, { runId }));
  const renders = events.filter((event) => event.eventType === "ui.render");
  expect(renders).toHaveLength(2);
  expect(renders[0]!.payload).toMatchObject({ component: CONTROLLED_RENDER_COMPONENT, props: { query: "flights to lisbon", status: "in_progress" } });
  expect(renders[1]!.payload).toMatchObject({ component: CONTROLLED_RENDER_COMPONENT, props: { query: "flights to lisbon", status: "complete" } });

  // Pending is the fold over the prefix that stops at the first render; terminal is the full fold.
  // Both are pure functions of the recorded events — no browser handler participates.
  const tenant = run.tenant;
  const prefixKey = `${tenant}/run/${runId}`;
  const pending = new Map<string, Json>();
  for (const event of events) {
    const writes = controlledRenderProjection.apply(event, pending as ProjectionState) as readonly ProjectionWrite[];
    for (const write of writes) pending.set(write.key, write.value);
    if (event.eventType === "ui.render") break;
  }
  expect(pending.get(prefixKey)).toEqual({ component: CONTROLLED_RENDER_COMPONENT, phase: "pending", renders: 1 });
  expect(fold(events).get(prefixKey)).toEqual({ component: CONTROLLED_RENDER_COMPONENT, phase: "terminal", renders: 2 });

  const rows = await journey.runtime.service.readProjection(alice, { name: "controlled-rendering" });
  expect(rows[0]).toEqual(expect.objectContaining({ key: `run/${runId}`, value: { component: CONTROLLED_RENDER_COMPONENT, phase: "terminal", renders: 2 } }));

  // A controlled render never turns into a human decision.
  expect(await journey.runtime.service.listContinuations(alice, { runId: runId! })).toEqual([]);
  expect(events.some((event) => event.eventType === "run.waiting")).toBe(false);
  expect(events.find((event) => event.eventType === "run.completed")?.payload).toMatchObject({ output: { answer: expect.any(String) } });
});
