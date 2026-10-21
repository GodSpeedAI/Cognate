// DEBT-002 goldens: every upstream diagnostic shape the adapter classifies, captured from the pinned binding.
// Re-run before any DomainForge version change; a message drift fails here instead of silently becoming `unknown`.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyParseError, loadSemanticProjection } from "../src/index.ts";
import { BINDING } from "../src/types.ts";

const load = (source: string) => loadSemanticProjection(source, { uri: "file:///golden.sea" });

describe("DomainForge diagnostic goldens (DEBT-002)", () => {
  test("undefined entity → unresolved_reference", () => {
    expect(load('Entity "Warehouse" in logistics\nFlow "Cameras" from "Warehouse" to "Nowhere" quantity 5')).toEqual({ ok: false, error: { kind: "unresolved_reference", message: "Parse error: Undefined entity: Nowhere at 0:0" } });
  });

  test("undefined resource → unresolved_reference", () => {
    expect(load('Entity "A" in x\nEntity "B" in x\nFlow "Ghost" from "A" to "B" quantity 1')).toEqual({ ok: false, error: { kind: "unresolved_reference", message: "Parse error: Undefined resource: Ghost at 0:0" } });
  });

  test("syntax error → syntax", () => {
    expect(load("Entity Warehouse in")).toEqual({ ok: false, error: { kind: "syntax", message: "Parse error: Syntax error at 1:8: expected name" } });
  });

  test("duplicate declaration → ambiguous_identity with the namespaced id", () => {
    expect(load('Entity "A" in x\nEntity "A" in x')).toEqual({ ok: false, error: { kind: "ambiguous_identity", id: "x::A" } });
  });

  test("an empty source is a valid empty projection", () => {
    const result = load("");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.projection.objects).toEqual([]);
  });

  test("an unrecognized message falls back to unknown and keeps the text", () => {
    expect(classifyParseError(new Error("Parse error: something new at 0:0"))).toEqual({ kind: "unknown", message: "Parse error: something new at 0:0" });
  });

  test("BINDING, the package.json pin, and the installed binding agree", () => {
    const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const pinned = (JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies["@godspeedai/domainforge"];
    const installed = (JSON.parse(readFileSync(Bun.resolveSync("@godspeedai/domainforge/package.json", pkgDir), "utf8")) as { version: string }).version;
    if (pinned === undefined) throw new Error("packages/domainforge/package.json does not pin @godspeedai/domainforge");
    expect(BINDING).toBe(`@godspeedai/domainforge@${pinned}`);
    expect(installed).toBe(pinned);
  });
});
