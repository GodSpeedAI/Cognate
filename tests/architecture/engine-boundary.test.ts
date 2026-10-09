// CG-KRN-007 (spec §3.4, §40.A): application-facing packages never see Cordis.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadGraph } from "./graph.ts";

test("only kernel-cordis imports cordis", () => {
  const importers = loadGraph().filter((node) => node.imports.has("cordis")).map((node) => node.name);
  expect(importers).toEqual(["@godspeedai/cognate-kernel-cordis"]);
});

test("kernel-cordis exports only framework-owned types", () => {
  const index = readFileSync("packages/kernel-cordis/src/index.ts", "utf8");
  expect(index).not.toMatch(/from\s+["']cordis/);
  const exported = [...index.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}|export\s+(?:const|function|class|type|interface)\s+(\w+)/g)].flatMap((m) => (m[1] ? m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()!) : [m[2]!])).filter(Boolean);
  for (const name of exported) expect(name).not.toMatch(/^(Context|Fiber|Plugin|Service|Cordis)/);
});

test("kernel-api public types mention no engine", () => {
  const types = readFileSync("packages/kernel-api/src/types.ts", "utf8");
  expect(types.toLowerCase()).not.toContain("cordis");
});
