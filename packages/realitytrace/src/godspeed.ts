// GodSpeed CEP profile envelopes for the RealityTrace boundary (migration Stage 8).
//
// Roles are fixed: Cognate operates and reports completion (execution_trace); RealityTrace observes and derives
// its own evidence; SEA-Forge settles. Nothing here upgrades one into the other: a trace says an operation
// completed, evidence keeps exactly the direction and reliability RealityTrace recorded, and settlement is not
// built here at all.
import { createHash } from "node:crypto";

type Obj = Record<string, unknown>;

const PROFILE_VERSION = "1.0.0";
const BASE = { cep_version: "1.0.0", envelope_version: "1.0", completeness_status: "partial", omission_status: "marked", validation_status: "valid" } as const;

const isoSeconds = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, "Z");

function boundary(scope: string, included: string[], omissions: string[], limitations: string[] = []): Obj {
  return { scope, included_sections: included, excluded_sections: [], known_omissions: omissions, unknowns: [], redactions: [], compression_notes: [], out_of_scope_entities: [], classification: "internal", limitations };
}

function provenance(id: string, system: string, producer: string, method: string, at: string): Obj {
  return { provenance_id: id, source_system_refs: [system], producer_refs: [producer], production_method: method, created_at: at };
}

export const executionTraceId = (operationId: string): string => `env-execution_trace-${operationId}`;
export const transformationId = (operationId: string): string => `tr-${operationId}`;

export interface TraceInput {
  readonly worldRef: string;
  /** The authority decision that allowed the operation (from the recorded decision metadata). */
  readonly authority: { readonly operationId: string; readonly decisionEnvelopeId: string };
  readonly correlationId: string;
  readonly capability: string;
  readonly ok: boolean;
  readonly failureKind?: string;
  readonly observationId: string;
  readonly occurredAt: string;
  readonly createdAt?: Date;
}

/** A GodSpeed `execution_trace`: what was done under an authority decision. Completion only, never settlement. */
export function executionTraceEnvelope(input: TraceInput): Obj {
  const op = input.authority.operationId;
  const at = isoSeconds(input.createdAt ?? new Date());
  const occurred = isoSeconds(new Date(input.occurredAt));
  return {
    envelope_id: executionTraceId(op),
    ...BASE,
    envelope_kind: "execution_trace",
    created_at: at,
    created_by: "cognate",
    scope: { evaluation_context: "godspeed-execution_trace", world_ref: input.worldRef },
    boundary_record: boundary("one governed Cognate capability invocation", ["observations", "transformations"], ["outputs are not carried"], ["records that the operation completed or failed; it is not evidence and not settlement"]),
    provenance_refs: [`prov-${executionTraceId(op)}`],
    lineage_refs: [input.authority.decisionEnvelopeId],
    provenance: [provenance(`prov-${executionTraceId(op)}`, "cognate", "cognate", "governed_invocation", at)],
    transformations: [{ transformation_id: transformationId(op), transformation_type: "capability_invocation" }],
    observations: [{ observation_id: input.observationId, observed_entity_ref: input.capability, observer_ref: "cognate", method: "governed_invocation", timestamp: occurred, limitations: ["completion only"] }],
    extensions: {
      "cep.profile": { profile_id: "godspeed.execution_trace", profile_version: PROFILE_VERSION },
      "godspeed.execution_trace": { operation_id: op, authority_decision_ref: input.authority.decisionEnvelopeId, correlation_id: input.correlationId, outcome: input.ok ? "completed" : "failed", ...(input.failureKind ? { failure_kind: input.failureKind } : {}) },
    },
  };
}

/** What RealityTrace recorded for one evidence item, with where it sits in RealityTrace's ledger. */
export interface SxrEvidenceRow {
  readonly evidence: Obj;
  readonly position: { readonly ledger_id: string; readonly append_ordinal: number };
}

export interface EvidencePacketInput {
  readonly worldRef: string;
  readonly authority: { readonly operationId: string; readonly decisionEnvelopeId: string };
  /** RealityTrace's recorded question (`questions[0]` of its question.declared record). */
  readonly question: Obj;
  readonly rows: readonly SxrEvidenceRow[];
  readonly createdAt?: Date;
}

const ITEM_KEYS = ["evidence_id", "evidence_type", "question_ref", "target_claim_ref", "target_entity_ref", "representation_ref", "relevance", "reliability", "direction", "confidence_impact", "limitations"] as const;
const QUESTION_KEYS = ["question_id", "question_form", "question_type", "scope", "target_entities", "target_states", "target_transformations", "expected_answer_shape", "evaluation_context", "assumptions", "unknowns"] as const;

function pick(source: Obj, keys: readonly string[]): Obj {
  const out: Obj = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

/**
 * A GodSpeed `evidence_packet` from RealityTrace's recorded evidence. Each item is copied as recorded: direction
 * and reliability are never upgraded, and an item without a direction stays `unknown`.
 */
export function evidencePacketEnvelope(input: EvidencePacketInput): Obj {
  if (input.rows.length === 0) throw new Error("an evidence packet needs at least one recorded evidence item");
  const op = input.authority.operationId;
  const at = isoSeconds(input.createdAt ?? new Date());
  const ids = input.rows.map((r) => String(r.evidence.evidence_id)).sort();
  const envelopeId = `env-evidence_packet-${op}-${createHash("sha256").update(ids.join("|")).digest("hex").slice(0, 12)}`;
  const items = input.rows.map((row) => ({
    ...pick(row.evidence, ITEM_KEYS),
    direction: typeof row.evidence.direction === "string" ? row.evidence.direction : "unknown",
    source: "realitytrace",
    provenance_refs: [`sxr:${row.position.ledger_id}:${row.position.append_ordinal}`],
  }));
  return {
    envelope_id: envelopeId,
    ...BASE,
    envelope_kind: "evidence_packet",
    created_at: at,
    created_by: "cognate-realitytrace-adapter",
    scope: { evaluation_context: "godspeed-evidence_packet", world_ref: input.worldRef },
    boundary_record: boundary("evidence RealityTrace recorded for one operation", ["evidence", "questions"], ["only evidence recorded in RealityTrace's ledger is carried"], ["evidence is relative to the question; it is not settlement"]),
    provenance_refs: [`prov-${envelopeId}`],
    lineage_refs: [executionTraceId(op)],
    provenance: [provenance(`prov-${envelopeId}`, "realitytrace", "cognate-realitytrace-adapter", "evidence_packaging", at)],
    questions: [pick(input.question, QUESTION_KEYS)],
    evidence: items,
    extensions: {
      "cep.profile": { profile_id: "godspeed.evidence_packet", profile_version: PROFILE_VERSION },
      "godspeed.evidence_packet": { operation_id: op, authority_decision_ref: input.authority.decisionEnvelopeId, execution_trace_ref: executionTraceId(op) },
    },
  };
}

/**
 * The execution_trace for a committed `run.invocation` event, or undefined when the invocation was not governed
 * by a SEA-Forge decision (no authority reference was recorded, so there is nothing for the trace to hang from).
 * Reads only what the runtime recorded; it never asks SEA-Forge anything.
 */
export function governedTraceFor(event: {
  readonly eventId: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly metadata?: { readonly [key: string]: unknown };
}): Obj | undefined {
  const metadata = event.metadata ?? {};
  const decision = metadata.decision as { authority?: { operationId?: string; decisionEnvelopeId?: string; worldRef?: string } } | null | undefined;
  const authority = decision?.authority;
  if (!authority?.operationId || !authority.decisionEnvelopeId || !authority.worldRef) return undefined;
  return executionTraceEnvelope({
    worldRef: authority.worldRef,
    authority: { operationId: authority.operationId, decisionEnvelopeId: authority.decisionEnvelopeId },
    correlationId: event.correlationId,
    capability: typeof metadata.capability === "string" ? metadata.capability : "unknown",
    ok: metadata.ok === true,
    ...(typeof metadata.failureKind === "string" ? { failureKind: metadata.failureKind } : {}),
    observationId: `obs-${event.eventId}`,
    occurredAt: event.occurredAt,
  });
}
