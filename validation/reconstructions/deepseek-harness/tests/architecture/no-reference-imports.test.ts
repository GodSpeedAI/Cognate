// Phase 8, criterion 2: no import/require specifier in APP src/domain/test, or in packages/**,
// resolves into .tmp/ref (the reference checkout) or names a reference package. Also scans the
// bundled browser output APP actually produces at build time: rather than reimplementing
// server.ts's Bun.build call (its BROWSER_ENTRY_TEMPLATE is generated dynamically and inlines
// caller-specific values), this test boots the real app via the app's own `bootApp` test helper
// (validation/reconstructions/deepseek-harness/cognate/test/helpers.ts) and fetches the exact
// `/app.js` bundle that startServer() serves, so any specifier that only surfaces after bundling
// (inlined transitive imports) is still caught, using the exact function under test.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { bootApp, withTempHome } from "../../cognate/test/helpers.ts";

const ROOT = join(import.meta.dir, "..", "..", "..", "..", "..");
const APP = join(ROOT, "validation/reconstructions/deepseek-harness/cognate");

const REFERENCE_SPECIFIER = /(?:^|["'`(])(\.\.?\/[^"'`)\s]*\.tmp\/ref\/deepseek-harness[^"'`)\s]*|@deepseek-ai\/[\w./-]*|deepseek-harness(?!-reconstruction)(?:\/[\w./-]*)?|dsh-[\w-]+)/;

function listSourceFiles(dir: string, exts: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const fs = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const name of fs.readdirSync(current)) {
      if (name === "node_modules" || name === ".generated" || name === ".git") continue;
      const full = join(current, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else if (exts.some((ext) => name.endsWith(ext))) out.push(full);
    }
  }
  return out;
}

const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

describe("Phase 8 §2: no import/require resolves into the reference checkout or names it", () => {
  const scanDirs = [
    join(APP, "src"),
    join(APP, "domain"),
    join(APP, "test"),
    ...["packages"].flatMap((d) => (existsSync(join(ROOT, d)) ? [join(ROOT, d)] : [])),
  ];

  test("scan set is non-empty", () => {
    expect(scanDirs.some((d) => existsSync(d))).toBe(true);
  });

  for (const dir of scanDirs) {
    if (!existsSync(dir)) continue;
    test(`no forbidden specifier under ${dir.replace(ROOT + "/", "")}`, () => {
      const files = listSourceFiles(dir, CODE_EXTS);
      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        const importRe = /(?:import|export)\s+(?:[\s\S]*?from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
        let m: RegExpExecArray | null;
        while ((m = importRe.exec(text))) {
          const specifier = m[1] ?? m[2] ?? "";
          if (REFERENCE_SPECIFIER.test(specifier)) offenders.push(`${file.replace(ROOT + "/", "")}: ${specifier}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  test(
    "the actual /app.js bundle startServer() builds and serves contains no reference specifier",
    async () => {
      await withTempHome(async (home) => {
        const { app } = await bootApp(home);
        try {
          const res = await fetch(`${app.url}/app.js`);
          expect(res.ok).toBe(true);
          const bundleText = await res.text();
          expect(bundleText.length).toBeGreaterThan(0);

          const offenders: string[] = [];
          // Bundled code has no import/require syntax to key off; scan the flattened text, per line
          // (so a match never spans across an unrelated stretch of code), for the forbidden literals
          // themselves — a module specifier is inlined as a string literal when Bun resolves it, and
          // Bun also emits a `// <source-path>` comment per module. This app's own source path
          // legitimately contains "deepseek-harness" (its own directory name,
          // validation/reconstructions/deepseek-harness/cognate/...) — that is not a dependency on
          // the *reference checkout* and is excluded by requiring ".tmp/ref/deepseek-harness" for the
          // path form, or the reference-package forms (@deepseek-ai/*, dsh-*) which this app's own
          // path never matches.
          const literalRe = /["'`](\.\.?\/[^"'`\n]*\.tmp\/ref\/deepseek-harness[^"'`\n]*|@deepseek-ai\/[\w./-]*|dsh-[\w-]+)["'`]/g;
          let m: RegExpExecArray | null;
          while ((m = literalRe.exec(bundleText))) offenders.push(m[1]!);
          // Also flag a `// <path>` source comment whose path runs through the reference checkout.
          const commentRe = /\/\/\s*([^\n]*\.tmp\/ref\/deepseek-harness[^\n]*)/g;
          while ((m = commentRe.exec(bundleText))) offenders.push(m[1]!);
          expect(offenders).toEqual([]);
        } finally {
          await app.stop();
        }
      });
    },
    30_000,
  );
});
