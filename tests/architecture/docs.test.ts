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

test("docs never describe an implemented requirement as candidate, in progress, or unimplemented", () => {
  const ledger = Bun.YAML.parse(readFileSync("requirements/ledger.yaml", "utf8")) as { requirements: { id: string; status: string }[] };
  const status = new Map(ledger.requirements.map((r) => [r.id, r.status]));
  const stale: string[] = [];
  for (const page of pages) {
    readFileSync(`docs/${page}.md`, "utf8").split("\n").forEach((line, index) => {
      // Status phrasing only ("candidate" also names candidate providers in selection docs).
      if (!/`candidate`|\bcandidate\s*[—)–-]|status:?\s*`?candidate|in progress|not implemented|currently throws|unimplemented/i.test(line)) return;
      for (const [id] of line.matchAll(/\b(?:AK|CG)-[A-Z]*-?\d{3}\b/g)) if (status.get(id) === "implemented") stale.push(`docs/${page}.md:${index + 1} ${id}`);
      const range = /\b(CG-[A-Z]+)-(\d{3})\.\.(\d{3})\b/.exec(line);
      if (range) for (let n = Number(range[2]); n <= Number(range[3]); n++) { const id = `${range[1]}-${String(n).padStart(3, "0")}`; if (status.get(id) === "implemented") stale.push(`docs/${page}.md:${index + 1} ${id}`); }
    });
  }
  expect(stale).toEqual([]);
});
