// Phase 13 check 10: DomainForge and RealityTrace required no reconstruction-specific
// modification. Evidence is git, executed from the repo root:
//   - no working-tree change under packages/domainforge/** or packages/realitytrace/**;
//   - no commit touching those paths whose SUBJECT mentions the copilot reconstruction.
// General maintenance commits are legitimate: e.g. "chore(domainforge): pin
// an upstream pin bump is not reconstruction-specific work — the
// criterion is the subject mentioning the copilot reconstruction, not the touch itself.
// (This reconstruction's own .sea/interaction domain model is new by design and is check 9's
// concern; the DomainForge *engine* and RealityTrace *adapter* must stay untouched.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { ROOT, git, rel } from "./helpers.ts";

const RECONSTRUCTION_SPECIFIC_SUBJECT = /copilot/i;

describe("Phase 13 §10: DomainForge and RealityTrace required no reconstruction-specific modification", () => {
  test("git diff --stat HEAD touches no files under packages/domainforge", () => {
    const stat = git(["diff", "--stat", "HEAD", "--", "packages/domainforge"]);
    expect(stat.trim()).toBe("");
  });

  test("git diff --stat HEAD touches no files under packages/realitytrace", () => {
    const stat = git(["diff", "--stat", "HEAD", "--", "packages/realitytrace"]);
    expect(stat.trim()).toBe("");
  });

  test("git status --porcelain shows no working-tree change under packages/domainforge or packages/realitytrace", () => {
    const lines = git(["status", "--porcelain"]).split("\n").filter((line) => line.trim().length > 0);
    const offenders = lines.filter((line) => {
      const path = line.slice(3).replace(/^"|"$/g, "");
      return path.startsWith("packages/domainforge/") || path.startsWith("packages/realitytrace/");
    });
    expect(offenders).toEqual([]);
  });

  test("no commit touching packages/domainforge or packages/realitytrace has a copilot-reconstruction subject", () => {
    const log = git(["log", "--oneline", "--", "packages/domainforge", "packages/realitytrace"]);
    expect(log.trim().length).toBeGreaterThan(0); // the histories exist and were actually read
    const offenders = log
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .filter((line) => RECONSTRUCTION_SPECIFIC_SUBJECT.test(line.replace(/^[0-9a-f]+\s+/, "")));
    expect(offenders).toEqual([]);
  });

  test("the framework's external DomainForge pin is a single declared version", () => {
    // The framework adapter pins the upstream @godspeedai/domainforge binding; the reconstruction
    // consumes DomainForge only through this package (asserted by the import scans above).
    const manifest = JSON.parse(readFileSync(join(ROOT, "packages/domainforge/package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["@godspeedai/domainforge"]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
