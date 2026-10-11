// Phase 13 check 8 (as revised for the PostgreSQL migration): PostgreSQL is the authoritative
// store. The reconstruction server wires createRuntime with the storeConfigFor helper — an explicit
// `postgres` connection (COGNATE_POSTGRES_URL) or the pg0-managed local instance — with the schema
// derived from its data directory. Memory-store-as-authority wiring stays forbidden, and the
// framework-side manifest keeps both store packages (the SQLite store remains supported for
// single-process apps).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { APP_SRC, ROOT, rel } from "./helpers.ts";

const SERVER = join(APP_SRC, "server.ts");

/** Extract the balanced-paren argument text of a call like `createRuntime({...})`. */
function callArguments(text: string, callee: string): string {
  const start = text.indexOf(`${callee}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = start + callee.length; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return text.slice(start + callee.length + 1, i);
    }
  }
  throw new Error(`unbalanced parentheses in ${callee}(...) call`);
}

describe("Phase 13 §8: PostgreSQL is the authoritative store", () => {
  const serverText = readFileSync(SERVER, "utf8");

  test("server wires createRuntime from @godspeedai/cognate-runtime-bun", () => {
    expect(serverText).toMatch(/import\s+\{[^}]*createRuntime[^}]*\}\s+from\s+"@godspeedai\/cognate-runtime-bun"/);
  });

  test("createRuntime receives the storeConfigFor(home) schema config, not :memory: and not an injected memory store", () => {
    const args = callArguments(serverText, "createRuntime");
    // The server wires `store,` (shorthand for the storeConfigFor result), never a bare path or
    // an inline memory store.
    expect(args).toMatch(/\bstore\s*,|store:\s*storeConfigFor/);
    const literalArgs = JSON.stringify(args);
    expect(literalArgs).not.toContain(":memory:");
    expect(args).not.toMatch(/(?:new\s+\w*[Mm]emory\w*|createMemoryStore|MemoryDurableStore)\s*\(/);
  });

  test("the store schema is derived from the runtime home via storeConfigFor", () => {
    expect(serverText).toMatch(/storeConfigFor\(\s*home\s*,\s*["']copilot["']\s*\)/);
    expect(serverText).toMatch(/from\s+"\.\/store\.ts"/);
  });

  test("server imports no memory store package", () => {
    expect(serverText).not.toMatch(/@godspeedai\/cognate-store-memory/);
  });

  test("framework-side: runtime-bun ships the SQLite store (authority lives in SQLite, not cognition)", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "packages/runtime-bun/package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["@godspeedai/cognate-store-sqlite"]).toBeDefined();
    expect(manifest.dependencies?.["@godspeedai/cognate-store-memory"]).toBeDefined(); // both exist; §8 pins which the app uses
  });
});
