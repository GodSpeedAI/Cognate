// Phase 13 check 3: no copied CopilotKit source/CSS. For every source file in the
// reconstruction (cognate/ + capture/), compute normalized-line 8-line shingles and assert none
// matches a shingle from the reference checkout's packages/**, examples/** and showcase/**
// (ts/tsx/css). Also asserts no reconstruction asset is byte-identical to any reference asset.
// Technique follows the deepseek-harness no-copied-source precedent: 8 consecutive
// non-trivial normalized lines (>=20 chars, boilerplate excluded) are a strong copy signal that
// generic structure, imports, and short identifiers never trip.
// If the reference checkout is absent, this test SKIPS with a clear FAILED-GATE message rather
// than passing silently — check 8 (reference-removed) covers the reference-absent scenario on
// its own terms; this test needs the reference present to do its job.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { APP, CAPTURE_DIR, referenceCheckout, rel, walk } from "./helpers.ts";

const SOURCE_EXTS = [".ts", ".tsx", ".css", ".mjs", ".json", ".svg"];
const ASSET_EXTS = [".png", ".svg", ".woff", ".woff2", ".ico", ".jpg"];

const BOILERPLATE = new Set([
  '"use strict";',
  "export {};",
  'import { describe, expect, test } from "bun:test";',
]);

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

describe("Phase 13 §3: no copied reference source", () => {
  const ref = referenceCheckout();

  if (!ref.present) {
    test.skip(
      `FAILED-GATE: reference checkout ${ref.clonePath} is absent — this test cannot verify absence of copied source without it. Check 8 (reference-removed) separately covers the reference-absent scenario.`,
      () => {},
    );
    return;
  }

  test("reference checkout is actually present for this comparison", () => {
    expect(ref.present).toBe(true);
  });

  test(
    "no 8-line normalized shingle in any reconstruction source file matches a shingle from reference packages/**, examples/** or showcase/**",
    () => {
      // The reference checkout is large; hashing every shingle can outlive bun:test's 5s default.
      const refDirs = [join(ref.clonePath, "packages"), join(ref.clonePath, "examples"), join(ref.clonePath, "showcase")].filter(existsSync);
      const refFiles = refDirs.flatMap((d) => walk(d, [".ts", ".tsx", ".css"]));
      expect(refFiles.length).toBeGreaterThan(0);

      const refShingles = new Set<string>();
      for (const file of refFiles) {
        for (const shingle of shinglesOf(readFileSync(file, "utf8"))) refShingles.add(shingle);
      }

      const appFiles = [...walk(APP, SOURCE_EXTS), ...walk(CAPTURE_DIR, SOURCE_EXTS)];
      const offenders: { file: string; shingle: string }[] = [];
      for (const file of appFiles) {
        for (const shingle of shinglesOf(readFileSync(file, "utf8"))) {
          if (refShingles.has(shingle)) {
            offenders.push({ file: rel(file), shingle: shingle.slice(0, 120) });
            break; // one hit per file is enough evidence; keep the report short
          }
        }
      }
      expect(offenders).toEqual([]);
    },
    120_000,
  );

  test("no reconstruction asset is byte-identical to any reference asset", () => {
    const refDirs = [join(ref.clonePath, "packages"), join(ref.clonePath, "examples"), join(ref.clonePath, "showcase")].filter(existsSync);
    const refAssets = refDirs.flatMap((d) => walk(d, ASSET_EXTS));
    const refHashes = new Map<string, string>();
    for (const file of refAssets) refHashes.set(hashFile(file), file);

    const appAssets = [...walk(APP, ASSET_EXTS), ...walk(CAPTURE_DIR, ASSET_EXTS)];
    const offenders: { app: string; ref: string }[] = [];
    for (const file of appAssets) {
      const match = refHashes.get(hashFile(file));
      if (match) offenders.push({ app: rel(file), ref: rel(match) });
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});
