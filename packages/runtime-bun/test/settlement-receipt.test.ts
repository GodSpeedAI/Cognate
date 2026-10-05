import { describe, expect, test } from "bun:test";
import { interpretSettlement } from "../src/index.ts";

const WORLD = `world:demo@sha256:${"a".repeat(64)}`;

const good = (overrides: Record<string, any> = {}) => {
  const base: Record<string, any> = {
    ok: true,
    status: "settled",
    final: true,
    replayed: false,
    ledger_entry: "01ENTRY",
    envelope: {
      envelope_kind: "settlement_packet",
      scope: { world_ref: WORLD },
      extensions: {
        "cep.profile": { profile_id: "godspeed.settlement_packet", profile_version: "1.0.0" },
        "godspeed.settlement_packet": { operation_id: "op-1", overall_status: "settled" },
      },
    },
  };
  return structuredClone({ ...base, ...overrides });
};

describe("interpretSettlement: only SEA-Forge's settlement of this operation, in this world, is accepted", () => {
  test("a faithful settlement is accepted for each status", () => {
    for (const status of ["settled", "unsettled", "rejected"] as const) {
      const response = good({ status });
      response.envelope.extensions["godspeed.settlement_packet"].overall_status = status;
      const receipt = interpretSettlement(response, "op-1", WORLD);
      expect(receipt).toMatchObject({ ok: true, status });
    }
  });

  test("a summary cannot be upgraded past what the packet says", () => {
    const response = good({ status: "settled" });
    response.envelope.extensions["godspeed.settlement_packet"].overall_status = "unsettled";
    expect(interpretSettlement(response, "op-1", WORLD)).toMatchObject({ ok: false, errorClass: "invalid_settlement" });
  });

  test("every defect is a refusal, never a settlement", () => {
    const mutate = (fn: (r: any) => void) => {
      const r = good();
      fn(r);
      return r;
    };
    const defects: [string, unknown][] = [
      ["not an object", "settled"],
      ["server error", { error: "no", error_class: "cep_evidence_refused" }],
      ["no envelope", { ok: true, status: "settled" }],
      ["wrong kind", mutate((r) => (r.envelope.envelope_kind = "evidence_packet"))],
      ["wrong profile", mutate((r) => (r.envelope.extensions["cep.profile"].profile_id = "godspeed.evidence_packet"))],
      ["other world", mutate((r) => (r.envelope.scope.world_ref = `world:demo@sha256:${"b".repeat(64)}`))],
      ["other operation", mutate((r) => (r.envelope.extensions["godspeed.settlement_packet"].operation_id = "op-2"))],
      ["unknown status", mutate((r) => (r.status = "accepted"))],
      ["boolean status", mutate((r) => (r.status = true))],
    ];
    for (const [name, response] of defects) expect(interpretSettlement(response, "op-1", WORLD).ok, name).toBe(false);
  });
});
