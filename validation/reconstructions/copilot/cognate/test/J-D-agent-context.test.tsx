import "./setup-dom.ts";
import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { createClient, type CognateClient } from "@godspeedai/cognate-client";
import { CognateProvider } from "@godspeedai/cognate-react";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRemainingJourneysApp, JOURNEY_D_AGENT } from "../src/remaining-journeys.ts";
import { AgentContextSurface } from "../src/ui/RemainingSurfaces.tsx";

const threadId = "thread:j-d-visible";
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

test("J-D-agent-context supplies mounted context as immutable invocation input that unmount removes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-d-"));
  const journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  close = async () => {
    await client.close();
    await journey.close();
    rmSync(directory, { recursive: true, force: true });
  };

  const ui = render(
    createElement(CognateProvider, {
      client,
      children: createElement(AgentContextSurface, { threadId }),
    }),
  );

  // The mounted surface publishes application state; the operator alters it before the turn.
  fireEvent.click(ui.getByRole("button", { name: "Alter published context" }));
  const published = JSON.stringify({ view: "workspace", panel: "activity" });
  expect(ui.getByLabelText("Published context").textContent).toBe(published);
  fireEvent.click(ui.getByRole("button", { name: "Start turn" }));
  await waitFor(() => expect(ui.getByLabelText("Turn context").textContent).toContain('"context"'), { timeout: 5_000 });

  const runs = await journey.runtime.service.listRuns(alice, { correlationId: threadId });
  expect(runs).toHaveLength(1);
  const runId = runs[0]!.runId;
  const expected = [{ description: "application-state", value: published }];

  const first = await journey.runtime.service.getRun(alice, { runId });
  expect(first.input).toEqual({ context: expected });
  expect(first.output).toEqual({ context: published });

  // The invocation is durable, not React-local: run.started carries the exact input the agent read.
  const events = await Array.fromAsync(journey.runtime.service.events(alice, { runId }));
  const started = events.find((event) => event.eventType === "run.started");
  expect(started?.payload).toEqual({ input: { context: expected } });
  expect(started?.metadata).toMatchObject({ agent: JOURNEY_D_AGENT });

  // Agent-writable state is a different channel and moved during the same run.
  await waitFor(
    async () =>
      expect(await journey.runtime.service.readProjection(alice, { name: "shared-state-canvas" })).toContainEqual(
        expect.objectContaining({ key: `thread/${threadId}`, value: { note: "agent-writable" } }),
      ),
    { timeout: 5_000 },
  );

  // Neither that write nor anything after it can reach back and edit the recorded invocation.
  const afterWrite = await journey.runtime.service.getRun(alice, { runId });
  expect(JSON.stringify(afterWrite.input)).toBe(JSON.stringify(first.input));

  // Unmounting stops supplying context; there is no context store left to clear.
  ui.unmount();
  const second = await client.startRun(JOURNEY_D_AGENT, {}, { correlationId: threadId });
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId: second.runId })).status).toBe("completed"), { timeout: 5_000 });
  const secondView = await journey.runtime.service.getRun(alice, { runId: second.runId });
  expect(secondView.input).toEqual({});
  expect(secondView.output).toEqual({ context: null });

  const secondEvents = await Array.fromAsync(journey.runtime.service.events(alice, { runId: second.runId }));
  expect(secondEvents.find((event) => event.eventType === "run.started")?.payload).toEqual({ input: {} });
  expect((await journey.runtime.service.getRun(alice, { runId })).input).toEqual({ context: expected });
});
