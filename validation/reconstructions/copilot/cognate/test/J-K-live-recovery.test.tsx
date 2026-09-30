import "./setup-dom.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alice } from "@cognate/runtime-api/conformance";
import { createRemainingJourneysApp, JOURNEY_K_AGENT, LIVE_RECOVERY_CHUNKS } from "../src/remaining-journeys.ts";

type Frame = { readonly type: string; readonly rawEvent?: { readonly cognate?: { readonly position?: number } }; readonly [key: string]: unknown };
type Encoded = readonly { readonly data: string }[];

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

function parseBlocks(body: string): Encoded {
  return body
    .split("\n\n")
    .map((block) => block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join(""))
    .filter((data) => data !== "")
    .map((data) => ({ data }));
}

/** Consume a strict prefix of the SSE stream, then abandon the consumer. */
async function readPrefix(response: Response, until: (frame: Frame) => boolean, limit = 20): Promise<Frame[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: Frame[] = [];
  while (frames.length < limit && !frames.some(until)) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1 && frames.length < limit && !frames.some(until)) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const encoded = parseBlocks(`${block}\n\n`);
      if (encoded.length > 0) frames.push(JSON.parse(encoded[0]!.data) as Frame);
      index = buffer.indexOf("\n\n");
    }
  }
  await reader.cancel();
  return frames;
}

async function post(body: Record<string, unknown>): Promise<Frame[]> {
  const response = await journey!.agUi(
    new Request("http://journey.test/agui", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: "Bearer alice" },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
  return parseBlocks(await response.text()).map((entry) => JSON.parse(entry.data) as Frame);
}

let journey: Awaited<ReturnType<typeof createRemainingJourneysApp>> | undefined;

test("J-K-live-recovery resumes a partially read stream from a cursor with a snapshot anchor and no loss", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-j-k-"));
  journey = await createRemainingJourneysApp(join(directory, "journey.sqlite"));
  close = async () => {
    await journey!.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const service = journey.runtime.service;
  const threadId = "j-k-thread";

  // A consumer that only ever sees the committed anchor, then walks away mid-stream.
  const partial = await journey.agUi(
    new Request("http://journey.test/agui", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: "Bearer alice" },
      body: JSON.stringify({
        threadId,
        runId: "j-k-first",
        messages: [{ id: "user-1", role: "user", content: "deliver the progress" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: { cognate: { agent: JOURNEY_K_AGENT } },
      }),
    }),
  );
  expect(partial.status).toBe(200);
  const prefix = await readPrefix(partial, (frame) => frame.type === "STATE_SNAPSHOT");
  expect(prefix.map((frame) => frame.type)).toEqual(["RUN_STARTED", "STATE_SNAPSHOT"]);
  const cursor = prefix.at(-1)!.rawEvent!.cognate!.position!;

  // Abandoning the consumer never abandons the run: the committed history is complete.
  const runs = await service.listRuns(alice, { correlationId: `agui-thread:${threadId}` });
  expect(runs).toHaveLength(1);
  const runId = runs[0]!.runId;
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await service.getRun(alice, { runId })).status === "completed") break;
    await Bun.sleep(25);
  }
  expect((await service.getRun(alice, { runId })).status).toBe("completed");
  const history = await Array.fromAsync(service.events(alice, { runId }));
  expect(history.length).toBeGreaterThan(prefix.length);
  expect(history.filter((event) => event.eventType === "message.delta")).toHaveLength(LIVE_RECOVERY_CHUNKS.length);
  expect(history.at(-1)!.eventType).toBe("run.completed");

  // Resuming from the cursor anchors on state, then replays only what was not consumed.
  const resumed = await post({
    threadId,
    runId: "j-k-resume",
    messages: [{ id: "assistant-1", role: "assistant", content: "" }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: { cognate: { cursor } },
  });
  const anchor = resumed[0]!;
  expect(anchor.type).toBe("STATE_SNAPSHOT");
  expect(anchor.snapshot).toEqual({ phase: "streaming" });
  // The anchor is synthesized from everything folded up to the cursor, not a stored event.
  expect(anchor.rawEvent).toBeUndefined();

  const durable = resumed.slice(1);
  const positions = durable.map((frame) => frame.rawEvent?.cognate?.position).filter((position): position is number => typeof position === "number");
  expect(positions).toHaveLength(durable.length);
  // Frames derived from one durable event share its position; distinct positions never regress.
  for (let index = 1; index < positions.length; index++) expect(positions[index]!).toBeGreaterThanOrEqual(positions[index - 1]!);
  const distinct = [...new Set(positions)];
  for (let index = 1; index < distinct.length; index++) expect(distinct[index]!).toBeGreaterThan(distinct[index - 1]!);
  expect(distinct[0]!).toBeGreaterThan(cursor);

  const text = resumed
    .filter((frame) => frame.type === "TEXT_MESSAGE_CONTENT")
    .map((frame) => String(frame.delta ?? ""))
    .join("");
  expect(text).toBe(LIVE_RECOVERY_CHUNKS.join(""));
  expect(resumed.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { status: "completed" } });
});
