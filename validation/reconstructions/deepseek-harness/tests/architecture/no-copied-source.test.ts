// Phase 8, criterion 3: no copied reference source. For every source file in APP, compute
// normalized-line 8-line shingles and assert none matches a shingle from the reference tree's
// packages/**/src and apps/** (ts/tsx/css files). Also asserts no APP asset is byte-identical to any
// reference asset. If the reference checkout is absent, this test SKIPS with a clear FAILED-GATE
// message rather than passing silently — criterion 8 (reference-removed.sh) covers the
// reference-absent scenario on its own terms; this test needs the reference present to do its job.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, extname } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..", "..", "..", "..");
const APP = join(ROOT, "validation/reconstructions/deepseek-harness/cognate");
const REF = join(ROOT, ".tmp/ref/deepseek-harness");

const SOURCE_EXTS = [".ts", ".tsx", ".css", ".json", ".svg"];
const ASSET_EXTS = [".png", ".svg", ".woff", ".woff2", ".ico"];
const EXCLUDE_DIR_NAMES = new Set(["node_modules", ".git", ".generated", "screenshots", "observations"]);

function walk(dir: string, filter: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const name of readdirSync(current)) {
      if (EXCLUDE_DIR_NAMES.has(name)) continue;
      const full = join(current, name);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else if (filter(name)) out.push(full);
    }
  }
  return out;
}

const BOILERPLATE = new Set([
  '"use strict";',
  "import { describe, expect, test } from \"bun:test\";",
  "export {};",
]);

/** Normalize a line: collapse whitespace, trim. */
function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

/** 8-consecutive-non-trivial-line shingles, ignoring short (<20 char) and boilerplate lines. */
function shinglesOf(text: string): Set<string> {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length >= 20 && !BOILERPLATE.has(l));
  const shingles = new Set<string>();
  const WINDOW = 8;
  for (let i = 0; i + WINDOW <= lines.length; i++) {
    shingles.add(lines.slice(i, i + WINDOW).join("\n"));
  }
  return shingles;
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Phase 8 §3: no copied reference source", () => {
  const referencePresent = existsSync(REF);

  if (!referencePresent) {
    test.skip("FAILED-GATE: reference checkout .tmp/ref/deepseek-harness is absent — this test cannot verify absence of copied source without it. Criterion 8 (reference-removed.sh) separately covers the reference-absent scenario.", () => {});
    return;
  }

  test("reference checkout is actually present for this comparison", () => {
    expect(existsSync(REF)).toBe(true);
  });

  test("no 8-line normalized shingle in any APP source file matches a shingle from reference packages/**/src or apps/**", () => {
    // The reference checkout has thousands of files; hashing every 8-line shingle across it can
    // take longer than bun:test's default 5s timeout.
    const refDirs = [join(REF, "packages"), join(REF, "apps")].filter(existsSync);
    const refFiles = refDirs.flatMap((d) => walk(d, (name) => [".ts", ".tsx", ".css"].includes(extname(name))));
    expect(refFiles.length).toBeGreaterThan(0);

    const refShingles = new Set<string>();
    for (const file of refFiles) {
      for (const shingle of shinglesOf(readFileSync(file, "utf8"))) refShingles.add(shingle);
    }

    const appFiles = walk(APP, (name) => SOURCE_EXTS.includes(extname(name)));
    const offenders: { file: string; shingle: string }[] = [];
    for (const file of appFiles) {
      const text = readFileSync(file, "utf8");
      for (const shingle of shinglesOf(text)) {
        if (refShingles.has(shingle)) {
          offenders.push({ file: file.replace(ROOT + "/", ""), shingle: shingle.slice(0, 120) });
          break; // one hit per file is enough evidence; keep the report short
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 60_000);

  test("no APP asset is byte-identical to any reference asset", () => {
    const refDirs = [join(REF, "packages"), join(REF, "apps")].filter(existsSync);
    const refAssets = refDirs.flatMap((d) => walk(d, (name) => ASSET_EXTS.includes(extname(name).toLowerCase())));
    const refHashes = new Map<string, string>();
    for (const file of refAssets) refHashes.set(hashFile(file), file);

    const appAssets = walk(APP, (name) => ASSET_EXTS.includes(extname(name).toLowerCase()));
    const offenders: { app: string; ref: string }[] = [];
    for (const file of appAssets) {
      const hash = hashFile(file);
      const match = refHashes.get(hash);
      if (match) offenders.push({ app: file.replace(ROOT + "/", ""), ref: match.replace(ROOT + "/", "") });
    }
    expect(offenders).toEqual([]);
  });
});
