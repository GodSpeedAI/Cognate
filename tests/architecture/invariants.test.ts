// CG-ARC-003 (spec §3.1, §3.2, §3.3, §3.7, §23): structural invariants that keep upstream projects independent.
import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadGraph } from "./graph.ts";

const nodes = loadGraph();
const manifests = [
  "package.json",
  "tests/e2e/package.json",
  ...["packages", "profiles"].flatMap((b) => readdirSync(b).map((d) => join(b, d, "package.json")).filter(existsSync)),
].map((path) => ({ path, json: JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, string> | undefined> }));

function files(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path, pattern) : pattern.test(entry) ? [path] : [];
  });
}

test("§23: RxJS is required by no package (streaming uses AsyncIterable / ReadableStream)", () => {
  for (const node of nodes) expect([...node.imports, ...node.declared].filter((d) => d === "rxjs" || d.startsWith("rxjs/"))).toEqual([]);
});

test("§3.1: the repository defines no .sea grammar or grammar extension", () => {
  const grammarFiles = [...files("packages", /\.(pest|g4|grammar|tmLanguage\.json)$|^grammar\.(js|json)$/), ...files("profiles", /\.(pest|g4)$/)];
  expect(grammarFiles).toEqual([]);
});

test("§3.2/§3.3: DomainForge and RealityTrace are consumed as pinned releases or an external CLI, never as source or path dependencies", () => {
  const offenders: string[] = [];
  for (const { path, json } of manifests) {
    for (const section of ["dependencies", "devDependencies", "optionalDependencies", "overrides"]) {
      for (const [name, spec] of Object.entries(json[section] ?? {})) {
        if (/domainforge|realitytrace|sxr/i.test(name) && !name.startsWith("@cognate/") && !/^\d+\.\d+\.\d+$/.test(spec)) offenders.push(`${path} ${name}@${spec}`);
        if (/^(file|link):/.test(spec) && /domainforge|realitytrace|sxr/i.test(spec)) offenders.push(`${path} ${name}@${spec}`);
      }
    }
  }
  expect(offenders).toEqual([]);
  expect(readFileSync("justfile", "utf8")).toMatch(/--tag realitytrace-v\d+\.\d+\.\d+/);
});

test("§3.7: the canonical proto schema defines framework concepts only, never domain ontology", () => {
  const proto = files("proto", /\.proto$/).map((f) => readFileSync(f, "utf8")).join("\n");
  const messages = [...proto.matchAll(/^\s*message\s+(\w+)/gm)].map((m) => m[1]!);
  expect(messages.length).toBeGreaterThan(10);
  // DomainForge kinds as whole message names, and example domain vocabulary anywhere (PolicyDecision is Cognate's own authorization type).
  expect(messages.filter((m) => ["Entity", "Resource", "Flow", "Policy", "Metric", "Dimension", "Unit", "Role", "Relation"].includes(m))).toEqual([]);
  expect(messages.filter((m) => /Refund|Customer|Order|Invoice|Payment/.test(m))).toEqual([]);
  expect(proto).not.toMatch(/import\s+"[^"]*\.sea"/);
});
