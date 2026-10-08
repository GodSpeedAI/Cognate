// Phase 13 check 1: no `@copilotkit/*` or `copilotkit` dependency anywhere the reconstruction
// could carry one — manifests under validation/reconstructions/copilot/**, the repo-root
// lockfile workspace entries in its dependency closure, the reconstruction's own source-text
// import specifiers, and the RESOLVED module graph (bundled server entry, browser UI entry,
// and every journey test entry; anything CopilotKit-shaped would either fail resolution or
// surface as an inlined module path/specifier in the output).
//
// Scope note: the repo-root bun.lock legitimately resolves @copilotkit/aimock for the
// deepseek-harness reconstruction's own mock-model devDependency. That is a DIFFERENT
// reconstruction; this suite scans the copilot reconstruction's closure, so it never
// false-positives on that entry.
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  APP,
  APP_SRC,
  APP_TEST,
  CAPTURE_DIR,
  CODE_EXTS,
  DEP_FIELDS,
  REC,
  TESTS_DIR,
  dependencyClosure,
  importSpecifiers,
  loadLockfile,
  rel,
  walk,
  withChdir,
} from "./helpers.ts";

// Dependency NAMES this reconstruction must never declare. "copilotkit-reconstruction" (the
// workspace's own name) is not a dependency and never matches: the bare form requires end-of-name.
const FORBIDDEN_DEP_NAME = /^(?:@copilotkit\/[\w.-]+|copilotkit(?:\/[\w.-]+)?)$/;

const COPILOT_WORKSPACE_KEY = "validation/reconstructions/copilot/cognate";

// Source-level specifier scan scope: the reconstruction's own code and suites.
const SCAN_DIRS = [APP_SRC, APP_TEST, CAPTURE_DIR, TESTS_DIR];

// Bundle-level patterns. Bundled code has no import statements for inlined modules, so a
// dependency would survive as (a) an `@copilotkit/...` specifier or (b) a
// `// <path>`/inline path naming node_modules/@copilotkit/... . The bare word "copilotkit"
// alone is NOT flagged: the app's /health payload and its self-namespace
// ("copilotkit-reconstruction.*") legitimately contain it.
const BUNDLE_FORBIDDEN = [
  /@copilotkit\//,
  /node_modules\/[\w.@/-]*copilotkit[\w.@/-]*/i,
  /(?:from|require\(|import\()\s*["']copilotkit(?:\/[\w./-]*)?["']/,
];

let tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

async function bundleOutputTexts(entrypoints: string[], target: "bun" | "browser", external?: string[]): Promise<string[]> {
  const build = await withChdir(APP, () => Bun.build({ entrypoints, target, external }));
  expect(build.success).toBe(true); // a missing @copilotkit/* module fails resolution here
  const texts: string[] = [];
  for (const output of build.outputs) texts.push(await output.text());
  return texts;
}

describe("Phase 13 §1: no @copilotkit/* or copilotkit dependency", () => {
  test("manifests under the reconstruction declare no @copilotkit/* / copilotkit dependency", () => {
    const manifests = walk(REC, [".json"]).filter((p) => p.endsWith("/package.json"));
    expect(manifests.length).toBeGreaterThan(0); // at least the app workspace manifest is checked
    const offenders: string[] = [];
    for (const manifestPath of manifests) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      for (const field of DEP_FIELDS) {
        const deps = manifest[field];
        if (!deps || typeof deps !== "object") continue;
        for (const name of Object.keys(deps as Record<string, string>)) {
          if (FORBIDDEN_DEP_NAME.test(name)) offenders.push(`${rel(manifestPath)} ${field}.${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("repo-root lockfile: the reconstruction's dependency closure carries no @copilotkit/* / copilotkit", () => {
    const lock = loadLockfile();
    const closure = dependencyClosure(lock, COPILOT_WORKSPACE_KEY);
    // The closure must actually be walked: it contains the app's @godspeedai/* workspace deps.
    expect([...closure.keys()].filter((name) => name.startsWith("@godspeedai/")).length).toBeGreaterThan(5);
    const offenders = [...closure.entries()]
      .filter(([name]) => FORBIDDEN_DEP_NAME.test(name))
      .map(([name, via]) => `${name} (reached via ${via})`);
    expect(offenders).toEqual([]);
  });

  test("repo-root lockfile: the copilot workspace entry itself declares no @copilotkit/* dependency", () => {
    const lock = loadLockfile();
    const entry = lock.workspaces[COPILOT_WORKSPACE_KEY]!;
    const offenders: string[] = [];
    for (const field of DEP_FIELDS) {
      for (const name of Object.keys(entry[field] ?? {})) {
        if (FORBIDDEN_DEP_NAME.test(name)) offenders.push(`${field}.${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  for (const dir of SCAN_DIRS) {
    test(`source import specifiers under ${rel(dir)} name no copilotkit package`, () => {
      const files = walk(dir, CODE_EXTS);
      expect(files.length).toBeGreaterThan(0);
      const offenders: string[] = [];
      for (const file of files) {
        for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
          if (FORBIDDEN_DEP_NAME.test(specifier)) offenders.push(`${rel(file)}: ${specifier}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  test("resolved module graph of the server entry (bundled, target bun) contains no copilotkit specifier", async () => {
    const texts = await bundleOutputTexts([join(APP, "src/server.ts")], "bun");
    expect(texts.some((text) => text.length > 100_000)).toBe(true); // the graph really was bundled
    const offenders: string[] = [];
    for (const text of texts) {
      for (const pattern of BUNDLE_FORBIDDEN) {
        const m = pattern.exec(text);
        if (m) offenders.push(`${pattern}: ${JSON.stringify(m[0])}`);
      }
    }
    expect(offenders).toEqual([]);
  }, 60_000);

  test("resolved module graph of the browser UI entry (bundled, target browser) contains no copilotkit specifier", async () => {
    // The served /app.js graph: App.tsx as reached from server.ts's generated browser entry.
    const tmp = mkdtempSync(join(tmpdir(), "copilot-arch-"));
    tempDirs.push(tmp);
    const entry = join(tmp, "entry.tsx");
    await Bun.write(entry, `import "${APP_SRC.replace(/\\/g, "/")}/ui/App.tsx";\n`);
    const texts = await bundleOutputTexts([entry], "browser");
    expect(texts.some((text) => text.length > 10_000)).toBe(true); // the UI graph really was bundled
    const offenders: string[] = [];
    for (const text of texts) {
      for (const pattern of BUNDLE_FORBIDDEN) {
        const m = pattern.exec(text);
        if (m) offenders.push(`${pattern}: ${JSON.stringify(m[0])}`);
      }
    }
    expect(offenders).toEqual([]);
  }, 60_000);

  test("resolved module graphs of every journey test entry contain no copilotkit specifier", async () => {
    const entries = walk(APP_TEST, [".ts", ".tsx"]).filter((file) => /\.test\.tsx?$/.test(file)).sort();
    expect(entries.length).toBeGreaterThanOrEqual(10); // J-A .. J-K
    const offenders: string[] = [];
    for (const entry of entries) {
      // One build per entry keeps the offender report attributable to a file.
      const texts = await bundleOutputTexts([entry], "bun", ["bun:test"]);
      for (const text of texts) {
        for (const pattern of BUNDLE_FORBIDDEN) {
          if (pattern.test(text)) offenders.push(`${rel(entry)}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});
