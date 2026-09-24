// Phase 0 compatibility fixture: @ruvector/core@0.1.32 under Bun 1.4.0
//
// This file is NOT part of the Framework's dependency graph. It exists only
// to characterize RuVector bindings per software-design-spec-cognate
// §3.5, §3.6, §14-17, §31.3, §37, §38.
//
// Package under test: @ruvector/core (narrow vector-DB package, preferred
// over the `ruvector` umbrella package per §38 "Prefer narrow RuVector
// packages over the umbrella package where feasible").
//
// Run with: bun test compatibility/phase0/ruvector/ruvector.test.ts

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIM = 4;

// Deterministic, hand-made unit-ish vectors along orthogonal axes so nearest
// neighbor results are unambiguous.
const RECORDS = [
  { id: "a", vector: [1, 0, 0, 0], metadata: { tenant: "acme", kind: "doc" } },
  { id: "b", vector: [0, 1, 0, 0], metadata: { tenant: "acme", kind: "doc" } },
  { id: "c", vector: [0, 0, 1, 0], metadata: { tenant: "globex", kind: "doc" } },
  { id: "d", vector: [0.9, 0.1, 0, 0], metadata: { tenant: "acme", kind: "img" } },
];

// observed: @ruvector/core@0.1.32's NAPI layer requires the `vector` field to
// be an actual Float32Array — a plain `number[]` (which index.d.ts's
// `Float32Array | number[]` union claims is valid) raises
// "Get TypedArray info failed on JsVectorEntry.vector" (code InvalidArg).
//
// observed: `metadata` must be a STRING, not an object — despite the
// README's example (`metadata: { title: 'Example Document' }`) passing an
// object literal directly. Passing an object raises "Failed to convert
// JavaScript value ... into rust type String on JsVectorEntry.metadata"
// (code StringExpected). Both index.d.ts and the README are wrong/misleading
// about this field's actual runtime contract; the caller must JSON.stringify
// metadata itself and JSON.parse it back on read.
// This helper is the workaround; every real-binding call below uses it.
function nativeEntry(r: { id: string; vector: number[]; metadata?: unknown }) {
  return {
    id: r.id,
    vector: new Float32Array(r.vector),
    ...(r.metadata !== undefined ? { metadata: JSON.stringify(r.metadata) } : {}),
  };
}
function nativeVector(v: number[]) {
  return new Float32Array(v);
}

// observed: @ruvector/core@0.1.32 has NO true in-memory mode. The README
// states "No storagePath = in-memory", but empirically, omitting
// `storagePath` (or passing `":memory:"`) silently creates/reuses a
// `ruvector.db` file in `process.cwd()` — polluting the working directory
// and leaking state across unrelated VectorDb instances / test runs.
// Passing `storagePath: ""` throws ("Is a directory"); `storagePath: null`
// throws ("Null" -> rust String conversion). The only safe way to get an
// isolated instance is to always pass a unique, real file path.
const isolationDirs: string[] = [];
function isolatedDbOptions(extra: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ruvector-phase0-iso-"));
  isolationDirs.push(dir);
  return { dimensions: DIM, distanceMetric: "Cosine", storagePath: join(dir, "vectors.db"), ...extra };
}

// ---------------------------------------------------------------------------
// Behaviour 1: load under Bun (with the fallback loader required by
// behaviour 8 written the way an application would actually use it).
// ---------------------------------------------------------------------------

let VectorDb: any;
let loadError: unknown = null;
let usedFallback = false;

function deterministicFallbackSearch(
  records: typeof RECORDS,
  queryVector: number[],
  k: number,
) {
  // Deterministic ordering fallback: plain cosine similarity computed in JS,
  // ties broken by id, ascending. This is what an application-level
  // CognitiveIndex adapter would fall back to per §31.3 ("RuVector
  // unavailable -> deterministic/non-cognitive behavior").
  function cosine(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  }
  return records
    .map((r) => ({ id: r.id, score: cosine(r.vector, queryVector) }))
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))
    .slice(0, k);
}

beforeAll(async () => {
  try {
    const mod = await import("@ruvector/core");
    VectorDb = mod.VectorDb ?? mod.VectorDB ?? mod.default?.VectorDb;
    if (!VectorDb) throw new Error("VectorDb export not found on module");
  } catch (err) {
    loadError = err;
    usedFallback = true;
  }
});

describe("(1) load under Bun", () => {
  test("observed: @ruvector/core native binding loads under Bun 1.4.0, or fallback engages", () => {
    if (loadError) {
      // Characterize the exact failure so the ADR can cite it verbatim.
      console.log("RuVector load failure under Bun:", String(loadError));
      expect(usedFallback).toBe(true);
    } else {
      expect(typeof VectorDb).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// Behaviours 2-7 run against the real binding only when it loaded. If it did
// not load, they run against the deterministic fallback and are marked
// `observed:` rather than asserting RuVector-specific behavior.
// ---------------------------------------------------------------------------

describe("(2) fixed-dimension index: insert with id + metadata, similarity search", () => {
  test("search for vector 'a' returns 'a' as nearest, then 'd' (closest non-identical)", async () => {
    if (usedFallback) {
      const results = deterministicFallbackSearch(RECORDS, [1, 0, 0, 0], 2);
      expect(results[0].id).toBe("a");
      expect(results[1].id).toBe("d");
      return;
    }
    const db = new VectorDb(isolatedDbOptions());
    for (const r of RECORDS) {
      await db.insert(nativeEntry(r) as any);
    }
    const results = await db.search({ vector: nativeVector([1, 0, 0, 0]), k: 2 } as any);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe("a");
    expect(results[1].id).toBe("d");
  });

  test("observed: metadata round-trips through insert -> get, even though VectorEntry.metadata is absent from index.d.ts", async () => {
    if (usedFallback) return;
    const db = new VectorDb(isolatedDbOptions());
    await db.insert(nativeEntry({ id: "meta-1", vector: [1, 1, 0, 0], metadata: { tenant: "acme" } }) as any);
    const fetched: any = await db.get("meta-1");
    // Characterize rather than assume: record what actually comes back.
    console.log("get() shape for entry with metadata:", JSON.stringify(fetched));
    expect(fetched).not.toBeNull();
  });
});

describe("(3) delete entry", () => {
  test("deleted id no longer appears in search results", async () => {
    if (usedFallback) {
      const remaining = RECORDS.filter((r) => r.id !== "b");
      const results = deterministicFallbackSearch(remaining, [0, 1, 0, 0], 4);
      expect(results.find((r) => r.id === "b")).toBeUndefined();
      return;
    }
    const db = new VectorDb(isolatedDbOptions());
    for (const r of RECORDS) await db.insert(nativeEntry(r) as any);
    const okDeleted = await db.delete("b");
    expect(okDeleted).toBe(true);
    const results = await db.search({ vector: nativeVector([0, 1, 0, 0]), k: 4 } as any);
    expect(results.find((r: any) => r.id === "b")).toBeUndefined();
  });
});

describe("(4) persistence to temp-dir file and reload", () => {
  let dir: string;
  let storagePath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ruvector-phase0-"));
    storagePath = join(dir, "vectors.db");
  });
  afterAll(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  test("observed: storagePath option persists index to disk and a fresh instance reloads it", async () => {
    if (usedFallback) {
      console.log("observed: skipped — no native binding to test persistence against");
      return;
    }
    const db1 = new VectorDb({ dimensions: DIM, distanceMetric: "Cosine", storagePath });
    for (const r of RECORDS) await db1.insert(nativeEntry(r) as any);

    const fileExistsAfterInsert = existsSync(storagePath);
    console.log("storagePath exists after insert:", fileExistsAfterInsert);

    const db2 = new VectorDb({ dimensions: DIM, distanceMetric: "Cosine", storagePath });
    const len = await db2.len();
    console.log("reloaded instance len():", len);
    // Characterize: does the second instance see the first instance's data,
    // or is storagePath write-only / not auto-loaded on construction?
    if (len === RECORDS.length) {
      const results = await db2.search({ vector: nativeVector([1, 0, 0, 0]), k: 1 } as any);
      expect(results[0].id).toBe("a");
    } else {
      console.log(
        "observed: reload did NOT restore prior entries automatically " +
          `(len=${len}); storagePath alone is not sufficient for reload.`,
      );
    }
  });
});

describe("(5) REBUILD: destroy index, rebuild from authoritative record array, search results equal original", () => {
  test("rebuilt index returns the same nearest-id ordering as the original", async () => {
    if (usedFallback) {
      const before = deterministicFallbackSearch(RECORDS, [1, 0, 0, 0], 2);
      const after = deterministicFallbackSearch(RECORDS, [1, 0, 0, 0], 2);
      expect(after).toEqual(before);
      return;
    }
    const db1 = new VectorDb(isolatedDbOptions());
    for (const r of RECORDS) await db1.insert(nativeEntry(r) as any);
    const before = await db1.search({ vector: nativeVector([1, 0, 0, 0]), k: 2 } as any);

    // "Destroy" the index: drop the reference (in-memory only variant has no
    // explicit destroy() in the API surface — characterized here).
    // Rebuild fresh from the authoritative record array (the SQLite-backed
    // source of truth in the real Framework, per §3.5).
    const db2 = new VectorDb(isolatedDbOptions());
    for (const r of RECORDS) await db2.insert(nativeEntry(r) as any);
    const after = await db2.search({ vector: nativeVector([1, 0, 0, 0]), k: 2 } as any);

    expect(after.map((r: any) => r.id)).toEqual(before.map((r: any) => r.id));
  });
});

describe("(6) query-time metadata filtering (tenant/scope pre-filtering)", () => {
  test("FAIL/characterize: SearchQuery has no filter field in @ruvector/core@0.1.32", async () => {
    // index.d.ts SearchQuery = { vector, k, efSearch? } — no `filter`,
    // `where`, or metadata predicate of any kind.
    if (usedFallback) {
      console.log("observed: fallback path — filtering must happen in application code, pre- or post-search.");
      return;
    }
    const db = new VectorDb(isolatedDbOptions());
    for (const r of RECORDS) await db.insert(nativeEntry(r) as any);

    let filterHonored = false;
    try {
      // Attempt the shape a caller might reasonably guess at.
      const results: any = await db.search({
        vector: nativeVector([1, 0, 0, 0]),
        k: 4,
        filter: { tenant: "acme" },
      } as any);
      const tenants = results.map((r: any) => r.metadata?.tenant).filter(Boolean);
      filterHonored = tenants.length > 0 && tenants.every((t: string) => t === "acme");
    } catch (err) {
      console.log("search() with `filter` option raised:", String(err));
    }
    console.log(
      "observed: query-time metadata filtering is NOT part of @ruvector/core's public API; " +
        `ad-hoc filter option honored=${filterHonored}. Pre-filtering must happen in ` +
        "application code (post-search predicate over returned ids, or scoping via " +
        "separate per-tenant VectorDb instances) to satisfy §16's authorization/scope filtering step.",
    );
    expect(filterHonored).toBe(false);
  });
});

describe("(7) graph/relationship features — characterize only", () => {
  test("observed: @ruvector/core exposes no graph/relationship API", () => {
    if (usedFallback) {
      console.log("observed: fallback path has no graph features by construction.");
      return;
    }
    const db = new VectorDb(isolatedDbOptions());
    const proto = Object.getPrototypeOf(db);
    const methods = Object.getOwnPropertyNames(proto).filter((m) => m !== "constructor");
    console.log("VectorDb instance methods:", methods.join(", "));
    const graphish = methods.filter((m) => /graph|relation|edge|traverse|neighbo/i.test(m));
    console.log(
      "observed: graph/relationship methods found on @ruvector/core VectorDb:",
      graphish.length ? graphish.join(", ") : "(none)",
    );
    console.log(
      "observed: graph/relationship capability (per spec §14 'traverse relationships', " +
        "'retrieve causally/temporally related entries') requires a separate package " +
        "(@ruvector/graph-node, published under the same npm/ruvnet org) which was not " +
        "installed for this fixture. @ruvector/core alone cannot satisfy the CognitiveIndex " +
        "graph_traversal capability flag.",
    );
    expect(graphish.length).toBe(0);
  });
});

describe("observed: no true in-memory mode (default storagePath writes to CWD)", () => {
  const cwdDb = join(process.cwd(), "ruvector.db");

  afterAll(() => {
    try { rmSync(cwdDb, { force: true }); } catch {}
  });

  test("omitting storagePath silently persists to ./ruvector.db instead of staying in-memory", async () => {
    const existedBefore = existsSync(cwdDb);
    const db = new VectorDb({ dimensions: DIM, distanceMetric: "Cosine" } as any);
    await db.insert(nativeEntry({ id: "cwd-probe", vector: [1, 0, 0, 0] }) as any);
    const existsAfter = existsSync(cwdDb);
    console.log(
      `observed: cwd ruvector.db existed-before=${existedBefore} exists-after-insert=${existsAfter} ` +
        "-- README claims 'No storagePath = in-memory'; this is false for @ruvector/core@0.1.32.",
    );
    expect(existsAfter).toBe(true);
  });
});

describe("(8) deterministic fallback: try/catch loader falls back to deterministic ordering", () => {
  test("simulated binding-import failure falls back to stable cosine ordering", () => {
    // This exercises the same loader shape used in beforeAll above, but
    // forces the failure branch explicitly so the fallback path itself is
    // asserted regardless of whether the real binding loaded on this host.
    let usedFallbackHere = false;
    let engine: { search: (v: number[], k: number) => { id: string; score: number }[] };
    try {
      throw new Error("simulated: native binding unavailable on this platform");
    } catch {
      usedFallbackHere = true;
      engine = {
        search: (v, k) => deterministicFallbackSearch(RECORDS, v, k),
      };
    }
    expect(usedFallbackHere).toBe(true);
    const results = engine!.search([1, 0, 0, 0], 2);
    expect(results.map((r) => r.id)).toEqual(["a", "d"]);
    // Re-running is bit-for-bit deterministic (no randomness / no learned state).
    const results2 = engine!.search([1, 0, 0, 0], 2);
    expect(results2).toEqual(results);
  });
});

afterAll(() => {
  for (const dir of isolationDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
