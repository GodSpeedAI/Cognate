/**
 * Sign in with ChatGPT (SIWC) wire constants and request builders, per the current official
 * documentation (developers.openai.com/siwc). Production endpoints are only defaults: every
 * entry point accepts overrides so conformance tests run against a deterministic fake issuer.
 */
export const OPENAI_ISSUER = "https://auth.openai.com";
export const OPENAI_DISCOVERY_URL = `${OPENAI_ISSUER}/.well-known/openid-configuration`;
export const OPENAI_AUTHORIZATION_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/authorize`;
export const OPENAI_TOKEN_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/oauth/token`;
export const OPENAI_JWKS_URI = `${OPENAI_ISSUER}/.well-known/jwks.json`;
/** The only resource (and Responses origin) this flow covers. */
export const OPENAI_API_RESOURCE = "https://api.openai.com/v1";
/** First-registration client id; the callback returns the issued id (oaiapp_...). Never stored. */
export const DYNAMIC_AGENT_CLIENT_ID = "dynamic_agent_client";
/** Plan-usage scope whose absence means "signed in, but not authorized for plan-backed inference". */
export const PLAN_USE_SCOPE = "chatgpt.tokens.use.direct";
export const SIWC_SCOPES = ["openid", "profile", "email", "offline_access", "resource.invoke", PLAN_USE_SCOPE] as const;
/** Loopback callback path is fixed; only the port may vary between sign-ins. */
export const LOOPBACK_CALLBACK_PATH = "/auth/callback";

export interface DiscoveryDocument {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
  readonly revocation_endpoint: string;
}

export type HttpFetch = (input: string | URL | RequestInfo, init?: RequestInit) => Promise<Response>;

/** Discovery is cached per process; tests inject their own fetch and URL anyway. */
export async function discoverEndpoints(discoveryUrl: string = OPENAI_DISCOVERY_URL, fetchFn: HttpFetch = fetch): Promise<DiscoveryDocument> {
  const response = await fetchFn(discoveryUrl, {});
  if (!response.ok) throw new Error(`siwc: discovery failed (HTTP ${response.status})`);
  const document = (await response.json()) as Partial<DiscoveryDocument>;
  for (const key of ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri", "revocation_endpoint"] as const) {
    if (typeof document[key] !== "string") throw new Error(`siwc: discovery document is missing ${key}`);
  }
  return document as DiscoveryDocument;
}

export interface AuthorizationAttempt {
  /** Exact URL for the system browser. Never log it: id_token_hint may be embedded. */
  readonly authorizeUrl: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  /** The exact loopback redirect URI used in both the authorization request and the exchange. */
  readonly redirectUri: string;
}

export interface AuthorizeOptions {
  readonly authorizationEndpoint: string;
  readonly clientId: string;
  /** Stable opaque host identifier (urn:uuid:..., JWK-thumbprint URN, or did:key). */
  readonly extAgentHostId: string;
  readonly redirectUri: string;
  readonly appName?: string;
  /** Retained (possibly expired) ID token identifying the re-authorizing account. */
  readonly idTokenHint?: string;
  readonly loginHint?: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  /** force_reconsent/prompt=consent are opt-in; ordinary sign-ins must not force consent. */
  readonly forceConsent?: boolean;
}

/** Builds the authorization URL. Every value is URL-encoded; scope is the complete SIWC set. */
export function buildAuthorizationUrl(options: AuthorizeOptions): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    ext_agent_host_id: options.extAgentHostId,
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: SIWC_SCOPES.join(" "),
    resource: OPENAI_API_RESOURCE,
    state: options.state,
    nonce: options.nonce,
    code_challenge_method: "S256",
    code_challenge: options.codeChallenge,
  });
  if (options.appName) params.set("agent_name_hint", options.appName);
  if (options.idTokenHint) params.set("id_token_hint", options.idTokenHint);
  if (options.loginHint) params.set("login_hint", options.loginHint);
  if (options.forceConsent) params.set("prompt", "consent");
  return `${options.authorizationEndpoint}?${params.toString()}`;
}

export type ParsedCallback =
  | { readonly kind: "success"; readonly code: string; readonly state?: string; readonly clientId?: string; readonly scope?: string }
  | { readonly kind: "error"; readonly state?: string; readonly error: string; readonly errorDescription?: string };

/** Strict callback parsing: unknown parameters are ignored, nothing is echoed back. */
export function parseCallback(query: URLSearchParams): ParsedCallback {
  const state = query.get("state") ?? undefined;
  const error = query.get("error");
  if (error) return { kind: "error", state, error, errorDescription: query.get("error_description") ?? undefined };
  const code = query.get("code");
  if (!code) return { kind: "error", state, error: "invalid_request", errorDescription: "callback has neither code nor error" };
  const clientId = query.get("client_id") ?? undefined;
  const scope = query.get("scope") ?? undefined;
  return { kind: "success", code, state, clientId, scope };
}

export interface TokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly idToken: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
  readonly grantedScopes: readonly string[];
}

/** Form-encoded token request (authorization_code). No client secret in this public-client flow. */
export async function exchangeAuthorizationCode(options: {
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly fetch?: HttpFetch;
  readonly signal?: AbortSignal;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: options.clientId,
    code: options.code,
    code_verifier: options.codeVerifier,
    redirect_uri: options.redirectUri,
    resource: OPENAI_API_RESOURCE,
  });
  return tokenRequest(options.tokenEndpoint, body, options.fetch, options.signal);
}

export async function refreshTokens(options: {
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly refreshToken: string;
  readonly fetch?: HttpFetch;
  readonly signal?: AbortSignal;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: options.clientId,
    refresh_token: options.refreshToken,
    resource: OPENAI_API_RESOURCE,
    // Omit scope to retain the original grant.
  });
  return tokenRequest(options.tokenEndpoint, body, options.fetch, options.signal);
}

async function tokenRequest(endpoint: string, body: URLSearchParams, fetchFn: HttpFetch = fetch, signal?: AbortSignal): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetchFn(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(), signal });
  } catch {
    throw new Error("siwc: token endpoint unreachable");
  }
  if (!response.ok) throw await tokenEndpointError(response);
  let raw: Record<string, unknown>;
  try {
    raw = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("siwc: token endpoint returned invalid JSON");
  }
  const accessToken = raw.access_token, refreshToken = raw.refresh_token, idToken = raw.id_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string" || typeof idToken !== "string") {
    throw new Error("siwc: token response is missing required tokens");
  }
  const scope = typeof raw.scope === "string" ? raw.scope.split(" ").filter(Boolean) : [];
  return {
    accessToken,
    refreshToken,
    idToken,
    tokenType: typeof raw.token_type === "string" ? raw.token_type : "Bearer",
    expiresInSeconds: typeof raw.expires_in === "number" ? raw.expires_in : 3600,
    grantedScopes: scope,
  };
}

/** Refresh failures that mean "this token set will never work again" (per SIWC error reference). */
const TERMINAL_REFRESH_CODES = new Set([
  "invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired",
  "refresh_token_invalidated", "refresh_token_reused",
]);

export class TokenRefreshError extends Error {
  constructor(readonly code: string, readonly httpStatus: number | undefined, readonly terminal: boolean) {
    super(`siwc: refresh failed (${code})`);
  }
}

async function tokenEndpointError(response: Response): Promise<Error> {
  let code = "unknown_error";
  try {
    const raw = (await response.json()) as Record<string, unknown>;
    if (typeof raw.error === "string") code = raw.error;
  } catch {
    // Diagnostic only; the body may be {"detail": "..."} — never echoed further.
  }
  if (response.status >= 500) return new TokenRefreshError(code, response.status, false);
  return new TokenRefreshError(code, response.status, TERMINAL_REFRESH_CODES.has(code));
}

/** Revocation: an empty 200 is success, including for an already-invalid token. */
export async function revokeToken(options: {
  readonly revocationEndpoint: string;
  readonly clientId: string;
  readonly refreshToken: string;
  readonly fetch?: HttpFetch;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const fetchFn = options.fetch ?? fetch;
  const body = new URLSearchParams({ token: options.refreshToken, token_type_hint: "refresh_token", client_id: options.clientId });
  let response: Response;
  try {
    response = await fetchFn(options.revocationEndpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(), signal: options.signal });
  } catch {
    throw new Error("siwc: revocation endpoint unreachable; local tokens cleared but remote revocation was not confirmed");
  }
  if (response.status >= 500) throw new Error(`siwc: revocation not confirmed (HTTP ${response.status}); retry or disconnect in ChatGPT Settings`);
  // 200 (or any 4xx: already invalid) counts as confirmed per the SIWC error reference.
}
