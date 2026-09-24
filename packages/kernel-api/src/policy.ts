import type { AuthorizationRequest, Policy, PolicyDecision } from "./types.ts";

/** Default policy: no authority (spec §32). */
export const denyAll: Policy = {
  authorize: () => ({ allow: false, policyId: "deny-all", reason: "no policy grants this invocation" }),
};

export type Rule = (request: AuthorizationRequest) => PolicyDecision | undefined;

/** First matching rule decides; no match denies. */
export function rulePolicy(policyId: string, rules: readonly Rule[]): Policy {
  return {
    authorize(request) {
      for (const rule of rules) {
        const decision = rule(request);
        if (decision) return decision;
      }
      return { allow: false, policyId, reason: "no rule matched" };
    },
  };
}

/** Allow invocations of the listed capability ids by any actor. Intended for tests and profiles that state it explicitly. */
export function allowCapabilities(policyId: string, capabilities: readonly string[]): Policy {
  const allowed = new Set(capabilities);
  return rulePolicy(policyId, [
    (request) => (allowed.has(request.capability.id) ? { allow: true, policyId, reason: `capability ${request.capability.id} allowed` } : undefined),
  ]);
}
