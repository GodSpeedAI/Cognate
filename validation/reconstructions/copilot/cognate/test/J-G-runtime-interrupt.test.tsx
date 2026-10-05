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
import { createRemainingJourneysApp, JOURNEY_G_AGENT } from "../src/remaining-journeys.ts";
import { RuntimeInterruptSurface } from "../src/ui/RemainingSurfaces.tsx";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

async function sseEvents(response: Response): Promise<{ type: string; [key: string]: unknown }[]> {
  const body = await response.text();
  return body
    .split("\n\n")
    .map((chunk) => chunk.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join(""))
    .filter(Boolean)
    .map((data) => JSON.parse(data) as { type: string; [key: string]: unknown });
}

test("J-G-runtime-interrupt settles a pending interrupt by resume or cancel, distinct from a tool result", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-g-"));
  const journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
  close = async () => {
    await client.close();
    await journey.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const service = journey.runtime.service;

  // ── Discovery: a run-level condition with its own payload, never a tool result ──
  const discovered = await journey.agUi(
    new Request("http://journey.test/agui", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: "Bearer alice" },
      body: JSON.stringify({
        threadId: "j-g-agui",
        runId: "j-g-agui-run",
        messages: [{ id: "user-1", role: "user", content: "pause the run here" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: { cognate: { agent: JOURNEY_G_AGENT } },
      }),
    }),
  );
  expect(discovered.status).toBe(200);
  const stream = await sseEvents(discovered);
  const finished = stream.find((event) => event.type === "RUN_FINISHED");
  expect(finished).toBeDefined();
  expect(String((finished!.result as { readonly status?: unknown }).status)).toMatch(/^waiting/);
  const pending = (finished!.result as { readonly continuations?: readonly { readonly id?: string }[] }).continuations ?? [];
  expect(pending).toHaveLength(1);
  // Interrupt discovery carries the interrupt payload as its own event; only frontend/remote
  // waits become TOOL_CALL_* on this endpoint.
  const interaction = stream.find((event) => event.type === "CUSTOM");
  expect(interaction).toMatchObject({ name: expect.stringMatching(/^cognate\./), value: { type: "run-interrupt", payload: { reason: "pause the run here" } } });
  expect(stream.some((event) => event.type.startsWith("TOOL_CALL"))).toBe(false);

  // ── Cancel: the human ends the suspended run instead of continuing it ──
  let cancelledRunId: string | undefined;
  const cancelUi = render(
    createElement(CognateProvider, {
      client,
      children: createElement(RuntimeInterruptSurface, {
        startLabel: "Start interrupt to cancel",
        reason: "operator paused the run",
        onRunStarted: (id: string) => {
          cancelledRunId = id;
        },
      }),
    }),
  );
  fireEvent.click(cancelUi.getByRole("button", { name: "Start interrupt to cancel" }));
  await waitFor(() => expect(cancelUi.getByLabelText("Interrupt state").textContent).toBe("waiting"), { timeout: 5_000 });
  await waitFor(() => expect(cancelUi.getByLabelText("Pending interrupt").textContent).toBe("interrupt"));
  expect(cancelUi.getByLabelText("Pending interrupt type").textContent).toBe("run-interrupt");

  const [open] = await service.listContinuations(alice, { runId: cancelledRunId!, status: "OPEN" });
  expect(open).toMatchObject({
    type: "run-interrupt",
    status: "OPEN",
    condition: { kind: "interrupt", source: "runtime" },
    payload: { reason: "operator paused the run" },
  });
  const suspended = await Array.fromAsync(service.events(alice, { runId: cancelledRunId! }));
  expect(suspended.some((event) => event.eventType === "run.waiting")).toBe(true);
  expect(suspended.some((event) => event.eventType === "run.remote_offers")).toBe(false);

  fireEvent.click(cancelUi.getByRole("button", { name: "Cancel interrupted run" }));
  await waitFor(async () => expect((await service.getRun(alice, { runId: cancelledRunId! })).status).toBe("failed"), { timeout: 5_000 });
  const cancelledView = await service.getRun(alice, { runId: cancelledRunId! });
  expect(String(cancelledView.error)).toContain("cancelled");
  const cancelledEvents = await Array.fromAsync(service.events(alice, { runId: cancelledRunId! }));
  expect(cancelledEvents.find((event) => event.eventType === "run.wait.closed")).toMatchObject({ metadata: { status: "CANCELLED" } });
  expect(cancelledEvents.some((event) => event.eventType === "run.completed")).toBe(false);
  const [closed] = await service.listContinuations(alice, { runId: cancelledRunId! });
  expect(closed).toMatchObject({ status: "CANCELLED", type: "run-interrupt" });
  cancelUi.unmount();

  // ── Resume: the same condition resolved the other way continues the suspended run ──
  let resumedRunId: string | undefined;
  const resumeUi = render(
    createElement(CognateProvider, {
      client,
      children: createElement(RuntimeInterruptSurface, {
        startLabel: "Start interrupt to resume",
        reason: "operator paused again",
        onRunStarted: (id: string) => {
          resumedRunId = id;
        },
      }),
    }),
  );
  fireEvent.click(resumeUi.getByRole("button", { name: "Start interrupt to resume" }));
  await waitFor(() => expect(resumeUi.getByLabelText("Interrupt state").textContent).toBe("waiting"), { timeout: 5_000 });
  fireEvent.click(resumeUi.getByRole("button", { name: "Resume interrupted run" }));
  await waitFor(async () => expect((await service.getRun(alice, { runId: resumedRunId! })).status).toBe("completed"), { timeout: 5_000 });

  expect((await service.getRun(alice, { runId: resumedRunId! })).output).toEqual({ resumed: true, resolution: { resumed: true } });
  const resumedEvents = await Array.fromAsync(service.events(alice, { runId: resumedRunId! }));
  expect(resumedEvents.find((event) => event.eventType === "run.resumed")).toBeDefined();
  expect(resumedEvents.some((event) => event.eventType === "run.completed")).toBe(true);
  const [resumedContinuation] = await service.listContinuations(alice, { runId: resumedRunId! });
  expect(resumedContinuation).toMatchObject({ status: "RESUMED", type: "run-interrupt" });

  // The two outcomes are separate settlements of the same condition kind.
  expect(cancelledView.status).not.toBe((await service.getRun(alice, { runId: resumedRunId! })).status);
});
