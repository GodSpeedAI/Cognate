// `cognate create` without --source: templates resolve from the package directory (workspace and installed
// tarball alike), and generated apps pin every @godspeedai/* dependency to the CLI's own exact version.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_VERSION, STARTER_TEMPLATE_DIR, create } from "../src/index.ts";

const packageDir = join(import.meta.dir, "..");

describe("starter template resolution", () => {
  test("templates ship inside the package and resolve from its directory", () => {
    expect(STARTER_TEMPLATE_DIR).toBe(join(packageDir, "templates", "starter"));
    expect(existsSync(join(STARTER_TEMPLATE_DIR, "common", "test", "app.test.ts"))).toBe(true);
    for (const profile of ["copilot", "harness"]) expect(existsSync(join(STARTER_TEMPLATE_DIR, profile, "cognate.config.ts"))).toBe(true);
  });

  test("the package manifest publishes the templates next to src", async () => {
    const manifest = await Bun.file(join(packageDir, "package.json")).json();
    expect(manifest.files).toEqual(["src", "templates"]);
    expect(CLI_VERSION).toBe(manifest.version);
  });
});

describe("cognate create without --source", () => {
  const root = mkdtempSync(join(tmpdir(), "cognate-create-registry-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  for (const profile of ["copilot", "harness"] as const) {
    test(`${profile}: pins every @godspeedai/* dependency to the CLI version and vendors nothing`, async () => {
      const dir = join(root, profile);
      const report = await create({ dir, profile, with: ["sona"] });
      expect(report.vendored).toEqual([]);
      expect(report.unsupported.map((entry) => entry.name)).toEqual(["sona"]);
      expect(existsSync(join(dir, ".cognate", "vendor"))).toBe(false);

      const manifest = await Bun.file(join(dir, "package.json")).json();
      expect(manifest.overrides).toBeUndefined();
      const godspeed = Object.entries(manifest.dependencies as Record<string, string>).filter(([name]) => name.startsWith("@godspeedai/"));
      expect(godspeed.length).toBeGreaterThan(0);
      for (const [, range] of godspeed) expect(range).toBe(CLI_VERSION);
      expect(JSON.stringify(manifest)).not.toContain("workspace:");
      expect(JSON.stringify(manifest)).not.toContain("file:");
      expect(JSON.stringify(manifest)).not.toContain("sona");
    });
  }

  test("the generated tree contains the documented layout", async () => {
    const dir = join(root, "layout");
    await create({ dir, profile: "harness" });
    for (const path of ["domain/example.sea", "src/agents", "src/ui", "cognate.config.ts", "package.json", "test/app.test.ts", ".gitignore"]) expect(existsSync(join(dir, path))).toBe(true);
  });
});
