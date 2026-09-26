// CG-SEM-001 (spec §7.1, §19): Graph output → read-only semantic objects with provenance; explicit mapping; no implicit capabilities.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { bindCapabilities, BINDING, loadSemanticProjection, mappingTable, PROJECTION_SCHEMA, serializeProjection } from "../src/index.ts";

const fixtureFile = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const fixture = (name: string) => fixtureFile(`${name}.sea`);
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
    for (const kind of ["Entity", "Resource", "Flow", "Role", "Relation", "Instance", "EntityInstance", "Pattern", "ConceptChange", "Policy", "Metric", "Dimension", "Unit", "Mapping", "Projection", "External"]) expect(kinds).toContain(kind);
    for (const row of mappingTable) {
      expect(row.meaning.length).toBeGreaterThan(0);
      expect(row.cardinality.length).toBeGreaterThan(0);
      expect(row.provenance.length).toBeGreaterThan(0);
      if (!row.supported) expect(row.reason?.length ?? 0).toBeGreaterThan(0);
    }
    expect(mappingTable.find((r) => r.kind === "Policy")).toMatchObject({ supported: true, provenance: "Graph.allPolicies()" });
    expect(mappingTable.find((r) => r.kind === "Instance")).toMatchObject({ supported: true, provenance: "Graph.allInstances()", meaning: expect.stringContaining("no SEA declaration") });
    expect(mappingTable.find((r) => r.kind === "EntityInstance")).toMatchObject({ supported: true, provenance: "Graph.allEntityInstances()", meaning: expect.stringContaining("declared in SEA") });
    expect(mappingTable.filter((r) => r.supported).every((r) => !/capabilit|permission/i.test(r.view))).toBe(true);
    expect(load().unmapped.map((u) => u.kind)).toEqual(["External"]);
  });

  test("every declared SEA kind becomes a read-only object and matches the golden projection", () => {
    const source = fixture("all-kinds");
    const first = loadSemanticProjection(source, { uri: "file:///domain/all-kinds.sea" });
    const second = loadSemanticProjection(source, { uri: "file:///domain/all-kinds.sea" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("all-kinds fixture did not load");

    const projection = first.projection;
    expect(serializeProjection(projection)).toBe(serializeProjection(second.projection));
    expect(serializeProjection(projection)).toBe(fixtureFile("all-kinds.projection.json").trimEnd());
    expect(projection.unmapped).toEqual([{ kind: "External", reason: expect.any(String) }]);

    const byKind = new Map<string, typeof projection.objects[number]>();
    for (const object of projection.objects) byKind.set(object.kind, object);
    for (const kind of ["Entity", "Resource", "Flow", "Role", "Relation", "EntityInstance", "Pattern", "ConceptChange", "Policy", "Metric", "Dimension", "Unit", "Mapping", "Projection"])
      expect(projection.objects.some((object) => object.kind === kind)).toBe(true);

    expect(byKind.get("Policy")?.fields).toMatchObject({ expression: expect.any(String), modality: expect.any(String), policyKind: expect.any(String) });
    expect(byKind.get("Metric")?.fields).toMatchObject({ expression: expect.any(String), unit: expect.any(String) });
    expect(byKind.get("Dimension")?.name).toBe("Currency");
    expect(byKind.get("Unit")?.fields).toMatchObject({ dimension: expect.any(String), baseFactor: expect.any(String) });
    expect(byKind.get("Mapping")?.fields).toMatchObject({ target: "CALM", source: expect.arrayContaining([expect.objectContaining({ primitive_type: "Entity", primitive_name: "Buyer", target_type: "Node" })]) });
    expect(byKind.get("Projection")?.fields).toMatchObject({ target: "CALM", source: expect.arrayContaining([expect.objectContaining({ primitive_type: "Entity", primitive_name: "Buyer" })]) });
    expect(byKind.get("Pattern")?.fields).toMatchObject({ regex: expect.any(String) });
    expect(byKind.get("ConceptChange")?.fields).toMatchObject({ fromVersion: expect.any(String), toVersion: expect.any(String), migrationPolicy: expect.any(String) });
    expect(byKind.get("EntityInstance")?.fields).toMatchObject({ entityType: expect.any(String), fields: expect.any(Object) });
    expect(mappingTable.filter((row) => row.kind !== "External").every((row) => row.supported)).toBe(true);
  });

  test("serialization is deterministic and versioned", () => {
    const a = serializeProjection(load());
    const b = serializeProjection(load());
    expect(a).toBe(b);
    expect(JSON.parse(a).schema).toBe(PROJECTION_SCHEMA);
  });

  test("no semantic object is a capability until the application binds it explicitly", () => {
    const projection = load(fixture("all-kinds"));
    expect(bindCapabilities(projection, [])).toEqual([]);
    const [contract] = bindCapabilities(projection, [{ semanticId: "debt003::Buyer", capability: { id: "buyer.read", version: "1.0.0" } }]);
    expect(contract).toMatchObject({ id: "buyer.read", version: "1.0.0", semanticRef: { id: "debt003::Buyer", kind: "Entity" } });
    expect(() => bindCapabilities(projection, [{ semanticId: "debt003::Nowhere", capability: { id: "x", version: "1.0.0" } }])).toThrow();
    expect(() => bindCapabilities(projection, [{ semanticId: "debt003::positive_payment", capability: { id: "policy.run", version: "1.0.0" } }])).toThrow(/Policy.*constraint/);
  });
});
