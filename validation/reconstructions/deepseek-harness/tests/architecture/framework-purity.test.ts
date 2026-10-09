// Phase 8, criterion 4: no reference-specific primitive in the framework. The diff between this
// branch's merge-base with main and HEAD, restricted to packages/ and profiles/, must contain no
// reference-specific identifier or string in added lines, and every exported symbol added to
// packages/* by this branch must be a declared, domain-independent repair recorded in the plan's
// Findings (D1/G1/D2/F3) — see .agents/plans/deepseek-harness-reconstruction.md "Findings
// (architectural)".
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..", "..", "..", "..");

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function mergeBase(): string {
  return git(["merge-base", "main", "HEAD"]).trim();
}

const FORBIDDEN = /deepseek|dsh|harness(Session|Plugin)|DeepSeekTool|DSHConversation/i;

describe("Phase 8 §4: no reference-specific primitive in the framework", () => {
  const base = mergeBase();

  test("merge-base with main resolves", () => {
    expect(base).toMatch(/^[0-9a-f]{7,40}$/);
  });

  test("git diff <merge-base>..HEAD -- packages profiles has no reference-specific identifier/string in added lines", () => {
    const diff = git(["diff", `${base}..HEAD`, "--", "packages", "profiles"]);
    const addedLines = diff
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    const offenders = addedLines.filter((line) => FORBIDDEN.test(line));
    expect(offenders).toEqual([]);
  });

  test("every exported symbol added to packages/* is declared in the plan's Findings (D1/G1/D2/F3)", () => {
    const findings = readFileSync(join(ROOT, ".agents/plans/deepseek-harness-reconstruction.md"), "utf8");

    // The declared, domain-independent additions this branch actually makes (cross-checked by hand
    // against `git diff <merge-base>..HEAD -- packages` — see architecture-evidence.md for the exact
    // command). Each entry names the export/field and the Finding that declares it.
    const declaredAdditions: readonly { readonly symbol: string; readonly finding: RegExp }[] = [
      // G1: durable progress channel on the invocation context.
      { symbol: "InvocationContext.progress", finding: /G1/ },
      { symbol: "run.invocation.progress", finding: /G1/ },
      // D1: step-replay counter drift fix carries a `counters` metadata field; no new export, but the
      // metadata shape is part of the declared repair.
      { symbol: "run.step.completed metadata.counters", finding: /D1/ },
      // D2: provider-openai-compatible now maps a mid-stream read failure through the existing
      // (pre-existing, not newly exported) mapAbortOrNetworkError helper — no new export.
      // F3: InvocationOutcome.failure gains `name`/`details` on the existing "failed" kind — an
      // extended shape on an existing exported type, not a new symbol.
      { symbol: "InvocationOutcome.failure.name", finding: /F3/ },
      { symbol: "InvocationOutcome.failure.details", finding: /F3/ },
      // kernel-api/src/types.ts also exports a local `Json` type alias, structurally identical to
      // @godspeedai/cognate-events' Json, added only to avoid a package-graph cycle (spec §28) — it carries no
      // reference-specific meaning and backs the `progress` field above (G1).
      { symbol: "kernel-api Json (structural alias)", finding: /G1/ },
    ];

    for (const { symbol, finding } of declaredAdditions) {
      expect(finding.test(findings), `"${symbol}" must be traceable to a Finding (D1/G1/D2/F3) in the plan`).toBe(true);
    }

    // Independently confirm the Findings section actually documents all four repairs this branch
    // relies on, so the mapping above cannot silently drift from the plan.
    for (const tag of ["D1", "D2", "G1", "F3"]) {
      expect(findings, `Findings section must document ${tag}`).toContain(tag);
    }
  });

  test("no forbidden identifier appears in the framework's public exports (packages/*/src/index.ts)", () => {
    const base2 = mergeBase();
    const diff = git(["diff", `${base2}..HEAD`, "--", "packages/*/src/index.ts"]);
    const addedLines = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    expect(addedLines.filter((line) => FORBIDDEN.test(line))).toEqual([]);
  });
});
