// Canonical organizational worlds must be resolved by DomainForge's native module resolver,
// not a concatenation of source files or independent Graph.parse(source) calls.
import { describe, expect, test } from "bun:test";
import { Graph } from "@godspeedai/domainforge";
import { loadSemanticWorld } from "../src/index.ts";

const main = '@namespace "organization"\nimport { Purchase } from "./finance.sea"\nimport { Shipment } from "./operations.sea"\nentity "Work" { key id: uuid\n purchase: ref<Purchase>\n shipment: ref<Shipment>\n}\n';
const finance = '@namespace "finance"\nexport entity "Purchase" { key id: uuid }\n';
const operations = '@namespace "operations"\nexport entity "Shipment" { key id: uuid }\n';
const sources = {
  "domain/organization.sea": main,
  "domain/finance.sea": finance,
  "domain/operations.sea": operations,
};
const nativeAvailable = typeof (Graph as typeof Graph & { parseSourceMap?: unknown }).parseSourceMap === "function";
const load = (files = sources) => loadSemanticWorld({ entry: "domain/organization.sea", sources: files, worldName: "godspeed.org" });

describe("canonical multi-source organizational world", () => {
  test("native binding required before composed-world integration can be released", () => {
    expect(nativeAvailable).toBe(true);
  });

  test.skipIf(nativeAvailable)("older native bindings refuse composed worlds instead of returning an incomplete graph", () => {
    expect(load()).toMatchObject({ ok: false, error: { kind: "binding_unavailable" } });
  });

  // Intentionally conditional: native functionality only becomes usable after DomainForge
  // publishes the Graph.parseSourceMap binding. A skip is not evidence of integration success.
  test.skipIf(!nativeAvailable)("resolves imported entities in their original namespaces and pins root identity", () => {
    const result = load();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.objects.filter((o) => o.kind === "Entity").map((o) => o.ref.id).sort()).toEqual([
      "finance::Purchase", "operations::Shipment", "organization::Work",
    ]);
    expect(result.worldRef).toMatch(/^world:godspeed\.org@sha256:[0-9a-f]{64}$/);
    expect(result.projection.source.uri).toBe(result.worldRef);
    expect(result.projection.source.digest).toBe(result.worldRef.split("@")[1]);
    expect(result.identity.semantic_closure_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(load()).toEqual(result);
  });

  test.skipIf(!nativeAvailable)("source-only edit moves world_ref but not semantic closure", () => {
    const a = load();
    const b = load({ ...sources, "domain/finance.sea": `// documentation only\n${finance}` });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.worldRef).not.toBe(b.worldRef);
    expect(a.identity.semantic_closure_hash).toBe(b.identity.semantic_closure_hash);
    const edited = load({ ...sources, "domain/finance.sea": '@namespace "finance"\nexport entity "Expense" { key id: uuid }\n' });
    expect(edited.ok).toBe(false); // import cannot resolve Purchase
  });

  test.skipIf(!nativeAvailable)("missing import fails closed", () => {
    const { ["domain/finance.sea"]: _removed, ...missing } = sources;
    void _removed;
    expect(load(missing).ok).toBe(false);
  });
});
