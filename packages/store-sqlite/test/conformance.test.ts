import { storeConformance } from "@godspeedai/cognate-events/conformance";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "../src/index.ts";

storeConformance("store-sqlite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-store-"));
  const path = join(dir, "cognate.sqlite");
  let store = openSqliteStore({ path });
  return {
    get store() {
      return store;
    },
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
}, { persistent: true });
