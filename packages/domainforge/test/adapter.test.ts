// CG-SEM-001 (spec §7.1, §19): Graph output → read-only semantic objects with provenance; explicit mapping; no implicit capabilities.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { bindCapabilities, BINDING, loadSemanticProjection, mappingTable, PROJECTION_SCHEMA, serializeProjection } from "../src/index.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.sea`, import.meta.url), "utf8");
const basic = fixture("basic");
const load = (source = basic) => {
  const result = loadSemanticProjection(source, { uri: "file:///domain/basic.sea" });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.projection;
};

describe("DomainForge adapter (§19)", () => {
  test("a projection carries schema, pinned binding, source uri, and sha256 source digest", () => {
    const projection = load();
    expect(projection.schema).toBe(PROJECTION_SCHEMA);
    expect(projection.binding).toBe(BINDING);
    expect(projection.source).toEqual({ uri: "file:///domain/basic.sea", digest: `sha256:${createHash("sha256").update(basic).digest("hex")}` });
  });

  test("entities, resources, and flows become SemanticRefs with kind and provenance", () => {
    const projection = load();
    const byId = new Map(projection.objects.map((o) => [o.ref.id, o]));
    expect(byId.get("logistics::Warehouse")).toMatchObject({ kind: "Entity", name: "Warehouse", namespace: "logistics", ref: { namespace: "logistics", kind: "Entity", source: projection.source, projectionVersion: PROJECTION_SCHEMA } });
    expect(byId.get("manufacturing::Factory")?.kind).toBe("Entity");
    expect(byId.get("equipment::Cameras")?.kind).toBe("Resource");
    const flow = projection.objects.find((o) => o.kind === "Flow")!;
    expect(flow.fields).toMatchObject({ resource: "equipment::Cameras", from: "logistics::Warehouse", to: "manufacturing::Factory", quantity: 10 });
    expect(projection.relations).toEqual(expect.arrayContaining([{ type: "flow.from", from: flow.ref.id, to: "logistics::Warehouse" }, { type: "flow.to", from: flow.ref.id, to: "manufacturing::Factory" }, { type: "flow.resource", from: flow.ref.id, to: "equipment::Cameras" }]));
  });

  test("the mapping table covers every DomainForge kind, marking unsupported ones with reasons", () => {
    const kinds = mappingTable.map((row) => row.kind);
    for (const kind of ["Entity", "Resource", "Flow", "Role", "Relation", "Instance", "Policy", "Metric", "Dimension", "Unit", "Mapping", "Projection", "External"]) expect(kinds).toContain(kind);
    for (const row of mappingTable) {
      expect(row.meaning.length).toBeGreaterThan(0);
      expect(row.cardinality.length).toBeGreaterThan(0);
      expect(row.provenance.length).toBeGreaterThan(0);
      if (!row.supported) expect(row.reason?.length ?? 0).toBeGreaterThan(0);
    }
    expect(mappingTable.find((r) => r.kind === "Policy")).toMatchObject({ supported: false });
    expect(mappingTable.filter((r) => r.supported).every((r) => !/capabilit|permission/i.test(r.view))).toBe(true);
    expect(load().unmapped.map((u) => u.kind)).toEqual(expect.arrayContaining(["Policy", "Metric", "External"]));
  });

  test("serialization is deterministic and versioned", () => {
    const a = serializeProjection(load());
    const b = serializeProjection(load());
    expect(a).toBe(b);
    expect(JSON.parse(a).schema).toBe(PROJECTION_SCHEMA);
  });

  test("no semantic object is a capability until the application binds it explicitly", () => {
    const projection = load();
    expect(bindCapabilities(projection, [])).toEqual([]);
    const [contract] = bindCapabilities(projection, [{ semanticId: "logistics::Warehouse", capability: { id: "warehouse.read", version: "1.0.0" } }]);
    expect(contract).toMatchObject({ id: "warehouse.read", version: "1.0.0", semanticRef: { id: "logistics::Warehouse", kind: "Entity" } });
    expect(() => bindCapabilities(projection, [{ semanticId: "logistics::Nowhere", capability: { id: "x", version: "1.0.0" } }])).toThrow();
  });
});
