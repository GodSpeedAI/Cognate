// CG-WIR-004 (spec §32): untrusted protocol input is authenticated, size- and depth-bounded, and deadlined.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import type { AgentDefinition } from "@cognate/runtime-api";
import { devTokenAuthenticator, serveRuntime, type RuntimeServer } from "../src/index.ts";

const slow: AgentDefinition = { id: "agent.echo", version: "1.0.0", run: async (i) => i };
let runtime: Runtime;
let server: RuntimeServer;

beforeAll(async () => {
  runtime = await createRuntime({
    store: ":memory:",
    policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
    actions: { authorize: () => ({ allow: true, reason: "ok" }) },
    agents: [slow],
    components: [{ id: "slow", provides: [{ id: "tool.slow", version: "1.0.0" }], activate: (f) => f.provide({ id: "tool.slow", version: "1.0.0" }, async () => (await Bun.sleep(500), "late")) }],
  });
  server = serveRuntime({ service: runtime.service, authenticate: devTokenAuthenticator, port: 0, limits: { maxBodyBytes: 4096, maxJsonDepth: 8, defaultDeadlineMs: 100 } });
});
afterAll(async () => {
  await server.stop();
  await runtime.close();
});

const call = (method: string, body: unknown, token: string | null = "tenant-a:alice") =>
  fetch(`${server.url}/cognate.v1.RuntimeService/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const errorCode = async (response: Response) => ((await response.json()) as { code: string }).code;

describe("protocol limits (§32)", () => {
  test("unauthenticated requests are rejected before reaching the service", async () => {
    const response = await call("GetRun", { runId: "x" }, null);
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthenticated");
  });

  test("oversized bodies are rejected", async () => {
    const response = await call("StartRun", { agent: "agent.echo", input: "x".repeat(10_000), idempotencyKey: "big" });
    expect(await errorCode(response)).toBe("resource_exhausted");
  });

  test("over-deep JSON values are rejected", async () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 20; i++) deep = { d: deep };
    const response = await call("StartRun", { agent: "agent.echo", input: deep, idempotencyKey: "deep" });
    expect(await errorCode(response)).toBe("invalid_argument");
  });

  test("malformed messages are invalid_argument", async () => {
    expect(await errorCode(await call("StartRun", "{not json"))).toBe("invalid_argument");
  });

  test("the server deadline bounds slow unary calls", async () => {
    const response = await call("Invoke", { capability: "tool.slow", input: null });
    expect(await errorCode(response)).toBe("deadline_exceeded");
  });

  test("well-formed authenticated calls succeed", async () => {
    const response = await call("StartRun", { agent: "agent.echo", input: { ok: true }, idempotencyKey: "fine" });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { runId: string }).runId).toBeString();
  });
});
