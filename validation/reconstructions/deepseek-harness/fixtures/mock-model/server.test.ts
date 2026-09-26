import { describe, expect, test } from "bun:test";
import { handleRequest } from "./server";

const BASE = "http://127.0.0.1:4010";

function chatReq(messages: unknown[], stream: boolean) {
  return new Request(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "mock-model-1", messages, stream }),
  });
}

function userMsg(scenario: string) {
  return { role: "user", content: `Do the thing. [[scenario:${scenario}]]` };
}

async function readSSE(res: Response): Promise<string[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function bytesFor(messages: unknown[], stream: boolean): Promise<Uint8Array> {
  const res = await handleRequest(chatReq(messages, stream));
  return new Uint8Array(await res.arrayBuffer());
}

describe("GET /v1/models", () => {
  test("returns a model list", async () => {
    const res = await handleRequest(new Request(`${BASE}/v1/models`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("list");
    expect(body.data[0].id).toBeString();
  });
});

describe("scenario: plain", () => {
  test("non-stream first response is a text completion", async () => {
    const res = await handleRequest(chatReq([userMsg("plain")], false));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.choices[0].message.content).toContain("# Summary");
  });

  test("stream emits chat.completion.chunk frames and terminates with [DONE]", async () => {
    const res = await handleRequest(chatReq([userMsg("plain")], true));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const frames = await readSSE(res);
    expect(frames[frames.length - 1]).toBe("data: [DONE]");
    const first = JSON.parse(frames[0].replace(/^data: /, ""));
    expect(first.object).toBe("chat.completion.chunk");
    expect(first.choices[0].delta.role).toBe("assistant");
  });
});

describe("scenario: read", () => {
  test("step 0 calls the read tool with README.md", async () => {
    const res = await handleRequest(chatReq([userMsg("read")], false));
    const body = await res.json();
    expect(body.choices[0].finish_reason).toBe("tool_calls");
    const call = body.choices[0].message.tool_calls[0];
    expect(call.function.name).toBe("read");
    expect(JSON.parse(call.function.arguments)).toEqual({ file_path: "README.md" });
  });

  test("step 1 (after a tool message) answers with text", async () => {
    const messages = [
      userMsg("read"),
      { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call-1", content: "1  # fixture-workspace" },
    ];
    const res = await handleRequest(chatReq(messages, false));
    const body = await res.json();
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.choices[0].message.content).toContain("README");
  });
});

describe("scenario: edit", () => {
  test("progresses read -> edit -> answer across steps", async () => {
    const step0 = await (await handleRequest(chatReq([userMsg("edit")], false))).json();
    expect(step0.choices[0].message.tool_calls[0].function.name).toBe("read");

    const step1 = await (
      await handleRequest(
        chatReq(
          [
            userMsg("edit"),
            { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }] },
            { role: "tool", tool_call_id: "c1", content: "ok" },
          ],
          false,
        ),
      )
    ).json();
    const editCall = step1.choices[0].message.tool_calls[0];
    expect(editCall.function.name).toBe("edit");
    const args = JSON.parse(editCall.function.arguments);
    expect(args.old_string).toBe("Hello");
    expect(args.new_string).toBe("Howdy");
  });
});

describe("scenario: shell", () => {
  test("step 0 runs bash with git status --short", async () => {
    const res = await handleRequest(chatReq([userMsg("shell")], false));
    const body = await res.json();
    const call = body.choices[0].message.tool_calls[0];
    expect(call.function.name).toBe("bash");
    expect(JSON.parse(call.function.arguments).command).toBe("git status --short");
  });
});

describe("scenario: approval", () => {
  test("step 0 calls run_code with sandbox_permissions + justification", async () => {
    const res = await handleRequest(chatReq([userMsg("approval")], false));
    const body = await res.json();
    const call = body.choices[0].message.tool_calls[0];
    expect(call.function.name).toBe("run_code");
    const args = JSON.parse(call.function.arguments);
    expect(args.sandbox_permissions).toBe("workspace-write");
    expect(typeof args.justification).toBe("string");
  });

  test("step 1 reflects the tool result content", async () => {
    const messages = [
      userMsg("approval"),
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "run_code", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "[sandbox: file access denied under workspace-write mode]" },
    ];
    const body = await (await handleRequest(chatReq(messages, false))).json();
    expect(body.choices[0].message.content).toContain("denied");
  });
});

describe("scenario: plan", () => {
  test("step 0 calls todo_write, step 1 calls exit_plan_mode", async () => {
    const step0 = await (await handleRequest(chatReq([userMsg("plan")], false))).json();
    expect(step0.choices[0].message.tool_calls[0].function.name).toBe("todo_write");

    const step1 = await (
      await handleRequest(
        chatReq(
          [
            userMsg("plan"),
            { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "todo_write", arguments: "{}" } }] },
            { role: "tool", tool_call_id: "c1", content: "ok" },
          ],
          false,
        ),
      )
    ).json();
    expect(step1.choices[0].message.tool_calls[0].function.name).toBe("exit_plan_mode");
    const planArgs = JSON.parse(step1.choices[0].message.tool_calls[0].function.arguments);
    expect(planArgs.plan.startsWith("# ")).toBe(true);
  });
});

describe("scenario: delegate", () => {
  test("parent calls subagent with a child scenario marker", async () => {
    const body = await (await handleRequest(chatReq([userMsg("delegate")], false))).json();
    const call = body.choices[0].message.tool_calls[0];
    expect(call.function.name).toBe("subagent");
    const args = JSON.parse(call.function.arguments);
    expect(args.prompt).toContain("[[scenario:child]]");
  });

  test("child scenario answers directly with no tool calls", async () => {
    const body = await (await handleRequest(chatReq([userMsg("child")], false))).json();
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.choices[0].message.content).toBeString();
  });
});

describe("scenario: error", () => {
  test("responds HTTP 500 with an OpenAI-style error body", async () => {
    const res = await handleRequest(chatReq([userMsg("error")], false));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBeString();
    expect(body.error.type).toBeString();
  });
});

describe("scenario: retry", () => {
  test("fails once then succeeds for the same conversation, keyed on message-history hash", async () => {
    await handleRequest(new Request(`${BASE}/__reset`, { method: "POST" }));
    const messages = [userMsg("retry")];
    const first = await handleRequest(chatReq(messages, false));
    expect(first.status).toBe(500);
    const second = await handleRequest(chatReq(messages, false));
    expect(second.status).toBe(200);

    // A distinct conversation gets its own independent first failure.
    const otherMessages = [{ role: "user", content: "different history [[scenario:retry]]" }];
    const otherFirst = await handleRequest(chatReq(otherMessages, false));
    expect(otherFirst.status).toBe(500);
  });
});

describe("scenario: interrupt", () => {
  test("requires stream:true", async () => {
    const res = await handleRequest(chatReq([userMsg("interrupt")], false));
    expect(res.status).toBe(400);
  });

  test("streams a few chunks before staying open", async () => {
    const res = await handleRequest(chatReq([userMsg("interrupt")], true));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("chat.completion.chunk");
    await reader.cancel();
  });
});

describe("determinism", () => {
  test("identical non-stream request -> identical response bytes", async () => {
    const messages = [userMsg("multi")];
    const a = await bytesFor(messages, false);
    const b = await bytesFor(messages, false);
    expect(a).toEqual(b);
  });

  test("identical streaming request -> identical SSE bytes", async () => {
    const messages = [userMsg("plain")];
    const a = await bytesFor(messages, true);
    const b = await bytesFor(messages, true);
    expect(a).toEqual(b);
  });

  test("step progression is driven only by trailing tool-message count, not history length noise", async () => {
    const messagesA = [
      userMsg("edit"),
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "same content" },
    ];
    const messagesB = [
      userMsg("edit"),
      { role: "assistant", content: null, tool_calls: [{ id: "different-id", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "different-id", content: "same content" },
    ];
    // Same step count (1 tool message) and same trailing tool content -> same scenario turn (edit).
    const a = await (await handleRequest(chatReq(messagesA, false))).json();
    const b = await (await handleRequest(chatReq(messagesB, false))).json();
    expect(a.choices[0].message.tool_calls[0].function.name).toBe(b.choices[0].message.tool_calls[0].function.name);
  });
});

describe("scenario marker with trailing synthetic user messages", () => {
  test("marker in an earlier user message (string or content parts) still selects the scenario", async () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "Do the thing. [[scenario:read]]" }] },
      { role: "user", content: "<runtime-context>cwd=/ws</runtime-context>" },
      { role: "user", content: "<reminder>skills available</reminder>" },
    ];
    const body = await (await handleRequest(chatReq(messages, false))).json();
    expect(body.choices[0].message.tool_calls[0].function.name).toBe("read");
  });
});
