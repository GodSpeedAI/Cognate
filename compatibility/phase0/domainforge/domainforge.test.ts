// Phase 0 compatibility fixture: @godspeedai/domainforge@0.16.0 (TypeScript/N-API
// Graph binding) under Bun 1.4. Read-only characterization — see
// .agents/evidence/phase0-domainforge.md and API_NOTES.md for the write-up.
//
// Spec anchors: software-design-spec-cognate.-frameworkmd §3.2, §7.1, §19.
// Required behaviours (§19 V0 golden fixtures): load, parse+typed collections
// with stable IDs, determinism across two parses, rename => new identity,
// missing reference => typed diagnostic, namespace change => new identity.
//
// 2026-09-28: fixture now pins @godspeedai/domainforge@0.18.1 (bun.lock
// regenerated via scoped `bun install` in this directory). All assertions
// below still characterize 0.16.0 behaviour accurately — no changes were
// needed; the full suite passes unmodified against 0.18.1 (verified 3x).
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf8");

const sha256 = (source: string) => createHash("sha256").update(source, "utf8").digest("hex");

// --- Behaviour 1: the binding loads under Bun -------------------------------

describe("binding load", () => {
  test("the N-API binding loads under Bun 1.4 and exposes Graph.parse", async () => {
    const mod = await import("@godspeedai/domainforge");
    expect(typeof mod.Graph).toBe("function");
    expect(typeof mod.Graph.parse).toBe("function");
  });
});

// --- Behaviour 2: a valid fixture parses and exposes typed collections ------

describe("parsing exposes typed collections with stable per-kind IDs", () => {
  test("entities, resources, and flows are exposed with id/name/namespace fields", async () => {
    const { Graph } = await import("@godspeedai/domainforge");
    const source = fixture("basic.sea");
    const graph = Graph.parse(source);

    expect(graph.entityCount()).toBe(2);
    expect(graph.resourceCount()).toBe(1);
    expect(graph.flowCount()).toBe(1);

    const entities = graph.allEntities();
    const resources = graph.allResources();
    const flows = graph.allFlows();

    for (const e of entities) {
      expect(typeof e.id).toBe("string");
      expect(typeof e.name).toBe("string");
    }
    for (const r of resources) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.unit).toBe("string");
    }
    for (const f of flows) {
      expect(typeof f.id).toBe("string");
      expect(typeof f.resourceId).toBe("string");
      expect(typeof f.fromId).toBe("string");
      expect(typeof f.toId).toBe("string");
      expect(typeof f.quantity).toBe("number");
    }

    const warehouse = entities.find((e) => e.name === "Warehouse");
    expect(warehouse?.namespace).toBe("logistics");

    // findEntityByName / hasEntity / getEntity round-trip on the returned id.
    const foundId = graph.findEntityByName("Warehouse");
    expect(foundId).toBe(warehouse!.id);
    expect(graph.hasEntity(foundId!)).toBe(true);
    expect(graph.getEntity(foundId!)?.name).toBe("Warehouse");
  });
});

// --- Behaviour 3: parsing the same source twice: identity + source digest --

describe("determinism across two parses of the same source", () => {
  test("entity and resource IDs are identical across two independent parses", async () => {
    const { Graph } = await import("@godspeedai/domainforge");
    const source = fixture("basic.sea");
    const digest = sha256(source);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    const g1 = Graph.parse(source);
    const g2 = Graph.parse(source);

    const ids = (g: import("@godspeedai/domainforge").Graph) =>
      g.allEntities().map((e) => e.id).sort();
    expect(ids(g1)).toEqual(ids(g2));

    const resourceIds = (g: import("@godspeedai/domainforge").Graph) =>
      g.allResources().map((r) => r.id).sort();
    expect(resourceIds(g1)).toEqual(resourceIds(g2));
  });

  test("observed: Flow identity is NOT stable across two parses of the same source", async () => {
    // This is a characterization failure against the naive reading of the
    // required behaviour, recorded rather than hidden. Entity/Resource IDs
    // are content-derived (namespace::name); Flow IDs are randomly generated
    // per parse (a v4-shaped UUID), so an adapter MUST NOT rely on Flow
    // identity being stable across re-parses of identical source. See
    // API_NOTES.md "Identity" section.
    const { Graph } = await import("@godspeedai/domainforge");
    const source = fixture("basic.sea");
    const g1 = Graph.parse(source);
    const g2 = Graph.parse(source);

    const flowIds1 = g1.allFlows().map((f) => f.id);
    const flowIds2 = g2.allFlows().map((f) => f.id);
    expect(flowIds1).toHaveLength(1);
    expect(flowIds2).toHaveLength(1);
    // Documented as failing/unstable behaviour: do NOT assert equality here.
    expect(flowIds1[0]).not.toBe(flowIds2[0]);
  });
});

// --- Behaviour 4: renaming an entity yields a new identity ------------------

describe("renaming an entity yields a new identity", () => {
  test("Warehouse -> WarehouseX changes the entity id; Factory (unchanged) keeps its id", async () => {
    const { Graph } = await import("@godspeedai/domainforge");
    const before = Graph.parse(fixture("basic.sea"));
    const after = Graph.parse(fixture("renamed.sea"));

    const beforeWarehouse = before.allEntities().find((e) => e.name === "Warehouse")!;
    const afterWarehouseX = after.allEntities().find((e) => e.name === "WarehouseX")!;
    expect(afterWarehouseX.id).not.toBe(beforeWarehouse.id);
    expect(after.hasEntity(beforeWarehouse.id)).toBe(false);

    const beforeFactory = before.allEntities().find((e) => e.name === "Factory")!;
    const afterFactory = after.allEntities().find((e) => e.name === "Factory")!;
    expect(afterFactory.id).toBe(beforeFactory.id);
  });
});

// --- Behaviour 5: a missing reference yields a typed error/diagnostic ------

describe("a missing reference yields a typed error", () => {
  test("Graph.parse throws an Error with a stable .code and a diagnostic message", async () => {
    const { Graph } = await import("@godspeedai/domainforge");
    const source = fixture("missing-reference.sea");

    let caught: unknown;
    try {
      Graph.parse(source);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { code?: string };
    // Observed shape: plain JS Error, no dedicated exception class or
    // structured diagnostic object. `.code` is the napi-rs status, not a
    // DomainForge-specific error code — it is the SAME "GenericFailure" value
    // for missing references, syntax errors, and bad-argument errors. Callers
    // MUST distinguish failure kinds by parsing `.message`, not `.code`.
    expect(err.code).toBe("GenericFailure");
    expect(err.message).toContain("Undefined entity");
    expect(err.message).toContain("Nowhere");
  });

  test("observed: a syntax error uses the same Error shape and the same .code", async () => {
    const { Graph } = await import("@godspeedai/domainforge");
    let caught: unknown;
    try {
      Graph.parse("this is not valid sea syntax @@@");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { code?: string };
    expect(err.code).toBe("GenericFailure");
    expect(err.message).toMatch(/Syntax error/i);
  });

  test("observed: hasEntity/getEntity reject a non-UUID id by throwing, not returning false/null", async () => {
    // A second, distinct diagnostic shape worth recording for the adapter:
    // lookups validate their id argument's shape *before* doing a lookup, and
    // throw GenericFailure for a malformed id, while a well-formed-but-absent
    // id returns false/null as expected.
    const { Graph } = await import("@godspeedai/domainforge");
    const graph = Graph.parse(fixture("basic.sea"));

    expect(() => graph.hasEntity("not-a-uuid")).toThrow(/Invalid UUID/i);
    expect(graph.hasEntity("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(graph.getEntity("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

// --- Behaviour 6: a namespace change changes identity ----------------------

describe("a namespace change changes identity", () => {
  test("Warehouse in logistics -> logistics2 changes the entity id", async () => {
    const { Graph } = await import("@godspeedai/domainforge");
    const before = Graph.parse(fixture("basic.sea"));
    const after = Graph.parse(fixture("namespace-changed.sea"));

    const beforeWarehouse = before.allEntities().find((e) => e.name === "Warehouse")!;
    const afterWarehouse = after.allEntities().find((e) => e.name === "Warehouse")!;

    expect(afterWarehouse.namespace).toBe("logistics2");
    expect(afterWarehouse.id).not.toBe(beforeWarehouse.id);
  });
});
