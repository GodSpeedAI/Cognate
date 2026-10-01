// Phase 13 check 8: SQLite remains authoritative. The reconstruction server must open its
// runtime home on a SQLite-backed store: createRuntime from @cognate/runtime-bun accepts a
// SQLite file path, ":memory:", or an explicit DurableStore object ({ store }) — this pins the
// server to the file-backed form (a .sqlite path derived from its home directory) and forbids
// memory-store-as-authority wiring (":memory:", a memory DurableStore object, or a store-memory
// import).
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

describe("Phase 13 §8: SQLite remains authoritative", () => {
  const serverText = readFileSync(SERVER, "utf8");

  test("server wires createRuntime from @cognate/runtime-bun", () => {
    expect(serverText).toMatch(/import\s+\{[^}]*createRuntime[^}]*\}\s+from\s+"@cognate\/runtime-bun"/);
  });

  test("createRuntime receives a store that is a SQLite file path, not :memory: and not an injected memory store", () => {
    const args = callArguments(serverText, "createRuntime");
    const storeMatch = /store:\s*([^,\n}]+)/.exec(args);
    expect(storeMatch).not.toBeNull();
    const storeValue = storeMatch![1]!.trim();
    // The file-backed form: an identifier that resolves to join(home, "<name>.sqlite").
    expect(storeValue).toMatch(/^[A-Za-z_$][\w$.]*$/); // a plain identifier, not an object literal
    expect(storeValue).not.toBe("undefined");
    const literalArgs = JSON.stringify(args);
    expect(literalArgs).not.toContain(":memory:");
    expect(args).not.toMatch(/(?:new\s+\w*[Mm]emory\w*|createMemoryStore|MemoryDurableStore)\s*\(/);
  });

  test("the store path is derived from the runtime home as a .sqlite file", () => {
    expect(serverText).toMatch(/join\(\s*home\s*,\s*["'][^"']*\.sqlite["']\s*\)/);
  });

  test("server imports no memory store package", () => {
    expect(serverText).not.toMatch(/@cognate\/store-memory/);
  });

  test("framework-side: runtime-bun ships the SQLite store (authority lives in SQLite, not cognition)", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "packages/runtime-bun/package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["@cognate/store-sqlite"]).toBeDefined();
    expect(manifest.dependencies?.["@cognate/store-memory"]).toBeDefined(); // both exist; §8 pins which the app uses
  });
});
