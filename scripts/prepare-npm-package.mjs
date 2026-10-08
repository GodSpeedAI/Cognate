#!/usr/bin/env node
// Resolves Bun workspace dependency ranges into registry-resolvable semver
// ranges inside one package's manifest, immediately before `npm publish`.
//
// npm CLI does not rewrite `workspace:` protocol ranges at publish time
// (unlike pnpm/Yarn/bun publish), and trusted publishing (OIDC) requires the
// npm CLI — so this script performs the rewrite instead, the same way
// pnpm's publisher does: every `workspace:*`, `workspace:^` and `workspace:~`
// range on an internal dependency becomes `^<this package's version>`.
// Coordinated Release Please releases keep all internal versions aligned.
//
// devDependencies are not touched: npm strips them from the published
// manifest. The rewrite mutates the working copy only; CI runners are
// ephemeral, and local runs should `git checkout -- <dir>/package.json`.

import { readFileSync, writeFileSync } from "node:fs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/prepare-npm-package.mjs <package-dir>");
  process.exit(1);
}

const path = `${dir}/package.json`;
const pkg = JSON.parse(readFileSync(path, "utf8"));
let resolved = 0;

for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  const deps = pkg[section];
  if (!deps) continue;
  for (const [name, range] of Object.entries(deps)) {
    if (range === "workspace:*" || range === "workspace:^" || range === "workspace:~") {
      deps[name] = `^${pkg.version}`;
      resolved++;
    }
  }
}

writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log(`${pkg.name}@${pkg.version}: ${resolved} workspace range(s) resolved to ^${pkg.version}`);
