// Gate: CopilotKit absence — settlement gates 19/22 and the Phase 13 purity requirement.
//
// "Also verify a normal AG-UI client can communicate with Cognate without CopilotKit installed."
// This is proven mechanically, not claimed: the transitive static import graph of the served
// endpoint entry (cognate/src/server.ts), this suite's own entries, and the AG-UI protocol
// packages the suite pulls in is walked (Bun.Transpiler.scanImports + Bun.resolveSync), and any
// specifier or resolved module path matching /copilotkit/i fails the suite. A file that cannot
// be scanned is a failure, not a skip, and the scanner itself is proven live against a synthetic
// dirty graph so the absence proof cannot pass vacuously.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agUiClientEntry, agUiCoreEntry, agUiEncoderEntry, agUiSchemasEntry } from "./agui-modules.ts";
import { scanModuleGraph } from "./modulegraph.ts";

const PROTOCOL_DIR = import.meta.dir;
const COGNATE_APP_DIR = join(PROTOCOL_DIR, "../../cognate");
const SERVER_ENTRY = join(COGNATE_APP_DIR, "src", "server.ts");
const AG_UI_ADAPTER_ENTRY = join(PROTOCOL_DIR, "../../../../../packages/ag-ui/src/index.ts");

/** The served endpoint entry plus every module of this suite plus the AG-UI protocol packages. */
async function purityEntries(): Promise<string[]> {
  const suiteFiles = readdirSync(PROTOCOL_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(PROTOCOL_DIR, name));
  return [SERVER_ENTRY, ...suiteFiles, agUiClientEntry, agUiCoreEntry, agUiEncoderEntry, agUiSchemasEntry];
}

describe("CopilotKit absence (gates 19/22)", () => {
  test("no copilotkit specifier or module is reachable from the endpoint, the suite, or the AG-UI protocol packages", async () => {
    const scan = await scanModuleGraph(await purityEntries());
    // Every module must have been statically scannable — an unscannable file would be a blind spot.
    expect(scan.scanFailures).toEqual([]);
    // The mechanical assertion itself: nothing matching /copilotkit/i is reachable.
    expect(scan.hits).toEqual([]);
    // Non-vacuity: the scan must actually have traversed the reconstruction's real graph — the
    // served entry, the Cognate AG-UI adapter, and the pinned @ag-ui/core schemas it emits.
    expect(scan.files).toContain(SERVER_ENTRY);
    expect(scan.files).toContain(AG_UI_ADAPTER_ENTRY);
    expect(scan.files.some((file) => file.includes("@ag-ui+core") && file.endsWith("index.mjs"))).toBe(true);
    expect(scan.files.length).toBeGreaterThan(50);
  });

  test("the scanner flags a synthetic CopilotKit import, so the absence proof is not vacuous", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cognate-agui-purity-"));
    try {
      await Bun.write(join(directory, "leaf.ts"), "export const leaf = 1;\n");
      await Bun.write(join(directory, "clean.ts"), `import { leaf } from "./leaf.ts";\nexport const clean = leaf;\n`);
      // An unresolvable @copilotkit specifier must still be flagged via its raw specifier...
      await Bun.write(join(directory, "dirty-specifier.ts"), `import { leaf } from "./leaf.ts";\nimport "@copilotkit/react-ui";\nexport const dirty = leaf;\n`);
      // ...and a resolvable module whose path carries the name must be flagged via its path.
      await Bun.write(join(directory, "copilotkit-helper.ts"), "export const helper = 1;\n");
      await Bun.write(join(directory, "dirty-path.ts"), `import { helper } from "./copilotkit-helper.ts";\nexport const viaPath = helper;\n`);

      const clean = await scanModuleGraph([join(directory, "clean.ts")]);
      expect(clean.hits).toEqual([]);

      const dirty = await scanModuleGraph([join(directory, "dirty-specifier.ts"), join(directory, "dirty-path.ts")]);
      expect(dirty.hits.some((hit) => hit.specifier === "@copilotkit/react-ui")).toBe(true);
      expect(dirty.hits.some((hit) => hit.file.endsWith("copilotkit-helper.ts"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("the reconstruction application manifest declares no CopilotKit dependency", async () => {
    const manifest = (await Bun.file(join(COGNATE_APP_DIR, "package.json")).json()) as Record<string, Record<string, string> | undefined>;
    for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
      const dependencies = manifest[section];
      if (dependencies === undefined) continue;
      expect(Object.keys(dependencies).filter((name) => /copilotkit/i.test(name))).toEqual([]);
    }
  });
});
