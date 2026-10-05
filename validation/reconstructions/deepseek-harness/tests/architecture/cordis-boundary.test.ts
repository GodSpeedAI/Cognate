// Phase 8, criterion 5: Cordis stays behind Cognate interfaces. APP never imports
// @cognate/kernel-cordis or the underlying `cordis` engine directly. Mirrors the pattern in the
// repo's own tests/architecture/engine-boundary.test.ts ("only kernel-cordis imports cordis"), scoped
// to the reconstruction's own source and test trees.
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

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;

describe("Phase 8 §5: Cordis stays behind Cognate interfaces", () => {
  const files = [...walk(join(APP, "src")), ...walk(join(APP, "domain")), ...walk(join(APP, "test"))];

  test("scanned at least one APP source file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("no APP file imports @cognate/kernel-cordis or cordis directly", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      IMPORT_RE.lastIndex = 0;
      while ((m = IMPORT_RE.exec(text))) {
        const specifier = m[1] ?? m[2] ?? "";
        if (specifier === "@cognate/kernel-cordis" || specifier === "cordis" || specifier.startsWith("cordis/")) {
          offenders.push(`${file.replace(ROOT + "/", "")}: ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("APP's own package.json does not declare @cognate/kernel-cordis or cordis as a dependency", () => {
    const manifest = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"));
    const deps = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    expect(Object.keys(deps)).not.toContain("@cognate/kernel-cordis");
    expect(Object.keys(deps)).not.toContain("cordis");
  });
});
