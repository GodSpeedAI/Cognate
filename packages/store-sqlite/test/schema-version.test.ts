// Fail-closed schema version check: a store recording a schema version newer than this build's
// highest migration must be refused before anything is applied or written.
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "../src/index.ts";
import { MIGRATIONS } from "../src/schema.ts";

const KNOWN = Math.max(...MIGRATIONS.map((m) => m.version));

function versionRows(path: string): { version: number; applied_at: string }[] {
  const db = new Database(path, { readonly: true });
  try {
    return db.query("SELECT version, applied_at FROM schema_versions ORDER BY version").all() as { version: number; applied_at: string }[];
  } finally {
    db.close();
  }
}

test("a store recording a newer schema version is refused on open", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-schema-version-"));
  try {
    const path = join(dir, "cognate.sqlite");
    (await openSqliteStore({ path })).close();

    const db = new Database(path);
    db.query("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)").run(KNOWN + 1, new Date().toISOString());
    db.close();

    const before = versionRows(path);
    expect(() => openSqliteStore({ path })).toThrow(/newer than this build supports/);
    expect(versionRows(path)).toEqual(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a refused open does not change schema_versions or add any rows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-schema-version-"));
  try {
    const path = join(dir, "cognate.sqlite");
    (await openSqliteStore({ path })).close();

    const db = new Database(path);
    db.query("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)").run(KNOWN + 3, new Date().toISOString());
    db.close();

    const countBefore = versionRows(path).length;
    expect(() => openSqliteStore({ path })).toThrow(/newer than this build supports/);
    const after = versionRows(path);
    expect(after).toHaveLength(countBefore);
    expect(after.map((r) => r.version)).toEqual([...MIGRATIONS.map((m) => m.version), KNOWN + 3]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a store at the current maximum schema version reopens normally", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cognate-schema-version-"));
  try {
    const path = join(dir, "cognate.sqlite");
    (await openSqliteStore({ path })).close();
    const reopened = openSqliteStore({ path });
    await reopened.close();
    expect(versionRows(path).map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
