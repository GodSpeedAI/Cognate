// CG-ART-001: artifacts have authoritative records, content-addressed bytes, access policy, and tombstones (spec §13.1).
import { afterEach, describe, expect, test } from "bun:test";
import type { Principal } from "@cognate/kernel-api";
import { storeCases } from "../../../tests/support/stores.ts";
import { ArtifactService, type PutArtifact } from "../src/index.ts";

const alice: Principal = { id: "alice", kind: "user" };
const bob: Principal = { id: "bob", kind: "user" };
const bytes = (text: string) => new TextEncoder().encode(text);
const report = (overrides: Partial<PutArtifact> = {}): PutArtifact => ({ name: "refund-report.md", mediaType: "text/markdown", bytes: bytes("# Refund\napproved"), access: { tenant: "tenant-a", scopeId: "root", readers: ["alice"] }, runId: "run-1", correlationId: "corr-1", ...overrides });

for (const storeCase of storeCases) {
  describe(`artifacts on ${storeCase.name}`, () => {
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup();
    });
    const open = async () => {
      const handle = await storeCase.open();
      cleanups.push(handle.dispose);
      return { svc: new ArtifactService(handle.store), store: handle.store };
    };

    test("put records hash, media type, size, policy, retention, representations, and an event", async () => {
      const { svc, store } = await open();
      const record = await svc.put(report({ retention: { class: "case-7y", until: "2033-01-01T00:00:00Z" }, representations: [{ mediaType: "application/json", bytes: bytes('{"approved":true}') }] }));
      expect(record).toMatchObject({ name: "refund-report.md", mediaType: "text/markdown", size: 17, state: "available", tombstone: null, retention: { class: "case-7y", until: "2033-01-01T00:00:00Z" }, runId: "run-1" });
      expect(record.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(record.representations.map((r) => r.mediaType)).toEqual(["text/markdown", "application/json"]);
      const [created] = await store.readStream(`artifact-${record.id}`);
      expect(created).toMatchObject({ eventType: "artifact.created", eventId: record.createdEventId, payload: { artifactId: record.id, contentHash: record.contentHash } });
      expect(JSON.stringify(created!.payload)).not.toContain("approved");
    });

    test("reads are authorized by tenant and readers and can select a representation", async () => {
      const { svc } = await open();
      const record = await svc.put(report({ representations: [{ mediaType: "application/json", bytes: bytes("{}") }] }));
      const ok = await svc.get(record.id, alice, "tenant-a");
      expect(ok.kind).toBe("ok");
      if (ok.kind === "ok") expect(new TextDecoder().decode(ok.bytes)).toBe("# Refund\napproved");
      const json = await svc.get(record.id, alice, "tenant-a", "application/json");
      if (json.kind === "ok") expect(new TextDecoder().decode(json.bytes)).toBe("{}");
      expect(await svc.get(record.id, bob, "tenant-a")).toEqual({ kind: "denied" });
      expect(await svc.get(record.id, alice, "tenant-b")).toEqual({ kind: "denied" });
      expect(await svc.get("nope", alice, "tenant-a")).toEqual({ kind: "not_found" });
      expect((await svc.list({ tenant: "tenant-a" }, bob)).map((r) => r.id)).toEqual([]);
      expect((await svc.list({ tenant: "tenant-a", runId: "run-1" }, alice)).map((r) => r.id)).toEqual([record.id]);
    });

    test("deletion leaves a tombstone distinguishable from loss", async () => {
      const { svc, store } = await open();
      const kept = await svc.put(report({ name: "a" }));
      const removed = await svc.put(report({ name: "b", bytes: bytes("secret personal data") }));
      await svc.delete(removed.id, "privacy-request", alice);
      const tomb = await svc.get(removed.id, alice, "tenant-a");
      expect(tomb).toMatchObject({ kind: "tombstoned", record: { state: "tombstoned", tombstone: { reason: "privacy-request", actorId: "alice" } } });
      expect(await store.getBlob(removed.contentHash)).toBeUndefined();
      await store.deleteBlob(kept.contentHash);
      expect(await svc.get(kept.id, alice, "tenant-a")).toMatchObject({ kind: "lost" });
      expect((await store.readStream(`artifact-${removed.id}`)).map((e) => e.eventType)).toEqual(["artifact.created", "artifact.tombstoned"]);
    });

    test("identical bytes are stored once and survive deletion of one referencing artifact", async () => {
      const { svc, store } = await open();
      const a = await svc.put(report({ name: "a" }));
      const b = await svc.put(report({ name: "b" }));
      expect(a.contentHash).toBe(b.contentHash);
      await svc.delete(a.id, "cleanup", alice);
      expect(await store.getBlob(b.contentHash)).toBeDefined();
      expect((await svc.get(b.id, alice, "tenant-a")).kind).toBe("ok");
    });
  });
}
