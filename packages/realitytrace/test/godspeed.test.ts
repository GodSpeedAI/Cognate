import { describe, expect, setSystemTime, test } from "bun:test";
import { evidencePacketEnvelope, executionTraceEnvelope, executionTraceId, governedTraceFor } from "../src/index.ts";

const WORLD = `world:demo@sha256:${"a".repeat(64)}`;
const authority = { operationId: "op-1", decisionEnvelopeId: "env-authority_decision-op-1" };

const row = (id: string, extra: Record<string, unknown> = {}, ordinal = 7) => ({
  evidence: { evidence_id: id, evidence_type: "test_result", question_ref: "q-1", target_entity_ref: "concept:x", ...extra },
  position: { ledger_id: "L1", append_ordinal: ordinal },
});

describe("execution_trace", () => {
  const trace = executionTraceEnvelope({ worldRef: WORLD, authority, correlationId: "c1", capability: "tool.ping", ok: true, observationId: "obs-e1", occurredAt: "2026-10-05T01:02:03.456Z", createdAt: new Date("2026-10-05T01:02:04Z") }) as any;

  test("hangs from the authority decision, in its world, and says only that it completed", () => {
    expect(trace.envelope_id).toBe(executionTraceId("op-1"));
    expect(trace.envelope_kind).toBe("execution_trace");
    expect(trace.lineage_refs).toEqual([authority.decisionEnvelopeId]);
    expect(trace.scope.world_ref).toBe(WORLD);
    expect(trace.extensions["godspeed.execution_trace"]).toMatchObject({ operation_id: "op-1", authority_decision_ref: authority.decisionEnvelopeId, outcome: "completed" });
    expect(trace.transformations[0]).toEqual({ transformation_id: "tr-op-1", transformation_type: "capability_invocation" });
    expect(trace.observations[0].timestamp).toBe("2026-10-05T01:02:03Z");
    // No evidence or settlement sections: a trace is neither.
    expect(trace.evidence).toBeUndefined();
    expect(trace.settlements).toBeUndefined();
  });

  test("a failed invocation is reported as failed, with its kind", () => {
    const failed = executionTraceEnvelope({ worldRef: WORLD, authority, correlationId: "c1", capability: "tool.ping", ok: false, failureKind: "denied", observationId: "o", occurredAt: "2026-10-05T01:02:03Z" }) as any;
    expect(failed.extensions["godspeed.execution_trace"]).toMatchObject({ outcome: "failed", failure_kind: "denied" });
  });

  test("governedTraceFor needs a recorded authority reference and never invents one", () => {
    const base = { eventId: "e1", correlationId: "c1", occurredAt: "2026-10-05T01:02:03Z" };
    expect(governedTraceFor({ ...base, metadata: { capability: "tool.ping", ok: true, decision: { allow: true, policyId: "local" } } })).toBeUndefined();
    expect(governedTraceFor({ ...base, metadata: { capability: "tool.ping", ok: true } })).toBeUndefined();
    expect(governedTraceFor({ ...base, metadata: { decision: { authority: { operationId: "op-1" } } } })).toBeUndefined();
    const governed = governedTraceFor({ ...base, metadata: { capability: "tool.ping", ok: true, decision: { authority: { ...authority, worldRef: WORLD } } } }) as any;
    expect(governed.envelope_id).toBe(executionTraceId("op-1"));
    expect(governed.observations[0].observation_id).toBe("obs-e1");
  });

  test("governedTraceFor is a pure function of the event: re-deriving it later yields the same bytes", () => {
    const event = { eventId: "e1", correlationId: "c1", occurredAt: "2026-10-05T01:02:03Z", metadata: { capability: "tool.ping", ok: true, decision: { authority: { ...authority, worldRef: WORLD } } } };
    setSystemTime(new Date("2026-10-05T01:02:03.900Z"));
    const first = JSON.stringify(governedTraceFor(event));
    setSystemTime(new Date("2026-10-06T09:00:00Z"));
    const later = JSON.stringify(governedTraceFor(event));
    setSystemTime();
    expect(later).toBe(first);
    expect(JSON.parse(first).created_at).toBe("2026-10-05T01:02:03Z");
  });
});

describe("evidence_packet", () => {
  const input = { worldRef: WORLD, authority, question: { question_id: "q-1", question_form: "is_true", question_type: "declared_semantics", private_note: "dropped" } };

  test("items keep exactly the direction and reliability RealityTrace recorded; a missing direction stays unknown", () => {
    const packet = evidencePacketEnvelope({ ...input, rows: [row("ev-1", { direction: "supports", reliability: "medium" }), row("ev-2", { direction: "contradicts", reliability: "low" }), row("ev-3")] }) as any;
    expect(packet.evidence.map((e: any) => [e.evidence_id, e.direction, e.reliability])).toEqual([
      ["ev-1", "supports", "medium"],
      ["ev-2", "contradicts", "low"],
      ["ev-3", "unknown", undefined],
    ]);
  });

  test("provenance names the RealityTrace ledger position, and only closed-schema keys are carried", () => {
    const packet = evidencePacketEnvelope({ ...input, rows: [row("ev-1", { direction: "supports", reliability: "high", secret: "x" }, 12)] }) as any;
    expect(packet.evidence[0].provenance_refs).toEqual(["sxr:L1:12"]);
    expect(packet.evidence[0].source).toBe("realitytrace");
    expect(packet.evidence[0].secret).toBeUndefined();
    expect(packet.questions[0]).toEqual({ question_id: "q-1", question_form: "is_true", question_type: "declared_semantics" });
  });

  test("lineage points at the trace, the packet is in the operation's world, and it names the decision", () => {
    const packet = evidencePacketEnvelope({ ...input, rows: [row("ev-1")] }) as any;
    expect(packet.lineage_refs).toEqual([executionTraceId("op-1")]);
    expect(packet.scope.world_ref).toBe(WORLD);
    expect(packet.extensions["godspeed.evidence_packet"]).toEqual({ operation_id: "op-1", authority_decision_ref: authority.decisionEnvelopeId, execution_trace_ref: executionTraceId("op-1") });
    expect(packet.settlements).toBeUndefined();
  });

  test("the envelope id follows the evidence set: the same set repackages identically, another set does not collide", () => {
    const id = (rows: ReturnType<typeof row>[]) => (evidencePacketEnvelope({ ...input, rows }) as any).envelope_id;
    expect(id([row("ev-1"), row("ev-2")])).toBe(id([row("ev-2"), row("ev-1")]));
    expect(id([row("ev-1")])).not.toBe(id([row("ev-1"), row("ev-2")]));
  });

  test("nothing recorded means nothing to package", () => {
    expect(() => evidencePacketEnvelope({ ...input, rows: [] })).toThrow(/at least one/);
  });
});
