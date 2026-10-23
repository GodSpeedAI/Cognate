// SeaForgeAuthority: the Cognate half of the CEP authority loop (migration Stage 6).
//
// Builds a CEP `authority_request` for one GovernedOperation, sends it to SEA-Forge over its Unix-socket
// NDJSON protocol (`authority_request` verb), and accepts only a response that is demonstrably the decision
// for *this* request in *this* world. Anything else is `unknown`, which the Governor refuses.
import { createHash, randomUUID } from "node:crypto";
import type { ApprovalReference, ApprovalState, AuthorityClaims, AuthorityReference, GovernanceAuthority, GovernanceConstraint, GovernanceDecision, GovernedOperation } from "./governed-operation.ts";

export interface SeaForgeAuthorityOptions {
  /** Path of the SEA-Forge cell's `server.sock`. */
  readonly socketPath: string;
  /** The identity Cognate claims; the server verifies it against the socket peer's uid. */
  readonly actor?: { readonly actor_id: string; readonly role: string };
  readonly timeoutMs?: number;
  /** Largest response line accepted. */
  readonly maxResponseBytes?: number;
}

const REQUEST_PROFILE = "godspeed.authority_request";
const DECISION_PROFILE = "godspeed.authority_decision";
const PROFILE_VERSION = "1.0.0";
const DECISIONS: ReadonlySet<string> = new Set(["allow", "deny", "escalate", "unknown", "constrained_allow", "boundary", "degraded"]);
const CONSTRAINED: ReadonlySet<string> = new Set(["constrained_allow", "boundary", "degraded"]);

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);
const strings = (value: unknown): string[] | undefined => (Array.isArray(value) && value.every((v) => typeof v === "string" && v.length > 0) ? (value as string[]) : undefined);

function describe(operation: GovernedOperation): { kind: "action" | "capability"; name: string; resource: string; subject: string; correlation: string; claims?: AuthorityClaims } {
  if (operation.kind === "action") {
    return { kind: "action", name: operation.action, resource: operation.resource, subject: `actor:${operation.caller.tenant}/${operation.caller.actor.id}`, correlation: "" };
  }
  const { request } = operation;
  return { kind: "capability", name: "invoke", resource: request.capability.id, subject: `actor:${request.tenant}/${request.actor.id}`, correlation: request.correlationId, ...(operation.claims ? { claims: operation.claims } : {}) };
}

/** The CEP `authority_request` envelope for one operation (profile godspeed.authority_request). */
export function buildAuthorityRequest(operation: GovernedOperation, worldRef: string, now: Date = new Date(), approval?: ApprovalReference, carry?: CarriedWork): { envelope: Obj; operationId: string } {
  return buildEnvelope(describe(operation), worldRef, now, approval, carry);
}

/**
 * Work decided in an earlier world that this request carries forward. SEA-Forge refuses a lineage reaching across
 * worlds unless it cites the allowed transition that moved it (`ledgerEntry` from `listTransitions()`); work already
 * decided stays pinned to its world and is never re-pinned.
 */
export interface CarriedWork {
  /** The request envelope ids of the earlier work. */
  readonly lineage: readonly string[];
  /** `RecordedTransition.ledgerEntry` of the move from that work's world to this request's world. */
  readonly transitionLedgerEntry: string;
}

function buildEnvelope(d: ReturnType<typeof describe>, worldRef: string, now: Date, approval?: ApprovalReference, carry?: CarriedWork): { envelope: Obj; operationId: string } {
  const operationId = `op-${randomUUID()}`;
  const at = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const provenanceId = `prov-${operationId}`;
  const envelope: Obj = {
    envelope_id: `env-authority_request-${operationId}`,
    cep_version: "1.0.0",
    envelope_version: "1.0",
    envelope_kind: "authority_request",
    created_at: at,
    created_by: "cognate",
    scope: { evaluation_context: "cognate-authority_request", world_ref: worldRef },
    boundary_record: {
      scope: "authority request for one Cognate operation",
      included_sections: ["authority", "references", "states", "transformations"],
      excluded_sections: [],
      known_omissions: ["operation payload is not carried"],
      unknowns: [],
      redactions: [],
      compression_notes: [],
      out_of_scope_entities: [],
      classification: "internal",
      limitations: [],
    },
    completeness_status: "partial",
    omission_status: "marked",
    provenance_refs: [provenanceId],
    validation_status: "valid",
    // A revalidation links back to the request that escalated; the approval itself is bound server-side.
    lineage_refs: [...(approval ? [`env-authority_request-${approval.approvalId.replace(/^apr-/, "")}`] : []), ...(carry ? carry.lineage : [])],
    provenance: [{ provenance_id: provenanceId, source_system_refs: ["cognate"], producer_refs: ["cognate"], production_method: "governed_operation", created_at: at }],
    authority: [{ authority_id: `auth-${operationId}`, subject_actor_ref: d.subject }],
    transformations: [{ transformation_id: `tr-${operationId}`, transformation_type: d.kind === "capability" ? "capability_invocation" : "action_invocation" }],
    references: [{ ref_id: `ref-${operationId}`, ref_type: "artifact_id", target_uri_or_id: d.resource, availability_status: "available", integrity_status: "verifiable" }],
    states: [{ state_id: `st-${operationId}`, state_type: "declared_state", subject_ref: `operation:${operationId}` }],
    extensions: {
      "cep.profile": { profile_id: REQUEST_PROFILE, profile_version: PROFILE_VERSION },
      [REQUEST_PROFILE]: { operation_id: operationId, correlation_id: d.correlation || operationId, operation_kind: d.kind, operation_name: d.name, resource_id: d.resource, ...(approval ? { approval_id: approval.approvalId } : {}), ...(carry ? { transition_ref: carry.transitionLedgerEntry } : {}), ...(d.claims ? { claims: { ...d.claims } } : {}) },
    },
  };
  return { envelope, operationId };
}

/**
 * A request to move work from one immutable semantic world to another (migration Stage 10).
 *
 * Cognate never chooses a world: both refs are given by whoever calls, and an allow only means SEA-Forge
 * recorded the move. Cognate's pinned world changes by reconfiguration after the move appears in
 * `SeaForgeAuthority.listTransitions()`, never as a side effect of asking.
 */
export interface WorldTransitionRequest {
  /** World the work is pinned to today (a `world:<name>@sha256:<digest>`; an alias is not accepted). */
  readonly sourceWorldRef: string;
  readonly targetWorldRef: string;
  readonly kind: "semantic_change" | "source_edit_only" | "compiler_upgrade" | "migration";
  readonly reason: string;
  /** The sender's claim. SEA-Forge cannot verify it unless the semantic closures are equal, and records `unknown` without one. */
  readonly compatibility?: "compatible" | "backward_compatible" | "breaking" | "unknown";
  readonly caller: { readonly tenant: string; readonly actor: { readonly id: string } };
  readonly semanticDiffRef?: string;
  readonly migrationRef?: string;
  readonly evidenceRefs?: readonly string[];
}

/** The `authority_request` for one world transition. The approval is bound to the TARGET, via `resource_id`. */
export function buildTransitionRequest(request: WorldTransitionRequest, now: Date = new Date(), approval?: ApprovalReference): { envelope: Obj; operationId: string } {
  const built = buildEnvelope({ kind: "action", name: "transition", resource: request.targetWorldRef, subject: `actor:${request.caller.tenant}/${request.caller.actor.id}`, correlation: "" }, request.sourceWorldRef, now, approval);
  const extensions = built.envelope.extensions as Obj;
  const base = extensions[REQUEST_PROFILE] as Obj;
  extensions[REQUEST_PROFILE] = { ...base, operation_kind: "world_transition", operation_name: "transition", resource_id: request.targetWorldRef };
  extensions["godspeed.world_transition"] = {
    target_world_ref: request.targetWorldRef,
    transition_kind: request.kind,
    reason: request.reason,
    ...(request.compatibility ? { compatibility: request.compatibility } : {}),
    ...(request.semanticDiffRef ? { semantic_diff_ref: request.semanticDiffRef } : {}),
    ...(request.migrationRef ? { migration_ref: request.migrationRef } : {}),
    ...(request.evidenceRefs?.length ? { evidence_refs: [...request.evidenceRefs] } : {}),
  };
  built.envelope.transformations = [{ transformation_id: `tr-${built.operationId}`, transformation_type: "world_transition" }];
  built.envelope.references = [{ ref_id: `ref-${built.operationId}`, ref_type: "world_ref", target_uri_or_id: request.targetWorldRef, availability_status: "available", integrity_status: "verifiable" }];
  return built;
}

/** One move SEA-Forge allowed and recorded, as read back from its ledger. */
export interface RecordedTransition {
  readonly operationId: string;
  readonly decisionId: string;
  /** The ledger entry of the allow; what a request cites (`CarriedWork`) to carry earlier work across the move. */
  readonly ledgerEntry: string;
  readonly approvalId?: string;
  readonly sourceWorldRef: string;
  readonly targetWorldRef: string;
  readonly kind: string;
  readonly compatibility: string;
  readonly semanticClosureEqual: boolean;
}

const unknown = (reason: string): GovernanceDecision => ({ disposition: "unknown", reason });

/**
 * Accept a response only if it is a well-formed authority_decision for exactly this request and world.
 * Never throws; every defect is an `unknown` disposition.
 */
export function interpretDecision(response: unknown, sent: { envelope: Obj; operationId: string }, worldRef: string, approval?: ApprovalReference): GovernanceDecision {
  if (!isObj(response)) return unknown("authority response is not an object");
  if (response.ok !== true) return unknown(`authority refused: ${str(response.error_class) ?? "error"}: ${str(response.error) ?? "no detail"}`);
  const envelope = response.envelope;
  if (!isObj(envelope)) return unknown("authority response carries no envelope");
  if (envelope.envelope_kind !== "authority_decision") return unknown("response envelope is not an authority_decision");
  const extensions = isObj(envelope.extensions) ? envelope.extensions : {};
  const profile = isObj(extensions["cep.profile"]) ? extensions["cep.profile"] : {};
  if (profile.profile_id !== DECISION_PROFILE || profile.profile_version !== PROFILE_VERSION) return unknown("response declares the wrong profile");
  const scope = isObj(envelope.scope) ? envelope.scope : {};
  if (scope.world_ref !== worldRef) return unknown("decision is for a different world than the one requested");
  const ext = extensions[DECISION_PROFILE];
  if (!isObj(ext)) return unknown("decision extension missing");
  if (ext.request_ref !== sent.envelope.envelope_id || ext.operation_id !== sent.operationId) return unknown("decision is not for this request");
  if (!Array.isArray(envelope.lineage_refs) || !envelope.lineage_refs.includes(sent.envelope.envelope_id)) return unknown("decision lineage does not include this request");
  const decision = str(ext.decision);
  if (!decision || !DECISIONS.has(decision)) return unknown("decision is not a recognized disposition");

  // The approval a decision names must be the one we relied on; an escalation names the one to wait for.
  const namedApproval = str(ext.approval_id);
  if (approval && namedApproval !== undefined && namedApproval !== approval.approvalId) return unknown("decision names a different approval than the one relied on");
  if (approval && decision === "allow" && ext.approval_used === true && namedApproval !== approval.approvalId) return unknown("approved allow does not name the approval relied on");

  const decisionRef = str(ext.ledger_entry) ?? str(ext.decision_id);
  const decisionEnvelopeId = str(envelope.envelope_id);
  if (decision === "allow" && !decisionEnvelopeId) return unknown("allow decision carries no envelope id");
  const authority: AuthorityReference | undefined = decisionEnvelopeId
    ? { operationId: sent.operationId, requestEnvelopeId: String(sent.envelope.envelope_id), decisionEnvelopeId, worldRef, ...(decisionRef ? { decisionRef } : {}) }
    : undefined;
  const base = { reason: `sea-forge decided ${decision}${str(ext.decision_id) ? ` (${str(ext.decision_id)})` : ""}`, ...(decisionRef ? { decisionRef } : {}), ...(authority ? { authority } : {}) };
  if (decision === "escalate" && namedApproval) {
    const expires = str(ext.approval_expires_at) ? Date.parse(str(ext.approval_expires_at)!) : Number.NaN;
    return { disposition: "escalate", ...base, escalation: { approvalId: namedApproval, ...(Number.isFinite(expires) ? { expiresAt: expires } : {}) } };
  }
  if (!CONSTRAINED.has(decision)) return { disposition: decision as GovernanceDecision["disposition"], ...base };

  const policyBasis = strings(ext.policy_basis);
  const rawConstraints = Array.isArray(envelope.constraints) ? envelope.constraints : [];
  const constraints: GovernanceConstraint[] = [];
  for (const item of rawConstraints) {
    if (!isObj(item) || !str(item.constraint_type) || !str(item.description)) return unknown("constraint record is malformed");
    constraints.push({ type: str(item.constraint_type)!, value: str(item.description)! });
  }
  if (!policyBasis?.length || constraints.length === 0) return unknown(`${decision} without constraints and policy basis`);
  const controls = strings(ext.compensating_controls);
  if (decision === "degraded" && !controls?.length) return unknown("degraded without compensating controls");
  return { disposition: decision as GovernanceDecision["disposition"], ...base, policyBasis, constraints, ...(controls ? { compensatingControls: controls } : {}) };
}

/** SEA-Forge's answer when its request admission is full: `server_busy` with `no_side_effect: true`. It is
 *  backpressure, not a decision, and the request did nothing, so it is safe to send again. */
export function isServerBusy(response: unknown): boolean {
  const r = response as { error_class?: unknown; no_side_effect?: unknown } | null;
  return typeof r === "object" && r !== null && r.error_class === "server_busy" && r.no_side_effect === true;
}

/**
 * One request/response exchange with SEA-Forge, retrying only `server_busy` answers that carry
 * `no_side_effect: true`, with jittered exponential backoff inside the same `timeoutMs` budget. When the budget
 * runs out the last busy answer is returned unchanged, so callers interpret it exactly as before.
 */
export async function exchange(socketPath: string, request: unknown, timeoutMs: number, maxBytes: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - Date.now();
    const response = await exchangeOnce(socketPath, request, Math.max(1, remaining), maxBytes);
    if (!isServerBusy(response)) return response;
    const backoff = Math.min(400, 20 * 2 ** attempt) * (0.5 + Math.random() / 2);
    if (deadline - Date.now() <= backoff) return response;
    await Bun.sleep(backoff);
  }
}

/** One NDJSON request/response exchange over a Unix socket. Rejects on timeout, close, or oversize. */
export function exchangeOnce(socketPath: string, request: unknown, timeoutMs: number, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffered = "";
    let settled = false;
    const finish = (error: Error | null, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.end();
      } catch {}
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`no response within ${timeoutMs} ms`)), timeoutMs);
    let socket: Awaited<ReturnType<typeof Bun.connect>> | undefined;
    Bun.connect({
      unix: socketPath,
      socket: {
        open(s) {
          s.write(`${JSON.stringify(request)}\n`);
        },
        data(_s, chunk) {
          buffered += chunk.toString("utf8");
          if (buffered.length > maxBytes) return finish(new Error("response exceeds size limit"));
          const newline = buffered.indexOf("\n");
          if (newline < 0) return;
          try {
            finish(null, JSON.parse(buffered.slice(0, newline)));
          } catch {
            finish(new Error("response is not valid JSON"));
          }
        },
        close() {
          finish(new Error("connection closed before a response"));
        },
        error(_s, error) {
          finish(error);
        },
      },
    }).then(
      (s) => {
        socket = s;
        if (settled) s.end();
      },
      (error: unknown) => finish(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

export type EvidenceReceipt =
  | { readonly ok: true; readonly operationId: string; readonly envelopeId: string; readonly items: number; readonly ledgerEntry: string }
  | { readonly ok: false; readonly errorClass: string; readonly error: string };

/** SEA-Forge's governed acceptance of an operation. Never derived from execution or from RealityTrace's own judgment. */
export type SettlementReceipt =
  | { readonly ok: true; readonly status: "settled" | "unsettled" | "rejected"; readonly final: boolean; readonly replayed: boolean; readonly envelope: Obj; readonly ledgerEntry: string }
  | { readonly ok: false; readonly errorClass: string; readonly error: string };

/** Accept a settlement response only if it is demonstrably the settlement of this operation in this world. */
export function interpretSettlement(response: unknown, operationId: string, worldRef: string): SettlementReceipt {
  const refuse = (error: string): SettlementReceipt => ({ ok: false, errorClass: "invalid_settlement", error });
  if (!isObj(response)) return { ok: false, errorClass: "malformed_response", error: "response is not an object" };
  if (response.ok !== true) return { ok: false, errorClass: str(response.error_class) ?? "error", error: str(response.error) ?? "no detail" };
  const envelope = response.envelope;
  if (!isObj(envelope) || envelope.envelope_kind !== "settlement_packet") return refuse("response carries no settlement_packet");
  const extensions = isObj(envelope.extensions) ? envelope.extensions : {};
  const profile = isObj(extensions["cep.profile"]) ? extensions["cep.profile"] : {};
  if (profile.profile_id !== "godspeed.settlement_packet" || profile.profile_version !== PROFILE_VERSION) return refuse("response declares the wrong profile");
  const scope = isObj(envelope.scope) ? envelope.scope : {};
  if (scope.world_ref !== worldRef) return refuse("settlement is for a different world");
  const ext = extensions["godspeed.settlement_packet"];
  if (!isObj(ext) || ext.operation_id !== operationId) return refuse("settlement is for a different operation");
  const status = response.status;
  if (status !== "settled" && status !== "unsettled" && status !== "rejected") return refuse("settlement status is not recognized");
  // The packet and the summary must agree: a summary cannot be upgraded past what the packet says.
  if (ext.overall_status !== status) return refuse("settlement summary disagrees with its packet");
  return { ok: true, status, final: response.final === true, replayed: response.replayed === true, envelope, ledgerEntry: String(response.ledger_entry) };
}

export class SeaForgeAuthority implements GovernanceAuthority {
  private readonly actor: { actor_id: string; role: string };
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(private readonly options: SeaForgeAuthorityOptions) {
    this.actor = { ...(options.actor ?? { actor_id: "cognate-service", role: "service" }) };
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxBytes = options.maxResponseBytes ?? 256 * 1024;
  }

  async decide(operation: GovernedOperation, worldRef: string, approval?: ApprovalReference, carry?: CarriedWork): Promise<GovernanceDecision> {
    const sent = buildAuthorityRequest(operation, worldRef, new Date(), approval, carry);
    let response: unknown;
    try {
      response = await exchange(this.options.socketPath, { verb: "authority_request", envelope: sent.envelope, request_id: sent.operationId, actor: this.actor }, this.timeoutMs, this.maxBytes);
    } catch (error) {
      return unknown(`sea-forge unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return interpretDecision(response, sent, worldRef, approval);
  }

  /**
   * Ask SEA-Forge to move work from one world to another. The answer is the usual governed disposition: a move
   * across a semantic change comes back `escalate` whatever policy says, and only an approved retry is allowed.
   * Nothing changes in Cognate on an allow; read the move back with `listTransitions`.
   */
  async requestWorldTransition(request: WorldTransitionRequest, approval?: ApprovalReference): Promise<GovernanceDecision> {
    const sent = buildTransitionRequest(request, new Date(), approval);
    let response: unknown;
    try {
      response = await exchange(this.options.socketPath, { verb: "authority_request", envelope: sent.envelope, request_id: sent.operationId, actor: this.actor }, this.timeoutMs, this.maxBytes);
    } catch (error) {
      return unknown(`sea-forge unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return interpretDecision(response, sent, request.sourceWorldRef, approval);
  }

  /** Every move SEA-Forge allowed, oldest first. Malformed rows are dropped, never guessed at; failure is an empty list. */
  async listTransitions(): Promise<RecordedTransition[]> {
    let response: unknown;
    try {
      response = await exchange(this.options.socketPath, { verb: "authority_transitions" }, this.timeoutMs, this.maxBytes);
    } catch {
      return [];
    }
    const rows = isObj(response) && response.ok === true && Array.isArray(response.transitions) ? response.transitions : [];
    const out: RecordedTransition[] = [];
    for (const row of rows) {
      if (!isObj(row) || !isObj(row.record)) continue;
      const rec = row.record;
      const operationId = str(row.operation_id);
      const decisionId = str(row.decision_id);
      const ledgerEntry = str(row.ledger_entry);
      const source = str(rec.source_world_ref);
      const target = str(rec.target_world_ref);
      const kind = str(rec.transition_kind);
      const compatibility = str(rec.compatibility);
      if (!operationId || !decisionId || !ledgerEntry || !source || !target || !kind || !compatibility || typeof rec.semantic_closure_equal !== "boolean" || source === target) continue;
      out.push({ operationId, decisionId, ledgerEntry, ...(str(row.approval_id) ? { approvalId: str(row.approval_id)! } : {}), sourceWorldRef: source, targetWorldRef: target, kind, compatibility, semanticClosureEqual: rec.semantic_closure_equal });
    }
    return out;
  }

  /**
   * Submit a GodSpeed `evidence_packet` (built from RealityTrace's recorded evidence) for an operation SEA-Forge
   * allowed. Recording evidence settles nothing.
   */
  async submitEvidence(packet: Obj): Promise<EvidenceReceipt> {
    // SEA-Forge binds a request id to its first payload. Deriving the id from the payload hash as well means a
    // replay of the same packet dedupes, while a different (e.g. tampered) packet under the same envelope id
    // can neither reuse nor poison the id of the genuine one.
    const requestId = `evidence:${String(packet.envelope_id)}:${createHash("sha256").update(JSON.stringify(packet)).digest("hex").slice(0, 16)}`;
    let response: unknown;
    try {
      response = await exchange(this.options.socketPath, { verb: "authority_evidence", envelope: packet, request_id: requestId, actor: this.actor }, this.timeoutMs, this.maxBytes);
    } catch (error) {
      return { ok: false, errorClass: "unreachable", error: error instanceof Error ? error.message : String(error) };
    }
    if (!isObj(response)) return { ok: false, errorClass: "malformed_response", error: "response is not an object" };
    if (response.ok !== true) return { ok: false, errorClass: str(response.error_class) ?? "error", error: str(response.error) ?? "no detail" };
    return { ok: true, operationId: String(response.operation_id), envelopeId: String(response.envelope_id), items: Number(response.items), ledgerEntry: String(response.ledger_entry) };
  }

  /**
   * Ask SEA-Forge to settle an operation from the evidence it holds. The answer is accepted only if it is a
   * settlement_packet for this operation and world; anything else is refused. `unsettled` is a normal answer.
   */
  async settle(operationId: string, worldRef: string): Promise<SettlementReceipt> {
    // One request id per (operation, call): settlement replays are SEA-Forge's to recognise, not ours to cache.
    const requestId = `settle:${operationId}:${randomUUID()}`;
    let response: unknown;
    try {
      response = await exchange(this.options.socketPath, { verb: "authority_settle", operation_id: operationId, request_id: requestId, actor: this.actor }, this.timeoutMs, this.maxBytes);
    } catch (error) {
      return { ok: false, errorClass: "unreachable", error: error instanceof Error ? error.message : String(error) };
    }
    return interpretSettlement(response, operationId, worldRef);
  }

  /** Where an escalation stands. Only used to decide when to try again; an `approved` here never allows anything. */
  async approvalState(approvalId: string): Promise<ApprovalState> {
    try {
      const response = await exchange(this.options.socketPath, { verb: "authority_approvals" }, this.timeoutMs, this.maxBytes);
      const approvals = isObj(response) && Array.isArray(response.approvals) ? response.approvals : [];
      const found = approvals.find((a) => isObj(a) && a.approval_id === approvalId);
      const state = isObj(found) ? str(found.state) : undefined;
      return state === "pending" || state === "approved" || state === "rejected" || state === "expired" || state === "used" ? state : "unknown";
    } catch {
      return "unknown";
    }
  }
}
