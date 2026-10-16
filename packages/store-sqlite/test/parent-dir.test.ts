// openSqliteStore creates the parent directory of its database path, so `data/app.db` opens on a fresh checkout
// instead of failing with SQLITE_CANTOPEN.
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "../src/index.ts";

test("openSqliteStore creates a missing parent directory for its database file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-parent-dir-"));
  try {
    const path = join(dir, "data", "nested", "app.db");
    expect(existsSync(join(dir, "data"))).toBe(false);
    const store = openSqliteStore({ path });
    await store.close();
    expect(existsSync(path)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("openSqliteStore accepts :memory: without touching the filesystem", async () => {
  const store = openSqliteStore({ path: ":memory:" });
  await store.close();
});
