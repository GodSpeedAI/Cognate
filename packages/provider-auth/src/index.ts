/**
 * Credentials are leased per request; never copy this object into an event, projection,
 * model capability description, error or log. This contract does not grant permission
 * to use a plan-backed subscription for unattended work.
 */
export interface CredentialLease {
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt?: number;
  readonly identityRef?: string;
  readonly grantedScopes?: readonly string[];
}
export interface CredentialSource {
  acquire(signal?: AbortSignal): Promise<CredentialLease>;
}
export type UsageMode = "interactive" | "authorized_automation";
export interface SubscriptionGrant {
  readonly identityRef: string;
  readonly scopes: readonly string[];
  /** Explicit user consent recorded by the host, not derived from token presence. */
  readonly automationApproved: boolean;
}
/** Local policy gate independent of the OAuth token. */
export function assertSubscriptionUse(grant: SubscriptionGrant, mode: UsageMode): void {
  if (!grant.scopes.includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan use has not been authorized");
  if (mode === "authorized_automation" && !grant.automationApproved) throw new Error("Unattended ChatGPT plan use requires explicit authorization");
}
export function apiKeySource(apiKey: () => string | Promise<string>, header: "authorization" | "x-api-key" = "authorization"): CredentialSource {
  return { async acquire() {
    const key = await apiKey();
    if (!key) throw new Error("Credential unavailable");
    return { headers: { [header]: header === "authorization" ? `Bearer ${key}` : key } };
  } };
}
export function bearerSource(accessToken: () => string | Promise<string>): CredentialSource {
  return apiKeySource(accessToken);
}
export function credentialHeaders(source?: CredentialSource, signal?: AbortSignal): Promise<Record<string, string>> {
  return source ? source.acquire(signal).then(lease => ({ ...lease.headers })) : Promise.resolve({});
}
