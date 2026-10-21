// DEBT-022: `world.fork` (and `experiment.round`) register the copy through the bubblewrap provider when
// an operator-supplied config is present and the provider is available; otherwise a local
// directory-copy world, with the reason recorded. The bubblewrap success path needs a host-owned
// provenance attestation (COGNATE_BWRAP_TEST_ATTESTATION), the same gate as the execution package's
// OS tests; it is skipped, not faked, when that attestation is absent.
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionWorldRegistry } from "@godspeedai/cognate-execution";
import { forkWorld, type BubblewrapForkConfig } from "../src/capabilities/cognitive.ts";

const unitProvenance = {
  operatorVerified: true as const,
  binarySha256: "a".repeat(64),
  version: "unit-only-placeholder",
  source: "non-OS fallback test only",
  patchedCve202687766: true as const,
};

async function withFixture(run: (paths: { base: string; source: string; forkBase: string }) => Promise<void>): Promise<void> {
  const base = await mkdtemp(join(tmpdir(), "cognitive-fork-"));
  try {
    const source = join(base, "source");
    const forkBase = join(base, "forks");
    await mkdir(source, { recursive: true });
    await mkdir(forkBase, { recursive: true });
    await writeFile(join(source, "a.txt"), "settled");
    await run({ base, source, forkBase });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

describe("world.fork isolation (DEBT-022)", () => {
  test("without an operator bubblewrap config the fork is a directory copy with no sandbox claim", async () => {
    await withFixture(async ({ source, forkBase }) => {
      const registry = createExecutionWorldRegistry();
      const fork = await forkWorld({ registry, forkBase, sandboxId: "sbx-plain", sourceRoot: source });
      expect(fork.isolation).toBe("directory-copy");
      expect(fork.root.startsWith(forkBase)).toBe(true);
      expect(await readFile(join(fork.root, "a.txt"), "utf8")).toBe("settled");
      const world = registry.get("sbx-plain");
      expect(world.kind).toBe("local");
      expect(world.metadata).toEqual({ isolation: "directory-copy", provider: "local-fork", root: fork.root });
      expect(world.metadata).not.toHaveProperty("cubeSandbox");
      await registry.dispose();
    });
  });

  test("a configured bubblewrap provider that is unavailable falls back to a directory copy and records why", async () => {
    await withFixture(async ({ source, forkBase, base }) => {
      const registry = createExecutionWorldRegistry();
      const config: BubblewrapForkConfig = {
        executablePath: join(base, "no-such-bwrap"),
        provenance: unitProvenance,
        runtimeRoots: ["/usr/bin"],
      };
      const fork = await forkWorld({ registry, forkBase, sandboxId: "sbx-fallback", sourceRoot: source, bubblewrap: config });
      expect(fork.isolation).toBe("directory-copy");
      const metadata = registry.get("sbx-fallback").metadata;
      expect(metadata).toMatchObject({ isolation: "directory-copy", provider: "local-fork", root: fork.root });
      expect(metadata.bubblewrapFallback).toBeTruthy();
      expect(metadata).not.toHaveProperty("cubeSandbox");
      await registry.dispose();
    });
  });

  const bwrapPath = Bun.which("bwrap");
  test.skipIf(!bwrapPath)("a launcher whose digest no longer matches its attestation fails closed to a directory copy", async () => {
    await withFixture(async ({ source, forkBase }) => {
      const registry = createExecutionWorldRegistry();
      const config: BubblewrapForkConfig = {
        executablePath: bwrapPath!,
        provenance: unitProvenance, // digest "aaaa..." never matches the real binary
        runtimeRoots: ["/usr/bin", "/usr/lib", "/lib", "/lib64"],
      };
      const fork = await forkWorld({ registry, forkBase, sandboxId: "sbx-tampered", sourceRoot: source, bubblewrap: config });
      expect(fork.isolation).toBe("directory-copy");
      expect(String(registry.get("sbx-tampered").metadata.bubblewrapFallback)).toContain("changed");
      await registry.dispose();
    });
  });

  const attestationPath = process.env.COGNATE_BWRAP_TEST_ATTESTATION;
  test.skipIf(!attestationPath)("an operator-attested bubblewrap fork runs its commands inside the namespace", async () => {
    const attested = JSON.parse(await readFile(attestationPath!, "utf8")) as { executablePath: string; provenance: BubblewrapForkConfig["provenance"] };
    await withFixture(async ({ source, forkBase }) => {
      const registry = createExecutionWorldRegistry();
      const config: BubblewrapForkConfig = {
        executablePath: attested.executablePath,
        provenance: attested.provenance,
        runtimeRoots: ["/usr/bin", "/usr/lib", "/lib", "/lib64"],
      };
      const fork = await forkWorld({ registry, forkBase, sandboxId: "sbx-bwrap", sourceRoot: source, bubblewrap: config });
      expect(fork.isolation).toBe("bubblewrap-namespace");
      const world = registry.get("sbx-bwrap");
      expect(world.kind).toBe("linux-bubblewrap");
      expect(world.metadata).toMatchObject({ isolation: "bubblewrap-namespace", provider: "bubblewrap", root: fork.root });
      expect(world.metadata).not.toHaveProperty("cubeSandbox");
      const result = await world.process.exec({ argv: ["/usr/bin/cat", "a.txt"], cwd: fork.root });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("settled");
      await registry.dispose();
    });
  });
});
