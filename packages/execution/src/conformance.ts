// Executable execution-world contract. Every provider (local, memory, ssh, later wsl/container)
// calls this suite from its own tests — that is how "replaceable provider" is proven rather than
// asserted.
import { afterEach, describe, expect, test } from "bun:test";
import { PathEscapeError } from "./types.ts";
import type { ExecSpec, ExecutionWorldProvider } from "./types.ts";

export interface ExecutionConformanceHarness {
  readonly provider: ExecutionWorldProvider;
  /** A location this provider owns and may write into. Provider-owned: an OS path locally, a virtual root for memory. */
  readonly root: string;
  /** How to express the three deterministic commands the suite runs, on this provider. */
  readonly commands: {
    readonly echo: (marker: string) => ExecSpec;
    readonly fail: (marker: string, code: number) => ExecSpec;
    readonly slow: () => ExecSpec;
  };
  /** The provider's `version` is documented as whole-second `mtime:size` (e.g. SSH over SFTP attrs). */
  readonly coarseVersion?: boolean;
  cleanup?(): Promise<void>;
}

const TIMEOUT_MARKER = 150;
const ABORT_MARKER = 50_000;

export function executionWorldConformance(name: string, make: () => Promise<ExecutionConformanceHarness>): void {
  describe(`${name}: execution-world contract (filesystem + process ports)`, () => {
    const open: ExecutionConformanceHarness[] = [];
    afterEach(async () => {
      for (const harness of open.splice(0)) {
        await harness.provider.dispose().catch(() => {});
        await harness.cleanup?.().catch(() => {});
      }
    });
    const fresh = async (): Promise<ExecutionConformanceHarness> => {
      const harness = await make();
      open.push(harness);
      return harness;
    };
    let seq = 0;
    const nextPath = (harness: ExecutionConformanceHarness): string => harness.provider.fileSystem.resolve(harness.root, `conformance-${++seq}.txt`);

    test("resolve canonicalizes inside the root and rejects escapes (containment boundary)", async () => {
      const { provider, root } = await fresh();
      const inside = provider.fileSystem.resolve(root, "nested/file.txt");
      expect(inside.startsWith(root)).toBe(true);
      expect(() => provider.fileSystem.resolve(root, "../outside.txt")).toThrow(PathEscapeError);
      expect(() => provider.fileSystem.resolve(root, "nested/../../outside.txt")).toThrow(PathEscapeError);
    });

    test("a missing path is absent, not an error", async () => {
      const harness = await fresh();
      const { provider } = harness;
      const missing = provider.fileSystem.resolve(harness.root, "does-not-exist.txt");
      expect(await provider.fileSystem.stat(missing)).toBeUndefined();
      expect(await provider.fileSystem.exists(missing)).toBe(false);
      expect(await provider.fileSystem.version(missing)).toBeUndefined();
    });

    test("writeText then readText round-trips, stat reports a file, and list includes it", async () => {
      const harness = await fresh();
      const { provider } = harness;
      const path = nextPath(harness);
      await provider.fileSystem.writeText(path, "hello execution world");
      expect(await provider.fileSystem.readText(path)).toBe("hello execution world");
      const stat = await provider.fileSystem.stat(path);
      expect(stat?.kind).toBe("file");
      expect(stat?.size).toBe("hello execution world".length);
      expect(await provider.fileSystem.exists(path)).toBe(true);
      const name = path.slice(path.lastIndexOf("/") + 1);
      expect((await provider.fileSystem.list(harness.root)).some((entry) => entry.name === name)).toBe(true);
    });

    test("version tracks content so staleness is detectable", async () => {
      const harness = await fresh();
      const { provider } = harness;
      const path = nextPath(harness);
      await provider.fileSystem.writeText(path, "one");
      const first = await provider.fileSystem.version(path);
      expect(first).toBeString();
      await provider.fileSystem.writeText(path, "two-longer");
      expect(await provider.fileSystem.version(path)).not.toBe(first);
    });

    test("a same-size rewrite within the same second still changes version", async () => {
      const harness = await fresh();
      if (harness.coarseVersion) return; // documented limit: seconds-only versions cannot see this rewrite
      const { provider } = harness;
      const path = nextPath(harness);
      await provider.fileSystem.writeText(path, "aaaa");
      const first = await provider.fileSystem.version(path);
      expect(first).toBeString();
      await provider.fileSystem.writeText(path, "bbbb");
      expect(await provider.fileSystem.readText(path)).toBe("bbbb");
      expect((await provider.fileSystem.stat(path))?.size).toBe(4);
      expect(await provider.fileSystem.version(path)).not.toBe(first);
    });

    test("exec returns stdout and a zero exit code", async () => {
      const harness = await fresh();
      const marker = `exec-ok-${++seq}`;
      const result = await harness.provider.process.exec(harness.commands.echo(marker));
      expect(result.stdout.trim()).toBe(marker);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    test("exec returns stderr and a non-zero exit code", async () => {
      const harness = await fresh();
      const marker = `exec-fail-${++seq}`;
      const result = await harness.provider.process.exec(harness.commands.fail(marker, 3));
      expect(result.stderr.trim()).toBe(marker);
      expect(result.exitCode).toBe(3);
      expect(result.timedOut).toBe(false);
    });

    test("exec terminates a process that exceeds its timeout and reports timedOut", async () => {
      const harness = await fresh();
      const spec = { ...harness.commands.slow(), timeoutMs: TIMEOUT_MARKER };
      const result = await harness.provider.process.exec(spec);
      expect(result.timedOut).toBe(true);
    });

    test("exec resolves on abort rather than hanging", async () => {
      const harness = await fresh();
      const controller = new AbortController();
      const spec = { ...harness.commands.slow(), timeoutMs: ABORT_MARKER };
      const started = Date.now();
      const pending = harness.provider.process.exec(spec, { signal: controller.signal });
      setTimeout(() => controller.abort(), 50);
      const result = await pending;
      expect(result.timedOut).toBe(false);
      expect(Date.now() - started).toBeLessThan(ABORT_MARKER);
    });

    test("dispose is idempotent", async () => {
      const harness = await fresh();
      await harness.provider.dispose();
      await harness.provider.dispose();
      expect(true).toBe(true);
    });
  });
}