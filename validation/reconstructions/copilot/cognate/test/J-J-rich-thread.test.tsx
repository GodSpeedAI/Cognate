import "./setup-dom.ts";
import { afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { createClient, type CognateClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import { alice } from "@cognate/runtime-api/conformance";
import { createRemainingJourneysApp, JOURNEY_J_AGENT, RICH_THREAD_MESSAGE } from "../src/remaining-journeys.ts";
import { RichThreadSurface } from "../src/ui/RemainingSurfaces.tsx";

const threadId = "thread:j-j-visible";
const THREAD_INSPECT_CONTRACT = { id: "thread.inspect", version: "1.0.0" } as const;
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

test("J-J-rich-thread replays chat, tool wait and render from durable state without reauthorizing the offer", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-j-"));
  const journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  let fresh: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  close = async () => {
    await fresh.close();
    await client.close();
    await journey.close();
    rmSync(directory, { recursive: true, force: true });
  };

  const revoke = await client.offerCapability(
    {
      leaseId: crypto.randomUUID(),
      agent: JOURNEY_J_AGENT,
      contract: THREAD_INSPECT_CONTRACT,
      description: "Inspect the mounted thread",
      inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] },
      outputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      ttlMs: 30_000,
    },
    () => ({ summary: "inspected by a mounted surface" }),
  );
  expect(await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_J_AGENT })).toHaveLength(1);

  const run = await client.startRun(JOURNEY_J_AGENT, { message: RICH_THREAD_MESSAGE }, { correlationId: threadId });
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId: run.runId })).status).toBe("completed"), { timeout: 5_000 });
  expect((await journey.runtime.service.getRun(alice, { runId: run.runId })).output).toEqual({
    offers: [expect.any(String)],
    tool: { summary: "inspected by a mounted surface" },
  });

  const events = await Array.fromAsync(journey.runtime.service.events(alice, { runId: run.runId }));
  expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["run.started", "message.delta", "ui.render", "run.remote_offers", "run.waiting", "run.completed"]));

  // The recorded wait is settled: nothing is open for a replaying surface to authorize again.
  const [settled] = await journey.runtime.service.listContinuations(alice, { runId: run.runId });
  expect(settled).toMatchObject({ status: "RESUMED", type: `remote:${THREAD_INSPECT_CONTRACT.id}`, condition: { kind: "frontend_capability" } });

  // A fresh client with no capability of its own reads the same thread back.
  const ui = render(createElement(CognateProvider, { client: fresh, children: createElement(RichThreadSurface, { threadId }) }));
  await waitFor(() => expect(ui.getByLabelText("Replayed settlement").textContent).toBe("completed"), { timeout: 5_000 });
  expect(ui.getByLabelText("Replayed message").textContent).toBe(RICH_THREAD_MESSAGE);
  expect(ui.getByLabelText("Replayed render").textContent).toBe("ThreadSummaryCard");
  expect(ui.getByLabelText("Replayed tool").textContent).toBe(`remote:${THREAD_INSPECT_CONTRACT.id}`);

  const rows = await journey.runtime.service.readProjection(alice, { name: "rich-thread" });
  const row = rows[0]!;
  expect(row).toEqual(
    expect.objectContaining({
      key: `thread/${threadId}`,
      value: { threadId, text: RICH_THREAD_MESSAGE, renders: [{ component: "ThreadSummaryCard", props: { title: RICH_THREAD_MESSAGE } }], tools: [{ type: `remote:${THREAD_INSPECT_CONTRACT.id}` }], status: "completed" },
    }),
  );

  // Withdrawing the offer leaves the recorded thread readable and blocks a new selection.
  await revoke();
  expect(await journey.runtime.service.listRemoteOffers(alice, { agent: JOURNEY_J_AGENT })).toEqual([]);
  const second = await fresh.startRun(JOURNEY_J_AGENT, { message: "second turn" }, { correlationId: "thread:j-j-second" });
  await waitFor(async () => expect((await journey.runtime.service.getRun(alice, { runId: second.runId })).status).toBe("completed"), { timeout: 5_000 });
  expect((await journey.runtime.service.getRun(alice, { runId: second.runId })).output).toEqual({ offers: [], tool: "no mounted capability" });

  // The first thread's replay is untouched by the second run.
  expect(await journey.runtime.service.readProjection(alice, { name: "rich-thread" })).toContainEqual(row);
});
