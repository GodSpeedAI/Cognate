// Runs a test body against every DurableStore implementation (memory and SQLite on a temp file).
import type { DurableStore } from "@godspeedai/events";
import { createMemoryStore } from "@godspeedai/store-memory";
import { openSqliteStore } from "@godspeedai/store-sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface StoreCase {
  readonly name: string;
  open(): Promise<{ store: DurableStore; reopen: () => Promise<DurableStore>; dispose: () => Promise<void> }>;
}

export const storeCases: readonly StoreCase[] = [
  {
    name: "memory",
    async open() {
      const store = createMemoryStore();
      return { store, reopen: async () => store, dispose: () => store.close() };
    },
  },
  {
    name: "sqlite",
    async open() {
      const dir = mkdtempSync(join(tmpdir(), "cognate-case-"));
      const path = join(dir, "cognate.sqlite");
      let store = openSqliteStore({ path });
      return {
        store,
        async reopen() {
          await store.close();
          store = openSqliteStore({ path });
          return store;
        },
        async dispose() {
          await store.close();
          rmSync(dir, { recursive: true, force: true });
        },
      };
    },
  },
];
