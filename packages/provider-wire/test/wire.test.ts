// Level-2 conformance for the shared wire layer: SSE framing across arbitrary byte boundaries,
// error classification without upstream-text echo, cancellation vs. unavailability, and timeout
// composition. These are the invariants both chat adapters inherit.
import { describe, expect, test } from "bun:test";
import { httpError, readSSE, requestSignal, sendJson, type SSEEvent } from "../src/index.ts";
import { ModelProviderError } from "@godspeedai/cognate-capabilities";

async function collect(response: Response, signal?: AbortSignal): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of readSSE(response, signal)) events.push(event);
  return events;
}

/** A Response whose body arrives in the given chunks (byte-exact, unlike Response(string)). */
function chunkedResponse(chunks: readonly Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream);
}

const sse = (frames: readonly string[]): Uint8Array => new TextEncoder().encode(frames.join(""));

describe("readSSE framing", () => {
  test("one byte at a time across arbitrary boundaries", async () => {
    const raw = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\nevent: response.completed\ndata: {"type":"response.completed"}\n\n';
    const bytes = new TextEncoder().encode(raw);
    // Feed each byte as its own chunk: framing must never split a UTF-8 event frame.
    const events = await collect(chunkedResponse(Array.from(bytes, (b) => new Uint8Array([b]))));
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "response.output_text.delta", data: '{"type":"response.output_text.delta","delta":"Hi"}' });
    expect(events[1]?.event).toBe("response.completed");
  });

  test("CRLF line endings, multi-line data joined with newline, comments ignored", async () => {
    const raw = ": keep-alive comment\r\n\r\nevent: x\r\ndata: line1\r\ndata: line2\r\n\r\n";
    const events = await collect(new Response(raw));
    expect(events).toEqual([{ event: "x", data: "line1\nline2" }]);
  });

  test("final frame without trailing blank line still parses; data-less frames are skipped", async () => {
    const raw = "event: ping\ndata: {}\n\n:data only\ntransaction: ignored";
    const events = await collect(new Response(raw));
    expect(events).toEqual([{ event: "ping", data: "{}" }]);
  });

  test("multi-byte UTF-8 split across chunk boundaries decodes losslessly", async () => {
    // "héllo" — é is 0xC3 0xA9; split the bytes mid-codepoint.
    const text = "héllo";
    const bytes = new TextEncoder().encode(`data: ${text}\n\n`);
    const split = 8; // inside the two-byte é
    const events = await collect(chunkedResponse([bytes.slice(0, split), bytes.slice(split)]));
    expect(events[0]?.data).toBe(text);
  });

  test("an aborted stream surfaces as cancelled, not unavailable", async () => {
    const controller = new AbortController();
    // Simulates a fetch body whose reads reject when the request signal aborts.
    const response = new Response(new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("data: 1\n\n"));
        controller.signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    }));
    const consume = (async () => {
      for await (const _ of readSSE(response, controller.signal)) {
        controller.abort();
      }
    })();
    await expect(consume).rejects.toMatchObject({ kind: "cancelled" });
  });
});

describe("error classification", () => {
  test("httpError maps statuses without echoing upstream text", () => {
    expect(httpError(401)).toMatchObject({ kind: "unauthorized" });
    expect(httpError(403)).toMatchObject({ kind: "unauthorized" });
    expect(httpError(429)).toMatchObject({ kind: "rate_limited" });
    expect(httpError(400)).toMatchObject({ kind: "invalid_request" });
    expect(httpError(500)).toMatchObject({ kind: "unavailable" });
    expect(httpError(503).message).toBe("model upstream HTTP 503");
  });

  test("sendJson maps network failure to unavailable and abort to cancelled; non-ok statuses classify", async () => {
    const unavailable = sendJson("https://example.test", {}, {}, async () => {
      throw new TypeError("fetch failed");
    });
    await expect(unavailable).rejects.toMatchObject({ kind: "unavailable" });

    const controller = new AbortController();
    const cancelled = sendJson("https://example.test", {}, {}, async (_url, init) => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }, controller.signal);
    await expect(cancelled).rejects.toMatchObject({ kind: "cancelled" });

    const unauthorized = sendJson("https://example.test", {}, {}, async () => new Response('{"error":"bad key (sk-live-xxxx)"}', { status: 401 }));
    const error = await unauthorized.catch((e: unknown) => e as ModelProviderError) as ModelProviderError;
    expect(error).toMatchObject({ kind: "unauthorized", status: 401 });
    // The upstream body (and any credential it contains) is not echoed.
    expect(error.message).not.toContain("sk-live");
  });
});

describe("requestSignal", () => {
  test("timeout aborts the composed signal", async () => {
    const controller = new AbortController();
    const signal = requestSignal(controller.signal, 20);
    expect(signal).toBeDefined();
    await new Promise((r) => setTimeout(r, 60));
    expect(signal!.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(false);
  });

  test("no timeout passes the caller signal through", () => {
    const controller = new AbortController();
    expect(requestSignal(controller.signal)).toBe(controller.signal);
    expect(requestSignal(undefined)).toBeUndefined();
  });
});
