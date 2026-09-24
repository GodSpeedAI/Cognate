// CG-DOC-001 (spec §37 Phase 10; README "Agent-Friendly by Design"): documentation map and per-package guidance exist and link correctly.
import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const pages = ["getting-started", "concepts", "architecture", "semantics", "cognition", "rvf", "evidence", "ui", "protocols", "extensions", "security"];

test("every page in the README documentation map exists", () => {
  const readme = readFileSync("README.md", "utf8");
  for (const page of pages) {
    expect(readme).toContain(`docs/${page}.md`);
    expect(existsSync(`docs/${page}.md`)).toBe(true);
  }
});

test("every package and profile has README.md and AGENTS.md", () => {
  const missing: string[] = [];
  for (const base of ["packages", "profiles"]) for (const dir of readdirSync(base)) for (const file of ["README.md", "AGENTS.md"]) if (!existsSync(join(base, dir, file))) missing.push(join(base, dir, file));
  expect(missing).toEqual([]);
});

test("relative markdown links in README, docs, and package guides resolve", () => {
  const files = ["README.md", "AGENTS.md", ...pages.map((p) => `docs/${p}.md`), ...["packages", "profiles"].flatMap((b) => readdirSync(b).flatMap((d) => ["README.md", "AGENTS.md"].map((f) => join(b, d, f))))].filter(existsSync);
  const broken: string[] = [];
  for (const file of files) {
    for (const [, target] of readFileSync(file, "utf8").matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(target!)) continue;
      if (!existsSync(resolve(dirname(file), target!))) broken.push(`${file} → ${target}`);
    }
  }
  expect(broken).toEqual([]);
});
