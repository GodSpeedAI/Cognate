// CG-ARC-001 (spec §28) and CG-UI-003 (spec §3.8): dependency direction, acyclicity, and third-party isolation.
import { describe, expect, test } from "bun:test";
import { bareName, findCycle, internalEdges, loadGraph } from "./graph.ts";

const nodes = loadGraph();
const byName = new Map(nodes.map((node) => [node.name, node]));

/** §28 forbidden edges, plus the implied ones for every framework-owned contract package. */
const FORBIDDEN: Record<string, readonly string[]> = {
  "@cognate/kernel-api": ["cordis", "@ruvector/core", "ruvector", "react", "react-dom", "@astryxdesign/core", "@ag-ui/core", "@godspeedai/domainforge", "@cognate/realitytrace", "@cognate/domainforge", "@cognate/ag-ui", "@cognate/react", "@cognate/ui-astryx"],
  "@cognate/events": ["@ruvector/core", "ruvector", "cordis", "react"],
  "@cognate/cognitive-api": ["@ruvector/core", "ruvector", "@ruvector/rvf", "cordis"],
  "@cognate/client": ["react", "react-dom", "@astryxdesign/core", "@cognate/react", "@cognate/ui-astryx"],
  "@cognate/react": ["@astryxdesign/core", "@astryxdesign/theme-neutral", "@cognate/ui-astryx"],
};

/** Third-party engines each owned by exactly one adapter package (spec §3.4, §39: no leaking implementation types). */
const OWNERS: Record<string, readonly string[]> = {
  cordis: ["@cognate/kernel-cordis"],
  "@ruvector/core": ["@cognate/cognitive-ruvector"],
  ruvector: ["@cognate/cognitive-ruvector"],
  "@ruvector/rvf": ["@cognate/cognitive-rvf"],
  "@godspeedai/domainforge": ["@cognate/domainforge"],
  "@ag-ui/core": ["@cognate/ag-ui"],
  "@astryxdesign/core": ["@cognate/ui-astryx"],
  "@astryxdesign/theme-neutral": ["@cognate/ui-astryx"],
  "@connectrpc/connect": ["@cognate/protocol-connect", "@cognate/protocol-connect-bun", "@cognate/proto"],
  "@connectrpc/connect-web": ["@cognate/protocol-connect", "@cognate/protocol-connect-bun"],
  "@modelcontextprotocol/sdk": ["@cognate/mcp"],
};

describe("package topology (§28)", () => {
  test("the workspace has packages to check", () => {
    expect(nodes.length).toBeGreaterThan(0);
  });

  test("no forbidden dependency edge exists", () => {
    const violations: string[] = [];
    for (const [from, banned] of Object.entries(FORBIDDEN)) {
      const node = byName.get(from);
      if (!node) continue;
      for (const dep of banned) if (node.imports.has(dep) || node.declared.has(dep)) violations.push(`${from} → ${dep}`);
    }
    expect(violations).toEqual([]);
  });

  test("third-party engines are imported only by their owning adapter", () => {
    const violations: string[] = [];
    for (const node of nodes) {
      for (const dep of node.imports) {
        const owners = OWNERS[dep];
        if (owners && !owners.includes(node.name) && !node.name.startsWith("@cognate/profile-")) violations.push(`${node.name} imports ${dep}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("every source import is declared in the importing package manifest", () => {
    const missing: string[] = [];
    for (const node of nodes) for (const dep of node.imports) if (!node.declared.has(dep)) missing.push(`${node.name} imports undeclared ${dep}`);
    expect(missing).toEqual([]);
  });

  test("the internal package graph is acyclic", () => {
    expect(findCycle(nodes)).toBeUndefined();
  });

  test("bareName strips subpaths and ignores relative and runtime specifiers", () => {
    expect(bareName("@cognate/events/conformance")).toBe("@cognate/events");
    expect(bareName("cordis/logger")).toBe("cordis");
    expect(bareName("./x")).toBeUndefined();
    expect(bareName("bun:sqlite")).toBeUndefined();
    expect(internalEdges([{ name: "a", dir: "", declared: new Set(), imports: new Set(["b"]) }, { name: "b", dir: "", declared: new Set(), imports: new Set() }])).toEqual([["a", "b"]]);
  });
});
