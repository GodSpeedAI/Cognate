// Phase 8, criterion 7: DomainForge and RealityTrace unchanged, and their pinned versions are
// unchanged vs the merge-base. APP's own `.sea` grammar for its interaction domain
// (validation/reconstructions/deepseek-harness/cognate/.sea/interaction/*) is new by design (it is
// the domain model this reconstruction built) and is explicitly out of scope here — this test checks
// the DomainForge *grammar engine* (packages/domainforge) and RealityTrace (packages/realitytrace),
// not any app's own .sea files.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..", "..", "..", "..");

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function mergeBase(): string {
  return git(["merge-base", "main", "HEAD"]).trim();
}

describe("Phase 8 §7: DomainForge and RealityTrace unchanged", () => {
  const base = mergeBase();

  test("git diff --stat touches no files under packages/domainforge", () => {
    const stat = git(["diff", `${base}..HEAD`, "--stat", "--", "packages/domainforge"]);
    expect(stat.trim()).toBe("");
  });

  test("git diff --stat touches no files under packages/realitytrace", () => {
    const stat = git(["diff", `${base}..HEAD`, "--stat", "--", "packages/realitytrace"]);
    expect(stat.trim()).toBe("");
  });

  test("@godspeedai/domainforge pinned version in bun.lock is unchanged vs merge-base", () => {
    const before = git(["show", `${base}:bun.lock`]);
    const after = git(["show", "HEAD:bun.lock"]);
    const versionOf = (text: string): string | undefined => /"@godspeedai\/domainforge":\s*"([^"]+)"/.exec(text)?.[1];
    const beforeVersion = versionOf(before);
    const afterVersion = versionOf(after);
    expect(beforeVersion).toBeDefined();
    expect(afterVersion).toBe(beforeVersion);
  });

  test("@godspeedai/realitytrace dependency shape in bun.lock is unchanged vs merge-base (workspace pin)", () => {
    const before = git(["show", `${base}:bun.lock`]);
    const after = git(["show", "HEAD:bun.lock"]);
    const entryOf = (text: string): string | undefined => /"@cognate\/realitytrace":\s*\[[^\]]*\]/.exec(text)?.[0];
    const beforeEntry = entryOf(before);
    const afterEntry = entryOf(after);
    expect(beforeEntry).toBeDefined();
    expect(afterEntry).toBe(beforeEntry);
  });

  test("packages/domainforge/package.json dependency versions unchanged vs merge-base", () => {
    const before = git(["show", `${base}:packages/domainforge/package.json`]);
    const after = git(["show", "HEAD:packages/domainforge/package.json"]);
    expect(after).toBe(before);
  });

  test("packages/realitytrace/package.json dependency versions unchanged vs merge-base", () => {
    const before = git(["show", `${base}:packages/realitytrace/package.json`]);
    const after = git(["show", "HEAD:packages/realitytrace/package.json"]);
    expect(after).toBe(before);
  });
});
