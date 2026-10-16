#!/usr/bin/env node
// Inspects packed npm tarballs the way a consumer would receive them:
// extracts each .tgz and asserts public metadata, shipped files, and that no
// Bun workspace protocol range survived publication (npm CLI does not rewrite
// `workspace:` — scripts/prepare-npm-package.mjs must have run before pack).
//
// Usage: node scripts/inspect-npm-tarballs.mjs <pkg.tgz> [<pkg.tgz> ...]
// Exits non-zero and prints one line per problem.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tarballs = process.argv.slice(2);
if (tarballs.length === 0) {
  console.error("usage: node scripts/inspect-npm-tarballs.mjs <pkg.tgz> [...]");
  process.exit(1);
}

let failed = false;
for (const tgz of tarballs) {
  const name = tgz.split("/").pop();
  const tmp = mkdtempSync(join(tmpdir(), "cognate-tarball-"));
  try {
    execFileSync("tar", ["-xzf", tgz, "-C", tmp]);
    const manifestPath = join(tmp, "package", "package.json");
    const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
    const problems = [];
    if (pkg.private) problems.push("private:true");
    if (pkg.license !== "Apache-2.0") problems.push("license missing/not Apache-2.0");
    if (!pkg.description) problems.push("description missing");
    if (!pkg.repository?.url?.includes("github.com/GodSpeedAI/Cognate")) problems.push("repository.url not the Cognate repo");
    // Most packages ship only src/; the CLI also ships the starter templates that `cognate create` copies.
    const shipsTemplates = pkg.files?.join(",") === "src,templates";
    if (!pkg.files || (pkg.files.join(",") !== "src" && !shipsTemplates)) problems.push(`files field is ${JSON.stringify(pkg.files)}, expected ["src"] or ["src","templates"]`);
    if (shipsTemplates && !existsSync(join(tmp, "package", "templates", "starter", "common", "_gitignore"))) problems.push("templates/starter not shipped");
    if (!existsSync(join(tmp, "package", "LICENSE"))) problems.push("LICENSE not shipped");
    if (!existsSync(join(tmp, "package", "README.md"))) problems.push("README not shipped");
    if (!existsSync(join(tmp, "package", "src"))) problems.push("src/ not shipped");
    for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [dep, range] of Object.entries(pkg[section] ?? {})) {
        if (String(range).startsWith("workspace:")) problems.push(`${section}.${dep} still "${range}"`);
      }
    }
    if (problems.length) {
      failed = true;
      console.error(`${name}: ${problems.join("; ")}`);
    } else {
      console.log(`${name}: OK (${pkg.name}@${pkg.version})`);
    }
  } catch (error) {
    failed = true;
    console.error(`${name}: inspection failed — ${error.message}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
