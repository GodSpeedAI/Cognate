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

export interface GovernanceDecision {
  readonly disposition: Disposition;
  readonly reason: string;
  /** Required by CEP for boundary / constrained_allow / degraded. */
  readonly policyBasis?: string;
  readonly constraints?: readonly string[];
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
}

export interface GovernedResult {
  readonly allow: boolean;
  readonly mode: GovernanceMode;
  readonly disposition: Disposition;
  readonly reason: string;
  readonly decisionRef?: string;
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
    return interpret(mode, decision);
  }

  private async localDecision(operation: GovernedOperation): Promise<{ allow: boolean; reason: string }> {
    if (operation.kind === "action") return this.local.authorize({ caller: operation.caller, action: operation.action, resource: operation.resource });
    return this.kernelPolicy.authorize(operation.request);
  }

  /** Kernel-policy facade: the same decision, shaped as the kernel expects. */
  async governCapability(request: AuthorizationRequest): Promise<PolicyDecision> {
    const result = await this.govern({ kind: "capability", request });
    return { allow: result.allow, policyId: result.mode === "sea-forge" ? "sea-forge" : "local", reason: result.reason };
  }
}

const KNOWN: ReadonlySet<string> = new Set<Disposition>(["allow", "deny", "escalate", "unknown", "constrained_allow", "boundary", "degraded"]);

function interpret(mode: GovernanceMode, decision: GovernanceDecision): GovernedResult {
  const ref = decision.decisionRef === undefined ? {} : { decisionRef: decision.decisionRef };
  if (!decision || !KNOWN.has(decision.disposition)) return { allow: false, mode, disposition: "unknown", reason: "governance authority returned an unrecognized disposition" };
  switch (decision.disposition) {
    case "allow":
      return { allow: true, mode, disposition: "allow", reason: decision.reason, ...ref };
    case "constrained_allow":
    case "boundary":
    case "degraded":
      // Honoring constraints is Stage 6. Until then these refuse rather than silently widen into allow.
      return { allow: false, mode, disposition: decision.disposition, reason: `${decision.disposition} requires constraint handling that is not wired: ${decision.reason}`, ...ref };
    default:
      return { allow: false, mode, disposition: decision.disposition, reason: decision.reason, ...ref };
  }
}
