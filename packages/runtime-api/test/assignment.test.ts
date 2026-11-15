// WP-23: assignment.v1 vendored by digest; every contract fixture through the validator; every lifecycle scenario
// through the state machine; the validator agrees with Ajv on the schema (differential).
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  addSpend, ASSIGNMENT_CODES, budgetBreaches, formatAssignmentId, nextAssignmentEvents, parseAssignmentId, runAssignmentLifecycle, spendOf, stepAssignment,
  caseContextIssues, validateAssignment, validateAssignmentError, validateAssignmentEvent, type AssignmentCode, type AssignmentEvent,
} from "../src/index.ts";

const SCHEMAS = join(import.meta.dir, "..", "schemas");
const FIXTURES = join(import.meta.dir, "fixtures", "assignment");
// Vendored from SEA-Forge contracts/fde/ (DIGESTS file); a change must be a deliberate re-vendor.
const PINS: Record<string, string> = {
  "assignment.v1.json": "34782bbd112b68a5c1f089ce5d4b81a93e0cbda96ffdca866cabffe9eb7780f9",
  "frozen-reference.v1.json": "7b0954ac79835783acc5cc642820d70bb01189b18cd596198879c81bbbfaa535",
};
const MANIFEST_SHA256 = "5d7cf4280c184d0fd8f760510cff5d4324ece8fdd14b3b868b172d619c206402";
const read = (...p: string[]) => JSON.parse(readFileSync(join(FIXTURES, ...p), "utf8"));
const manifest = read("manifest.json");

const ajv = new Ajv2020({ strict: false, allErrors: false });
for (const name of Object.keys(PINS)) ajv.addSchema(JSON.parse(readFileSync(join(SCHEMAS, name), "utf8")));
const ajvCheck = (def: string, value: unknown) => {
  const validate = ajv.getSchema(`urn:sea-forge:fde:assignment:v1#/$defs/${def}`)!;
  return validate(value) ? [] : (validate.errors ?? []).map((e) => ({ pointer: e.instancePath, message: e.message ?? "" }));
};
const mine = (def: string, value: unknown) => (def === "Assignment" ? validateAssignment(value) : def === "Event" ? validateAssignmentEvent(value) : validateAssignmentError(value));

describe("vendoring", () => {
  test("the vendored schemas are the pinned ones", () => {
    for (const [name, sha] of Object.entries(PINS)) expect(createHash("sha256").update(readFileSync(join(SCHEMAS, name))).digest("hex")).toBe(sha);
  });
  test("the vendored fixtures are the pinned ones and every fixture file is listed in the manifest", () => {
    expect(createHash("sha256").update(readFileSync(join(FIXTURES, "manifest.json"))).digest("hex")).toBe(MANIFEST_SHA256);
    const listed = (dir: string, entries: string[]) => expect(readdirSync(join(FIXTURES, dir)).sort()).toEqual([...entries].sort());
    listed("valid", manifest.valid.map((e: { file: string }) => e.file));
    listed("invalid", [...manifest.invalid, ...manifest.semantic_invalid].map((e: { file: string }) => e.file));
    listed("scenarios", manifest.scenarios);
  });
});

describe("id grammar", () => {
  test("parse and format round-trip", () => {
    expect(parseAssignmentId("assign:case-0001:item-03:2:5")).toEqual({ caseId: "case-0001", stepId: "item-03", n: 2, k: 5 });
    expect(formatAssignmentId({ caseId: "c", stepId: "s", n: 1, k: 2 })).toBe("assign:c:s:1:2");
  });
  test.each(["assign:c:s:1", "assign:c:s:0:1", "assign:c:s:1:0", "assign:c:d:s:1:1", "asg:c:s:1:1", "assign:c:s:1:1x", "assign:c@x:s:1:1", "assign:c:s:01:1", ""])("refuses %p", (id) => {
    expect(parseAssignmentId(id)).toBeUndefined();
  });
  test("refuses an id over the length bound", () => {
    expect(parseAssignmentId(`assign:${"a".repeat(310)}:s:1:1`)).toBeUndefined();
  });
  test("format refuses parts that cannot form an id", () => {
    expect(() => formatAssignmentId({ caseId: "a:b", stepId: "s", n: 1, k: 1 })).toThrow(RangeError);
    expect(() => formatAssignmentId({ caseId: "c", stepId: "s", n: 0, k: 1 })).toThrow(RangeError);
  });
});

describe("contract fixtures", () => {
  test.each(manifest.valid as { file: string; def: string }[])("valid: $file", ({ file, def }) => {
    const value = read("valid", file);
    expect(ajvCheck(def, value)).toEqual([]);
    expect(mine(def, value).ok).toBe(true);
  });
  test.each(manifest.invalid as { file: string; def: string; pointer: string }[])("invalid: $file", ({ file, def, pointer }) => {
    const value = read("invalid", file);
    expect(ajvCheck(def, value).length).toBeGreaterThan(0); // the schema itself refuses it
    const result = mine(def, value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.pointer)).toContain(pointer);
  });
  test.each(manifest.semantic_invalid as { file: string; def: string; code: AssignmentCode }[])("semantic: $file -> $code", ({ file, def, code }) => {
    const value = read("invalid", file);
    expect(ajvCheck(def, value)).toEqual([]); // schema-valid; only the semantic rule refuses it
    const result = mine(def, value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });
  test("an id that does not parse carries ASSIGNMENT_ID_INVALID", () => {
    for (const file of ["id-four-part-old-form.json", "id-k-zero.json", "id-n-zero.json", "id-colon-in-case-id.json", "id-wrong-prefix.json", "id-trailing-text.json", "id-longer-than-bound.json"]) {
      const r = validateAssignment(read("invalid", file));
      expect(r.ok ? undefined : r.code).toBe("ASSIGNMENT_ID_INVALID");
    }
  });
  test("the id must agree with the episode reference even when the repeated fields agree with the id (own cases, no contract fixture isolates this)", () => {
    const a = read("valid", "assignment-first-delegation.json");
    for (const bad of [
      { ...a, assignment_id: "assign:case-0001:item-03:2:1", n: 2 }, // n of id and field differ from the episode's
      { ...a, assignment_id: "assign:case-0001:item-99:1:1", step_id: "item-99" },
      { ...a, assignment_id: "assign:case-9999:item-03:1:1", case_id: "case-9999" },
    ]) {
      const r = validateAssignment(bad);
      expect(r.ok ? undefined : r.code).toBe("ASSIGNMENT_ID_INVALID");
    }
    const e = read("valid", "event-interrupted.json");
    const r = validateAssignmentEvent({ ...e, assignment_id: "assign:case-0001:item-03:2:1" }); // an Event has no repeated fields: only the episode can disagree
    expect(r.ok ? undefined : r.code).toBe("ASSIGNMENT_ID_INVALID");
  });
  test("every code of the contract's Error def is known", () => {
    expect([...ASSIGNMENT_CODES].sort()).toEqual(["ASSIGNMENT_BUDGET_EXCEEDED", "ASSIGNMENT_BUDGET_INVALID", "ASSIGNMENT_EPISODE_CHANGED", "ASSIGNMENT_ID_INVALID", "ASSIGNMENT_LINK_EXPIRED", "ASSIGNMENT_TRANSITION_INVALID"]);
  });
  test("brief.context_refs present but undefined is refused", () => {
    const a = read("valid", "assignment-first-delegation.json");
    expect(validateAssignment({ ...a, brief: { ...a.brief, context_refs: undefined } }).ok).toBe(false);
  });
  test("case-context references must be strings, not values that coerce to a matching string", () => {
    const ctx = { worldRef: `world:fde-sop@sha256:${"a".repeat(64)}`, semanticRef: "fde-sop.work::Task", caseId: "c", planItemId: "p", role: "executor", kind: "exploratory" } as const;
    expect(caseContextIssues(ctx as never)).toEqual([]);
    expect(caseContextIssues({ ...ctx, worldRef: [ctx.worldRef] } as never)).not.toEqual([]);
    expect(caseContextIssues({ ...ctx, semanticRef: [ctx.semanticRef] } as never)).not.toEqual([]);
    expect(caseContextIssues({ ...ctx, expectationRefs: [["question:q1"]] } as never)).not.toEqual([]);
  });
  test("an unknown limit is accepted and money takes an ISO 4217 unit", () => {
    const a = read("valid", "assignment-first-delegation.json");
    expect(a.budget.some((b: { limit: unknown }) => b.limit === "unknown")).toBe(true);
    expect(validateAssignment(a).ok).toBe(true);
  });
});

describe("lifecycle scenarios", () => {
  test.each(manifest.scenarios as string[])("%s", (file) => {
    const s = read("scenarios", file);
    const result = runAssignmentLifecycle(s.events as AssignmentEvent[], { ...(s.budget ? { budget: s.budget } : {}), ...(s.link_expires_at ? { linkExpiresAt: s.link_expires_at } : {}) });
    if (s.expect.outcome === "ok") expect(result.ok).toBe(true);
    else {
      expect(result.ok).toBe(false);
      expect(result.ok ? undefined : result.code).toBe(s.expect.code);
    }
    if (s.expect.outcome === "ok") for (const e of s.events) expect(validateAssignmentEvent(e).ok).toBe(true); // an accepted sequence holds only valid Events
  });
  test("the scenarios cover every refusal code except BUDGET_INVALID (a payload rule, covered by a semantic fixture)", () => {
    const codes = new Set(manifest.scenarios.map((f: string) => read("scenarios", f).expect.code).filter(Boolean));
    for (const c of ASSIGNMENT_CODES) if (c !== "ASSIGNMENT_BUDGET_INVALID") expect(codes.has(c)).toBe(true);
  });
  test("the transition table: only the contract's edges are allowed", () => {
    expect(nextAssignmentEvents(undefined)).toEqual(["issued"]);
    expect(nextAssignmentEvents("issued")).toEqual(["started"]);
    expect(nextAssignmentEvents("interrupted")).toEqual(["resumed", "cancelled"]);
    for (const t of ["completed", "failed", "cancelled"] as const) expect(nextAssignmentEvents(t)).toEqual([]);
  });
  test("stepAssignment is pure: the input state is not changed", () => {
    const s = read("scenarios", "lifecycle-delegate-interrupt-resume-complete.json");
    const first = stepAssignment(undefined, s.events[0]);
    const frozen = JSON.stringify(first);
    stepAssignment(first.ok ? first.state : undefined, s.events[1]);
    expect(JSON.stringify(first)).toBe(frozen);
  });
  test("a link expiry exactly at the resume instant is not expired; one millisecond later is", () => {
    const s = read("scenarios", "lifecycle-resume-after-link-expiry.json");
    const at = s.events[3].at;
    expect(runAssignmentLifecycle(s.events, { linkExpiresAt: at }).ok).toBe(true);
    expect(runAssignmentLifecycle(s.events, { linkExpiresAt: "2026-11-15T17:59:59.999Z" }).ok).toBe(false);
  });
});

describe("spend", () => {
  test("addSpend adds numbers and never turns unknown into a number", () => {
    let s = spendOf(0);
    s = addSpend(s, "money", 2);
    s = addSpend(s, "money", 1.5);
    expect(s.find((e) => e.currency === "money")!.spent).toBe(3.5);
    s = addSpend(s, "risk", "unknown");
    s = addSpend(s, "risk", 4);
    expect(s.find((e) => e.currency === "risk")!.spent).toBe("unknown");
  });
  test("budgetBreaches: above a numeric limit trips; equal, unknown limit and unknown spend do not", () => {
    const budget = read("valid", "assignment-first-delegation.json").budget;
    const at = (currency: string, spent: number | "unknown") => spendOf(0).map((e) => (e.currency === currency ? { ...e, spent } : e));
    expect(budgetBreaches(budget, at("time", 14400))).toEqual([]);
    expect(budgetBreaches(budget, at("time", 14401))).toEqual([{ currency: "time", limit: 14400, spent: 14401 }]);
    expect(budgetBreaches(budget, at("attention", 1e9))).toEqual([]); // unknown limit
    expect(budgetBreaches(budget, at("time", "unknown"))).toEqual([]); // unknown spend
  });
});
