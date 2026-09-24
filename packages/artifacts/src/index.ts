import { randomUUID } from "node:crypto";
import { NotFoundError } from "@cognate/events";
import type { DurableStore, Json } from "@cognate/events";
import type { Principal, SemanticRef } from "@cognate/kernel-api";

export interface ArtifactAccess {
  readonly tenant: string;
  readonly scopeId: string;
  /** Principal ids allowed to read; empty means any principal of the tenant. */
  readonly readers: readonly string[];
}

export interface ArtifactRecord {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
  /** `sha256:<hex>` of the bytes. */
  readonly contentHash: string;
  readonly access: ArtifactAccess;
  readonly retention: { readonly class: string; readonly until: string | null };
  readonly semanticRef: SemanticRef | null;
  readonly runId: string | null;
  /** Multiple projections of one artifact (e.g. `text/markdown`, `application/json` table view). */
  readonly representations: readonly { readonly mediaType: string; readonly contentHash: string }[];
  readonly state: "available" | "tombstoned";
  readonly tombstone: { readonly reason: string; readonly actorId: string; readonly at: string } | null;
  readonly createdEventId: string;
}

export interface PutArtifact {
  readonly id?: string;
  readonly name: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly access: ArtifactAccess;
  readonly retention?: { readonly class: string; readonly until?: string };
  readonly semanticRef?: SemanticRef;
  readonly runId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly representations?: readonly { readonly mediaType: string; readonly bytes: Uint8Array }[];
  readonly metadata?: { readonly [key: string]: Json };
}

export type ReadResult =
  | { readonly kind: "ok"; readonly record: ArtifactRecord; readonly bytes: Uint8Array }
  | { readonly kind: "denied" }
  | { readonly kind: "not_found" }
  /** Deliberately removed under retention/privacy policy. */
  | { readonly kind: "tombstoned"; readonly record: ArtifactRecord }
  /** Record exists but bytes are gone without a tombstone: data loss, reported distinctly. */
  | { readonly kind: "lost"; readonly record: ArtifactRecord };

const COLLECTION = "artifacts";

function isAuthorized(record: ArtifactRecord, actor: Principal, tenant: string): boolean {
  if (record.access.tenant !== tenant) return false;
  if (record.access.readers.length > 0 && !record.access.readers.includes(actor.id)) return false;
  return true;
}

/**
 * Artifact service (spec §13.1). Bytes are written (content-addressed) before the record and its
 * `artifact.created` event commit, so an artifact is never claimed available before its bytes exist.
 */
export class ArtifactService {
  constructor(private readonly store: DurableStore) {}

  async put(input: PutArtifact): Promise<ArtifactRecord> {
    const id = input.id ?? randomUUID();
    const contentHash = await this.store.putBlob(input.bytes);
    const representations: { readonly mediaType: string; readonly contentHash: string }[] = [{ mediaType: input.mediaType, contentHash }];
    for (const rep of input.representations ?? []) {
      const hash = await this.store.putBlob(rep.bytes);
      representations.push({ mediaType: rep.mediaType, contentHash: hash });
    }

    const eventId = randomUUID();
    const now = new Date().toISOString();
    const retention = { class: input.retention?.class ?? "default", until: input.retention?.until ?? null };
    const record: ArtifactRecord = {
      id,
      name: input.name,
      mediaType: input.mediaType,
      size: input.bytes.byteLength,
      contentHash,
      access: input.access,
      retention,
      semanticRef: input.semanticRef ?? null,
      runId: input.runId ?? null,
      representations,
      state: "available",
      tombstone: null,
      createdEventId: eventId,
    };

    await this.store.commit({
      records: [{ collection: COLLECTION, id, expectedVersion: 0, value: record as unknown as { readonly [key: string]: Json } }],
      appends: [
        {
          streamId: `artifact-${id}`,
          expectedVersion: 0,
          events: [
            {
              eventId,
              eventType: "artifact.created",
              schemaVersion: 1,
              occurredAt: now,
              tenant: input.access.tenant,
              correlationId: input.correlationId,
              causationId: input.causationId ?? null,
              runId: input.runId ?? null,
              scopeId: input.access.scopeId,
              payload: {
                artifactId: id,
                name: input.name,
                mediaType: input.mediaType,
                size: record.size,
                contentHash,
                representations,
                access: input.access as unknown as Json,
                retention,
                semanticRef: (input.semanticRef ?? null) as unknown as Json,
                runId: input.runId ?? null,
                metadata: input.metadata ?? null,
              },
            },
          ],
        },
      ],
    });

    return record;
  }

  async get(id: string, actor: Principal, tenant: string, representation?: string): Promise<ReadResult> {
    const stored = await this.store.getRecord(COLLECTION, id);
    if (!stored) return { kind: "not_found" };
    const record = stored.value as unknown as ArtifactRecord;
    if (!isAuthorized(record, actor, tenant)) return { kind: "denied" };
    if (record.state === "tombstoned") return { kind: "tombstoned", record };

    const target = representation === undefined ? record.representations[0] : record.representations.find((r) => r.mediaType === representation);
    if (!target) return { kind: "not_found" };

    const bytes = await this.store.getBlob(target.contentHash);
    if (!bytes) return { kind: "lost", record };
    return { kind: "ok", record, bytes };
  }

  async list(filter: { readonly tenant: string; readonly runId?: string }, actor: Principal): Promise<ArtifactRecord[]> {
    const stored = await this.store.listRecords(COLLECTION);
    const result: ArtifactRecord[] = [];
    for (const item of stored) {
      const record = item.value as unknown as ArtifactRecord;
      if (!isAuthorized(record, actor, filter.tenant)) continue;
      if (filter.runId !== undefined && record.runId !== filter.runId) continue;
      result.push(record);
    }
    return result;
  }

  /** Tombstone the artifact and delete bytes no other artifact references. */
  async delete(id: string, reason: string, actor: Principal): Promise<ArtifactRecord> {
    const stored = await this.store.getRecord(COLLECTION, id);
    if (!stored) throw new NotFoundError(`artifact ${id} not found`);
    const current = stored.value as unknown as ArtifactRecord;
    const at = new Date().toISOString();
    const updated: ArtifactRecord = { ...current, state: "tombstoned", tombstone: { reason, actorId: actor.id, at } };

    const streamId = `artifact-${id}`;
    const expectedStreamVersion = await this.store.streamVersion(streamId);
    await this.store.commit({
      records: [{ collection: COLLECTION, id, expectedVersion: stored.version, value: updated as unknown as { readonly [key: string]: Json } }],
      appends: [
        {
          streamId,
          expectedVersion: expectedStreamVersion,
          events: [
            {
              eventType: "artifact.tombstoned",
              schemaVersion: 1,
              occurredAt: at,
              tenant: current.access.tenant,
              correlationId: randomUUID(),
              causationId: null,
              runId: current.runId,
              scopeId: current.access.scopeId,
              payload: { artifactId: id, reason, actorId: actor.id },
            },
          ],
        },
      ],
    });

    const hashes = new Set([current.contentHash, ...current.representations.map((r) => r.contentHash)]);
    const allRecords = await this.store.listRecords(COLLECTION);
    for (const hash of hashes) {
      const stillReferenced = allRecords.some((item) => {
        if (item.id === id) return false;
        const other = item.value as unknown as ArtifactRecord;
        if (other.state !== "available") return false;
        return other.contentHash === hash || other.representations.some((r) => r.contentHash === hash);
      });
      if (!stillReferenced) await this.store.deleteBlob(hash);
    }

    return updated;
  }
}
