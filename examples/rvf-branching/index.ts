// Example: rvf-branching — a branched RVF index diverges from its parent independently.
// Docs: docs/rvf.md (ADR-0006; spec §18: portable cognition files support branch and snapshot).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRvfIndex } from "@godspeedai/cognitive-rvf";

const entry = (id: string, vector: number[]) => ({
  id,
  sourceType: "event" as const,
  sourceRef: `event:${id}`,
  tenant: "tenant-a",
  scopeId: "root",
  semanticRef: null,
  eventRef: id,
  traceRef: null,
  embedding: Float32Array.from(vector),
  metadata: {},
  relationships: [],
  validFrom: "2026-01-01T00:00:00Z",
  validTo: null,
  indexerVersion: "1",
  durable: true,
});

async function main() {
  const root = mkdtempSync(join(tmpdir(), "cognate-example-rvf-"));
  const parent = await createRvfIndex({ dimension: 4, path: join(root, "parent.rvf") });
  try {
    await parent.upsert([entry("a", [1, 0, 0, 0])]);

    const child = await parent.branch(join(root, "child.rvf"));
    try {
      await child.upsert([entry("b", [0, 1, 0, 0])]);
      await parent.upsert([entry("c", [0, 0, 1, 0])]);

      const parentHits = (await parent.similar({ vector: Float32Array.from([0, 1, 0, 0]), k: 3, tenant: "tenant-a" })).map((h) => h.id);
      const childHits = (await child.similar({ vector: Float32Array.from([0, 0, 1, 0]), k: 3, tenant: "tenant-a" })).map((h) => h.id);
      if (parentHits.includes("b")) throw new Error("child's entry leaked into the parent");
      if (childHits.includes("c")) throw new Error("parent's later entry leaked into the child");

      const lineage = await child.lineage();
      const parentLineage = await parent.lineage();
      if (lineage.parentId !== parentLineage.fileId) throw new Error(`expected the child's lineage to point at the parent, got: ${JSON.stringify(lineage)}`);

      console.log(`ok: branch diverged from its parent (parent knows [${(await parent.similar({ vector: Float32Array.from([1, 0, 0, 0]), k: 3, tenant: "tenant-a" })).map((h) => h.id)}], child knows [b] and inherits a) with lineage depth ${lineage.depth}`);
    } finally {
      await child.close();
    }
  } finally {
    await parent.close();
    rmSync(root, { recursive: true, force: true });
  }
}

await main();
