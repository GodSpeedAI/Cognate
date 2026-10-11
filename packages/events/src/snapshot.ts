// DEBT-021 support: a consistent rows+checkpoint read for stores without a native snapshot read.
// Reading the checkpoint FIRST and the rows second guarantees the reported checkpoint is never ahead
// of the returned rows — the rows may be newer (a fold landed between the reads), never older.
import type { DurableStore, ProjectionSnapshot } from "./types.ts";

export async function readProjectionSnapshotFallback(store: DurableStore, name: string): Promise<ProjectionSnapshot> {
  const checkpoint = await store.getProjection(name);
  const rows = await store.listProjection(name);
  return { checkpoint, rows };
}

/** The store's native consistent snapshot when available, else the ordered fallback. */
export function readProjectionSnapshot(store: DurableStore, name: string): Promise<ProjectionSnapshot> {
  return store.readProjectionSnapshot ? store.readProjectionSnapshot(name) : readProjectionSnapshotFallback(store, name);
}
