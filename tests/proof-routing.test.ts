import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cognate-gate-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const ledger = join(dir, "ledger.yaml");
writeFileSync(
  ledger,
  `requirements:
  - {id: T-MISSING, title: missing proof, status: candidate, gate: {cwd: ., run: 'true', proof_paths: [does/not/exist.test.ts]}}
  - {id: T-PASS, title: passing proof, status: implemented, gate: {cwd: ., run: 'true', proof_paths: [package.json]}}
  - {id: T-FAIL, title: failing proof, status: candidate, gate: {cwd: ., run: 'echo gate-failure-evidence >&2; exit 1', proof_paths: [package.json]}}
acceptance_contracts:
  - {requirement: T-MISSING, expected: proof exists}
`,
);

async function gate(arg: string) {
  const proc = Bun.spawn(["bun", "scripts/gate.ts", arg], { stdout: "pipe", stderr: "pipe", env: { ...process.env, COGNATE_LEDGER: ledger } });
  const [exit, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { exit, stdout, stderr };
}

test("a gate whose proof does not exist fails explicitly instead of skipping", async () => {
  const { exit, stderr } = await gate("T-MISSING");
  expect(exit).toBe(1);
  expect(stderr).toContain("T-MISSING: unmet gate");
  expect(stderr).toContain("Expected: proof exists");
});

test("a gate propagates its proof command's exit code", async () => {
  expect((await gate("T-PASS")).exit).toBe(0);
  expect((await gate("T-FAIL")).exit).not.toBe(0);
});

test("--all reports every gate and fails while any is unmet", async () => {
  const { exit, stdout, stderr } = await gate("--all");
  expect(exit).toBe(1);
  expect(stdout).toContain("FAIL  T-MISSING");
  expect(stdout).toContain("PASS  T-PASS");
  expect(stdout).toContain("1/3 gates pass");
  expect(stderr).toContain("gate-failure-evidence");
});

test("an unknown requirement id is rejected", async () => {
  const { exit, stderr } = await gate("NOPE-1");
  expect(exit).toBe(2);
  expect(stderr).toContain("Unknown requirement");
});

test("concurrent whole-ledger runs are refused instead of corrupting each other (audit F-06)", async () => {
  const { mkdirSync, writeFileSync: write, rmSync: rm } = await import("node:fs");
  mkdirSync(".tmp", { recursive: true });
  write(".tmp/gates.lock", String(process.pid)); // a live pid holds the lock
  try {
    const { exit, stderr } = await gate("--all");
    expect(exit).toBe(3);
    expect(stderr).toContain("another gate run is in progress");
  } finally {
    rm(".tmp/gates.lock", { force: true });
  }
  write(".tmp/gates.lock", "999999999"); // a dead pid is a stale lock and is taken over
  expect((await gate("--all")).exit).toBe(1);
  expect(await Bun.file(".tmp/gates.lock").exists()).toBe(false);
});
