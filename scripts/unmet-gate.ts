import { readFileSync } from "node:fs";

const id = process.argv[2];
const ledger = Bun.YAML.parse(readFileSync("requirements/ledger.yaml", "utf8")) as {
  requirements: { id: string; title: string }[];
  acceptance_contracts: { requirement: string; expected: string }[];
};
const requirement = ledger.requirements.find((entry) => entry.id === id);
if (!requirement) {
  console.error(`Unknown requirement: ${id ?? "<none>"}`);
  process.exit(2);
}
console.error(`${id}: unmet Phase 0 gate — ${requirement.title}`);
for (const contract of ledger.acceptance_contracts.filter((entry) => entry.requirement === id)) {
  console.error(`Expected: ${contract.expected}`);
}
console.error("Add a real compatibility fixture, run it, and record its observed result before replacing this gate.");
process.exit(1);
