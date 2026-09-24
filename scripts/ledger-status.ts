// Set a requirement's status in requirements/ledger.yaml in place, preserving formatting.
// Usage: bun scripts/ledger-status.ts <ID> <candidate|implemented|blocked> [--evidence <path>] [--debt <DEBT-NNN[,..]>]
import { readFileSync, writeFileSync } from "node:fs";

const [id, status, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};
if (!id || !status || !["candidate", "implemented", "blocked"].includes(status)) {
  console.error("usage: ledger-status.ts <ID> <candidate|implemented|blocked> [--evidence path] [--debt DEBT-NNN]");
  process.exit(2);
}
const path = "requirements/ledger.yaml";
const lines = readFileSync(path, "utf8").split("\n");
const start = lines.findIndex((line) => line === `  - id: ${id}`);
if (start < 0) {
  console.error(`Unknown requirement ${id}`);
  process.exit(2);
}
let end = start + 1;
while (end < lines.length && lines[end]!.startsWith("    ")) end++;
const body = lines.slice(start + 1, end).filter((line) => !/^    (status|evidence|debt): /.test(line));
body.push(`    status: ${status}`);
const evidence = flag("--evidence");
const debt = flag("--debt");
if (evidence) body.push(`    evidence: ${evidence}`);
if (debt) body.push(`    debt: ${debt}`);
lines.splice(start + 1, end - start - 1, ...body);
writeFileSync(path, lines.join("\n"));
console.log(`${id} → ${status}${evidence ? ` (evidence ${evidence})` : ""}${debt ? ` (debt ${debt})` : ""}`);
