// Phase 8, criterion 1 (spec .agents/prompts/deepseek-harness-reconstruction-test.md:743-771):
// no dependency on the reference package family anywhere a package manifest or the lockfile could
// carry one. This checks dependency *declarations* (keys/values in dependencies/devDependencies/
// peerDependencies/optionalDependencies, and lockfile entries that resolve a package by that name),
// not the reconstruction's own workspace package name — the APP's package.json is legitimately named
// "deepseek-harness-reconstruction" (it lives under validation/reconstructions/deepseek-harness/) and
// bun.lock echoes that name back for the workspace entry. That self-naming is not a *dependency on*
// the reference and would otherwise produce a false positive on every run.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..", "..", "..", "..");

// Matches an actual dependency specifier, e.g. "deepseek-harness", "@deepseek-ai/dsh-core", "dsh-cli".
// Deliberately does NOT match "deepseek-harness-reconstruction" (the APP's own workspace name) or the
// path segment "validation/reconstructions/deepseek-harness/...".
const FORBIDDEN_DEP_NAME = /^(deepseek-harness|@deepseek-ai\/.*|dsh-.*)$/;

function findPackageJsonFiles(): string[] {
  const found: string[] = [];
  const roots = [
    join(ROOT, "package.json"),
    ...listDirs(join(ROOT, "packages")).map((d) => join(d, "package.json")),
    ...listDirs(join(ROOT, "profiles")).map((d) => join(d, "package.json")),
    join(ROOT, "validation/reconstructions/deepseek-harness/cognate/package.json"),
  ];
  for (const p of roots) if (existsSync(p)) found.push(p);
  return found;
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dir, e.name));
}

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

describe("Phase 8 §1: no dependency on the reference package family", () => {
  const manifests = findPackageJsonFiles();

  test("at least one package.json was actually checked", () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  for (const manifestPath of manifests) {
    test(`${manifestPath.replace(ROOT + "/", "")} declares no deepseek-harness / @deepseek-ai/* / dsh-* dependency`, () => {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const offenders: string[] = [];
      for (const field of DEP_FIELDS) {
        const deps = manifest[field];
        if (!deps || typeof deps !== "object") continue;
        for (const name of Object.keys(deps)) {
          if (FORBIDDEN_DEP_NAME.test(name)) offenders.push(`${field}.${name}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  test("bun.lock declares no resolved package named deepseek-harness / @deepseek-ai/* / dsh-*", () => {
    const lockPath = join(ROOT, "bun.lock");
    expect(existsSync(lockPath)).toBe(true);
    const text = readFileSync(lockPath, "utf8");
    // bun.lock is JSONC (trailing commas), not strict JSON, so JSON.parse chokes on it — scan the
    // raw text for the top-level `"packages"` map's entries by pattern instead: each entry looks
    // like `"<key>": ["<resolved-name>@<version-or-spec>", ...]` on (or starting) its own line.
    const offenders: string[] = [];
    const entryRe = /"([^"]+)":\s*\[\s*"((?:@[^"/]+\/[^"@]+)|[^"@]+)@/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(text))) {
      const key = m[1]!;
      const resolvedName = m[2]!;
      if (FORBIDDEN_DEP_NAME.test(key) && key !== "deepseek-harness-reconstruction") offenders.push(key);
      if (resolvedName && FORBIDDEN_DEP_NAME.test(resolvedName) && resolvedName !== "deepseek-harness-reconstruction") {
        offenders.push(`${key} -> ${resolvedName}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
