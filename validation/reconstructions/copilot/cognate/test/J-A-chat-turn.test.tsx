import "./setup-dom.ts";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { createClient, type CognateClient } from "@cognate/client";
import { CognateProvider } from "@cognate/react";
import { alice } from "@cognate/runtime-api/conformance";
import { ChatSurface } from "../src/ChatSurface.tsx";
import { createJourneyAApp, JOURNEY_A_AGENT } from "../src/journey.ts";

const threadId = "thread:j-a-visible";
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  cleanup();
  await close?.();
  close = undefined;
});

async function app() {
  const dir = mkdtempSync(join(tmpdir(), "cognate-j-a-"));
  const journey = await createJourneyAApp(join(dir, "journey.sqlite"));
  const dispose = async () => {
    await journey.close();
    rmSync(dir, { recursive: true, force: true });
  };
  close = dispose;
  return { journey, dispose };
}

async function terminal(service: Awaited<ReturnType<typeof app>>["journey"]["runtime"]["service"], runId: string) {
  for (let elapsed = 0; elapsed < 5000; elapsed += 10) {
    const run = await service.getRun(alice, { runId });
    if (run.status === "completed") return run;
    await Bun.sleep(10);
  }
  throw new Error(`J-A run ${runId} did not complete`);
}

async function sseEvents(response: Response): Promise<{ type: string; [key: string]: unknown }[]> {
  const body = await response.text();
  return body
    .split("\n\n")
    .map((chunk) => chunk.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join(""))
    .filter(Boolean)
    .map((data) => JSON.parse(data) as { type: string; [key: string]: unknown });
}

describe("J-A-chat-turn", () => {
  test("streams durable events into the thread projection and renders terminal assistant text", async () => {
    const { journey, dispose } = await app();
    const client: CognateClient = createClient({ service: journey.runtime.service, caller: alice });
    close = async () => {
      await client.close();
      await dispose();
    };
    const ui = render(createElement(CognateProvider, { client, children: createElement(ChatSurface, { threadId }) }));

    fireEvent.change(ui.getByPlaceholderText("Message the assistant"), { target: { value: "hello" } });
    await act(async () => {
      fireEvent.click(ui.getByRole("button", { name: "Send" }));
    });

    await waitFor(() => expect(ui.getByLabelText("Assistant response").textContent).toBe("Hello from the deterministic Cognate chat."));
    await waitFor(() => expect(ui.getByLabelText("Conversation settlement").textContent).toBe("Conversation complete"));

    const runs = await journey.runtime.service.listRuns(alice, { correlationId: threadId });
    expect(runs).toHaveLength(1);
    const run = await terminal(journey.runtime.service, runs[0]!.runId);
    expect(run.output).toEqual({ answer: "Hello from the deterministic Cognate chat." });
    const events = [] as { eventType: string; payload: unknown }[];
    for await (const event of journey.runtime.service.events(alice, { runId: run.runId })) events.push(event);
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["run.started", "run.invocation", "message.delta", "run.completed"]));
    expect(events.filter((event) => event.eventType === "message.delta").map((event) => (event.payload as { text: string }).text).join("")).toBe("Hello from the deterministic Cognate chat.");

    const projection = await journey.runtime.service.readProjection(alice, { name: "conversation-thread-history" });
    expect(projection).toContainEqual(expect.objectContaining({ key: `thread/${threadId}`, value: expect.objectContaining({ threadId, runs: [expect.objectContaining({ runId: run.runId, status: "completed", text: "Hello from the deterministic Cognate chat." })] }) }));
    expect(await journey.runtime.store.listProjection("conversation-thread-history")).toContainEqual(expect.objectContaining({ key: `tenant-a/thread/${threadId}` }));

    // A new client has no React-local run id. It restores the visible terminal response solely
    // from the public, durable thread projection keyed by the same tenant/thread identity.
    ui.unmount();
    await client.close();
    const reloaded = createClient({ service: journey.runtime.service, caller: alice });
    close = async () => {
      await reloaded.close();
      await dispose();
    };
    const restored = render(createElement(CognateProvider, { client: reloaded, children: createElement(ChatSurface, { threadId }) }));
    await waitFor(() => expect(restored.getByLabelText("Assistant response").textContent).toBe("Hello from the deterministic Cognate chat."));
    expect(restored.getByLabelText("Conversation settlement").textContent).toBe("Conversation complete");
  });

  test("projects the same deterministic chat run through the ordinary AG-UI endpoint", async () => {
    const { journey } = await app();
    const response = await journey.agUi(
      new Request("http://journey.test/agui", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream", authorization: "Bearer alice" },
        body: JSON.stringify({ threadId: "j-a-agui", runId: "j-a-agui-run", messages: [{ id: "user-1", role: "user", content: "hello" }], tools: [], context: [], state: {}, forwardedProps: {} }),
      }),
    );
    expect(response.status).toBe(200);
    const events = await sseEvents(response);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]));
    expect(events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta).join("")).toBe("Hello from the deterministic Cognate chat.");
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { status: "completed" } });
    const runs = await journey.runtime.service.listRuns(alice, { correlationId: "agui-thread:j-a-agui", agent: JOURNEY_A_AGENT });
    expect(runs).toHaveLength(1);
  });
});
