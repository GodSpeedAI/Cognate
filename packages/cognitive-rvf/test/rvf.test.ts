// CG-RVF-001 (spec §18, §31.4, §32; DEBT-006): snapshots, branches, verified imports, attached/detached classification.
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { entry } from "@godspeedai/cognate-cognitive-api/conformance";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RvfDatabase, RvfError, RvfErrorCode } from "@ruvector/rvf";
import { createRvfIndex, importSnapshot, type RvfIndex, type SnapshotOptions } from "../src/index.ts";

const root = mkdtempSync(join(tmpdir(), "cognate-rvf-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const open: RvfIndex[] = [];
afterEach(async () => {
  for (const i of open.splice(0)) await i.close();
});
async function index(name: string) {
  const i = await createRvfIndex({ dimension: 4, path: join(root, `${name}-${crypto.randomUUID()}.rvf`) });
  open.push(i);
  return i;
}
const snap = (dir: string, overrides: Partial<SnapshotOptions> = {}): SnapshotOptions => ({ dir, name: "base", lineage: "app-1", indexedThrough: 10, storeHead: 10, onBehind: "fail", frameworkVersion: "0.0.0", ...overrides });
const limits = { lineage: "app-1", storeHead: 10, allowedTenants: ["tenant-a"], maxEntries: 1000, maxBytes: 50_000_000 };
const q = (i: RvfIndex, v: number[]) => i.similar({ vector: Float32Array.from(v), k: 3, tenant: "tenant-a" });

describe("RVF snapshots and branches (§18)", () => {
  test("declares snapshot and branch flags", async () => {
    const i = await index("flags");
    expect([...i.flags].sort()).toEqual(["branch", "snapshot", "vector_search"]);
  });

  test("a branch diverges without affecting its parent, and records lineage", async () => {
    const parent = await index("parent");
    await parent.upsert([entry("a", [1, 0, 0, 0])]);
    const child = await parent.branch(join(root, `child-${crypto.randomUUID()}.rvf`));
    open.push(child);
    await child.upsert([entry("b", [0, 1, 0, 0])]);
    await parent.upsert([entry("c", [0, 0, 1, 0])]);
    expect((await q(parent, [0, 1, 0, 0])).map((h) => h.id)).not.toContain("b");
    expect((await q(child, [0, 0, 1, 0])).map((h) => h.id)).not.toContain("c");
    expect((await q(child, [1, 0, 0, 0]))[0]!.id).toBe("a");
    const [pl, cl] = [await parent.lineage(), await child.lineage()];
    expect(cl.parentId).toBe(pl.fileId);
    expect(cl.depth).toBe(pl.depth + 1);
  });

  test("snapshot writes a manifest with identity fields, records it durably, and imports attached with identical results", async () => {
    const store = createMemoryStore();
    const i = await index("snap");
    await i.upsert([entry("a", [1, 0, 0, 0]), entry("b", [0, 1, 0, 0], { sourceType: "artifact", sourceRef: "artifact:b" })]);
    const dir = mkdtempSync(join(root, "s-"));
    const manifest = await i.snapshot(store, snap(dir, { semanticSourceVersion: "sha256:sea" }));
    expect(manifest).toMatchObject({ format: "cognate.rvf.v1", lineage: "app-1", checkpoint: { position: 10, partial: false }, semanticSourceVersion: "sha256:sea", parentSnapshotId: null, tenants: ["tenant-a"], entryCount: 2, frameworkVersion: "0.0.0" });
    expect(manifest.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect((await store.getRecord("rvf_snapshots", manifest.snapshotId))?.value).toMatchObject({ integrity: manifest.integrity });
    const imported = await importSnapshot(store, join(dir, "base.manifest.json"), limits);
    expect(imported.kind).toBe("attached");
    if (imported.kind === "rejected") throw new Error(imported.reason);
    open.push(imported.index);
    expect(await q(imported.index, [0, 1, 0, 0])).toEqual(await q(i, [0, 1, 0, 0]));
    expect(await imported.index.get("b")).toMatchObject({ sourceRef: "artifact:b", sourceType: "artifact" });
  });

  test("tampered, truncated, or manifest-less snapshots are rejected before anything is exposed", async () => {
    const store = createMemoryStore();
    const i = await index("tamper");
    await i.upsert([entry("a", [1, 0, 0, 0])]);
    const dir = mkdtempSync(join(root, "t-"));
    await i.snapshot(store, snap(dir));
    const rvf = join(dir, "base.rvf");
    const bytes = readFileSync(rvf);
    const middle = Math.floor(bytes.length / 2);
    bytes[middle] = bytes[middle]! ^ 0xff;
    writeFileSync(rvf, bytes);
    expect(await importSnapshot(store, join(dir, "base.manifest.json"), limits)).toMatchObject({ kind: "rejected", reason: expect.stringMatching(/integrity/) });
    writeFileSync(rvf, bytes.subarray(0, bytes.length / 2));
    expect((await importSnapshot(store, join(dir, "base.manifest.json"), limits)).kind).toBe("rejected");
    expect((await importSnapshot(store, join(dir, "missing.manifest.json"), limits)).kind).toBe("rejected");
  });

  test("foreign lineage or unknown snapshots import detached; tenant and size limits reject", async () => {
    const theirs = createMemoryStore();
    const ours = createMemoryStore();
    const i = await index("foreign");
    await i.upsert([entry("a", [1, 0, 0, 0])]);
    const dir = mkdtempSync(join(root, "f-"));
    await i.snapshot(theirs, snap(dir));
    const unknown = await importSnapshot(ours, join(dir, "base.manifest.json"), limits);
    expect(unknown).toMatchObject({ kind: "detached" });
    if (unknown.kind !== "rejected") open.push(unknown.index);
    const otherLineage = await importSnapshot(theirs, join(dir, "base.manifest.json"), { ...limits, lineage: "app-2" });
    expect(otherLineage.kind).toBe("detached");
    if (otherLineage.kind !== "rejected") open.push(otherLineage.index);
    const future = await importSnapshot(theirs, join(dir, "base.manifest.json"), { ...limits, storeHead: 3 });
    expect(future.kind).toBe("detached");
    if (future.kind !== "rejected") open.push(future.index);
    expect((await importSnapshot(theirs, join(dir, "base.manifest.json"), { ...limits, allowedTenants: ["tenant-z"] })).kind).toBe("rejected");
    expect((await importSnapshot(theirs, join(dir, "base.manifest.json"), { ...limits, maxEntries: 0 })).kind).toBe("rejected");
  });

  test("a lagging index fails or is labelled partial, never a complete mixed-time image", async () => {
    const store = createMemoryStore();
    const i = await index("lag");
    await i.upsert([entry("a", [1, 0, 0, 0])]);
    await expect(i.snapshot(store, snap(mkdtempSync(join(root, "l-")), { indexedThrough: 5, storeHead: 9 }))).rejects.toThrow();
    const partial = await i.snapshot(store, snap(mkdtempSync(join(root, "p-")), { indexedThrough: 5, storeHead: 9, onBehind: "partial" }));
    expect(partial.checkpoint).toEqual({ position: 5, partial: true });
  });

  test("a failed snapshot leaves the active index intact (§31.4)", async () => {
    const store = createMemoryStore();
    const i = await index("fail");
    await i.upsert([entry("a", [1, 0, 0, 0])]);
    await expect(i.snapshot(store, snap("/proc/definitely/not/writable"))).rejects.toThrow();
    expect((await q(i, [1, 0, 0, 0]))[0]!.id).toBe("a");
    expect(await store.listRecords("rvf_snapshots")).toEqual([]);
  });
});

describe("createRvfIndex FsyncFailed retry (DEBT-018)", () => {
  const fsyncFailed = () => new RvfError(RvfErrorCode.FsyncFailed, "injected fsync failure");

  test("retries FsyncFailed twice, then delegates to the real create and the index works", async () => {
    let calls = 0;
    const create: typeof RvfDatabase.create = async (p, o, b) => {
      calls++;
      if (calls <= 2) throw fsyncFailed();
      return RvfDatabase.create(p, o, b);
    };
    const i = await createRvfIndex({ dimension: 4, path: join(root, `retry-${crypto.randomUUID()}.rvf`), create });
    open.push(i);
    expect(calls).toBe(3);
    await i.upsert([entry("a", [1, 0, 0, 0])]);
    expect((await q(i, [1, 0, 0, 0]))[0]!.id).toBe("a");
  });

  test("a non-FsyncFailed error is not retried", async () => {
    let calls = 0;
    const create: typeof RvfDatabase.create = async () => {
      calls++;
      throw new RvfError(RvfErrorCode.DiskFull, "injected disk full");
    };
    await expect(createRvfIndex({ dimension: 4, path: join(root, `nonfsync-${crypto.randomUUID()}.rvf`), create })).rejects.toMatchObject({ code: RvfErrorCode.DiskFull });
    expect(calls).toBe(1);
  });

  test("a persistent FsyncFailed gives up after 5 attempts and rethrows", async () => {
    let calls = 0;
    const create: typeof RvfDatabase.create = async () => {
      calls++;
      throw fsyncFailed();
    };
    await expect(createRvfIndex({ dimension: 4, path: join(root, `persist-${crypto.randomUUID()}.rvf`), create })).rejects.toMatchObject({ code: RvfErrorCode.FsyncFailed });
    expect(calls).toBe(5);
  });
});
