// Phase 0 compatibility fixture: @ruvector/rvf EXACT 0.3.4 under Bun 1.4.0.
//
// Scope: this directory only. Run with `bun install && bun test` from
// `compatibility/phase0/rvf/` — it is intentionally NOT a workspace member
// (see ./package.json) so its exact-pinned dependency tree never touches the
// root lockfile.
//
// See ./API_NOTES.md for verified API signatures/format facts and
// `.agents/evidence/phase0-rvf.md` for the full per-behaviour ledger. Spec
// references: software-design-spec-cognate.-frameworkmd §6 (Cognitive
// container), §18 (Branching/RVF identity/Import safety), §31.4 (RVF
// failure), §37/Phase 0 (Architecture characterization).
//
// Per the task contract: failing behaviours stay failing. They are asserted
// against their OBSERVED outcome (marked `observed:`) rather than skipped or
// weakened to match the spec's aspiration.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RvfDatabase, RvfError, RvfErrorCode, resolveBackend } from "@ruvector/rvf";

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "cognate-rvf-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// (1) Load under Bun
// ---------------------------------------------------------------------------

describe("(1) load under Bun", () => {
  test("PASS: @ruvector/rvf imports and resolveBackend('auto'|'node') selects the native N-API backend", async () => {
    expect(typeof RvfDatabase).toBe("function");
    expect(resolveBackend("auto").constructor.name).toBe("NodeBackend");
    expect(resolveBackend("node").constructor.name).toBe("NodeBackend");
  });

  test("PASS: create/ingest/query round-trip succeeds through the native backend under Bun", async () => {
    const dir = tempDir();
    const db = await RvfDatabase.create(join(dir, "load.rvf"), { dimensions: 4 });
    await db.ingestBatch([{ id: "a", vector: new Float32Array([1, 2, 3, 4]) }]);
    const results = await db.query(new Float32Array([1, 2, 3, 4]), 1);
    expect(results).toEqual([{ id: "a", distance: 0 }]);
    await db.close();
  });

  test("observed: import still resolves @ruvector/rvf-solver even after its node_modules directory is removed", async () => {
    // @ruvector/rvf-solver is an OPTIONAL dependency of @ruvector/rvf, yet
    // dist/index.js does an unconditional `require("@ruvector/rvf-solver")`
    // at module load. Under npm/Node, an environment that skips optional
    // deps (`--omit=optional`, strict CI installs) would make the whole
    // package fail to `require` with MODULE_NOT_FOUND. Bun's module
    // resolver did NOT reproduce that failure in manual testing (it
    // resolved the package from its global install cache even after the
    // local node_modules entry was deleted) — this fixture records the
    // dependency shape as fragile without asserting Bun's cache-fallback
    // behavior, since relying on that fallback would not be portable to a
    // production install (`bun install --production` / registry mirrors
    // without the optional package cached).
    const pkg = await import("@ruvector/rvf/package.json");
    expect(pkg.default.optionalDependencies).toHaveProperty("@ruvector/rvf-solver");
    expect(pkg.default.dependencies).not.toHaveProperty("@ruvector/rvf-solver");
  });
});

// ---------------------------------------------------------------------------
// (2) Create a store, write vectors + metadata
// ---------------------------------------------------------------------------

describe("(2) create store, write vectors + metadata", () => {
  test("PASS: ingestBatch without metadata accepts vectors", async () => {
    const dir = tempDir();
    const db = await RvfDatabase.create(join(dir, "vectors.rvf"), { dimensions: 3 });
    const result = await db.ingestBatch([{ id: "p1", vector: new Float32Array([1, 0, 0]) }]);
    expect(result).toEqual({ accepted: 1, rejected: 0, epoch: 1 });
    await db.close();
  });

  test("FAIL (observed): per-vector metadata is rejected outright, not written", async () => {
    // dist/backend.js's rejectUnsupportedMetadata throws MetadataNotSupported
    // for ANY entry carrying a non-empty `metadata` object. There is no
    // partial/best-effort metadata path in 0.3.4 — this is a hard capability
    // gap against the "write vectors + metadata" fixture requirement.
    const dir = tempDir();
    const db = await RvfDatabase.create(join(dir, "meta.rvf"), { dimensions: 2 });
    let error: unknown;
    try {
      await db.ingestBatch([{ id: "m1", vector: new Float32Array([1, 1]), metadata: { tag: "x" } }]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RvfError);
    expect((error as RvfError).code).toBe(RvfErrorCode.MetadataNotSupported);
    await db.close();
  });
});

// ---------------------------------------------------------------------------
// (3) Export/snapshot to a file and import into a fresh handle (fidelity)
// ---------------------------------------------------------------------------

describe("(3) export/snapshot + import fidelity", () => {
  test("PASS: closing and reopening the same file path yields identical query results", async () => {
    // The node backend persists directly to a file path; `create()`/`open()`
    // ARE the export/import mechanism for this backend (see API_NOTES.md).
    const dir = tempDir();
    const path = join(dir, "snapshot.rvf");
    const original = await RvfDatabase.create(path, { dimensions: 2 });
    await original.ingestBatch([
      { id: "x", vector: new Float32Array([1, 1]) },
      { id: "y", vector: new Float32Array([2, 2]) },
    ]);
    const before = await original.query(new Float32Array([1, 1]), 2);
    await original.close();

    const reopened = await RvfDatabase.open(path);
    const after = await reopened.query(new Float32Array([1, 1]), 2);
    expect(after).toEqual(before);
    await reopened.close();
  });

  test("FAIL (observed): exportBytes()/openBytes() — the documented in-memory snapshot API — are not supported by the node backend", async () => {
    // database.d.ts documents exportBytes/openBytes as the WASM-only
    // in-memory snapshot mechanism. Calling exportBytes() on a node-backed
    // (Bun-native) store throws BackendNotFound with a message that
    // recommends installing... the backend that is already active. This is
    // the literal "export/snapshot to a file" primitive the fixture asked
    // for, and it does not exist for the backend Bun actually uses.
    const dir = tempDir();
    const db = await RvfDatabase.create(join(dir, "export.rvf"), { dimensions: 2 });
    await db.ingestBatch([{ id: "x", vector: new Float32Array([1, 1]) }]);
    let error: unknown;
    try {
      await db.exportBytes();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RvfError);
    expect((error as RvfError).code).toBe(RvfErrorCode.BackendNotFound);
    await db.close();
  });
});

// ---------------------------------------------------------------------------
// (4) Copy-on-write branch isolation
// ---------------------------------------------------------------------------

describe("(4) copy-on-write branch isolation", () => {
  test("PASS: writes to the branch are invisible in the parent and vice versa", async () => {
    const dir = tempDir();
    const parent = await RvfDatabase.create(join(dir, "parent.rvf"), { dimensions: 3 });
    await parent.ingestBatch([{ id: "p1", vector: new Float32Array([1, 0, 0]) }]);

    const child = await parent.branch(join(dir, "child.rvf"));
    await child.ingestBatch([{ id: "c1", vector: new Float32Array([0, 1, 0]) }]);

    // Child writes are invisible in the parent.
    const parentQuery = await parent.query(new Float32Array([0, 1, 0]), 5);
    expect(parentQuery.map((r) => r.id)).toEqual(["p1"]);

    // Further parent writes (after the branch point) are invisible in the
    // already-branched child.
    await parent.ingestBatch([{ id: "p2", vector: new Float32Array([0, 0, 1]) }]);
    const childQuery = await child.query(new Float32Array([0, 0, 1]), 5);
    expect(childQuery.map((r) => r.id).sort()).toEqual(["c1", "p1"]);
    expect(childQuery.map((r) => r.id)).not.toContain("p2");

    await child.close();
    await parent.close();
  });
});

// ---------------------------------------------------------------------------
// (5) Lineage / parent metadata recorded on branch
// ---------------------------------------------------------------------------

describe("(5) lineage/parent metadata on branch", () => {
  test("PASS: branch records parentId == parent fileId and increments lineageDepth", async () => {
    const dir = tempDir();
    const parent = await RvfDatabase.create(join(dir, "parent.rvf"), { dimensions: 2 });
    await parent.ingestBatch([{ id: "p1", vector: new Float32Array([1, 1]) }]);
    const parentFileId = await parent.fileId();
    expect(await parent.lineageDepth()).toBe(0);

    const child = await parent.branch(join(dir, "child.rvf"));
    expect(await child.parentId()).toBe(parentFileId);
    expect(await child.lineageDepth()).toBe(1);

    await child.close();
    await parent.close();
  });
});

// ---------------------------------------------------------------------------
// (6) Integrity check on corrupted/truncated import
// ---------------------------------------------------------------------------

describe("(6) integrity check on corrupted/truncated import", () => {
  test("PASS: opening an empty or near-empty file throws a typed ManifestNotFound error, no crash", async () => {
    const dir = tempDir();
    const path = join(dir, "empty.rvf");
    writeFileSync(path, Buffer.alloc(0));
    let error: unknown;
    try {
      await RvfDatabase.open(path);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RvfError);
    expect((error as RvfError).code).toBe(RvfErrorCode.ManifestNotFound);
    expect((error as RvfError).isFormatError).toBe(true);
  });

  test("FAIL (observed): truncating a well-formed file to half its length opens successfully with silently empty data instead of a typed error", async () => {
    // Spec §18.3: "Import SHALL verify integrity ... before exposing
    // entries." Observed: RvfDatabase.open() does NOT reject a truncated
    // file above a small size threshold. It opens, reports
    // totalVectors: 0, totalSegments: 0, and never throws — a silent data
    // loss rather than a typed integrity failure.
    const dir = tempDir();
    const goodPath = join(dir, "good.rvf");
    const db = await RvfDatabase.create(goodPath, { dimensions: 3 });
    await db.ingestBatch([{ id: "p1", vector: new Float32Array([1, 0, 0]) }]);
    await db.close();

    const good = readFileSync(goodPath);
    const truncPath = join(dir, "truncated.rvf");
    writeFileSync(truncPath, good.subarray(0, Math.floor(good.length / 2)));

    const reopened = await RvfDatabase.open(truncPath); // does not throw
    const status = await reopened.status();
    expect(status.totalVectors).toBe(0);
    expect(status.totalSegments).toBe(0);
    await reopened.close();
  });

  test("FAIL (observed): flipping a single byte anywhere in a well-formed file (including the magic header) is not detected — open succeeds and stale/incorrect data is served", async () => {
    // InvalidMagic (256), InvalidChecksum (258), and TruncatedSegment (260)
    // error codes exist in the SDK's RvfErrorCode enum, but a single-byte
    // corruption of the magic header, a middle byte, or a near-end byte did
    // not trigger any of them in manual testing: RvfDatabase.open()
    // succeeded and status()/query() returned data as if the file were
    // intact (id "p1" resolved from a numeric fallback label "1" once the
    // sidecar id-mapping file was not copied alongside the corrupted bytes,
    // which is a separate finding — see API_NOTES.md). This means the byte
    // format's checksums are not verified as part of the default open path.
    const dir = tempDir();
    const goodPath = join(dir, "good2.rvf");
    const db = await RvfDatabase.create(goodPath, { dimensions: 3 });
    await db.ingestBatch([{ id: "p1", vector: new Float32Array([1, 0, 0]) }]);
    await db.close();

    const good = readFileSync(goodPath);
    const flipped = Buffer.from(good);
    flipped[0] = flipped[0] ^ 0xff; // corrupt the magic byte
    const flippedPath = join(dir, "flipped.rvf");
    writeFileSync(flippedPath, flipped);

    const reopened = await RvfDatabase.open(flippedPath); // does not throw
    const status = await reopened.status();
    expect(status.totalVectors).toBe(1); // corruption silently ignored
    const results = await reopened.query(new Float32Array([1, 0, 0]), 1);
    expect(results).toHaveLength(1); // served data from a corrupted file
    await reopened.close();
  });
});

// ---------------------------------------------------------------------------
// (7) Compute-capable segments: existence and default-execution characterization
// ---------------------------------------------------------------------------

describe("(7) compute-capable segments (kernel/eBPF) do not execute on load", () => {
  test("observed: embedKernel/extractKernel exist and round-trip raw bytes; no boot/execute API exists in this SDK", async () => {
    // The RVF format supports KERNEL_SEG (0x0E) and EBPF_SEG (0x0F) payloads
    // (compute-capable segments per README). The 0.3.4 TypeScript SDK only
    // exposes embed*/extract* — there is no boot/run/execute call surface
    // at all in this package, so "no default execution" holds trivially for
    // this SDK: the image is round-tripped as opaque bytes, never invoked.
    // Whether the native Rust CLI (`rvf-kernel`, `rvf embed-kernel`) or a
    // hypervisor consuming a self-booting .rvf executes such a segment is
    // out of scope for this package and untested here (open question).
    const dir = tempDir();
    const path = join(dir, "kernel.rvf");
    const db = await RvfDatabase.create(path, { dimensions: 2 });
    await db.ingestBatch([{ id: "k1", vector: new Float32Array([1, 1]) }]);

    expect(await db.extractKernel()).toBeNull();

    const image = new Uint8Array([1, 2, 3, 4]);
    const segId = await db.embedKernel(0, 0, 0, image, 8080, "quiet");
    expect(typeof segId).toBe("number");

    const segments = await db.segments();
    expect(segments.some((s) => s.segType === "kernel")).toBe(true);
    await db.close();

    // Reopen fresh: extractKernel returns bytes back, unexecuted. Observed:
    // the returned image is NOT a clean round-trip of the embedded bytes —
    // it comes back with the `cmdline` argument's UTF-8 bytes appended
    // ("quiet" -> 113,117,105,101,116), so embedKernel/extractKernel do not
    // preserve the image byte-for-byte when a cmdline is supplied. This is
    // still consistent with "no execution": the extra bytes are literal
    // ASCII text, not evidence of anything being run.
    const reopened = await RvfDatabase.open(path);
    const kernel = await reopened.extractKernel();
    expect(kernel).not.toBeNull();
    const returned = Array.from(kernel!.image);
    expect(returned.slice(0, image.length)).toEqual(Array.from(image));
    const appended = Buffer.from(returned.slice(image.length)).toString("utf8");
    expect(appended).toBe("quiet");
    await reopened.close();
  });
});
