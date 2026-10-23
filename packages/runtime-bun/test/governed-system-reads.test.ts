// A `thread.state.read` by the runtime's own system principal has no side effect: local policy decides it and
// the external authority is not asked (unless `governSystemReads`). Every other operation still reaches it.
import { describe, expect, test } from "bun:test";
import { Governor, isSystemRead, type GovernanceAuthority, type GovernedOperation } from "../src/index.ts";

const WORLD = `world:test@sha256:${"a".repeat(64)}`;
const system = { tenant: "local", actor: { id: "system", kind: "system" as const } };
const user = { tenant: "local", actor: { id: "operator", kind: "user" as const } };
const agent = { tenant: "local", actor: { id: "agent-1", kind: "agent" as const } };
const op = (caller: typeof system | typeof user | typeof agent, action: "thread.state.read" | "thread.state.update"): GovernedOperation =>
  ({ kind: "action", caller, action, resource: "schedules:registry" }) as GovernedOperation;

function governor(options: { governSystemReads?: boolean; localAllows?: boolean } = {}) {
  const asked: GovernedOperation[] = [];
  const authority: GovernanceAuthority = {
    decide: async (operation) => {
      asked.push(operation);
      return { disposition: "deny", reason: "external authority said no" } as never;
    },
  } as GovernanceAuthority;
  const local = { authorize: () => (options.localAllows === false ? { allow: false, reason: "local deny" } : { allow: true, reason: "local allow" }) };
  const kernel = { authorize: () => ({ allow: true, reason: "kernel allow" }) };
  const g = new Governor(local as never, kernel as never, { mode: "sea-forge", authority, worldRef: WORLD, ...(options.governSystemReads === undefined ? {} : { governSystemReads: options.governSystemReads }) });
  return { g, asked };
}

describe("system reads of runtime state", () => {
  test("isSystemRead matches only thread.state.read by the system principal", () => {
    expect(isSystemRead(op(system, "thread.state.read"))).toBe(true);
    expect(isSystemRead(op(user, "thread.state.read"))).toBe(false);
    expect(isSystemRead(op(agent, "thread.state.read"))).toBe(false);
    expect(isSystemRead(op(system, "thread.state.update"))).toBe(false);
  });

  test("a system read is decided by local policy and never reaches the external authority", async () => {
    const { g, asked } = governor();
    const result = await g.govern(op(system, "thread.state.read"));
    expect(result.allow).toBe(true);
    expect(result.reason).toContain("system read of runtime state: local policy only");
    expect(asked).toHaveLength(0);
  });

  test("local policy still refuses a system read", async () => {
    const { g, asked } = governor({ localAllows: false });
    const result = await g.govern(op(system, "thread.state.read"));
    expect(result.allow).toBe(false);
    expect(asked).toHaveLength(0);
  });

  test("reads by users and agents, and system writes, still go to the external authority", async () => {
    const { g, asked } = governor();
    for (const operation of [op(user, "thread.state.read"), op(agent, "thread.state.read"), op(system, "thread.state.update")]) {
      const result = await g.govern(operation);
      expect(result.allow).toBe(false);
      expect(result.reason).toContain("external authority said no");
    }
    expect(asked).toHaveLength(3);
  });

  test("governSystemReads sends system reads to the external authority too", async () => {
    const { g, asked } = governor({ governSystemReads: true });
    const result = await g.govern(op(system, "thread.state.read"));
    expect(result.allow).toBe(false);
    expect(asked).toHaveLength(1);
  });
});
