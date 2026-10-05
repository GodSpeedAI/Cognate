// Phase 8, criterion 9: RuVector-rebuild criterion. APP uses no @cognate/cognitive-* package, so the
// "RuVector can be deleted and rebuilt without changing deterministic behavior" criterion is
// vacuously satisfied — there is no cognitive index in this reconstruction to rebuild. This test
// asserts the premise (no cognition dependency/usage) rather than adding cognition just to exercise
// the rebuild path. See architecture-evidence.md for the plain statement of vacuous satisfaction.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..", "..", "..", "..");
const APP = join(ROOT, "validation/reconstructions/deepseek-harness/cognate");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === ".git" || name === ".generated") continue;
      const full = join(current, name);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else if ([".ts", ".tsx"].includes(extname(name))) out.push(full);
    }
  }
  return out;
}

describe("Phase 8 §9: RuVector-rebuild criterion is vacuous (no cognition used)", () => {
  test("APP's package.json declares no @cognate/cognitive-* dependency", () => {
    const manifest = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"));
    const deps = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    const cognitionDeps = Object.keys(deps).filter((k) => k.startsWith("@cognate/cognitive-"));
    expect(cognitionDeps).toEqual([]);
  });

  test("no APP source or test file imports @cognate/cognitive-*", () => {
    const files = [...walk(join(APP, "src")), ...walk(join(APP, "domain")), ...walk(join(APP, "test"))];
    const offenders: string[] = [];
    const re = /["']@cognate\/cognitive-[\w-]*["']/g;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (re.test(text)) offenders.push(file.replace(ROOT + "/", ""));
      re.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  });

  test("APP's createRuntime call passes no `cognition` option (grep server.ts)", () => {
    const serverText = readFileSync(join(APP, "src/server.ts"), "utf8");
    // A `cognition:` key inside the createRuntime({...}) options object would opt into the cognitive
    // index; its absence means rebuildCognition() is a no-op and there is nothing to delete/rebuild.
    expect(serverText).not.toMatch(/\bcognition\s*:/);
  });
});
