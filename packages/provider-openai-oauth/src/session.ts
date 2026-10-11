/**
 * SIWC session lifecycle: system-browser sign-in over a loopback callback, strict callback and
 * ID-token validation, single-flight refresh with atomic rotation, revocation, and the
 * per-request CredentialSource lease. Secrets never enter logs, errors, or events: every error
 * path here carries at most status codes and issuer-minted error codes.
 */
import { spawn } from "node:child_process";
import type { CredentialLease, CredentialSource, SubscriptionGrant } from "@godspeedai/cognate-provider-auth";
import {
  DYNAMIC_AGENT_CLIENT_ID, LOOPBACK_CALLBACK_PATH, PLAN_USE_SCOPE, TokenRefreshError,
  buildAuthorizationUrl, discoverEndpoints, exchangeAuthorizationCode, parseCallback, refreshTokens, revokeToken,
  type HttpFetch, type ParsedCallback,
} from "./protocol.ts";
import { JwksClient, pkceChallenge, randomToken, validateIdToken } from "./jwt.ts";
import {
  approveAutomation, automationApproved, clearAccountTokens, ensureHostId, fromTokenResponse,
  listAccountRecords, readAccountRecord, revokeAutomationApproval, writeAccountRecord,
  type AccountRecord,
} from "./store.ts";

export type { AccountRecord };
export { approveAutomation, automationApproved, listAccountRecords, revokeAutomationApproval, ensureHostId };
export { PLAN_USE_SCOPE };

export interface SiwcOptions {
  /** App-local credential directory (see store.accountsDirectory for the default layout). */
  readonly accountsDir: string;
  /** The app's real name, used as agent_name_hint on initial dynamic registration. */
  readonly appName: string;
  /** Defaults to the production discovery document; tests point this at a fake issuer. */
  readonly discoveryUrl?: string;
  readonly fetch?: HttpFetch;
  /** Opens the authorization URL in the system browser; tests capture the URL instead. */
  readonly openBrowser?: (url: string) => void | Promise<void>;
  /** Fixed port for the loopback listener; default is an ephemeral port (only the port may vary). */
  readonly loopbackPort?: number;
  readonly now?: () => number;
  readonly clockSkewSeconds?: number;
  readonly signal?: AbortSignal;
}

export interface SignInHints {
  /** Re-authorize a specific saved registration (its issued client id). */
  readonly clientId?: string;
  readonly idTokenHint?: string;
  readonly loginHint?: string;
  /** Set when the operator explicitly (re-)requests plan usage after an earlier decline. */
  readonly forceConsent?: boolean;
}

export interface SignedIn {
  readonly record: AccountRecord;
  /** True when the granted scopes include chatgpt.tokens.use.direct. */
  readonly planUseEnabled: boolean;
}

interface PendingAttempt {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly isRegistration: boolean;
  readonly reauthSubject?: string;
}

/** One loopback sign-in attempt. The listener starts before the browser opens. */
export async function signIn(options: SiwcOptions, hints: SignInHints = {}): Promise<SignedIn> {
  const now = options.now?.() ?? Date.now();
  const discovery = await discoverEndpoints(options.discoveryUrl ?? "https://auth.openai.com/.well-known/openid-configuration", options.fetch);
  const hostId = await ensureHostId(options.accountsDir);

  const expected = hints.clientId ? await readAccountRecord(options.accountsDir, hints.clientId) : undefined;
  if (hints.clientId && !expected) throw new Error("siwc: no saved registration for the requested account");

  const attempt: PendingAttempt = {
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(48),
    isRegistration: !hints.clientId,
    reauthSubject: expected?.subject,
  };
  const listener = await startLoopbackListener(options.loopbackPort, options.signal);
  try {
    // Only the port may vary between sign-ins; scheme/host/path are fixed (127.0.0.1 + /auth/callback).
    const redirectUri = `http://127.0.0.1:${listener.port}${LOOPBACK_CALLBACK_PATH}`;
    const authorizeUrl = buildAuthorizationUrl({
      authorizationEndpoint: discovery.authorization_endpoint,
      clientId: hints.clientId ?? DYNAMIC_AGENT_CLIENT_ID,
      extAgentHostId: hostId,
      redirectUri,
      appName: attempt.isRegistration ? options.appName : undefined,
      idTokenHint: hints.idTokenHint ?? (expected?.idToken ? expected.idToken : undefined),
      loginHint: hints.loginHint ?? expected?.email,
      state: attempt.state,
      nonce: attempt.nonce,
      codeChallenge: pkceChallenge(attempt.codeVerifier),
      forceConsent: hints.forceConsent,
    });
    await (options.openBrowser ?? defaultOpenBrowser)(authorizeUrl);

    const callback = await listener.waitForCallback(attempt.state);
    if (callback.kind === "error") throw new Error(`siwc: authorization ended with ${callback.error}`);
    // Registration must return an issued client id; reauthorization must not switch clients.
    let clientId = hints.clientId;
    if (attempt.isRegistration) {
      if (!callback.clientId) throw new Error("siwc: registration callback lacked an issued client id; registration is incomplete");
      if (callback.clientId === DYNAMIC_AGENT_CLIENT_ID) throw new Error("siwc: callback returned the dynamic entrypoint id, not an issued client id");
      clientId = callback.clientId;
    } else if (callback.clientId && callback.clientId !== clientId) {
      throw new Error("siwc: callback supplied a different client id than the pending registration; rejected");
    }

    const tokens = await exchangeAuthorizationCode({
      tokenEndpoint: discovery.token_endpoint,
      clientId: clientId!,
      code: callback.code,
      codeVerifier: attempt.codeVerifier,
      redirectUri,
      fetch: options.fetch,
      signal: options.signal,
    });

    const jwks = new JwksClient(discovery.jwks_uri, options.fetch);
    const validated = await validateIdToken(tokens.idToken, {
      jwks,
      issuer: discovery.issuer,
      audience: clientId!,
      nonce: attempt.nonce,
      now: options.now,
      clockSkewSeconds: options.clockSkewSeconds,
    });
    // Reauthorization must stay on the selected account before anything is overwritten.
    if (!attempt.isRegistration && attempt.reauthSubject && validated.subject !== attempt.reauthSubject) {
      throw new Error("siwc: validated identity does not match the selected account; credentials not replaced");
    }

    const previous = await readAccountRecord(options.accountsDir, clientId!);
    const email = typeof validated.claims.email === "string" ? validated.claims.email : previous?.email;
    const record = fromTokenResponse(
      { subject: validated.subject, issuer: discovery.issuer, ...(email ? { email } : {}), clientId: clientId!, extAgentHostId: hostId },
      tokens,
      now,
    );
    await writeAccountRecord(options.accountsDir, record);
    const callbackScopes = (callback.scope ?? "").split(" ").filter(Boolean);
    return { record, planUseEnabled: record.grantedScopes.includes(PLAN_USE_SCOPE) || callbackScopes.includes(PLAN_USE_SCOPE) };
  } finally {
    await listener.close();
  }
}

/** Single-flight map keyed by client id: concurrent callers share one rotation. */
const inFlightRefreshes = new Map<string, Promise<AccountRecord>>();

export async function refreshAccount(options: SiwcOptions, clientId: string): Promise<AccountRecord> {
  const existing = inFlightRefreshes.get(clientId);
  if (existing) return existing;
  const task = (async (): Promise<AccountRecord> => {
    const record = await readAccountRecord(options.accountsDir, clientId);
    if (!record?.refreshToken) throw new Error("siwc: no refreshable credentials for this account; sign in again");
    const discovery = await discoverEndpoints(options.discoveryUrl ?? "https://auth.openai.com/.well-known/openid-configuration", options.fetch);
    try {
      const tokens = await refreshTokens({
        tokenEndpoint: discovery.token_endpoint,
        clientId: record.clientId,
        refreshToken: record.refreshToken,
        fetch: options.fetch,
        signal: options.signal,
      });
      // Rotation replaces access token, refresh token, scopes and expiry together, atomically.
      const updated = fromTokenResponse(
        { subject: record.subject, issuer: record.issuer, ...(record.email ? { email: record.email } : {}), clientId: record.clientId, extAgentHostId: record.extAgentHostId },
        tokens,
        options.now?.() ?? Date.now(),
      );
      await writeAccountRecord(options.accountsDir, updated);
      return updated;
    } catch (error) {
      if (error instanceof TokenRefreshError && error.terminal) {
        // Unusable token set: keep the registration mapping, clear the tokens, require sign-in.
        await clearAccountTokens(options.accountsDir, clientId);
      }
      throw error;
    }
  })();
  inFlightRefreshes.set(clientId, task);
  try {
    return await task;
  } finally {
    inFlightRefreshes.delete(clientId);
  }
}

/** Refresh errors that mean the token set will never work again (per the SIWC error reference). */
export { TokenRefreshError } from "./protocol.ts";

/**
 * Signs out: stop using tokens, revoke the renewable session remotely, then clear local token
 * material while retaining the account/client mapping and host id.
 */
export async function signOut(options: SiwcOptions, clientId: string): Promise<{ remoteRevoked: boolean }> {
  const record = await readAccountRecord(options.accountsDir, clientId);
  if (!record?.refreshToken) return { remoteRevoked: false };
  const discovery = await discoverEndpoints(options.discoveryUrl ?? "https://auth.openai.com/.well-known/openid-configuration", options.fetch);
  await revokeToken({ revocationEndpoint: discovery.revocation_endpoint, clientId: record.clientId, refreshToken: record.refreshToken, fetch: options.fetch, signal: options.signal });
  await clearAccountTokens(options.accountsDir, clientId);
  return { remoteRevoked: true };
}

const EXPIRY_MARGIN_MS = 60_000;

/** A CredentialSource that leases a valid access token per request and refreshes near expiry. */
export function subscriptionCredentialSource(options: SiwcOptions, clientId: string): CredentialSource & { grant(): Promise<{ subject: string; scopes: readonly string[] }> } {
  return {
    async acquire(_signal?: AbortSignal): Promise<CredentialLease> {
      let record = await readAccountRecord(options.accountsDir, clientId);
      if (!record?.accessToken) throw new Error("siwc: account is not signed in; complete sign-in first");
      if (record.expiresAt - EXPIRY_MARGIN_MS <= (options.now?.() ?? Date.now())) {
        record = await refreshAccount(options, clientId);
      }
      if (!record.grantedScopes.includes(PLAN_USE_SCOPE)) {
        throw new Error("siwc: ChatGPT plan use is not authorized for this account (scope chatgpt.tokens.use.direct was not granted)");
      }
      return {
        headers: { authorization: `Bearer ${record.accessToken}` },
        expiresAt: record.expiresAt,
        identityRef: record.subject,
        grantedScopes: record.grantedScopes,
      };
    },
    async grant() {
      const record = await readAccountRecord(options.accountsDir, clientId);
      if (!record) throw new Error("siwc: account is not signed in");
      return { subject: record.subject, scopes: record.grantedScopes };
    },
  };
}

/** The local policy grant consumed by assertSubscriptionUse (provider-auth). */
export async function subscriptionGrant(options: SiwcOptions, clientId: string): Promise<SubscriptionGrant> {
  const record = await readAccountRecord(options.accountsDir, clientId);
  if (!record) throw new Error("siwc: account is not signed in");
  return {
    identityRef: record.subject,
    scopes: record.grantedScopes,
    automationApproved: await automationApproved(options.accountsDir, record.subject),
  };
}

/** Explicit, separately-recorded automation authorization (local policy, independent of tokens). */
export async function ensureAutomationGrant(options: SiwcOptions, clientId: string, note?: string): Promise<void> {
  const record = await readAccountRecord(options.accountsDir, clientId);
  if (!record) throw new Error("siwc: account is not signed in");
  await approveAutomation(options.accountsDir, record.subject, note);
}

interface LoopbackListener {
  readonly port: number;
  waitForCallback(expectedState: string): Promise<ParsedCallback>;
  close(): Promise<void>;
}

/**
 * Binds 127.0.0.1 (never "localhost") on the permitted loopback interface and resolves exactly
 * one callback. The response page is static; reflected callback parameters would be injection.
 */
async function startLoopbackListener(port = 0, signal?: AbortSignal): Promise<LoopbackListener> {
  let resolveCallback: ((value: ParsedCallback) => void) | undefined;
  const callbackPromise = new Promise<ParsedCallback>((resolve) => {
    resolveCallback = resolve;
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname !== LOOPBACK_CALLBACK_PATH) return new Response("Not found", { status: 404 });
      const parsed = parseCallback(url.searchParams);
      resolveCallback?.(parsed);
      const page = parsed.kind === "success"
        ? "<!doctype html><title>Sign in complete</title><p>Sign-in complete. You can close this window and return to the app.</p>"
        : "<!doctype html><title>Sign in failed</title><p>Sign-in did not complete. Return to the app for details.</p>";
      return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  signal?.addEventListener("abort", () => resolveCallback?.({ kind: "error", error: "cancelled" }), { once: true });
  return {
    // Bun's Server types mark port optional; after a successful bind it is always set.
    port: server.port ?? 0,
    waitForCallback: (expectedState: string) =>
      Promise.race([
        callbackPromise.then((parsed) => {
          // State must match the pending attempt before anything is used.
          if (parsed.state !== expectedState) throw new Error("siwc: callback state mismatch; possible CSRF, attempt rejected");
          return parsed;
        }),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error("siwc: timed out waiting for the authorization callback")), 10 * 60_000);
          timer.unref?.();
        }),
      ]),
    close: async () => {
      server.stop(true);
    },
  };
}

/** Opens the system browser without a shell: each platform's opener is spawned directly. */
function defaultOpenBrowser(url: string): void {
  const candidates: readonly (readonly string[])[] = process.platform === "darwin"
    ? [["open", url]]
    : process.platform === "win32"
      ? [["cmd", "/c", "start", "", url]]
      : [["xdg-open", url]];
  for (const candidate of candidates) {
    try {
      const child = spawn(candidate[0]!, candidate.slice(1) as string[], { stdio: "ignore", detached: true });
      child.on("error", () => {});
      child.unref();
      return;
    } catch {
      // Try the next opener; total failure surfaces when the loop ends.
    }
  }
  throw new Error("siwc: could not open a system browser; open the authorization URL manually");
}
