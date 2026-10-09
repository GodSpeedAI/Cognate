import { describe, expect, test } from "bun:test";
import { createCordisKernel } from "@godspeedai/cognate-kernel-cordis";
import { allowCapabilities, isUnavailable } from "@godspeedai/cognate-kernel-api";
import type { Component, InvocationContext } from "@godspeedai/cognate-kernel-api";
import { EXECUTION_CAPABILITY_IDS, createExecutionWorldRegistry, executionWorldsComponent, memoryExecutionWorld } from "../src/index.ts";

const ctx: InvocationContext = { actor: { id: "test", kind: "user" }, correlationId: "execution-test", tenant: "test" };

async function kernelWith(components: readonly Component[]) {
  const kernel = await createCordisKernel({ tenant: "test", principal: { id: "system", kind: "system" }, policy: allowCapabilities("execution-test", EXECUTION_CAPABILITY_IDS) });
  for (const component of components) await (await kernel.mount(component)).waitFor("ACTIVE", 5_000);
  return kernel;
}

async function invoke(kernel: Awaited<ReturnType<typeof kernelWith>>, capability: string, input: unknown) {
  const lease = kernel.resolve({ capability });
  if (isUnavailable(lease)) return { ok: false as const, reason: lease.reason };
  return lease.invoke(input, ctx);
}

describe("executionWorldsComponent", () => {
  test("publishes every filesystem/process capability and routes by worldId", async () => {
    const registry = createExecutionWorldRegistry([memoryExecutionWorld({ worldId: "world-a", files: { "/workspace/readme.md": "hello" } })]);
    const kernel = await kernelWith([executionWorldsComponent(registry)]);
    const read = await invoke(kernel, "filesystem.readText", { worldId: "world-a", path: "/workspace/readme.md" });
    expect(read.ok).toBe(true);
    expect(read.ok && (read.value as { content: string }).content).toBe("hello");
    expect(isUnavailable(kernel.resolve({ capability: "process.exec" }))).toBe(false);
  });

  test("an unknown worldId fails the invocation instead of executing elsewhere", async () => {
    const registry = createExecutionWorldRegistry([memoryExecutionWorld({ worldId: "world-a" })]);
    const kernel = await kernelWith([executionWorldsComponent(registry)]);
    const result = await invoke(kernel, "filesystem.readText", { worldId: "world-b", path: "/workspace/readme.md" });
    expect(result.ok).toBe(false);
    const failure = (result as { failure?: { kind: string; error?: Error } }).failure;
    expect(failure?.kind).toBe("failed");
    expect(failure?.error?.name).toBe("WorldUnavailableError");
  });

  test("removing a provider makes dependent resolution fail cleanly; restoring it reactivates", async () => {
    const registry = createExecutionWorldRegistry([memoryExecutionWorld({ worldId: "world-a" })]);
    const consumer: Component = {
      id: "consumer",
      requires: { fs: { capability: "filesystem.readText" } },
      provides: [{ id: "consumer.ping", version: "1.0.0" }],
      activate(fiber) {
        fiber.provide({ id: "consumer.ping", version: "1.0.0" }, () => ({ ok: true }));
      },
    };
    const kernel = await createCordisKernel({ tenant: "test", principal: { id: "system", kind: "system" }, policy: allowCapabilities("execution-test", EXECUTION_CAPABILITY_IDS) });
    // Mount the consumer alone: it must stay WAITING, not activate, with no execution provider.
    const consumerHandle = await kernel.mount(consumer);
    await Bun.sleep(20);
    expect(consumerHandle.state).toBe("WAITING");
    expect(consumerHandle.fiberId).toBeUndefined();
    expect(isUnavailable(kernel.resolve({ capability: "consumer.ping" }))).toBe(true);

    const providerHandle = await kernel.mount(executionWorldsComponent(registry));
    await providerHandle.waitFor("ACTIVE", 5_000);
    await Bun.sleep(20);
    expect(isUnavailable(kernel.resolve({ capability: "consumer.ping" }))).toBe(false);

    // Removing the provider withdraws the capability again — no silent local fallback.
    await providerHandle.dispose("provider removed");
    await Bun.sleep(20);
    expect(isUnavailable(kernel.resolve({ capability: "consumer.ping" }))).toBe(true);

    // Restoring it re-enables the behaviour without touching the consumer.
    const restored = await kernel.mount(executionWorldsComponent(registry));
    await restored.waitFor("ACTIVE", 5_000);
    await Bun.sleep(20);
    expect(isUnavailable(kernel.resolve({ capability: "consumer.ping" }))).toBe(false);
    await kernel.shutdown("test end");
  });
});