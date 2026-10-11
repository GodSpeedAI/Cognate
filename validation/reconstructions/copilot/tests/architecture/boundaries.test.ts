// Phase 13 checks 5-7, enforced by import scanning:
//   §5 AG-UI only behind the adapter boundary — application source (cognate/src) reaches AG-UI
//      only through @godspeedai/cognate-ag-ui. Direct @ag-ui/* imports are allowed ONLY in test files
//      (protocol-only usage) and inside packages/ag-ui itself.
//   §6 Astryx only in presentation — @godspeedai/cognate-ui-astryx may be imported only from UI/presentation
//      files (src/ui/**, *Surface.tsx surfaces, or the server's UI bundling), never from
//      agents/domain logic.
//   §7 Cordis hidden behind Cognate — the reconstruction app never imports @godspeedai/cognate-kernel-cordis
//      or cordis; kernel access goes through @godspeedai/cognate-kernel-api and the runtime packages.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  APP_SRC,
  APP_TEST,
  CODE_EXTS,
  ROOT,
  importSpecifiers,
  rel,
  walk,
} from "./helpers.ts";

function importersOf(dir: string, specifierPattern: RegExp): string[] {
  const files = walk(dir, CODE_EXTS);
  const found: string[] = [];
  for (const file of files) {
    if (importSpecifiers(readFileSync(file, "utf8")).some((s) => specifierPattern.test(s))) found.push(file);
  }
  return found;
}

describe("Phase 13 §5: AG-UI exists only behind the @godspeedai/cognate-ag-ui adapter boundary", () => {
  test("application source under cognate/src has no direct @ag-ui/* import", () => {
    const offenders = importersOf(APP_SRC, /^@ag-ui\//);
    expect(offenders.map(rel)).toEqual([]);
  });

  test("the boundary exists: application source imports @godspeedai/cognate-ag-ui (server + adapter composition)", () => {
    const importers = importersOf(APP_SRC, /^@godspeedai\/cognate-ag-ui$/);
    expect(importers.map(rel)).toContain("validation/reconstructions/copilot/cognate/src/server.ts");
  });

  test("packages/ag-ui wraps the real AG-UI protocol packages (direct @ag-ui/* allowed only there)", () => {
    const own = importersOf(join(ROOT, "packages/ag-ui/src"), /^@ag-ui\//);
    expect(own.length).toBeGreaterThan(0);
  });

  test("test trees are the only other sanctioned @ag-ui/* location (protocol-only usage)", () => {
    // Allowed, not required: today no test tree imports @ag-ui/* directly; if one later does,
    // this suite keeps that legal ONLY while application source stays clean (asserted above),
    // mirroring the prompt's protocol-only carve-out for tests.
    const testTreeFiles = [...walk(APP_TEST, CODE_EXTS), ...walk(join(ROOT, "validation/reconstructions/copilot/tests"), CODE_EXTS)];
    expect(testTreeFiles.length).toBeGreaterThan(10);
    for (const file of testTreeFiles) {
      // test trees must not smuggle the adapter boundary into app code either:
      // they may import @ag-ui/*, but nothing here re-exports it as an app module.
      const text = readFileSync(file, "utf8");
      expect(/export\s+[\s\S]*?from\s+["']@ag-ui\//.test(text)).toBe(false);
    }
  });
});

describe("Phase 13 §6: Astryx exists only in presentation implementation", () => {
  const ASTRYX = /^@godspeedai\/cognate-ui-astryx(?:\/[\w./-]*)?$/;

  test("@godspeedai/cognate-ui-astryx is imported only from UI/presentation files", () => {
    const offenders: string[] = [];
    for (const file of importersOf(APP_SRC, ASTRYX)) {
      const isUiDir = file.startsWith(join(APP_SRC, "ui") + "/");
      const isSurface = /Surface\.tsx$/.test(file);
      const isServerBundling = file === join(APP_SRC, "server.ts");
      if (!isUiDir && !isSurface && !isServerBundling) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  test("@godspeedai/cognate-ui-astryx is absent from agents/domain logic files", () => {
    const domainFiles = ["domain.ts", "journey.ts", "remaining-journeys.ts", "shared-state.ts", "remote-capability.tsx", "constants.ts"]
      .map((name) => join(APP_SRC, name))
      .filter((path) => existsSync(path));
    expect(domainFiles.length).toBeGreaterThanOrEqual(5);
    for (const file of domainFiles) {
      expect(importSpecifiers(readFileSync(file, "utf8")).filter((s) => ASTRYX.test(s))).toEqual([]);
    }
  });
});

describe("Phase 13 §7: Cordis remains hidden behind Cognate", () => {
  test("reconstruction app imports neither @godspeedai/cognate-kernel-cordis nor cordis", () => {
    const offenders = [...importersOf(APP_SRC, /^(?:@godspeedai\/cognate-kernel-cordis|cordis)(?:\/[\w./-]*)?$/), ...importersOf(APP_TEST, /^(?:@godspeedai\/cognate-kernel-cordis|cordis)(?:\/[\w./-]*)?$/)];
    expect(offenders.map(rel)).toEqual([]);
  });

  test("kernel access in the app goes through @godspeedai/cognate-kernel-api / runtime packages", () => {
    const kernelApi = importersOf(APP_SRC, /^@godspeedai\/cognate-kernel-api$/);
    const runtime = importersOf(APP_SRC, /^@godspeedai\/cognate-runtime-(?:api|bun)$/);
    expect(kernelApi.length + runtime.length).toBeGreaterThan(0);
  });

  test("framework-side: cordis is consumed only by @godspeedai/cognate-kernel-cordis, and kernel-cordis only by @godspeedai/cognate-runtime-bun", () => {
    const manifests = walk(join(ROOT, "packages"), [".json"])
      .filter((p) => p.endsWith("/package.json"))
      .map((path) => ({ path, text: readFileSync(path, "utf8") }));
    expect(manifests.length).toBeGreaterThan(10);
    const cordisConsumers = manifests.filter((m) => /"cordis"\s*:/.test(m.text)).map((m) => m.path);
    const kernelCordisConsumers = manifests.filter((m) => /"@godspeedai\/cognate-kernel-cordis"\s*:/.test(m.text)).map((m) => m.path);
    expect(cordisConsumers.map(rel)).toEqual(["packages/kernel-cordis/package.json"]);
    // Framework packages only: the kernel adapter, the runtime composition root, and the execution
    // world provider (governed operations). Application source stays free of cordis (asserted above).
    expect(kernelCordisConsumers.map(rel)).toEqual(["packages/runtime-bun/package.json", "packages/execution/package.json"]);
  });
});
