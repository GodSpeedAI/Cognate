import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});

test("Bun SQLite commits, rejects stale append, rolls back failure, and survives reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-sqlite-"));
  paths.push(directory);
  const file = join(directory, "events.sqlite");
  const db = new Database(file, { create: true });
  db.exec("CREATE TABLE events (stream TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (stream, revision))");

  const append = db.transaction((expected: number, payload: string, abort = false) => {
    const row = db.query("SELECT COALESCE(MAX(revision), 0) AS revision FROM events WHERE stream = ?").get("run-1") as { revision: number };
    if (row.revision !== expected) throw new Error("stale revision");
    db.query("INSERT INTO events (stream, revision, payload) VALUES (?, ?, ?)").run("run-1", expected + 1, payload);
    if (abort) throw new Error("simulated failure");
  });

  append(0, "committed");
  expect(() => append(0, "stale")).toThrow("stale revision");
  expect(() => append(1, "rolled back", true)).toThrow("simulated failure");
  db.close();

  const reopened = new Database(file);
  try {
    expect(reopened.query("SELECT revision, payload FROM events ORDER BY revision").all()).toEqual([
      { revision: 1, payload: "committed" },
    ]);
  } finally {
    reopened.close();
  }
});
