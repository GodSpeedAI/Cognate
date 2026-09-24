export type * from "./types.ts";
export { isCompatible } from "./compat.ts";
export { denyAll, rulePolicy, allowCapabilities, type Rule } from "./policy.ts";
export { CleanupError, PermanentActivationError, ActivationTimeoutError, UndeclaredCapabilityError, ScopeClosedError } from "./errors.ts";

/** Type guard distinguishing an unavailable resolution from a lease. */
export function isUnavailable(value: import("./types.ts").CapabilityLease | import("./types.ts").Unavailable): value is import("./types.ts").Unavailable {
  return "unavailable" in value && value.unavailable === true;
}
