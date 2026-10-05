// GovernedOperation: the single choke point for every consequential Cognate decision (migration Stage 5).
//
// Cognate operates; SEA-Forge governs. Two things are kept apart (authority != capability):
//   - local policy (ActionPolicy / kernel Policy) says what this runtime is *able* to permit, and
//   - the governance authority (SEA-Forge) says whether the operation is *authorized*.
// In `sea-forge` mode both must allow. In `off` mode only local policy applies, and every decision says so.
// Only `allow` proceeds. Every other disposition is refused here; later stages add constraint handling and
// escalation. Nothing outside this file may call `ActionPolicy.authorize` or the user's kernel `Policy`.
import type { Caller } from "@cognate/runtime-api";
import type { AuthorizationRequest, Policy, PolicyDecision } from "@cognate/kernel-api";
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
}

/** What SEA-Forge implements (Stage 6 supplies the CEP-backed implementation). */
export interface GovernanceAuthority {
  decide(operation: GovernedOperation, worldRef: string): GovernanceDecision | Promise<GovernanceDecision>;
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
}

export interface GovernedResult {
  readonly allow: boolean;
  readonly mode: GovernanceMode;
  readonly disposition: Disposition;
  readonly reason: string;
  readonly decisionRef?: string;
  /** Constraints that were enforced before this operation was allowed (empty for plain allow). */
  readonly applied?: readonly GovernanceConstraint[];
}

const WORLD_REF = /^world:[a-z0-9]+(?:-[a-z0-9]+)*@sha256:[0-9a-f]{64}$/;

export function isWorldRef(text: unknown): text is string {
  return typeof text === "string" && text.length <= 200 && WORLD_REF.test(text);
}

/** Fails at construction, never at first use: `sea-forge` mode without authority and a world is a bug. */
export function validateGovernance(options: GovernanceOptions): void {
  if (options.mode !== "sea-forge" && options.mode !== "off") throw new Error(`unsupported governance mode: ${String(options.mode)}`);
  if (options.mode === "sea-forge") {
    if (!options.authority) throw new Error("governance mode sea-forge requires an authority");
    if (!isWorldRef(options.worldRef)) throw new Error("governance mode sea-forge requires a valid worldRef");
  }
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
  async govern(operation: GovernedOperation): Promise<GovernedResult> {
    const mode = this.options.mode;
    const localDecision = await this.localDecision(operation);
    if (!localDecision.allow) return { allow: false, mode, disposition: "deny", reason: localDecision.reason };
    if (mode === "off") return { allow: true, mode, disposition: "allow", reason: `${localDecision.reason} (governance off: local policy only)` };

    let decision: GovernanceDecision;
    try {
      decision = await this.options.authority!.decide(operation, this.options.worldRef!);
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
    const ref = decision.decisionRef === undefined ? {} : { decisionRef: decision.decisionRef };
    const refuse = (disposition: Disposition, reason: string): GovernedResult => ({ allow: false, mode, disposition, reason, ...ref });
    if (decision.disposition === "allow") return { allow: true, mode, disposition: "allow", reason: decision.reason, ...ref };
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
  async governCapability(request: AuthorizationRequest, onApplied?: (applied: readonly GovernanceConstraint[]) => void): Promise<PolicyDecision> {
    const result = await this.govern({ kind: "capability", request });
    if (result.allow && result.applied?.length) onApplied?.(result.applied);
    return { allow: result.allow, policyId: result.mode === "sea-forge" ? "sea-forge" : "local", reason: result.reason };
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
