// Phase 13 check 2: no import/require specifier or path in the reconstruction resolves into the
// pinned reference checkout. The reference location comes from reference-manifest.json
// (clonePath, currently .tmp/ref/copilotkit); both that absolute path and the literal
// ".tmp/ref/copilotkit" form are banned, and relative specifiers are resolved against their
// importing file so "../../../../.tmp/ref/..." cannot sneak through.
//
// Scope: the reconstruction's own code and suites (cognate/src, cognate/test, capture/, tests/).
// validation/reconstructions/copilot/reference/** is excluded BY DESIGN: it is the sanctioned
// harness that DRIVES the pinned checkout for black-box observation; the purity constraint
// governs the reconstruction built on top of Cognate, not the observation harness.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  APP_SRC,
  APP_TEST,
  CAPTURE_DIR,
  CODE_EXTS,
  TESTS_DIR,
  importSpecifiers,
  referenceCheckout,
  rel,
  walk,
} from "./helpers.ts";

const SCAN_DIRS = [APP_SRC, APP_TEST, CAPTURE_DIR, TESTS_DIR];

describe("Phase 13 §2: no import resolves into the pinned reference checkout", () => {
  const ref = referenceCheckout();
  const literalForm = ".tmp/ref/copilotkit";

  test("reference location is pinned by the reconstruction's own manifest", () => {
    expect(ref.source).toBe("reference-manifest.json clonePath");
    expect(ref.clonePath).toContain(literalForm);
  });

  for (const dir of SCAN_DIRS) {
    test(`no specifier or resolved path under ${rel(dir)} reaches ${literalForm}`, () => {
      const files = walk(dir, CODE_EXTS);
      expect(files.length).toBeGreaterThan(0);
      const offenders: string[] = [];
      for (const file of files) {
        for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
          if (specifier.includes(literalForm) || specifier.includes(ref.clonePath)) {
            offenders.push(`${rel(file)}: ${specifier}`);
            continue;
          }
          if (specifier.startsWith(".")) {
            const resolved = resolve(dirname(file), specifier);
            if (resolved === ref.clonePath || resolved.startsWith(ref.clonePath + "/")) {
              offenders.push(`${rel(file)}: ${specifier} -> ${resolved}`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
