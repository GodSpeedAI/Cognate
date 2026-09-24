import { describe, expect, test } from "bun:test";
import { event } from "../src/conformance.ts";
import { EnvelopeValidationError, fingerprint, MAX_PAYLOAD_BYTES, validateNewEvent } from "../src/index.ts";

const issues = (e: unknown) => {
  try {
    validateNewEvent(e as never);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvelopeValidationError);
    return (error as EnvelopeValidationError).issues;
  }
  return [];
};

describe("event envelope (§10)", () => {
  test("a complete envelope is valid", () => {
    expect(issues(event("run.started", { a: [1, "x", null, { b: true }] }))).toEqual([]);
  });

  test.each([
    ["eventType", ""],
    ["eventType", "Run Started"],
    ["schemaVersion", 0],
    ["schemaVersion", 1.5],
    ["occurredAt", "yesterday"],
    ["tenant", ""],
    ["correlationId", ""],
    ["scopeId", ""],
    ["causationId", ""],
    ["runId", 7],
  ])("rejects %s = %p", (field, value) => {
    expect(issues({ ...event("run.started"), [field]: value }).length).toBeGreaterThan(0);
  });

  test("missing required fields are each reported", () => {
    const { tenant: _t, correlationId: _c, ...rest } = event("run.started");
    expect(issues(rest)).toEqual(["tenant is required", "correlationId is required"]);
  });

  test("non-JSON payloads are rejected (undefined, NaN, bigint, class instances, functions)", () => {
    for (const payload of [{ a: undefined }, Number.NaN, 1n, new Date(), () => 1, { nested: new Map() }]) {
      expect(issues({ ...event("x.y"), payload })).toContain("payload must be JSON");
    }
  });

  test("payload size is bounded", () => {
    expect(issues(event("x.y", "a".repeat(MAX_PAYLOAD_BYTES + 1)))).toContain(`payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  });

  test("an incomplete semantic reference is rejected", () => {
    const semanticRef = { namespace: "n", id: "n::X", source: { uri: "", digest: "d" }, projectionVersion: "1" };
    expect(issues({ ...event("x.y"), semanticRef }).join()).toContain("semanticRef");
  });

  test("fingerprints ignore key order and distinguish values", () => {
    expect(fingerprint({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(fingerprint({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});
