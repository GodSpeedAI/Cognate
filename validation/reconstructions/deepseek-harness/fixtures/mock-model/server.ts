#!/usr/bin/env bun
// Deterministic mock model server — OpenAI Chat Completions compatible.
// Zero dependencies (Bun built-ins only).
//
// Endpoints:
//   POST /v1/chat/completions   (stream + non-stream)
//   GET  /v1/models
//   POST /__reset               (clears in-memory `retry` scenario state)
//
// Scenario is chosen by a `[[scenario:<name>]]` marker in the LAST user
// message of the request. The "step" within a scenario is the number of
// `tool` role messages that appear after that last user message — so the
// exact same request history always produces the exact same response
// (deterministic replay, no server-side session state needed except for
// the `retry` scenario, which is keyed on a hash of the message history).

const PORT = Number(process.argv.find((a) => a.startsWith("--port="))?.split("=")[1]
  ?? process.env.MOCK_MODEL_PORT
  ?? 4010);
const CHUNK_DELAY_MS = Number(process.env.MOCK_CHUNK_DELAY_MS ?? 40);
const MODEL_ID = "mock-model-1";

// ---------------------------------------------------------------------------
// Tiny deterministic hash (FNV-1a) — no crypto import needed.
// ---------------------------------------------------------------------------
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  [key: string]: unknown;
};

type ToolCallSpec = { name: string; arguments: Record<string, unknown> };

type Turn =
  | { kind: "text"; text: string }
  | { kind: "tool"; calls: ToolCallSpec[] };

// ---------------------------------------------------------------------------
// Scenario scripts
//
// Tool names/argument shapes are taken verbatim from the reference's
// docs/tool-catalog.md (DeepSeek Harness, pinned commit 477b4f420553).
// ---------------------------------------------------------------------------
const SCENARIOS: Record<string, Turn[]> = {
  plain: [
    {
      kind: "text",
      text: [
        "# Summary",
        "",
        "Here is what I found:",
        "",
        "- first point",
        "- second point",
        "",
        "```ts",
        "export function greet(name: string): string {",
        "  return `Hello, ${name}!`;",
        "}",
        "```",
      ].join("\n"),
    },
  ],

  read: [
    { kind: "tool", calls: [{ name: "read", arguments: { file_path: "README.md" } }] },
    { kind: "text", text: "The README describes a tiny fixture project used to exercise read/edit/shell tool flows." },
  ],

  edit: [
    { kind: "tool", calls: [{ name: "read", arguments: { file_path: "src/greet.ts" } }] },
    {
      kind: "tool",
      calls: [
        {
          name: "edit",
          arguments: {
            file_path: "src/greet.ts",
            old_string: "Hello",
            new_string: "Howdy",
            replace_all: false,
          },
        },
      ],
    },
    { kind: "text", text: "Updated the greeting in src/greet.ts from \"Hello\" to \"Howdy\"." },
  ],

  shell: [
    { kind: "tool", calls: [{ name: "bash", arguments: { command: "git status --short", description: "Show working tree status" } }] },
    { kind: "tool", calls: [{ name: "bash", arguments: { command: "ls", description: "List files in current directory" } }] },
    { kind: "text", text: "The working tree is clean and the directory listing matches the template layout." },
  ],

  // Journey C: read -> bash -> edit -> final answer
  multi: [
    { kind: "tool", calls: [{ name: "read", arguments: { file_path: "src/greet.ts" } }] },
    { kind: "tool", calls: [{ name: "bash", arguments: { command: "git status --short", description: "Show working tree status" } }] },
    {
      kind: "tool",
      calls: [
        {
          name: "edit",
          arguments: {
            file_path: "src/greet.ts",
            old_string: "Hello",
            new_string: "Howdy",
            replace_all: false,
          },
        },
      ],
    },
    { kind: "text", text: "Read greet.ts, confirmed a clean tree, then updated the greeting from \"Hello\" to \"Howdy\"." },
  ],

  // Sandbox escalation lives on `run_code` (dsh-tools), not on `bash` — the
  // `bash` tool schema (docs/tool-catalog.md, packages/shell/tool-bash) has
  // no sandbox_permissions/justification fields; only run_code
  // (packages/core/tools/src/ptc.ts) does, and it is what triggers the
  // approval `ask` PreToolDecision waterfall (privileged-execution escalation).
  approval: [
    {
      kind: "tool",
      calls: [
        {
          name: "run_code",
          arguments: {
            code: "await tools.bash({ command: 'rm -rf /tmp/scratch-cache', description: 'Clear stale scratch cache' })",
            description: "Clear stale scratch cache outside the workspace",
            sandbox_permissions: "workspace-write",
            justification: "Need to remove a stale cache directory outside the default workspace sandbox.",
          },
        },
      ],
    },
    { kind: "text", text: "__REFLECT_TOOL_RESULT__" },
  ],

  // todo_write / exit_plan_mode exactly as docs/tool-catalog.md defines them.
  plan: [
    {
      kind: "tool",
      calls: [
        {
          name: "todo_write",
          arguments: {
            todos: [
              { content: "Investigate current greet.ts implementation", status: "in_progress" },
              { content: "Propose the greeting change", status: "pending" },
            ],
          },
        },
      ],
    },
    {
      kind: "tool",
      calls: [
        {
          name: "exit_plan_mode",
          arguments: {
            plan: "# Update greeting\n\n1. Read src/greet.ts\n2. Change \"Hello\" to \"Howdy\"\n3. Report the change",
          },
        },
      ],
    },
    { kind: "text", text: "__REFLECT_TOOL_RESULT__" },
  ],

  delegate: [
    {
      kind: "tool",
      calls: [
        {
          name: "subagent",
          arguments: {
            description: "Summarize project status",
            prompt: "Summarize the current state of the fixture workspace in one sentence. [[scenario:child]]",
          },
        },
      ],
    },
    { kind: "text", text: "__REFLECT_TOOL_RESULT__" },
  ],

  child: [
    { kind: "text", text: "The fixture workspace is a tiny, clean project with a README, a greet() helper, and no pending changes." },
  ],
};

// `error`, `interrupt`, `retry` are handled outside SCENARIOS (special control flow).
const SPECIAL_SCENARIOS = new Set(["error", "interrupt", "retry"]);

// ---------------------------------------------------------------------------
// Request parsing helpers
// ---------------------------------------------------------------------------
function lastUserMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

function extractScenario(messages: ChatMessage[]): { name: string; step: number } {
  const idx = lastUserMessageIndex(messages);
  const marker = idx >= 0 ? String(messages[idx].content ?? "").match(/\[\[scenario:([a-zA-Z0-9_-]+)\]\]/) : null;
  const name = marker ? marker[1] : "plain";
  let step = 0;
  if (idx >= 0) {
    for (let i = idx + 1; i < messages.length; i++) {
      if (messages[i].role === "tool") step++;
    }
  }
  return { name, step };
}

function lastToolMessageContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "tool") return String(messages[i].content ?? "");
  }
  return "";
}

function resolveTurn(scenarioName: string, step: number): Turn {
  const script = SCENARIOS[scenarioName] ?? SCENARIOS.plain;
  const turn = script[Math.min(step, script.length - 1)];
  return turn;
}

function materializeTurn(turn: Turn, messages: ChatMessage[]): Turn {
  if (turn.kind === "text" && turn.text === "__REFLECT_TOOL_RESULT__") {
    const raw = lastToolMessageContent(messages).trim();
    return { kind: "text", text: raw.length > 0 ? `Tool result: ${raw}` : "Done." };
  }
  return turn;
}

// ---------------------------------------------------------------------------
// OpenAI-shape builders
// ---------------------------------------------------------------------------
function makeId(prefix: string, seed: string): string {
  return `${prefix}-${fnv1a(seed)}`;
}

function toolCallsToOpenAI(calls: ToolCallSpec[], seed: string) {
  return calls.map((c, i) => ({
    id: makeId("call", `${seed}:${i}:${c.name}`),
    type: "function" as const,
    function: { name: c.name, arguments: JSON.stringify(c.arguments) },
  }));
}

function nonStreamResponse(turn: Turn, seed: string, scenario: string, step: number) {
  const id = makeId("chatcmpl", seed);
  const message: ChatMessage =
    turn.kind === "text"
      ? { role: "assistant", content: turn.text }
      : { role: "assistant", content: null, tool_calls: toolCallsToOpenAI(turn.calls, seed) };
  return {
    id,
    object: "chat.completion",
    created: 1_700_000_000,
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message,
        finish_reason: turn.kind === "tool" ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    system_fingerprint: `mock-${scenario}-${step}`,
  };
}

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function baseChunk(id: string, delta: Record<string, unknown>, finishReason: string | null) {
  return {
    id,
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function splitWords(text: string): string[] {
  // Keep whitespace attached to the following token so re-joining is exact.
  const pieces = text.match(/\S+\s*|\s+/g);
  return pieces ?? [text];
}

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function requestSummary(scenario: string, step: number, stream: boolean) {
  console.log(`[mock-model] scenario=${scenario} step=${step} stream=${stream}`);
}

// ---------------------------------------------------------------------------
// `retry` scenario state (in-memory, cleared by POST /__reset)
// ---------------------------------------------------------------------------
const retrySeen = new Set<string>();

function retryKey(messages: ChatMessage[]): string {
  // Hash the full message history so distinct conversations retry independently.
  return fnv1a(JSON.stringify(messages));
}

// ---------------------------------------------------------------------------
// Streaming writers
// ---------------------------------------------------------------------------
function streamText(controller: ReadableStreamDefaultController, id: string, text: string, delayMs: number) {
  return (async () => {
    controller.enqueue(new TextEncoder().encode(sseChunk(baseChunk(id, { role: "assistant" }, null))));
    const pieces = splitWords(text);
    for (const piece of pieces) {
      await sleep(delayMs);
      controller.enqueue(new TextEncoder().encode(sseChunk(baseChunk(id, { content: piece }, null))));
    }
    controller.enqueue(new TextEncoder().encode(sseChunk(baseChunk(id, {}, "stop"))));
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
  })();
}

function streamToolCalls(controller: ReadableStreamDefaultController, id: string, calls: ToolCallSpec[], seed: string, delayMs: number) {
  return (async () => {
    controller.enqueue(new TextEncoder().encode(sseChunk(baseChunk(id, { role: "assistant", tool_calls: [] }, null))));
    const openaiCalls = toolCallsToOpenAI(calls, seed);
    for (let i = 0; i < openaiCalls.length; i++) {
      const call = openaiCalls[i];
      await sleep(delayMs);
      controller.enqueue(
        new TextEncoder().encode(
          sseChunk(
            baseChunk(
              id,
              { tool_calls: [{ index: i, id: call.id, type: "function", function: { name: call.function.name, arguments: "" } }] },
              null,
            ),
          ),
        ),
      );
      const argChunks = call.function.arguments.match(/.{1,12}/g) ?? [call.function.arguments];
      for (const chunk of argChunks) {
        await sleep(delayMs);
        controller.enqueue(
          new TextEncoder().encode(
            sseChunk(baseChunk(id, { tool_calls: [{ index: i, function: { arguments: chunk } }] }, null)),
          ),
        );
      }
    }
    controller.enqueue(new TextEncoder().encode(sseChunk(baseChunk(id, {}, "tool_calls"))));
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
  })();
}

async function streamInterrupt(controller: ReadableStreamDefaultController, id: string) {
  const encoder = new TextEncoder();
  const send = (obj: unknown): boolean => {
    try {
      controller.enqueue(encoder.encode(sseChunk(obj)));
      return true;
    } catch {
      // Controller was cancelled (client disconnected / test cancelled the reader) — stop the drip.
      return false;
    }
  };
  if (!send(baseChunk(id, { role: "assistant" }, null))) return;
  const words = ["Working", "on", "a", "long", "task..."];
  for (const w of words) {
    await sleep(CHUNK_DELAY_MS);
    if (!send(baseChunk(id, { content: `${w} ` }, null))) return;
  }
  // Slow drip: 1 chunk every 2s for up to 60s, so a UI Stop can be exercised.
  const dripCount = 30;
  for (let i = 0; i < dripCount; i++) {
    await sleep(2000);
    if (!send(baseChunk(id, { content: "." }, null))) return;
  }
  if (!send(baseChunk(id, {}, "stop"))) return;
  try {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  } catch {
    // already closed/cancelled
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
function openAIError(status: number, message: string, type: string, code: string) {
  return new Response(
    JSON.stringify({ error: { message, type, param: null, code } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

export async function handleRequest(req: Request): Promise<Response> {
  {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/v1/models") {
      return Response.json({
        object: "list",
        data: [{ id: MODEL_ID, object: "model", created: 1_700_000_000, owned_by: "mock" }],
      });
    }

    if (req.method === "POST" && url.pathname === "/__reset") {
      retrySeen.clear();
      return Response.json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      let body: { messages?: ChatMessage[]; stream?: boolean };
      try {
        body = await req.json();
      } catch {
        return openAIError(400, "Invalid JSON body", "invalid_request_error", "invalid_json");
      }
      const messages = body.messages ?? [];
      const stream = body.stream === true;
      const { name: scenario, step } = extractScenario(messages);
      requestSummary(scenario, step, stream);

      if (scenario === "error") {
        return openAIError(500, "Mock model server: scripted server_error", "server_error", "mock_server_error");
      }

      if (scenario === "retry") {
        const key = retryKey(messages);
        if (!retrySeen.has(key)) {
          retrySeen.add(key);
          return openAIError(500, "Mock model server: scripted transient failure (retry to succeed)", "server_error", "mock_retry_error");
        }
        const turn = resolveTurn("plain", 0);
        const seed = `${scenario}:${step}:${JSON.stringify(messages)}`;
        if (!stream) return Response.json(nonStreamResponse(turn, seed, scenario, step));
        const id = makeId("chatcmpl", seed);
        const streamBody = new ReadableStream({
          start(controller) {
            streamText(controller, id, (turn as { kind: "text"; text: string }).text, CHUNK_DELAY_MS);
          },
        });
        return new Response(streamBody, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
      }

      const seed = `${scenario}:${step}:${JSON.stringify(messages)}`;
      const id = makeId("chatcmpl", seed);

      if (scenario === "interrupt") {
        if (!stream) return openAIError(400, "interrupt scenario requires stream:true", "invalid_request_error", "interrupt_requires_stream");
        const streamBody = new ReadableStream({
          start(controller) {
            streamInterrupt(controller, id);
          },
        });
        return new Response(streamBody, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
      }

      const turn = materializeTurn(resolveTurn(scenario, step), messages);

      if (!stream) {
        return Response.json(nonStreamResponse(turn, seed, scenario, step));
      }

      const streamBody = new ReadableStream({
        start(controller) {
          if (turn.kind === "text") {
            streamText(controller, id, turn.text, CHUNK_DELAY_MS);
          } else {
            streamToolCalls(controller, id, turn.calls, seed, CHUNK_DELAY_MS);
          }
        },
      });
      return new Response(streamBody, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
    }

    return new Response("not found", { status: 404 });
  }
}

export function startServer(port = PORT) {
  return Bun.serve({ port, idleTimeout: 0, fetch: handleRequest });
}

if (import.meta.main) {
  const server = startServer();
  console.log(`[mock-model] listening on http://127.0.0.1:${server.port} (chunk delay ${CHUNK_DELAY_MS}ms)`);
}
