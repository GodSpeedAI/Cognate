// The RuVector adapter is derived state, not a persistence layer: reopening an existing
// storagePath must never resurrect entries the adapter map (the only source of provenance)
// has no record of. See DEBT-007 and packages/cognitive-ruvector/README.md.
import { entry } from "@godspeedai/cognate-cognitive-api/conformance";
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuVectorIndex } from "../src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "cognate-ruvector-reopen-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("reopening the same storagePath starts clean instead of serving unprovenanced entries", async () => {
  const storagePath = join(dir, "reopen.db");

  const first = await createRuVectorIndex({ dimension: 4, storagePath });
  await first.upsert([entry("a", [1, 0, 0, 0])]);
  expect(await first.count()).toBe(1);
  await first.close();

  const second = await createRuVectorIndex({ dimension: 4, storagePath });
  expect(await second.count()).toBe(0);
  expect(await second.similar({ vector: Float32Array.from([1, 0, 0, 0]), k: 5, tenant: "tenant-a" })).toEqual([]);
  await second.close();
});
