// CG-SEM-002 (spec §7.1, §13.3; DEBT-001/002): pinned identity, derived Flow ids, renames are new identities, typed failures.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadSemanticProjection, SemanticRegistry, type SemanticProjection } from "../src/index.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.sea`, import.meta.url), "utf8");
const load = (name: string): SemanticProjection => {
  const result = loadSemanticProjection(fixture(name), { uri: `file:///domain/${name}.sea` });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.projection;
};

describe("semantic identity (§7.1)", () => {
  test("Flow identity is derived and stable across parses although the native Flow id is random (DEBT-001)", () => {
    const a = load("basic").objects.filter((o) => o.kind === "Flow").map((o) => o.ref.id);
    const b = load("basic").objects.filter((o) => o.kind === "Flow").map((o) => o.ref.id);
    expect(a).toHaveLength(1);
    expect(a).toEqual(b);
    expect(a[0]).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
  });

  test("a rename produces a new identity and never resolves the old ref to the renamed object", () => {
    const before = load("basic");
    const after = load("renamed");
    const ids = (p: SemanticProjection) => p.objects.map((o) => o.ref.id);
    const removed = ids(before).filter((id) => !ids(after).includes(id));
    const added = ids(after).filter((id) => !ids(before).includes(id));
    expect(removed).toContain("logistics::Warehouse");
    expect(added.length).toBeGreaterThan(0);
    const registry = new SemanticRegistry();
    registry.register(before);
    registry.register(after);
    const old = before.objects.find((o) => o.ref.id === "logistics::Warehouse")!.ref;
    expect(registry.resolve(old)).toMatchObject({ kind: "resolved", object: { name: "Warehouse" }, projection: { source: before.source } });
    expect(registry.resolve({ ...old, source: after.source })).toEqual({ kind: "unresolved", ref: { ...old, source: after.source }, reason: "not_in_source" });
  });

  test("refs from an unarchived source are typed unresolved, not guessed", () => {
    const registry = new SemanticRegistry();
    const ref = load("basic").objects[0]!.ref;
    expect(registry.resolve(ref)).toEqual({ kind: "unresolved", ref, reason: "unknown_source" });
  });

  test("a namespace change is a new identity", () => {
    const moved = load("namespace-changed").objects.map((o) => o.ref.id);
    expect(moved).not.toContain("logistics::Warehouse");
  });

  test("aliases are explicit, reviewed records and do not change resolution", () => {
    const registry = new SemanticRegistry();
    const before = load("basic");
    const after = load("renamed");
    registry.register(before);
    registry.register(after);
    const old = before.objects.find((o) => o.ref.id === "logistics::Warehouse")!.ref;
    const renamed = after.objects.find((o) => o.kind === "Entity" && !before.objects.some((b) => b.ref.id === o.ref.id))!.ref;
    registry.alias(old, renamed, { reviewedBy: "domain-owner", meaningCheck: "same physical site" });
    expect(registry.aliasesOf(old)).toEqual([{ to: renamed, reviewedBy: "domain-owner", meaningCheck: "same physical site" }]);
    expect(registry.resolve({ ...old, source: after.source }).kind).toBe("unresolved");
  });

  test("missing references and syntax errors are typed, never thrown", () => {
    expect(loadSemanticProjection(fixture("missing-reference"), { uri: "file:///m.sea" })).toMatchObject({ ok: false, error: { kind: "unresolved_reference" } });
    expect(loadSemanticProjection("Entity Warehouse in", { uri: "file:///s.sea" })).toMatchObject({ ok: false, error: { kind: "syntax" } });
  });

  test("a changed source is a different digest and pins different refs", () => {
    const a = load("basic");
    const b = loadSemanticProjection(`${fixture("basic")}\nEntity "Depot" in logistics\n`, { uri: "file:///domain/basic.sea" });
    if (!b.ok) throw new Error("expected ok");
    expect(b.projection.source.digest).not.toBe(a.source.digest);
    expect(b.projection.objects.find((o) => o.ref.id === "logistics::Warehouse")!.ref.source.digest).toBe(b.projection.source.digest);
  });
});
