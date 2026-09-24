import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const specPath = ".agents/specs/software-design-spec-cognate.-frameworkmd";
const ledgerPath = "requirements/ledger.yaml";
const debtPath = ".agents/DEBT.md";
const spec = readFileSync(specPath);
const digest = `sha256:${createHash("sha256").update(spec).digest("hex")}`;
const ledger = Bun.YAML.parse(readFileSync(ledgerPath, "utf8")) as {
  ledger_version: number;
  freeze_hash: string;
  requirements: {
    id: string;
    title: string;
    source: { file: string; section: string; digest: string };
    acceptance: string[];
    gate: { cwd: string; run: string; proof_paths: string[] };
    dependencies: string[];
    status: string;
    evidence?: string;
    debt?: string;
  }[];
  acceptance_contracts: { id: string; requirement: string; expected: string }[];
};
const errors: string[] = [];
if (ledger.ledger_version !== 2 || ledger.freeze_hash !== "candidate") errors.push("Expected a version 2 candidate ledger");
for (const path of ["AGENTS.md", ".agents/AGENTS.md", ".agents/CURRENT_STATUS.yaml", ".agents/CURRENT_STATUS.md", ".agents/OPEN_QUESTIONS.md", debtPath, ".agents/plans/implementation.md", "package.json", "scripts/gate.ts"]) {
  if (!existsSync(path)) errors.push(`Missing substrate file: ${path}`);
}
if (existsSync(".agents/CURRENT_STATUS.yaml") && existsSync(".agents/CURRENT_STATUS.md")) {
  const statusText = readFileSync(".agents/CURRENT_STATUS.yaml", "utf8");
  const lines = statusText.trimEnd().split("\n");
  const human = readFileSync(".agents/CURRENT_STATUS.md", "utf8");
  if (!statusText.endsWith("\n") || lines.length % 2 !== 0) errors.push("Status history must contain complete two-line documents and end with a newline");
  let previousRevision = 0;
  for (let index = 0; index + 1 < lines.length; index += 2) {
    if (lines[index] !== "---") errors.push(`Status document ${index / 2 + 1}: missing separator`);
    try {
      const snapshot = JSON.parse(lines[index + 1] ?? "") as Record<string, unknown>;
      const required = ["revision", "recorded_at", "stage", "summary", "verified", "limits", "next", "evidence", "spec", "ledger"];
      for (const field of required) if (!(field in snapshot)) errors.push(`Status document ${index / 2 + 1}: missing ${field}`);
      if (typeof snapshot.revision !== "number" || !Number.isInteger(snapshot.revision) || snapshot.revision <= previousRevision) errors.push(`Status document ${index / 2 + 1}: revision must increase`);
      if (typeof snapshot.revision === "number") previousRevision = snapshot.revision;
      if (typeof snapshot.recorded_at !== "string" || Number.isNaN(Date.parse(snapshot.recorded_at))) errors.push(`Status document ${index / 2 + 1}: invalid recorded_at`);
      for (const field of ["verified", "limits", "evidence"]) if (!Array.isArray(snapshot[field])) errors.push(`Status document ${index / 2 + 1}: ${field} must be a list`);
      for (const field of ["stage", "summary", "next", "spec", "ledger"]) if (typeof snapshot[field] !== "string" || !snapshot[field]) errors.push(`Status document ${index / 2 + 1}: ${field} must be text`);
      if (index + 2 === lines.length) {
        if (!human.includes(`**Status revision:** ${snapshot.revision}`) || !human.includes(`**Summary:** ${snapshot.summary}`)) errors.push("Human status view does not match the latest YAML snapshot");
      }
    } catch {
      errors.push(`Status document ${index / 2 + 1}: invalid one-line JSON-compatible YAML`);
    }
  }
}
const debtIds = new Set(existsSync(debtPath) ? [...readFileSync(debtPath, "utf8").matchAll(/^## (DEBT-\d{3})\b/gm)].map((m) => m[1]) : []);
const ids = new Set(ledger.requirements.map((entry) => entry.id));
const contracts = new Set(ledger.acceptance_contracts.map((entry) => entry.id));
if (ids.size !== ledger.requirements.length) errors.push("Duplicate requirement ID");
if (contracts.size !== ledger.acceptance_contracts.length) errors.push("Duplicate acceptance ID");
for (const entry of ledger.requirements) {
  if (entry.source.file !== specPath || entry.source.digest !== digest || !entry.source.section) errors.push(`${entry.id}: source identity mismatch`);
  if (!["candidate", "implemented", "blocked"].includes(entry.status)) errors.push(`${entry.id}: unknown status ${entry.status}`);
  if (entry.status === "implemented" && (!entry.evidence || !existsSync(entry.evidence))) errors.push(`${entry.id}: implemented without an existing evidence record`);
  if (entry.status === "blocked" && (!entry.debt || !debtIds.has(entry.debt))) errors.push(`${entry.id}: blocked without a DEBT.md entry`);
  if (!entry.acceptance.length) errors.push(`${entry.id}: missing acceptance`);
  if (!entry.gate?.run || !entry.gate.proof_paths?.length) errors.push(`${entry.id}: missing gate`);
  if (entry.status === "implemented") {
    for (const path of entry.gate.proof_paths) if (!existsSync(join(entry.gate.cwd, path))) errors.push(`${entry.id}: implemented but proof ${path} is missing`);
  }
  for (const dependency of entry.dependencies) if (!ids.has(dependency)) errors.push(`${entry.id}: unknown dependency ${dependency}`);
  for (const contract of entry.acceptance) if (!contracts.has(contract)) errors.push(`${entry.id}: unknown acceptance ${contract}`);
}
for (const contract of ledger.acceptance_contracts) {
  if (!ids.has(contract.requirement)) errors.push(`${contract.id}: unknown requirement`);
  if (!ledger.requirements.find((entry) => entry.id === contract.requirement)?.acceptance.includes(contract.id)) errors.push(`${contract.id}: not bound by requirement`);
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
const count = (status: string) => ledger.requirements.filter((entry) => entry.status === status).length;
console.log(`Substrate check passed: ${ledger.requirements.length} requirements (${count("implemented")} implemented, ${count("blocked")} blocked, ${count("candidate")} candidate); no freeze claimed.`);
