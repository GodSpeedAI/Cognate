#!/usr/bin/env node
// Mechanical documentation gate for every published package README.
// See docs/package-readme-standard.md. Exits non-zero, printing one line per problem.

import { readFileSync, existsSync } from "node:fs";
import { readdirSync } from "node:fs";

const root = process.cwd();
const dirs = [
  ...readdirSync(`${root}/packages`).map((d) => `packages/${d}`),
  ...readdirSync(`${root}/profiles`).map((d) => `profiles/${d}`),
];

const packageNames = new Set();
const packages = [];
for (const dir of dirs) {
  const manifestPath = `${root}/${dir}/package.json`;
  if (!existsSync(manifestPath)) continue;
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!pkg.name?.startsWith("@godspeedai/")) continue;
  packages.push({ dir, ...pkg });
  packageNames.add(pkg.name);
}

const problems = [];
let checked = 0;

for (const pkg of packages) {
  checked++;
  const readmePath = `${root}/${pkg.dir}/README.md`;
  if (!existsSync(readmePath)) {
    problems.push(`${pkg.dir}: README.md missing`);
    continue;
  }
  const md = readFileSync(readmePath, "utf8");
  const rel = (line) => `${pkg.dir}/README.md: ${line}`;

  // H1 must equal the npm package name.
  const h1 = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1 !== pkg.name) problems.push(rel(`H1 is ${JSON.stringify(h1)}, expected ${JSON.stringify(pkg.name)}`));

  // Internal identifiers and stale publication claims.
  const banned = [
    [/\bDEBT-\d{3}\b/, "internal debt identifier (DEBT-###)"],
    [/\bCG-[A-Z]{3}-\d{3}\b/, "internal requirement id (CG-XXX-###)"],
    [/spec\s+§/i, "internal spec reference (spec §)"],
    [/not\s+(?:yet\s+)?published/i, "stale 'not published' claim"],
    [/not\s+yet\s+on\s+npm/i, "stale 'not yet on npm' claim"],
    [/\bunreleased\b/i, "stale 'unreleased' claim"],
  ];
  for (const [re, why] of banned) {
    const match = md.match(re);
    if (match) problems.push(rel(`contains ${why}: ${JSON.stringify(match[0])}`));
  }

  // Relative links must resolve to files that ship in the tarball.
  for (const [, target] of md.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
    const clean = target.split("#")[0];
    if (!clean) continue;
    if (!existsSync(`${root}/${pkg.dir}/${clean}`)) {
      problems.push(rel(`relative link target does not ship in the package: ${target}`));
    }
  }

  // @godspeedai package names in install/execute commands must exist.
  for (const [, command] of md.matchAll(/(?:bun add|npm install|bunx|npm exec)\s+([^\n`]+)/g)) {
    for (const match of command.matchAll(/@godspeedai\/[a-z0-9.-]+/g)) {
      const name = match[0];
      if (!packageNames.has(name)) problems.push(rel(`command references unknown package ${name}`));
    }
  }

  // License statement.
  if (!/Apache-2\.0/i.test(md)) problems.push(rel("does not state the Apache-2.0 license"));
}

console.log(`check-readmes: ${checked} published packages checked`);
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("check-readmes: OK");
