// Test for invoker failure recording with error details (T11 / structured error fields).
import { describe, expect, test } from "bun:test";
import type { Component, Policy } from "@godspeedai/kernel-api";
import type { AgentDefinition } from "@godspeedai/runtime-api";
import { alice } from "@godspeedai/runtime-api/conformance";
import { createRuntime } from "../src/index.ts";

// Simulates ModelProviderError or any error with structured properties.
class StructuredError extends Error {
  override readonly name = "StructuredError";
  constructor(
    message: string,
    readonly kind: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const testAgent: AgentDefinition = {
  id: "agent.test",
  version: "1.0.0",
  async run(input, ctx) {
    const result = await ctx.invoke("tool.failing", {});
    return result;
  },
};

const policy: Policy = { authorize: () => ({ allow: true, policyId: "test", reason: "ok" }) };
const actions = { authorize: () => ({ allow: true, reason: "ok" }) };

describe("invoker failure recording", () => {
  test("records error name and details from thrown error", async () => {
    const components: Component[] = [
      {
        id: "error-provider",
        provides: [{ id: "tool.failing", version: "1.0.0" }],
        activate: (fiber) =>
          fiber.provide({ id: "tool.failing", version: "1.0.0" }, () => {
            throw new StructuredError("HTTP request failed", "http", 500);
          }),
      },
    ];

    const runtime = await createRuntime({ store: ":memory:", agents: [testAgent], policy, actions, components });

    const run = await runtime.service.startRun(alice, { agent: "agent.test", input: {}, idempotencyKey: "test-1" });

    // Wait for run to complete (fail)
    for (let i = 0; i < 500; i++) {
      const view = await runtime.service.getRun(alice, { runId: run.runId });
      if (view.status === "failed") break;
      await Bun.sleep(10);
    }

    // Read events to inspect the invocation failure
    const events = [];
    for await (const event of runtime.service.events(alice, { runId: run.runId })) {
      events.push(event);
    }

    const invocationEvent = events.find((e) => e.eventType === "run.invocation");
    expect(invocationEvent).toBeDefined();

    const failure = (invocationEvent?.payload as { failure?: unknown })?.failure;
    expect(failure).toBeDefined();
    expect(failure).toMatchObject({
      kind: "failed",
      message: "HTTP request failed",
    });
    expect((failure as { name?: string }).name).toBe("StructuredError");
    expect((failure as { details?: Record<string, unknown> }).details).toMatchObject({
      kind: "http",
      status: 500,
    });

    // The InvocationFailedError that the agent caught should carry the same failure
    const runView = await runtime.service.getRun(alice, { runId: run.runId });
    expect(runView.status).toBe("failed");

    await runtime.close();
  });
});
