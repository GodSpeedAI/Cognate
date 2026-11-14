// `godspeed.interaction_event` v1: the semantic-exhaust extension (E section 5, WP-15). One consequential run or
// invocation event becomes one extension object, built only from the committed event and the case context frozen
// on `run.started`. The event is observation, not settlement. It is UNSIGNED in S1: `emitter` is absent by design
// (the schema makes the signature required only from WP-33); nothing here fabricates one.
import { createHash } from "node:crypto";
import type { Json, OutboxIntent } from "@godspeedai/cognate-events";
import { governedTraceFor } from "./godspeed.ts";
import { observationIntent } from "./index.ts";

type Obj = { [key: string]: Json };

/** ConceptId namespace (domainforge-core `concept_id.rs`): the RFC 4122 DNS namespace. */
const CONCEPT_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** UUIDv5 (RFC 4122 section 4.3) of `name` under `namespace`. */
export function uuidV5(name: string, namespace = CONCEPT_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(Buffer.from(name, "utf8")).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `concept:<uuidv5 of namespace::name>`; the receiver recomputes it and never trusts this. */
export const declarationKey = (semanticRef: string): string => `concept:${uuidV5(semanticRef)}`;

/** Event types that are consequential interactions (the executor commits these through the outbox hook). */
export const INTERACTION_EVENT_TYPES: ReadonlySet<string> = new Set(["run.invocation", "run.completed", "run.failed"]);

/** The committed (or about-to-commit) event fields this module reads. */
export interface InteractionSource {
  readonly eventId: string;
  readonly eventType: string;
  readonly runId: string | null;
  readonly causationId: string | null;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly streamSequence: number;
  readonly semanticRef?: { readonly namespace: string; readonly id: string };
  readonly metadata?: { readonly [key: string]: unknown };
}

const isObj = (v: unknown): v is { [key: string]: unknown } => typeof v === "object" && v !== null && !Array.isArray(v);
const SEMANTIC = /^[A-Za-z0-9_.-]+::[A-Za-z0-9_.-]+$/;
const isoSeconds = (iso: string): string => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * The interaction event for one run event, or `undefined` when the run has no case context or the event is not a
 * consequential interaction. A run without case context therefore yields nothing: its behavior is unchanged.
 */
export function interactionEventFor(event: InteractionSource): Obj | undefined {
  const meta = event.metadata ?? {};
  const ctx = meta.caseContext;
  if (!isObj(ctx) || !INTERACTION_EVENT_TYPES.has(event.eventType) || event.runId === null) return undefined;
  const str = (key: string): string | undefined => (typeof ctx[key] === "string" ? (ctx[key] as string) : undefined);
  const invocation = event.eventType === "run.invocation";
  const capability = typeof meta.capability === "string" ? meta.capability : "unknown";

  const own = event.semanticRef ? `${event.semanticRef.namespace}::${event.semanticRef.id}` : undefined;
  const semanticRef = own !== undefined && SEMANTIC.test(own) ? own : str("semanticRef")!;

  const decision = isObj(meta.decision) ? meta.decision : undefined;
  const authority = isObj(decision?.authority) ? decision.authority : undefined;
  // The SEA-Forge decision when one was recorded; `not_required` when no governed decision applies (local policy,
  // or a run-level event); `unknown` when an invocation recorded no decision at all.
  const decisionId = typeof authority?.decisionEnvelopeId === "string" ? authority.decisionEnvelopeId : invocation && decision === undefined ? "unknown" : "not_required";

  let status: string;
  if (invocation) status = meta.ok === true ? "succeeded" : meta.failureKind === "denied" ? "denied" : "failed";
  else status = event.eventType === "run.completed" ? "succeeded" : "failed";

  const kind = str("kind")!;
  const episodeRef = str("episodeRef");
  const assignmentId = str("assignmentId");
  const provenance = capability === "program.run" && invocation ? "program" : (str("executorProvenance") ?? "live");

  const out: Obj = {
    world_ref: str("worldRef")!,
    semantic_ref: semanticRef,
    declaration_key: declarationKey(semanticRef),
    actor: { principal: str("principal") ?? "unknown", role: str("role")! },
    operation: invocation ? capability : event.eventType,
    resource: invocation ? `capability:${capability}` : `run:${event.runId}`,
    context: { case_id: str("caseId")!, plan_item_id: str("planItemId")!, ...(episodeRef ? { episode_ref: episodeRef } : {}), ...(assignmentId ? { assignment_id: assignmentId } : {}) },
    correlation: { case_id: str("caseId")!, ...(assignmentId ? { assignment_id: assignmentId } : {}), ...(episodeRef ? { episode_ref: episodeRef } : {}), run_id: event.runId },
    ...(event.causationId ? { causation_id: event.causationId } : {}),
    authority: { decision_id: decisionId },
    outcome: { status },
    source: { system: "cognate", record_id: event.eventId, sequence: event.streamSequence, recorded_at: isoSeconds(event.recordedAt) },
    executor_provenance: provenance,
    kind,
  };
  if (kind === "evaluated") out.expectation_refs = Array.isArray(ctx.expectationRefs) ? (ctx.expectationRefs as string[]) : [];
  return out;
}

/**
 * Outbox intents for one run event, for `RuntimeOptions.outboxFor`. Empty for a run without case context and for
 * non-consequential events, so a non-case run commits exactly the intents it did before. The observation carries the
 * interaction event, and the governed execution_trace (with the extension attached) when an authority decision exists.
 * `source.record_id` is the event id, so the intent id and the record id are stable across redelivery.
 */
export function interactionOutboxFor(event: InteractionSource & Parameters<typeof observationIntent>[0]): OutboxIntent[] {
  const interaction = interactionEventFor(event);
  if (!interaction) return [];
  const trace = governedTraceFor({ eventId: event.eventId, correlationId: event.correlationId, occurredAt: event.occurredAt, ...(event.metadata ? { metadata: event.metadata } : {}) });
  if (trace) (trace.extensions as Obj)["godspeed.interaction_event"] = interaction;
  return [observationIntent(event, { classification: "durable_fact", ...(typeof event.metadata?.capability === "string" ? { capabilityId: event.metadata.capability } : {}), interactionEvent: interaction, ...(trace ? { trace: trace as Json } : {}) })];
}
