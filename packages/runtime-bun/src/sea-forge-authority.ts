// SeaForgeAuthority: the Cognate half of the CEP authority loop (migration Stage 6).
//
// Builds a CEP `authority_request` for one GovernedOperation, sends it to SEA-Forge over its Unix-socket
// NDJSON protocol (`authority_request` verb), and accepts only a response that is demonstrably the decision
// for *this* request in *this* world. Anything else is `unknown`, which the Governor refuses.
import { randomUUID } from "node:crypto";
import type { GovernanceAuthority, GovernanceConstraint, GovernanceDecision, GovernedOperation } from "./governed-operation.ts";

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

function describe(operation: GovernedOperation): { kind: "action" | "capability"; name: string; resource: string; subject: string; correlation: string } {
  if (operation.kind === "action") {
    return { kind: "action", name: operation.action, resource: operation.resource, subject: `actor:${operation.caller.tenant}/${operation.caller.actor.id}`, correlation: "" };
  }
  const { request } = operation;
  return { kind: "capability", name: "invoke", resource: request.capability.id, subject: `actor:${request.tenant}/${request.actor.id}`, correlation: request.correlationId };
}

/** The CEP `authority_request` envelope for one operation (profile godspeed.authority_request). */
export function buildAuthorityRequest(operation: GovernedOperation, worldRef: string, now: Date = new Date()): { envelope: Obj; operationId: string } {
  const d = describe(operation);
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
    lineage_refs: [],
    provenance: [{ provenance_id: provenanceId, source_system_refs: ["cognate"], producer_refs: ["cognate"], production_method: "governed_operation", created_at: at }],
    authority: [{ authority_id: `auth-${operationId}`, subject_actor_ref: d.subject }],
    transformations: [{ transformation_id: `tr-${operationId}`, transformation_type: d.kind === "capability" ? "capability_invocation" : "action_invocation" }],
    references: [{ ref_id: `ref-${operationId}`, ref_type: "artifact_id", target_uri_or_id: d.resource, availability_status: "available", integrity_status: "verifiable" }],
    states: [{ state_id: `st-${operationId}`, state_type: "declared_state", subject_ref: `operation:${operationId}` }],
    extensions: {
      "cep.profile": { profile_id: REQUEST_PROFILE, profile_version: PROFILE_VERSION },
      [REQUEST_PROFILE]: { operation_id: operationId, correlation_id: d.correlation || operationId, operation_kind: d.kind, operation_name: d.name, resource_id: d.resource },
    },
  };
  return { envelope, operationId };
}

const unknown = (reason: string): GovernanceDecision => ({ disposition: "unknown", reason });

/**
 * Accept a response only if it is a well-formed authority_decision for exactly this request and world.
 * Never throws; every defect is an `unknown` disposition.
 */
export function interpretDecision(response: unknown, sent: { envelope: Obj; operationId: string }, worldRef: string): GovernanceDecision {
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

  const decisionRef = str(ext.ledger_entry) ?? str(ext.decision_id);
  const base = { reason: `sea-forge decided ${decision}${str(ext.decision_id) ? ` (${str(ext.decision_id)})` : ""}`, ...(decisionRef ? { decisionRef } : {}) };
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

/** One NDJSON request/response exchange over a Unix socket. Rejects on timeout, close, or oversize. */
export function exchange(socketPath: string, request: unknown, timeoutMs: number, maxBytes: number): Promise<unknown> {
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

export class SeaForgeAuthority implements GovernanceAuthority {
  private readonly actor: { actor_id: string; role: string };
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(private readonly options: SeaForgeAuthorityOptions) {
    this.actor = { ...(options.actor ?? { actor_id: "cognate-service", role: "service" }) };
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxBytes = options.maxResponseBytes ?? 256 * 1024;
  }

  async decide(operation: GovernedOperation, worldRef: string): Promise<GovernanceDecision> {
    const sent = buildAuthorityRequest(operation, worldRef);
    let response: unknown;
    try {
      response = await exchange(this.options.socketPath, { verb: "authority_request", envelope: sent.envelope, request_id: sent.operationId, actor: this.actor }, this.timeoutMs, this.maxBytes);
    } catch (error) {
      return unknown(`sea-forge unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return interpretDecision(response, sent, worldRef);
  }
}
