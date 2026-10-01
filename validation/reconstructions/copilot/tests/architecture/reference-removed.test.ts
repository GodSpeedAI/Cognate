// Phase 13 check 11 (gate 23): the reconstruction works with the reference checkout physically
// removed. The pinned checkout (reference-manifest.json clonePath, currently .tmp/ref/copilotkit)
// is TEMPORARILY renamed aside; while it is absent, the reconstruction's own journey suite
// (cd cognate && bun test test) and this architecture suite (excluding THIS check, via
// COPILOT_ARCH_SKIP_REFERENCE_REMOVED=1, to avoid recursion) must run green. The checkout is
// then restored and the test asserts it exists again.
//
// Restore guarantees, in order: the test's try/finally; a process exit handler (sync rename);
// signal handlers (SIGINT/SIGTERM/SIGHUP); and self-healing on the next run if a previous run
// was killed outright (a leftover stash is moved back before the check begins).
// Observed command + output tails are appended to tests/architecture/reference-removed.log.
import { appendFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { APP, ARCH_DIR, REC, referenceCheckout, rel } from "./helpers.ts";

const SKIP_ENV = "COPILOT_ARCH_SKIP_REFERENCE_REMOVED";
const LOG_PATH = join(ARCH_DIR, "reference-removed.log");
const STASH_NAME = ".copilotkit-ref-stash";

function tail(text: string, lines: number): string {
  const all = text.split("\n");
  const slice = all.slice(-lines);
  return slice.length === all.length ? text : `(last ${slice.length} of ${all.length} lines)\n` + slice.join("\n");
}

async function runSuite(cwd: string, args: string[], env: Record<string, string | undefined>): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const exitCode = await proc.exited;
  return { exitCode, output: `${stdout}${stderr}` };
}

if (process.env[SKIP_ENV] === "1") {
  // Inner invocation of this same suite while the reference is already removed.
  test.skip(`${SKIP_ENV}=1: reference-removed check skipped (inner run of the same suite)`, () => {});
} else {
  describe("Phase 13 §11: the reconstruction works with the reference checkout removed", () => {
    test(
      "journey suite and architecture suite stay green with .tmp/ref/copilotkit renamed away; the checkout is restored afterwards",
      async () => {
        const ref = referenceCheckout();
        const stashPath = join(dirname(ref.clonePath), STASH_NAME);

        // Self-heal: a previous run killed before its finally could restore leaves the stash behind.
        if (existsSync(stashPath)) {
          if (!existsSync(ref.clonePath)) {
            renameSync(stashPath, ref.clonePath);
            appendFileSync(LOG_PATH, `[self-heal] recovered leftover stash ${rel(stashPath)} -> ${rel(ref.clonePath)}\n`);
          } else {
            throw new Error(`unexpected leftover stash ${rel(stashPath)} while the reference is present — resolve manually`);
          }
        }

        expect(existsSync(ref.clonePath)).toBe(true); // present to begin with — removal must change something
        let renamed = false;
        const emergencyRestore = (): void => {
          if (renamed && existsSync(stashPath) && !existsSync(ref.clonePath)) {
            renameSync(stashPath, ref.clonePath);
            renamed = false;
          }
        };
        process.on("exit", emergencyRestore);
        for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
          process.on(signal, () => {
            emergencyRestore();
            process.exit(1);
          });
        }

        let log = `\n=== reference-removed run ===\nstarted: ${new Date().toISOString()}\nstash: ${rel(ref.clonePath)} -> ${rel(stashPath)}\n`;
        try {
          renameSync(ref.clonePath, stashPath);
          renamed = true;
          expect(existsSync(ref.clonePath)).toBe(false); // the rename actually happened
          expect(existsSync(stashPath)).toBe(true);

          const entries: { label: string; cwd: string; args: string[]; env: Record<string, string | undefined> }[] = [
            { label: "journey suite", cwd: APP, args: ["test", "test"], env: { ...process.env } },
            { label: "architecture suite (excluding this check)", cwd: REC, args: ["test", "tests/architecture/"], env: { ...process.env, [SKIP_ENV]: "1" } },
          ];

          for (const entry of entries) {
            const command = `cd ${rel(entry.cwd)} && bun test ${entry.args.slice(1).join(" ")}`;
            let result = await runSuite(entry.cwd, entry.args, entry.env);
            if (result.exitCode !== 0) {
              // One clean retry under unrelated concurrent load; both runs are recorded.
              const first = result;
              log += `[retry] ${command} exited ${first.exitCode}; re-running once cleanly\n`;
              result = await runSuite(entry.cwd, entry.args, entry.env);
              result.output = `--- first attempt (exit ${first.exitCode}) ---\n${tail(first.output, 40)}\n--- retry (exit ${result.exitCode}) ---\n${result.output}`;
            }
            log += `command: ${command}\nexit code: ${result.exitCode}\noutput tail:\n${tail(result.output, 60)}\n`;
            expect(result.exitCode).toBe(0);
          }
        } finally {
          emergencyRestore();
          process.off("exit", emergencyRestore);
          log += `reference restored: ${rel(ref.clonePath)} exists=${existsSync(ref.clonePath)}\nfinished: ${new Date().toISOString()}\n`;
          try {
            appendFileSync(LOG_PATH, log); // evidence lands even when a child suite fails
          } catch {
            // never let logging mask the restore
          }
        }

        // The restore is asserted, not assumed.
        expect(existsSync(ref.clonePath)).toBe(true);
        expect(existsSync(stashPath)).toBe(false);
      },
      300_000,
    );
  });
}
