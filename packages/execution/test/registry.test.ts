import { describe, expect, test } from "bun:test";
import { WorldUnavailableError, createExecutionWorldRegistry, memoryExecutionWorld } from "../src/index.ts";

describe("execution world registry", () => {
  test("resolves a registered world and lists secret-free descriptors", () => {
    const registry = createExecutionWorldRegistry([memoryExecutionWorld({ worldId: "b", metadata: { host: "b.example" } }), memoryExecutionWorld({ worldId: "a" })]);
    expect(registry.has("a")).toBe(true);
    expect(registry.get("a").worldId).toBe("a");
    expect(registry.list().map((entry) => entry.worldId)).toEqual(["a", "b"]);
    expect(registry.list().every((entry) => entry.kind === "memory")).toBe(true);
  });

  test("an unknown world fails closed with a typed error — never another world", () => {
    const registry = createExecutionWorldRegistry();
    expect(() => registry.get("nope")).toThrow(WorldUnavailableError);
    expect(registry.has("nope")).toBe(false);
  });

  test("registering the same world twice is refused", () => {
    const registry = createExecutionWorldRegistry([memoryExecutionWorld({ worldId: "a" })]);
    expect(() => registry.register(memoryExecutionWorld({ worldId: "a" }))).toThrow(/already registered/);
  });

  test("unregister disposes the provider and makes the world unavailable", async () => {
    const registry = createExecutionWorldRegistry([memoryExecutionWorld({ worldId: "a" })]);
    await registry.unregister("a");
    expect(registry.has("a")).toBe(false);
    expect(() => registry.get("a")).toThrow(WorldUnavailableError);
    // Idempotent: unregistering an absent world is a no-op.
    await registry.unregister("a");
  });

  test("dispose clears every provider and is idempotent", async () => {
    const registry = createExecutionWorldRegistry([memoryExecutionWorld({ worldId: "a" }), memoryExecutionWorld({ worldId: "b" })]);
    await registry.dispose();
    await registry.dispose();
    expect(registry.list()).toEqual([]);
  });
});