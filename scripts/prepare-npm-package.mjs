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

import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/prepare-npm-package.mjs <package-dir>");
  process.exit(1);
}

const path = `${dir}/package.json`;
const pkg = JSON.parse(readFileSync(path, "utf8"));
let resolved = 0;

// @godspeedai/cognate-cli ships the starter template so registry-mode `cognate create` works without a checkout.
// templates/starter stays at the repo root (single source of truth); this copies it into the package working copy,
// which is git-ignored (packages/cli/.gitignore) and never committed.
if (pkg.name === "@godspeedai/cognate-cli") {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const from = join(repoRoot, "templates", "starter");
  const to = join(dir, "templates", "starter");
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  // npm never publishes .gitignore files, so the packaged copy stores it as _gitignore; `cognate create` restores the dot name.
  const dotGitignore = join(to, "common", ".gitignore");
  if (existsSync(dotGitignore)) renameSync(dotGitignore, join(to, "common", "_gitignore"));
  console.log(`${pkg.name}: copied templates/starter into ${to}`);
}

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
