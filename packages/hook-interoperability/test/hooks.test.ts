import { describe, expect, test } from "bun:test";
import { dispatchHooks, mapNativeEvent, parseDeclarativeHooks } from "../src/index.ts";

describe("hook semantics and effect governance", () => {
  const inventory = parseDeclarativeHooks({
    hooks: { PreToolUse: [{ matcher: "Bash|Edit", hooks: [{ type: "command", command: "guard.sh" }] }] },
  }, { harness: "claude", scope: "project", sourcePath: "/work/.claude/settings.json", trusted: false });

  test("normalizes declarative hooks but never equates discovery with trust", () => {
    expect(inventory.hooks).toHaveLength(1);
    expect(inventory.hooks[0]).toMatchObject({ phase: "tool.before", fidelity: "exact", matcher: "Bash|Edit", trust: "untrusted" });
    expect(mapNativeEvent("gemini", "BeforeTool")).toEqual({ phase: "tool.before", fidelity: "approximate" });
    expect(mapNativeEvent("opencode", "tool.execute.before")).toEqual({ fidelity: "unmapped" });
  });
  test("does not execute untrusted or unauthorized hooks", async () => {
    let calls = 0;
    const executor = { async invoke() { calls++; return { kind: "deny" as const, reason: "blocked" }; } };
    const invocation = { phase: "tool.before" as const, sessionId: "s", toolName: "Bash" };
    expect((await dispatchHooks(inventory.hooks, invocation, { executor, authorization: { authorize: () => true } })).effect.kind).toBe("allow");
    expect(calls).toBe(0);
    const trusted = inventory.hooks.map(h => ({ ...h, trust: "trusted" as const }));
    expect((await dispatchHooks(trusted, invocation, { executor })).receipts[0]?.decision).toBe("unauthorized");
    expect(calls).toBe(0);
    expect((await dispatchHooks(trusted, invocation, { executor, authorization: { authorize: () => true } })).effect.kind).toBe("deny");
    expect(calls).toBe(1);
  });
  test("approved guard failures fail closed; opaque native command never enters receipt", async () => {
    const trusted = inventory.hooks.map(h => ({ ...h, trust: "trusted" as const }));
    const result = await dispatchHooks(trusted, { phase: "tool.before", sessionId: "s", toolName: "Bash" }, {
      authorization: { authorize: () => true },
      executor: { invoke: async () => { throw new Error("secret-hook-token"); } },
    });
    expect(result.effect.kind).toBe("deny");
    expect(JSON.stringify(result.receipts)).not.toContain("secret-hook-token");
    expect(JSON.stringify(result.receipts)).not.toContain("guard.sh");
  });
  test("tool matcher prevents unrelated tool execution and unsafe matcher widening", async () => {
    let calls = 0;
    const trusted = inventory.hooks.map(h => ({...h, trust: "trusted" as const}));
    const options = {authorization: { authorize: () => true }, executor: {async invoke() { calls++; return {kind:"deny" as const,reason:"blocked"};}}};
    const unrelated = await dispatchHooks(trusted, {phase:"tool.before",sessionId:"s",toolName:"Read"}, options);
    expect(unrelated.effect.kind).toBe("allow");
    const missing = await dispatchHooks(trusted, {phase:"tool.before",sessionId:"s"}, options);
    expect(missing.effect.kind).toBe("allow");
    const unsupported = await dispatchHooks(trusted.map(h => ({...h,matcher:".*"})), {phase:"tool.before",sessionId:"s",toolName:"Bash"}, options);
    expect(unsupported.effect.kind).toBe("allow");
    expect(calls).toBe(0);
  });
  test("unknown events remain explicitly unresolved", () => {
    const inv = parseDeclarativeHooks({ hooks: { SurprisingEvent: [{ hooks: [{ type: "command", command: "hello" }] }] } }, { harness: "claude", scope: "user", sourcePath: "/home/settings.json" });
    expect(inv.discovery).toBe("partial");
    expect(inv.hooks[0]?.fidelity).toBe("unmapped");
  });
});
