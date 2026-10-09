import "./setup-dom.ts";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { createClient, type CognateClient } from "@godspeedai/cognate-client";
import { CognateProvider } from "@godspeedai/cognate-react";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { SharedStateSurface } from "../src/SharedStateSurface.tsx";
import { createJourneyAApp } from "../src/journey.ts";
import { JOURNEY_C_AGENT } from "../src/shared-state.ts";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

test("J-C-shared-state streams an agent canvas write, commits a terminal user edit, and exposes it to a distinct next run", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-j-c-"));
  const journey = await createJourneyAApp(join(dir, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  close = async () => {
    await client.close();
    await journey.close();
    rmSync(dir, { recursive: true, force: true });
  };

  const ui = render(createElement(CognateProvider, { client, children: createElement(SharedStateSurface) }));
  fireEvent.click(ui.getByRole("button", { name: "Start agent write" }));

  await waitFor(() => expect(ui.getByLabelText("Canvas todos").textContent).toContain("agent todo"));
  const [first] = await journey.runtime.service.listRuns(alice, { correlationId: "thread:j-c", agent: JOURNEY_C_AGENT });
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId: first!.runId })).status).toBe("completed"));

  fireEvent.click(ui.getByRole("button", { name: "Save canvas edit" }));
  await waitFor(() => expect(ui.getByLabelText("Canvas todos").textContent).toContain("user todo"));
  await waitFor(async () => expect(await journey.runtime.service.readProjection(alice, { name: "shared-state-canvas" })).toContainEqual(expect.objectContaining({ key: "thread/thread:j-c", value: { todos: [{ id: "agent", text: "agent todo" }, { id: "user", text: "user todo" }] } })));

  fireEvent.click(ui.getByRole("button", { name: "Start agent observation" }));
  await waitFor(async () => expect(await journey.runtime.service.listRuns(alice, { correlationId: "thread:j-c", agent: JOURNEY_C_AGENT })).toHaveLength(2));
  const [, second] = await journey.runtime.service.listRuns(alice, { correlationId: "thread:j-c", agent: JOURNEY_C_AGENT });
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId: second!.runId })).status).toBe("completed"));
  expect((await journey.runtime.service.getRun(alice, { runId: second!.runId })).output).toEqual({ todos: [{ id: "agent", text: "agent todo" }, { id: "user", text: "user todo" }] });

  const events: Array<{ readonly eventType: string; readonly position: number; readonly metadata?: unknown }> = [];
  for await (const event of journey.runtime.service.events(alice, { correlationId: "thread:j-c" })) events.push(event);
  const stateChanges = events.filter((event) => event.eventType === "state.changed");
  expect(stateChanges).toHaveLength(2);
  expect(stateChanges.map((event) => event.position)).toEqual([...stateChanges.map((event) => event.position)].sort((a, b) => a - b));
  expect(stateChanges.map((event) => event.metadata)).toEqual(expect.arrayContaining([expect.objectContaining({ scope: "thread", source: "agent" }), expect.objectContaining({ scope: "thread", source: "caller", actor: "alice" })]));
});
