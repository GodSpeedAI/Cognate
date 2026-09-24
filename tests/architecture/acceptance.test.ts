// CG-ARC-002 (spec §40): every architectural acceptance criterion is bound to requirement gates that are implemented.
// `just gates` re-runs the gates themselves; this test pins the mapping and refuses unimplemented criteria.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadGraph } from "./graph.ts";

const CRITERIA: Record<string, { readonly title: string; readonly requirements: readonly string[] }> = {
  A: { title: "Cordis can be removed conceptually", requirements: ["CG-KRN-001", "CG-KRN-007"] },
  B: { title: "RuVector can be deleted operationally", requirements: ["CG-COG-003", "CG-COG-004"] },
  C: { title: ".sea does not know the Framework exists", requirements: ["AK-003", "CG-SEM-001"] },
  D: { title: "DomainForge remains independently releasable", requirements: ["CG-SEM-001", "CG-SEM-002"] },
  E: { title: "RealityTrace remains independently releasable", requirements: ["CG-RT-001", "CG-RT-002"] },
  F: { title: "Astryx can be replaced", requirements: ["CG-UI-001", "CG-UI-003"] },
  G: { title: "Connect can be replaced", requirements: ["CG-WIR-003"] },
  H: { title: "AG-UI can be removed", requirements: ["CG-CLT-001", "CG-UI-001"] },
  I: { title: "Learning cannot expand authority", requirements: ["CG-CAP-002", "CG-COG-002"] },
  J: { title: "A Copilot-like application can be composed", requirements: ["CG-PRF-001", "CG-PRF-002"] },
  K: { title: "A Harness-like system can be composed", requirements: ["CG-PRF-001", "CG-PRF-003"] },
  L: { title: "The cognitive system can improve without semantic mutation", requirements: ["CG-COG-006", "CG-SEM-001"] },
  M: { title: "Runtime behavior is causally inspectable", requirements: ["CG-OBS-001", "CG-RT-003"] },
};

const ledger = Bun.YAML.parse(readFileSync("requirements/ledger.yaml", "utf8")) as { requirements: { id: string; status: string }[] };
const status = new Map(ledger.requirements.map((r) => [r.id, r.status]));

describe("architectural acceptance criteria (§40)", () => {
  test("the map covers exactly A–M and names only ledger requirements", () => {
    expect(Object.keys(CRITERIA)).toEqual("ABCDEFGHIJKLM".split(""));
    for (const { requirements } of Object.values(CRITERIA)) for (const id of requirements) expect(status.has(id)).toBe(true);
  });

  for (const [letter, { title, requirements }] of Object.entries(CRITERIA)) {
    test(`${letter}. ${title}`, () => {
      const unmet = requirements.filter((id) => status.get(id) !== "implemented");
      expect(unmet).toEqual([]);
    });
  }

  test("H (structural): no framework package depends on the AG-UI adapter", () => {
    const dependents = loadGraph()
      .filter((node) => node.declared.has("@cognate/ag-ui") || node.imports.has("@cognate/ag-ui"))
      .map((node) => node.name)
      .filter((name) => !name.startsWith("@cognate/profile-"));
    expect(dependents).toEqual([]);
  });

  test("D (structural): DomainForge is consumed as a pinned upstream release, never a fork or path dependency", () => {
    const manifest = JSON.parse(readFileSync("packages/domainforge/package.json", "utf8"));
    expect(manifest.dependencies["@godspeedai/domainforge"]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
