#!/usr/bin/env node
// check-parity-report.mjs — validity checker for the CopilotKit reconstruction parity report.
//
// Loads parity-report.json next to this file and asserts:
//   1. it parses as JSON;
//   2. EVERY cited artifact path (reference.manifest, every matrixRows[].referenceEvidence /
//      cognateEvidence entry, every gates[].evidence entry, every followUps[].evidence entry)
//      exists on disk (files or directories), resolved against the repository root;
//   3. all 32 settlement gates (ids 1..32) are present exactly once, each with a status of
//      "pass", "pass-with-recorded-gap" or "open";
//   4. every "pass" gate's check.command is non-empty (this checker also enforces non-empty
//      for "pass-with-recorded-gap"; only "open" gates may omit a check);
//   5. the 14 P0/P1 matrix rows R-A01..R-A14 are present with known priorities and statuses,
//      and the completion standard answers q1..q3 with "yes"/"no".
//
// Usage (from anywhere):
//   node validation/reconstructions/copilot/check-parity-report.mjs
// Exits 0 when every assertion holds; exits 1 printing each failure.
import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reportPath = join(here, "parity-report.json");
const repoRoot = resolve(here, "..", "..", "..");

const failures = [];
const notes = [];
function fail(message) {
  failures.push(message);
}
function check(condition, message) {
  if (!condition) fail(message);
  return condition;
}

// 1. Parse.
let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
  notes.push(`parsed ${reportPath}`);
} catch (error) {
  console.error(`FAIL: parity-report.json does not parse: ${error.message}`);
  process.exit(1);
}

const KNOWN_STATUS = new Set(["pass", "pass-with-recorded-gap", "open"]);
const KNOWN_ROW_STATUS = new Set(["pass", "pass-with-recorded-gap", "open", "fail"]);
const KNOWN_PRIORITY = new Set(["P0", "P1", "P2"]);

// 2. Every cited path exists.
function citedPaths() {
  const paths = [];
  if (report.reference?.manifest) paths.push(["reference.manifest", report.reference.manifest]);
  for (const row of report.matrixRows ?? []) {
    for (const p of row.referenceEvidence ?? []) paths.push([`matrixRows[${row.id}].referenceEvidence`, p]);
    for (const p of row.cognateEvidence ?? []) paths.push([`matrixRows[${row.id}].cognateEvidence`, p]);
  }
  for (const gate of report.gates ?? []) {
    for (const p of gate.evidence ?? []) paths.push([`gates[${gate.id}].evidence`, p]);
  }
  for (const item of report.followUps ?? []) {
    for (const p of item.evidence ?? []) paths.push([`followUps[${item.id}].evidence`, p]);
  }
  return paths;
}
const paths = citedPaths();
check(paths.length > 0, "no cited artifact paths found in the report");
let missing = 0;
for (const [where, p] of paths) {
  if (typeof p !== "string" || p.length === 0) {
    fail(`${where}: empty path citation`);
    missing += 1;
    continue;
  }
  const absolute = resolve(repoRoot, p);
  if (!existsSync(absolute)) {
    fail(`${where}: cited path does not exist: ${p}`);
    missing += 1;
    continue;
  }
  if (!statSync(absolute).isFile() && !statSync(absolute).isDirectory()) {
    fail(`${where}: cited path is neither file nor directory: ${p}`);
    missing += 1;
  }
}
notes.push(`checked ${paths.length} cited artifact paths against the repository root (${repoRoot})`);

// 3. All 32 gates present with a status.
const gates = report.gates ?? [];
const byId = new Map();
for (const gate of gates) {
  if (byId.has(gate.id)) fail(`duplicate gate id ${gate.id}`);
  byId.set(gate.id, gate);
}
for (let id = 1; id <= 32; id += 1) {
  const gate = byId.get(id);
  if (!check(gate !== undefined, `gate ${id} is missing`)) continue;
  check(KNOWN_STATUS.has(gate.status), `gate ${id} has unknown status ${JSON.stringify(gate.status)}`);
}
check(gates.length === 32, `expected 32 gates, found ${gates.length}`);

// 4. Executable checks behind non-open gates.
for (let id = 1; id <= 32; id += 1) {
  const gate = byId.get(id);
  if (!gate || gate.status === "open") continue;
  const command = gate.check?.command;
  check(typeof command === "string" && command.trim().length > 0, `gate ${id} (${gate.status}) has an empty check.command`);
  check(typeof gate.check?.observed === "string" && gate.check.observed.trim().length > 0, `gate ${id} (${gate.status}) has an empty check.observed`);
}

// 5. Matrix rows and completion standard.
const rows = report.matrixRows ?? [];
check(rows.length === 14, `expected 14 matrix rows (R-A01..R-A14), found ${rows.length}`);
for (let i = 1; i <= 14; i += 1) {
  const id = `R-A${String(i).padStart(2, "0")}`;
  const row = rows.find((r) => r.id === id);
  if (!check(row !== undefined, `matrix row ${id} is missing`)) continue;
  check(KNOWN_PRIORITY.has(row.priority), `matrix row ${id} has unknown priority ${JSON.stringify(row.priority)}`);
  check(KNOWN_ROW_STATUS.has(row.status), `matrix row ${id} has unknown status ${JSON.stringify(row.status)}`);
  check(typeof row.evidenceClass === "string" && row.evidenceClass.length > 0, `matrix row ${id} has no evidenceClass`);
  check(Array.isArray(row.testId) || (typeof row.testId === "string" && row.testId.length > 0), `matrix row ${id} has no testId`);
}
const completion = report.completionStandard ?? {};
for (const key of ["q1", "q2", "q3"]) {
  const answer = completion[key]?.answer;
  check(answer === "yes" || answer === "no", `completionStandard.${key} must answer "yes" or "no", found ${JSON.stringify(answer)}`);
  check(Array.isArray(completion[key]?.basis) && completion[key].basis.length > 0, `completionStandard.${key} has no basis`);
}

// Open deviations must carry D1..D13 by reference.
const deviationIds = new Set((report.openDeviations ?? []).map((d) => d.id));
for (let i = 1; i <= 13; i += 1) {
  check(deviationIds.has(`D${i}`), `openDeviations is missing D${i}`);
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} problem(s) in parity-report.json:`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
for (const note of notes) console.log(`ok: ${note}`);
console.log("ok: parity-report.json is valid (parses; all cited paths exist; 32 gates present with statuses; executable checks behind every non-open gate; 14 matrix rows; completion standard answered)");
process.exit(0);
