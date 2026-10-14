// Runs one requirement's proof gate from requirements/ledger.yaml, or every gate with --all.
// A gate whose proof paths do not exist yet is an unmet gate (exit 1), never a skip.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Gate {
  cwd: string;
  run: string;
  proof_paths: string[];
}
interface Requirement {
  id: string;
  title: string;
  status: string;
  gate: Gate;
  debt?: string;
}
interface Ledger {
  requirements: Requirement[];
  acceptance_contracts: { requirement: string; expected: string }[];
}

const ledger = Bun.YAML.parse(readFileSync(process.env.COGNATE_LEDGER ?? "requirements/ledger.yaml", "utf8")) as Ledger;

async function runGate(requirement: Requirement, quiet: boolean): Promise<{ exit: number; reason: string }> {
  const missing = requirement.gate.proof_paths.filter((path) => !existsSync(join(requirement.gate.cwd, path)));
  if (missing.length) {
    if (!quiet) {
      console.error(`${requirement.id}: unmet gate — ${requirement.title}`);
      for (const contract of ledger.acceptance_contracts.filter((entry) => entry.requirement === requirement.id)) {
        console.error(`Expected: ${contract.expected}`);
      }
      console.error(`Missing proof: ${missing.join(", ")}`);
    }
    return { exit: 1, reason: `missing ${missing.join(", ")}` };
  }
  const proc = Bun.spawn(["sh", "-c", requirement.gate.run], {
    cwd: requirement.gate.cwd,
    stdout: quiet ? "pipe" : "inherit",
    stderr: quiet ? "pipe" : "inherit",
  });
  // Drain both pipes while the process runs, and retain diagnostics on failure. Whole-ledger
  // CI otherwise reports only "status drift", concealing the failing assertion or fixture.
  const [exit, stdout, stderr] = await Promise.all([
    proc.exited,
    quiet ? new Response(proc.stdout).text() : Promise.resolve(""),
    quiet ? new Response(proc.stderr).text() : Promise.resolve(""),
  ]);
  if (quiet && exit !== 0) {
    console.error(`${requirement.id}: proof command failed (last 16,384 characters per stream)`);
    if (stdout) console.error(stdout.slice(-16_384));
    if (stderr) console.error(stderr.slice(-16_384));
  }
  return { exit, reason: exit === 0 ? "passed" : `exit ${exit}` };
}

const arg = process.argv[2];
/**
 * Whole-ledger runs share SQLite files, temp dirs, and ports; two at once produce spurious drift (audit F-06).
 * Take an exclusive lock; a lock held by a dead process is stale and taken over.
 */
function acquireLock(): () => void {
  const path = ".tmp/gates.lock";
  mkdirSync(".tmp", { recursive: true });
  for (;;) {
    try {
      writeFileSync(path, String(process.pid), { flag: "wx" });
      return () => rmSync(path, { force: true });
    } catch {
      const holder = Number(readFileSync(path, "utf8"));
      let alive = false;
      try {
        process.kill(holder, 0);
        alive = true;
      } catch {}
      if (alive) {
        console.error(`another gate run is in progress (pid ${holder}); run just verify / just gates sequentially`);
        process.exit(3);
      }
      rmSync(path, { force: true });
    }
  }
}

if (arg === "--all" || arg === "--implemented") {
  const release = acquireLock();
  process.on("exit", release);
  // --implemented is the regression mode: every requirement claimed implemented must still pass.
  const selected = arg === "--all" ? ledger.requirements : ledger.requirements.filter((entry) => entry.status === "implemented");
  let failures = 0;
  for (const requirement of selected) {
    const { exit, reason } = await runGate(requirement, true);
    const verdict = exit === 0 ? "PASS" : "FAIL";
    if (exit !== 0) failures++;
    // Drift: a passing gate still marked candidate, or a failing gate marked implemented.
    // A blocked requirement may pass its gate: the characterization proves why it is blocked.
    const drift =
      (exit === 0 && requirement.status === "candidate") || (exit !== 0 && requirement.status === "implemented")
        ? "  <-- status drift"
        : "";
    console.log(`${verdict}  ${requirement.id.padEnd(12)} [${requirement.status}] ${reason}${drift}`);
  }
  console.log(`${selected.length - failures}/${selected.length} gates pass`);
  process.exit(failures ? 1 : 0);
}
const requirement = ledger.requirements.find((entry) => entry.id === arg);
if (!requirement) {
  console.error(`Unknown requirement: ${arg ?? "<none>"}`);
  process.exit(2);
}
const { exit } = await runGate(requirement, false);
process.exit(exit);
