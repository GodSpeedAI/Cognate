// Phase 13 check 9: the .sea grammar is unchanged. Three legs:
//   (a) git evidence from the repo root: `git status --porcelain` shows no working-tree change
//       under .sea/, packages/domainforge/ or packages/realitytrace/, and
//       `git diff --stat HEAD -- .sea packages/domainforge packages/realitytrace` is empty;
//   (b) the reconstruction's own .sea/interaction/** contains only validation models and their
//       catalog docs — never grammar definitions (no *.pest/*.g4/grammar.* artifacts, and the
//       .sea files are DomainForge semantic models with an @namespace, not grammar specs);
//   (c) no reconstruction source file writes to .sea/** (the app loads models read-only).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { APP_SRC, CAPTURE_DIR, REC, TESTS_DIR, CODE_EXTS, git, rel, walk, walkAll } from "./helpers.ts";

const GRAMMAR_ARTIFACTS = /\.(pest|g4|grammar|tmLanguage\.json)$|^grammar\.(js|json)$/;

describe("Phase 13 §9: .sea grammar unchanged", () => {
  test("git status --porcelain shows no working-tree change under .sea/, packages/domainforge/ or packages/realitytrace/", () => {
    // Full porcelain is expected to contain other sessions' concurrent work; this asserts
    // only the grammar- and adapter-owned pathscopes.
    const lines = git(["status", "--porcelain"]).split("\n").filter((line) => line.trim().length > 0);
    const offenders = lines.filter((line) => {
      const path = line.slice(3).replace(/^"|"$/g, "");
      return path.startsWith(".sea/") || path.startsWith("packages/domainforge/") || path.startsWith("packages/realitytrace/");
    });
    expect(offenders).toEqual([]);
  });

  test("git diff --stat HEAD -- .sea packages/domainforge packages/realitytrace is empty", () => {
    const command = ["diff", "--stat", "HEAD", "--", ".sea", "packages/domainforge", "packages/realitytrace"];
    const stat = git(command);
    expect(stat.trim()).toBe("");
  });

  test("the reconstruction's .sea/interaction/** contains only validation models and catalog docs, never grammar definitions", () => {
    const seaDir = join(REC, ".sea");
    expect(existsSync(seaDir)).toBe(true);
    const files = walkAll(seaDir);
    expect(files.length).toBeGreaterThan(0);
    const grammarOffenders = files.filter((file) => GRAMMAR_ARTIFACTS.test(file.split("/").pop() ?? ""));
    expect(grammarOffenders.map(rel)).toEqual([]);

    const modelFiles = files.filter((file) => file.endsWith(".sea"));
    expect(modelFiles.length).toBeGreaterThan(0);
    for (const file of modelFiles) {
      const text = readFileSync(file, "utf8");
      // A DomainForge semantic model declares a namespace; a grammar definition would not.
      expect(text).toMatch(/^\s*@namespace\s+/m);
    }
    expect(modelFiles.map(rel)).toContain("validation/reconstructions/copilot/.sea/interaction/interaction-model.sea");
  });

  test("no reconstruction source file writes to .sea/**", () => {
    // Scope: reconstruction code. tests/architecture is excluded — it IS this checker, and its
    // own regex literals mention the write-patterns it scans for.
    const offenders: string[] = [];
    for (const dir of [APP_SRC, join(REC, "cognate/test"), CAPTURE_DIR, join(TESTS_DIR, "protocol"), join(TESTS_DIR, "persistence")]) {
      for (const file of walk(dir, CODE_EXTS)) {
        const text = readFileSync(file, "utf8");
        if (/(?:writeFile(?:Sync)?|Bun\.write|rmSync|renameSync|mkdirSync|cpSync)\s*\([^;\n]*\.sea/.test(text)) {
          offenders.push(rel(file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
