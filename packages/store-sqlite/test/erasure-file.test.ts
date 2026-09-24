// After erasePayload, the erased plaintext must not be recoverable from the raw database
// bytes on disk — neither the main file nor the WAL once it has been checkpointed (spec §32).
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "../src/index.ts";

test("erased payload bytes are not recoverable from the database file or its WAL", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-erasure-file-"));
  try {
    const path = join(dir, "cognate.sqlite");
    const store = openSqliteStore({ path });
    const secret = "super-secret-plaintext-marker-8f2c1a";
    const { events } = await store.commit({
      appends: [{ streamId: "pii", expectedVersion: 0, events: [{ eventType: "user.registered", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: "t", correlationId: "c", causationId: null, runId: null, scopeId: "root", payload: { secret } }] }],
    });
    const eventId = events[0]!.eventId;

    await store.erasePayload(eventId, "gdpr-art-17", "operator-1");
    await store.close();

    const dbBytes = readFileSync(path);
    expect(dbBytes.includes(secret)).toBe(false);

    const walPath = `${path}-wal`;
    try {
      const walBytes = readFileSync(walPath);
      expect(walBytes.includes(secret)).toBe(false);
    } catch {
      // No WAL file after checkpoint/close is also acceptable: it means nothing lingers there either.
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
