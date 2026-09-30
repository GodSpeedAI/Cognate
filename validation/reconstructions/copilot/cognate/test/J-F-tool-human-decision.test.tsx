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
import { CONTINUATION_MESSAGE, createRemainingJourneysApp, JOURNEY_F_AGENT } from "../src/remaining-journeys.ts";
import { ToolDecisionSurface } from "../src/ui/RemainingSurfaces.tsx";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

test("J-F-tool-human-decision returns a human answer to a waiting tool and the run continues", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-f-"));
  const journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  close = async () => {
    await client.close();
    await journey.close();
    rmSync(directory, { recursive: true, force: true });
  };

  const ui = render(createElement(CognateProvider, { client, children: createElement(ToolDecisionSurface) }));
  fireEvent.click(ui.getByRole("button", { name: "Offer meeting time" }));

  await waitFor(() => expect(ui.getByLabelText("Decision state").textContent).toBe("waiting"), { timeout: 5_000 });

  const runs = await journey.runtime.service.listRuns(alice, { agent: JOURNEY_F_AGENT });
  expect(runs).toHaveLength(1);
  const runId = runs[0]!.runId;
  const suspended = await journey.runtime.service.getRun(alice, { runId });
  expect(suspended.status).toBe("waiting");
  expect(suspended.waitingOn).toHaveLength(1);

  // The waiting tool is a durable continuation, discoverable before any answer exists.
  const [open] = await journey.runtime.service.listContinuations(alice, { runId, status: "OPEN" });
  expect(open).toMatchObject({
    type: "frontend:schedule.meeting",
    status: "OPEN",
    condition: { kind: "frontend_capability", capability: "schedule.meeting" },
    payload: { prompt: "30-minute meeting with CopilotKit" },
  });
  const suspendedEvents = await Array.fromAsync(journey.runtime.service.events(alice, { runId }));
  expect(suspendedEvents.find((event) => event.eventType === "run.waiting")?.payload).toMatchObject({ type: "frontend:schedule.meeting" });

  // The inline UI holds the answer until a human accepts a slot.
  fireEvent.click(ui.getByRole("button", { name: "Accept 10:30" }));
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId })).status).toBe("completed"), { timeout: 5_000 });

  const settled = await journey.runtime.service.getRun(alice, { runId });
  expect(settled.output).toEqual({ decision: { slot: "10:30" }, continued: true });

  // Execution continued past the wait: post-decision evidence sits at a later durable position.
  const events = await Array.fromAsync(journey.runtime.service.events(alice, { runId }));
  const waitingAt = events.find((event) => event.eventType === "run.waiting")!.position;
  const continued = events.find((event) => event.eventType === "message.delta")!;
  expect(continued.position).toBeGreaterThan(waitingAt);
  expect(continued.payload).toEqual({ text: CONTINUATION_MESSAGE });

  // The tool was answered once: one wait, one completion, no replayed invocation.
  expect(events.filter((event) => event.eventType === "run.waiting")).toHaveLength(1);
  expect(events.filter((event) => event.eventType === "run.completed")).toHaveLength(1);
  expect(events.filter((event) => event.eventType === "run.resumed")).toHaveLength(1);

  const [resolved] = await journey.runtime.service.listContinuations(alice, { runId });
  expect(resolved).toMatchObject({ status: "RESUMED", type: "frontend:schedule.meeting" });
});
