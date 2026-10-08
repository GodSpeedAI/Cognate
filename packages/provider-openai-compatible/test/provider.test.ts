// CG-PRV-001 (spec §26): OpenAI-compatible provider over fetch against a local HTTP stub; features as capability attributes.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { modelContract, ModelProviderError, type ModelDelta } from "@godspeedai/capabilities";
import { localProvider } from "@godspeedai/provider-local";
import { modelComponent, openAICompatible } from "../src/index.ts";

const SECRET = "sk-test-cognate-9f8e7d";
let server: ReturnType<typeof Bun.serve>;
const requests: { auth: string | null; body: Record<string, unknown> }[] = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = (await req.json()) as Record<string, unknown>;
      requests.push({ auth: req.headers.get("authorization"), body });
      const last = (body.messages as { content: string }[]).at(-1)!.content;
      if (last === "unauthorized") return Response.json({ error: { message: "bad key" } }, { status: 401 });
      if (last === "slow") await Bun.sleep(2000);
      if (body.stream) {
        const last2 = (body.messages as { content: string }[]).at(-1)!.content;
        if (last2 === "server-error") return new Response("boom", { status: 500 });
        if (last2 === "slow-stream") {
          return new Response(
            new ReadableStream({
              async start(c) {
                c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`));
                await Bun.sleep(2000);
                c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                c.close();
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (body.tools) {
          // Tool call split across chunks: id+name arrive first, arguments trickle in split mid-token.
          const chunks = [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_9", type: "function", function: { name: "lookup" } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"ke' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'y":"a' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'bc"}' } }] } }] },
            { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
          ].map((e) => `data: ${JSON.stringify(e)}\n\n`);
          chunks.push("data: [DONE]\n\n");
          return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); c.close(); } }), { headers: { "content-type": "text/event-stream" } });
        }
        const chunks = ["Hel", "lo", "!"].map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
        chunks.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`, "data: [DONE]\n\n");
        return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); c.close(); } }), { headers: { "content-type": "text/event-stream" } });
      }
      if (body.tools) return Response.json({ model: body.model, choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: '{"key":"abc"}' } }] } }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
      return Response.json({ model: body.model, choices: [{ finish_reason: "stop", message: { role: "assistant", content: `echo: ${last}` } }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
    },
  });
});
afterAll(() => server.stop(true));

const provider = () => openAICompatible({ id: "stub", baseURL: `${server.url.origin}/v1`, model: "stub-model", apiKey: () => SECRET, features: { tool_use: true, structured_output: true, stream: true, context_limit: 8192 }, timeoutMs: 500 });

describe("OpenAI-compatible provider (§26)", () => {
  test("generate sends model, messages, auth and parses content and usage", async () => {
    const response = await provider().generate({ messages: [{ role: "user", content: "hi" }] });
    expect(response).toEqual({ message: { role: "assistant", content: "echo: hi" }, toolCalls: [], finishReason: "stop", usage: { inputTokens: 5, outputTokens: 2 }, model: "stub-model" });
    expect(requests.at(-1)).toMatchObject({ auth: `Bearer ${SECRET}`, body: { model: "stub-model", messages: [{ role: "user", content: "hi" }] } });
  });

  test("tools and structured output are sent in the OpenAI shape and tool calls parsed", async () => {
    const response = await provider().generate({ messages: [{ role: "user", content: "find" }], tools: [{ name: "lookup", description: "look up", inputSchema: { type: "object" } }], responseFormat: { type: "json", schema: { type: "object" } } });
    expect(response.toolCalls).toEqual([{ id: "call_1", name: "lookup", arguments: { key: "abc" } }]);
    expect(response.finishReason).toBe("tool_calls");
    expect(requests.at(-1)!.body).toMatchObject({ tools: [{ type: "function", function: { name: "lookup", description: "look up", parameters: { type: "object" } } }], response_format: { type: "json_schema" } });
  });

  test("stream yields ordered text deltas then done", async () => {
    const deltas: ModelDelta[] = [];
    for await (const d of provider().stream({ messages: [{ role: "user", content: "hi" }] })) deltas.push(d);
    expect(deltas.filter((d) => d.type === "text").map((d) => (d as { text: string }).text).join("")).toBe("Hello!");
    expect(deltas.at(-1)).toMatchObject({ type: "done", response: { message: { content: "Hello!" }, finishReason: "stop" } });
  });

  test("stream accumulates a tool call whose id, name, and arguments arrive split across chunks", async () => {
    const deltas: ModelDelta[] = [];
    for await (const d of provider().stream({ messages: [{ role: "user", content: "find" }], tools: [{ name: "lookup", description: "look up", inputSchema: { type: "object" } }] })) deltas.push(d);
    const toolCall = deltas.find((d) => d.type === "tool_call");
    expect(toolCall).toMatchObject({ type: "tool_call", call: { id: "call_9", name: "lookup", arguments: { key: "abc" } } });
    expect(deltas.filter((d) => d.type === "tool_call_args")).toEqual([
      { type: "tool_call_args", callId: "call_9", delta: '{"ke' },
      { type: "tool_call_args", callId: "call_9", delta: 'y":"a' },
      { type: "tool_call_args", callId: "call_9", delta: 'bc"}' },
    ]);
    expect(deltas).toContainEqual({ type: "tool_call_start", callId: "call_9", name: "lookup" });
    expect(deltas).toContainEqual({ type: "tool_call_end", callId: "call_9" });
    expect(deltas.at(-1)).toMatchObject({ type: "done", response: { toolCalls: [{ id: "call_9", name: "lookup", arguments: { key: "abc" } }], finishReason: "tool_calls" } });
  });

  test("stream aborts on the caller's signal without hanging", async () => {
    const controller = new AbortController();
    const iterate = async () => {
      for await (const _d of provider().stream({ messages: [{ role: "user", content: "slow-stream" }] }, controller.signal)) controller.abort();
    };
    const err = await iterate().catch((e) => e);
    expect(err).toBeInstanceOf(ModelProviderError);
    expect(err).toMatchObject({ kind: "cancelled" });
  });

  test("stream surfaces an HTTP error before any bytes are read, typed and without the credential", async () => {
    const err = await (async () => {
      try {
        for await (const _d of provider().stream({ messages: [{ role: "user", content: "server-error" }] })) void 0;
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ModelProviderError);
    expect(err).toMatchObject({ kind: "unavailable", status: 500 });
    expect(JSON.stringify({ ...(err as ModelProviderError), message: (err as ModelProviderError).message })).not.toContain(SECRET);
  });

  test("HTTP errors and timeouts are typed and never echo the credential", async () => {
    const unauthorized = await provider().generate({ messages: [{ role: "user", content: "unauthorized" }] }).catch((e) => e);
    expect(unauthorized).toBeInstanceOf(ModelProviderError);
    expect(unauthorized).toMatchObject({ kind: "unauthorized", status: 401 });
    expect(JSON.stringify({ ...unauthorized, message: unauthorized.message })).not.toContain(SECRET);
    const slow = await provider().generate({ messages: [{ role: "user", content: "slow" }] }).catch((e) => e);
    expect(slow).toMatchObject({ kind: "unavailable" });
  });

  test("the published capability declares features and never the credential", () => {
    const contract = modelContract(provider());
    expect(contract).toMatchObject({ id: "model.generate", version: "1.0.0", attributes: { stream: true, tool_use: true, structured_output: true, multimodal_input: false, context_limit: 8192, provider: "openai-compatible:stub", model: "stub-model" } });
    expect(JSON.stringify(contract)).not.toContain(SECRET);
    const component = modelComponent(provider());
    expect(component.provides).toEqual([contract]);
    expect(JSON.stringify(component.provides)).not.toContain(SECRET);
  });
});

describe("local provider", () => {
  test("is deterministic, rule-scripted, and streams the same text it generates", async () => {
    const local = localProvider({ rules: [{ when: "refund", respond: () => ({ message: { role: "assistant", content: "Refund approved pending review." }, toolCalls: [], finishReason: "stop" }) }], chunkSize: 5 });
    const a = await local.generate({ messages: [{ role: "user", content: "Please refund me" }] });
    const b = await local.generate({ messages: [{ role: "user", content: "Please refund me" }] });
    expect(a).toEqual(b);
    expect(a.message.content).toBe("Refund approved pending review.");
    const text: string[] = [];
    for await (const d of local.stream({ messages: [{ role: "user", content: "Please refund me" }] })) if (d.type === "text") text.push(d.text);
    expect(text.join("")).toBe(a.message.content);
    expect(text[0]).toHaveLength(5);
    expect((await local.generate({ messages: [{ role: "user", content: "unmatched" }] })).finishReason).toBe("stop");
    expect(local.features.generate).toBe(true);
  });
});
