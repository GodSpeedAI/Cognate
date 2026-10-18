// GovernedOperation: the single choke point for every consequential Cognate decision (migration Stage 5).
//
// Cognate operates; SEA-Forge governs. Two things are kept apart (authority != capability):
//   - local policy (ActionPolicy / kernel Policy) says what this runtime is *able* to permit, and
//   - the governance authority (SEA-Forge) says whether the operation is *authorized*.
// In `sea-forge` mode both must allow. In `off` mode only local policy applies, and every decision says so.
// Only `allow` proceeds. Every other disposition is refused here; later stages add constraint handling and
// escalation. Nothing outside this file may call `ActionPolicy.authorize` or the user's kernel `Policy`.
import type { Caller } from "@godspeedai/cognate-runtime-api";
import type { AuthorizationRequest, Policy, PolicyDecision } from "@godspeedai/cognate-kernel-api";
import type { ActionPolicy } from "./index.ts";

export type GovernanceMode = "sea-forge" | "off";

/** CEP authority dispositions. Never a boolean (CEP profile `authority_decision`). */
export type Disposition = "allow" | "deny" | "escalate" | "unknown" | "constrained_allow" | "boundary" | "degraded";

export type ActionName = Parameters<ActionPolicy["authorize"]>[0]["action"];

export type GovernedOperation =
  | { readonly kind: "action"; readonly action: ActionName; readonly caller: Caller; readonly resource: string }
  | { readonly kind: "capability"; readonly request: AuthorizationRequest };

/** One constraint the authority attached to a constrained disposition, e.g. `{ type: "timeout_secs", value: "30" }`. */
export interface GovernanceConstraint {
  readonly type: string;
  readonly value: string;
}

/**
 * Installs one kind of constraint for one operation. It returns true only when the constraint is actually
 * in force for that operation; any other outcome (false or a throw) means the constraint is not enforced.
 */
export interface ConstraintEnforcer {
  apply(constraint: GovernanceConstraint, operation: GovernedOperation): boolean | Promise<boolean>;
}

/**
 * Which authority decision allowed an operation. It travels in the recorded decision metadata so everything
 * downstream (the execution trace, the evidence, the settlement) can name the decision it hangs from.
 */
export interface AuthorityReference {
  readonly operationId: string;
  readonly requestEnvelopeId: string;
  readonly decisionEnvelopeId: string;
  readonly worldRef: string;
  /** The authority's own record of the decision (e.g. a ledger entry), when it gave one. */
  readonly decisionRef?: string;
}

/** An escalation that a human can approve: the approval to wait for and when its window closes. */
export interface GovernanceEscalation {
  readonly approvalId: string;
  /** Epoch ms, when the authority said the approval window closes. */
  readonly expiresAt?: number;
}

/** Revalidation after an escalation was approved: the approval being relied on. */
export interface ApprovalReference {
  readonly approvalId: string;
}

export type ApprovalState = "pending" | "approved" | "rejected" | "expired" | "used" | "unknown";

export interface GovernanceDecision {
  readonly disposition: Disposition;
  readonly reason: string;
  /** Required by CEP for boundary / constrained_allow / degraded. */
  readonly policyBasis?: readonly string[];
  readonly constraints?: readonly GovernanceConstraint[];
  /** Required by CEP for degraded. Each must have an enforcer registered under `control:<name>`. */
  readonly compensatingControls?: readonly string[];
  /** Reference to the authority's decision record, when one exists. */
  readonly decisionRef?: string;
  /** Present on an `escalate` that a human approval can satisfy. */
  readonly escalation?: GovernanceEscalation;
  /** Which decision this was, when the authority identifies it. */
  readonly authority?: AuthorityReference;
}

/** What SEA-Forge implements (Stage 6 supplies the CEP-backed implementation). */
export interface GovernanceAuthority {
  /** `approval` is set only when revalidating an operation whose escalation has since been approved. */
  decide(operation: GovernedOperation, worldRef: string, approval?: ApprovalReference): GovernanceDecision | Promise<GovernanceDecision>;
  /** Where an escalation stands, if the authority can say. Used only to know when to try again; never to allow. */
  approvalState?(approvalId: string): Promise<ApprovalState>;
}

export interface GovernanceOptions {
  readonly mode: GovernanceMode;
  readonly authority?: GovernanceAuthority;
  /** Immutable `world:<name>@sha256:<64 hex>` all operations of this runtime are governed against. */
  readonly worldRef?: string;
  /**
   * Enforcers by constraint type (`timeout_secs`) or `control:<name>` for compensating controls. None by
   * default, so constrained dispositions are refused until a host registers the means to honor them.
   */
  readonly enforcers?: Readonly<Record<string, ConstraintEnforcer>>;
  /** When set (>0) and the authority can report approval state, poll for approved escalations this often. */
  readonly approvalPollMs?: number;
}

export interface GovernedResult {
  readonly allow: boolean;
  readonly mode: GovernanceMode;
  readonly disposition: Disposition;
  readonly reason: string;
  readonly decisionRef?: string;
  /** Constraints that were enforced before this operation was allowed (empty for plain allow). */
  readonly applied?: readonly GovernanceConstraint[];
  /** Present when the operation was refused because a human approval could satisfy it. */
  readonly escalation?: GovernanceEscalation;
  /** The decision that allowed (or refused) this, for downstream trace, evidence and settlement. */
  readonly authority?: AuthorityReference;
}

// Mirror DomainForge WorldName's public grammar, rather than accepting a narrower name.
// Canonical rule: [a-z][a-z0-9]*([._-][a-z0-9]+)*, with a 64-byte ASCII name bound.
// DomainForge remains authoritative for minting and verifying the pinned identity.
const WORLD_REF = /^world:([a-z][a-z0-9]*(?:[._-][a-z0-9]+)*)@sha256:[0-9a-f]{64}$/;

export function isWorldRef(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const match = WORLD_REF.exec(text);
  return match !== null && match[1]!.length <= 64;
}

/** Fails at construction, never at first use: `sea-forge` mode without authority and a world is a bug. */
export function validateGovernance(options: GovernanceOptions): void {
  if (options.mode !== "sea-forge" && options.mode !== "off") throw new Error(`unsupported governance mode: ${String(options.mode)}`);
  if (options.mode === "sea-forge") {
    if (!options.authority) throw new Error("governance mode sea-forge requires an authority");
    if (!isWorldRef(options.worldRef)) throw new Error("governance mode sea-forge requires a valid worldRef");
  }
}

/** What the invoker needs to observe about one capability authorization. */
export interface CapabilityHooks {
  /** Set when revalidating an approved escalation. */
  readonly approval?: ApprovalReference;
  readonly applied?: (applied: readonly GovernanceConstraint[]) => void;
  readonly escalated?: (escalation: GovernanceEscalation) => void;
}

export class Governor {
  constructor(
    private readonly local: ActionPolicy,
    private readonly kernelPolicy: Policy,
    private readonly options: GovernanceOptions,
  ) {
    validateGovernance(options);
  }

  get mode(): GovernanceMode {
    return this.options.mode;
  }

  /** Decide one operation. Never throws for a refusal; throws only on programmer error. */
  async govern(operation: GovernedOperation, approval?: ApprovalReference): Promise<GovernedResult> {
    const mode = this.options.mode;
    const localDecision = await this.localDecision(operation);
    if (!localDecision.allow) return { allow: false, mode, disposition: "deny", reason: localDecision.reason };
    if (mode === "off") return { allow: true, mode, disposition: "allow", reason: `${localDecision.reason} (governance off: local policy only)` };

    let decision: GovernanceDecision;
    try {
      decision = await this.options.authority!.decide(operation, this.options.worldRef!, approval);
    } catch (error) {
      // An authority that cannot answer is not an authority that said yes.
      return { allow: false, mode, disposition: "unknown", reason: `governance authority unavailable: ${error instanceof Error ? error.message : String(error)}` };
    }
    return this.interpret(mode, decision, operation);
  }

  private async localDecision(operation: GovernedOperation): Promise<{ allow: boolean; reason: string }> {
    if (operation.kind === "action") return this.local.authorize({ caller: operation.caller, action: operation.action, resource: operation.resource });
    return this.kernelPolicy.authorize(operation.request);
  }

  private async interpret(mode: GovernanceMode, decision: GovernanceDecision, operation: GovernedOperation): Promise<GovernedResult> {
    if (!decision || !KNOWN.has(decision.disposition)) return { allow: false, mode, disposition: "unknown", reason: "governance authority returned an unrecognized disposition" };
    const ref = { ...(decision.decisionRef === undefined ? {} : { decisionRef: decision.decisionRef }), ...(decision.authority ? { authority: decision.authority } : {}) };
    const refuse = (disposition: Disposition, reason: string): GovernedResult => ({ allow: false, mode, disposition, reason, ...ref });
    if (decision.disposition === "allow") return { allow: true, mode, disposition: "allow", reason: decision.reason, ...ref };
    if (decision.disposition === "escalate" && decision.escalation) {
      return { ...refuse("escalate", `${decision.reason}; awaiting approval ${decision.escalation.approvalId}`), escalation: decision.escalation };
    }
    if (!CONSTRAINED.has(decision.disposition)) return refuse(decision.disposition, decision.reason);

    // A constrained disposition is an allow only if every constraint is genuinely enforced for this operation.
    const constraints = decision.constraints ?? [];
    const controls = decision.compensatingControls ?? [];
    if (constraints.length === 0 || !decision.policyBasis?.length) return refuse("unknown", `${decision.disposition} arrived without constraints and policy basis`);
    if (decision.disposition === "degraded" && controls.length === 0) return refuse("unknown", "degraded arrived without compensating controls");
    const enforcers = this.options.enforcers ?? {};
    const applied: GovernanceConstraint[] = [];
    const needed: { key: string; constraint: GovernanceConstraint }[] = [
      ...constraints.map((constraint) => ({ key: constraint.type, constraint })),
      ...(decision.disposition === "degraded" ? controls.map((name) => ({ key: `control:${name}`, constraint: { type: `control:${name}`, value: name } })) : []),
    ];
    for (const { key, constraint } of needed) {
      const enforcer = Object.hasOwn(enforcers, key) ? enforcers[key] : undefined;
      if (!enforcer) return refuse(decision.disposition, `${decision.disposition} requires '${key}' and no enforcer is registered: ${decision.reason}`);
      let enforced = false;
      try {
        enforced = (await enforcer.apply(constraint, operation)) === true;
      } catch {
        enforced = false;
      }
      if (!enforced) return refuse(decision.disposition, `${decision.disposition} constraint '${key}' could not be enforced: ${decision.reason}`);
      applied.push(constraint);
    }
    return { allow: true, mode, disposition: decision.disposition, reason: decision.reason, applied, ...ref };
  }

  /**
   * Kernel-policy facade: the same decision, shaped as the kernel expects. `onApplied` receives the
   * constraints that were enforced before the allow, so the invoker can put them in force for the call.
   */
  async governCapability(request: AuthorizationRequest, hooks: CapabilityHooks = {}): Promise<PolicyDecision> {
    const result = await this.govern({ kind: "capability", request }, hooks.approval);
    if (result.allow && result.applied?.length) hooks.applied?.(result.applied);
    if (!result.allow && result.escalation) hooks.escalated?.(result.escalation);
    // `authority` rides in the recorded decision (run.invocation metadata), so a later trace can name it.
    return { allow: result.allow, policyId: result.mode === "sea-forge" ? "sea-forge" : "local", reason: result.reason, ...(result.authority ? { authority: result.authority } : {}) } as PolicyDecision;
  }
}

const KNOWN: ReadonlySet<string> = new Set<Disposition>(["allow", "deny", "escalate", "unknown", "constrained_allow", "boundary", "degraded"]);
const CONSTRAINED: ReadonlySet<string> = new Set<Disposition>(["constrained_allow", "boundary", "degraded"]);

/** Largest timeout an authority may impose; a longer one is not a meaningful bound. */
export const MAX_TIMEOUT_SECONDS = 3600;

/**
 * Enforcer for the `timeout_secs` constraint. It reports "enforced" only for capability invocations, because
 * only the Invoker puts a deadline in force (it reads the applied constraint, aborts the provider's signal and
 * fails the call with `deadline_exceeded`). An action has no such deadline, so the constraint cannot be honored
 * there and the operation is refused. Register it under `enforcers: { timeout_secs: timeoutSecsEnforcer }`.
 */
export const timeoutSecsEnforcer: ConstraintEnforcer = {
  apply(constraint, operation) {
    if (operation.kind !== "capability") return false;
    return parseTimeoutSeconds(constraint.value) !== undefined;
  },
};

/** A whole number of seconds in 1..=MAX_TIMEOUT_SECONDS, else undefined. */
export function parseTimeoutSeconds(value: string): number | undefined {
  if (!/^[1-9][0-9]{0,3}$/.test(value)) return undefined;
  const seconds = Number(value);
  return seconds <= MAX_TIMEOUT_SECONDS ? seconds : undefined;
}
