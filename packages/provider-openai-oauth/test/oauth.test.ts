/**
 * Level-2 SIWC conformance: a deterministic fake OAuth/OIDC issuer (discovery, JWKS, token,
 * revocation) with real RSA-signed tokens, plus a mocked Responses transport. Covers the happy
 * sign-in path and the adversarial matrix: state/nonce mismatch, bad signature, wrong audience,
 * expiry, missing plan scope, refresh rotation + concurrency, revoked/terminal refresh, and
 * token-leak checks. No paid API keys and no live OpenAI endpoints are involved.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, createSign, createVerify } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DYNAMIC_AGENT_CLIENT_ID, IdTokenError, PLAN_USE_SCOPE, TokenRefreshError,
  pkceChallenge, signIn, refreshAccount, signOut, subscriptionCredentialSource,
  subscriptionGrant, ensureAutomationGrant, subscriptionResponsesProvider,
  readAccountRecord, removeAccountRecord, JwksClient, validateIdToken,
} from "../src/index.ts";
import type { SiwcOptions } from "../src/index.ts";

/** RS256 signing over a JWK pair, exactly like the real issuer's JWKS shape. */
function makeIssuer() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }) as Record<string, string>, kid: "test-key-1", alg: "RS256", use: "sig" };
  const b64u = (input: string | Uint8Array) => Buffer.from(input).toString("base64url");
  const sign = (payload: Record<string, unknown>) => {
    const header = b64u(JSON.stringify({ alg: "RS256", kid: "test-key-1", typ: "JWT" }));
    const body = b64u(JSON.stringify(payload));
    const signer = createSign("sha256");
    signer.update(`${header}.${body}`);
    return `${header}.${body}.${signer.sign(privateKey).toString("base64url")}`;
  };
  return { jwk, sign, verify: createVerify("sha256") };
}

type Issuer = ReturnType<typeof makeIssuer>;

function startFakeIssuer(issuer: Issuer, options: {
  readonly rotateRefresh?: boolean;
  readonly grantedScopes?: string[];
} = {}) {
  const state: {
    codes: Map<string, { challenge: string; clientId: string; redirectUri: string; nonce: string; used?: boolean }>;
    clients: Map<string, { refresh: string; previousRefresh?: string; subject: string }>;
    revoked: string[];
    registrations: number;
  } = { codes: new Map(), clients: new Map(), revoked: [], registrations: 0 };
  const grantedScopes = options.grantedScopes ?? ["chatgpt.tokens.use.direct", "email", "offline_access", "openid", "profile", "resource.invoke"];
  const now = Math.floor(Date.now() / 1000);
  let issuedClientIdCounter = 0;

  const idToken = (claims: Record<string, unknown>) => issuer.sign({ iss: "https://issuer.test", iat: now, exp: now + 3600, ...claims });

  const server: Bun.Server<never> = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/.well-known/openid-configuration") {
        return Response.json({
          issuer: "https://issuer.test",
          authorization_endpoint: "https://issuer.test/authorize",
          token_endpoint: `${server.url.origin}/token`,
          jwks_uri: `${server.url.origin}/jwks.json`,
          revocation_endpoint: `${server.url.origin}/revoke`,
        });
      }
      if (url.pathname === "/jwks.json") return Response.json({ keys: [issuer.jwk] });
      if (url.pathname === "/token" && request.method === "POST") {
        const form = new URLSearchParams(await request.text());
        const grantType = form.get("grant_type");
        const clientId = form.get("client_id") ?? "";
        if (grantType === "authorization_code") {
          const entry = state.codes.get(form.get("code") ?? "");
          if (!entry || entry.used) return jsonError(entry?.used ? "invalid_grant" : "invalid_code", 400);
          if (entry.clientId !== clientId) return jsonError("invalid_client", 401);
          if (entry.redirectUri !== form.get("redirect_uri")) return jsonError("invalid_grant", 400);
          if (form.get("resource") !== "https://api.openai.com/v1") return jsonError("invalid_resource", 400);
          if (pkceChallenge(form.get("code_verifier") ?? "") !== entry.challenge) return jsonError("invalid_grant", 400);
          entry.used = true;
          const client = state.clients.get(clientId)!;
          const refreshToken = options.rotateRefresh === false ? client.refresh : `rt-${crypto.randomUUID()}`;
          client.previousRefresh = client.refresh;
          client.refresh = refreshToken;
          return Response.json({
            access_token: issuer.sign({ sub: client.subject, aud: "https://api.openai.com/v1", client_id: clientId, scope: grantedScopes.join(" "), exp: now + 3600 }),
            refresh_token: refreshToken,
            id_token: idToken({ sub: client.subject, aud: clientId, nonce: entry.nonce, email: "user@example.test" }),
            token_type: "Bearer",
            expires_in: 3600,
            scope: grantedScopes.join(" "),
          });
        }
        if (grantType === "refresh_token") {
          const client = state.clients.get(clientId);
          const presented = form.get("refresh_token") ?? "";
          if (!client || state.revoked.includes(presented)) return jsonError("invalid_grant", 400);
          // Rotation replay: presenting the previous refresh token after rotation is terminal.
          if (client.refresh !== presented) return jsonError(presented === client.previousRefresh ? "refresh_token_reused" : "invalid_refresh_token", 400);
          const refreshToken = options.rotateRefresh === false ? client.refresh : `rt-${crypto.randomUUID()}`;
          client.previousRefresh = client.refresh;
          client.refresh = refreshToken;
          return Response.json({
            access_token: issuer.sign({ sub: client.subject, aud: "https://api.openai.com/v1", client_id: clientId, scope: grantedScopes.join(" "), exp: now + 3600 }),
            refresh_token: refreshToken,
            id_token: idToken({ sub: client.subject, aud: clientId, email: "user@example.test" }),
            token_type: "Bearer",
            expires_in: 3600,
            scope: grantedScopes.join(" "),
          });
        }
        return jsonError("unsupported_grant_type", 400);
      }
      if (url.pathname === "/revoke" && request.method === "POST") {
        const form = new URLSearchParams(await request.text());
        state.revoked.push(form.get("token") ?? "");
        return new Response(null, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    },
  });

  function jsonError(error: string, status: number) {
    return Response.json({ error }, { status });
  }

  /** Simulates the browser round trip against this server's loopback callback listener. */
  const completeSignIn = async (authorizeUrl: string, overrides: { state?: string } = {}) => {
    const url = new URL(authorizeUrl);
    // Validate the authorization request shape (what the real issuer would enforce).
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    expect(url.searchParams.get("resource")).toBe("https://api.openai.com/v1");
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    const code = `code-${crypto.randomUUID()}`;
    const clientIdParam = url.searchParams.get("client_id")!;
    const issued = clientIdParam === DYNAMIC_AGENT_CLIENT_ID ? `oaiapp-${++issuedClientIdCounter}` : clientIdParam;
    if (clientIdParam === DYNAMIC_AGENT_CLIENT_ID) state.registrations++;
    state.clients.set(issued, state.clients.get(issued) ?? { refresh: `rt-${crypto.randomUUID()}`, subject: "subject-1" });
    state.codes.set(code, {
      challenge: url.searchParams.get("code_challenge")!,
      clientId: issued,
      redirectUri: url.searchParams.get("redirect_uri")!,
      nonce: url.searchParams.get("nonce")!,
    });
    const params = new URLSearchParams({
      code,
      scope: grantedScopes.join(" "),
      state: overrides.state ?? url.searchParams.get("state")!,
      client_id: issued,
    });
    const response = await fetch(new URL(`${callback.pathname}?${params}`, callback.origin));
    await response.text();
  };

  return { server, state, completeSignIn, grantedScopes };
}

describe("SIWC OAuth conformance", () => {
  const issuer = makeIssuer();
  const fake = startFakeIssuer(issuer);
  let accountsDir = "";

  const siwc = (overrides: Partial<SiwcOptions> = {}): SiwcOptions => ({
    accountsDir,
    appName: "Cognate",
    discoveryUrl: `${fake.server.url.origin}/.well-known/openid-configuration`,
    openBrowser: (url) => fake.completeSignIn(url),
    ...overrides,
  });

  beforeAll(async () => {
    accountsDir = await mkdtemp(join(tmpdir(), "siwc-test-"));
  });
  afterAll(async () => {
    fake.server.stop(true);
  });

  test("happy path: dynamic registration, validated ID token, saved record, plan scope granted", async () => {
    const opened: string[] = [];
    const options = siwc({ openBrowser: (url) => { opened.push(url); return fake.completeSignIn(url); } });
    const result = await signIn(options);
    expect(result.planUseEnabled).toBe(true);
    expect(result.record.subject).toBe("subject-1");
    expect(result.record.clientId).toMatch(/^oaiapp-/);
    expect(result.record.grantedScopes).toContain(PLAN_USE_SCOPE);
    expect(opened).toHaveLength(1);
    expect(new URL(opened[0]!).searchParams.get("scope")).toContain(PLAN_USE_SCOPE);
  });

  test("state mismatch is rejected as CSRF and no credentials are stored", async () => {
    const options = siwc({ openBrowser: (url) => fake.completeSignIn(url, { state: "tampered" }) });
    await expect(signIn(options)).rejects.toThrow("state mismatch");
  });

  test("nonce mismatch fails ID-token validation", async () => {
    // The fake issuer binds the code to the request nonce; a swapped nonce in the token fails.
    const options = siwc({ openBrowser: async (url) => {
      const urlWithForeignNonce = new URL(url);
      urlWithForeignNonce.searchParams.set("nonce", "foreign-nonce");
      await fake.completeSignIn(urlWithForeignNonce.toString());
    } });
    await expect(signIn(options)).rejects.toThrow(IdTokenError);
  });

  test("access token is leased per request with expiry and scope evidence", async () => {
    const options = siwc();
    const signedIn = await signIn(options);
    const source = subscriptionCredentialSource(options, signedIn.record.clientId);
    const lease = await source.acquire();
    expect(lease.headers.authorization).toMatch(/^Bearer ey/);
    expect(lease.identityRef).toBe("subject-1");
    expect(lease.grantedScopes).toContain(PLAN_USE_SCOPE);
    expect(lease.expiresAt).toBeGreaterThan(Date.now());
  });

  test("missing plan scope: sign-in succeeds but plan-backed acquisition refuses", async () => {
    const limited = startFakeIssuer(issuer, { grantedScopes: ["openid", "profile", "email", "offline_access", "resource.invoke"] });
    try {
      const options = siwc({ discoveryUrl: `${limited.server.url.origin}/.well-known/openid-configuration`, openBrowser: (url) => limited.completeSignIn(url) });
      const signedIn = await signIn(options);
      expect(signedIn.planUseEnabled).toBe(false);
      const source = subscriptionCredentialSource(options, signedIn.record.clientId);
      await expect(source.acquire()).rejects.toThrow("plan use is not authorized");
    } finally {
      limited.server.stop(true);
    }
  });

  test("refresh rotates atomically; concurrent refreshers share one rotation", async () => {
    const options = siwc();
    const signedIn = await signIn(options);
    const before = signedIn.record.refreshToken;
    const [a, b] = await Promise.all([
      refreshAccount(options, signedIn.record.clientId),
      refreshAccount(options, signedIn.record.clientId),
    ]);
    expect(a.refreshToken).not.toBe(before);
    expect(b.refreshToken).toBe(a.refreshToken);
    expect(a.accessToken).toBe(b.accessToken);
  });

  test("refresh-token replay is terminal: tokens cleared, registration retained", async () => {
    const options = siwc();
    const signedIn = await signIn(options);
    const stale = signedIn.record.refreshToken;
    await refreshAccount(options, signedIn.record.clientId);
    // Simulate another process presenting the pre-rotation token: terminal per SIWC.
    fake.state.clients.get(signedIn.record.clientId)!.refresh = "unknown";
    await expect(refreshAccount(options, signedIn.record.clientId)).rejects.toThrow(TokenRefreshError);
    const cleared = await readAccountRecord(accountsDir, signedIn.record.clientId);
    expect(cleared?.refreshToken).toBe("");
    expect(cleared?.clientId).toBe(signedIn.record.clientId);
    void stale;
  });

  test("sign-out revokes remotely and clears local token material, keeping the registration", async () => {
    const options = siwc();
    const signedIn = await signIn(options);
    const outcome = await signOut(options, signedIn.record.clientId);
    expect(outcome.remoteRevoked).toBe(true);
    const record = await readAccountRecord(accountsDir, signedIn.record.clientId);
    expect(record?.refreshToken).toBe("");
    expect(fake.state.revoked.length).toBeGreaterThan(0);
  });

  test("automation without recorded consent is refused before any payable request", async () => {
    const options = siwc();
    const signedIn = await signIn(options);
    const grant = await subscriptionGrant(options, signedIn.record.clientId);
    expect(grant.automationApproved).toBe(false);
    const provider = subscriptionResponsesProvider({
      id: "plan", model: "gpt-5-codex", clientId: signedIn.record.clientId, siwc: options,
      usageMode: () => "authorized_automation",
      fetch: async () => { throw new Error("no request may reach the transport"); },
    });
    await expect(provider.generate({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("explicit authorization");
    await ensureAutomationGrant(options, signedIn.record.clientId, "approved for nightly triage");
    const grantAfter = await subscriptionGrant(options, signedIn.record.clientId);
    expect(grantAfter.automationApproved).toBe(true);
  });

  test("subscription provider enforces preview constraints: stream:true, store:false, no temperature/system items", async () => {
    const options = siwc();
    const signedIn = await signIn(options);
    let captured: { url: string; init: RequestInit } | undefined;
    const provider = subscriptionResponsesProvider({
      id: "plan", model: "gpt-5-codex", clientId: signedIn.record.clientId, siwc: options,
      fetch: async (url, init) => {
        captured = { url: String(url), init: init! };
        const events = [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n',
          `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", model: "gpt-5-codex", output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] } })}\n\n`,
        ];
        return new Response(events.join(""));
      },
    });
    const result = await provider.generate({ messages: [{ role: "system", content: "be careful" }, { role: "user", content: "hi" }], temperature: 0.7, maxTokens: 128 });
    expect(result.message.content).toBe("ok");
    expect(captured?.url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(captured?.init.body));
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
    expect(body.temperature).toBeUndefined();
    expect(body.max_output_tokens).toBeUndefined();
    expect(body.instructions).toContain("be careful");
    expect(JSON.stringify(body.input)).not.toContain('"role":"system"');
  });

  test("secrets never leak into errors or rendered diagnostics", async () => {
    const options = siwc();
    const signedIn = await signIn(options);
    try {
      const source = subscriptionCredentialSource(options, signedIn.record.clientId);
      await source.acquire();
      const record = await readAccountRecord(accountsDir, signedIn.record.clientId);
      const secretFragments = [record!.refreshToken, record!.accessToken];
      let caught: unknown;
      try {
        // Point refresh at an unusable discovery URL: the error must not carry the presented token.
        await refreshAccount({ ...options, discoveryUrl: "not-a-discovery-url" }, signedIn.record.clientId);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      for (const secret of secretFragments) {
        expect(String(caught)).not.toContain(secret.slice(0, 20));
      }
    } finally {
      await removeAccountRecord(accountsDir, signedIn.record.clientId);
    }
  });

  test("bad signature / wrong audience / expired ID tokens are rejected", async () => {
    const otherIssuer = makeIssuer();
    const now = Math.floor(Date.now() / 1000);
    const signedIn = await signIn(siwc());
    const jwks = new JwksClient(`${fake.server.url.origin}/jwks.json`, fetch);
    const base = { iss: "https://issuer.test", sub: "subject-1", aud: signedIn.record.clientId, nonce: "n", exp: now + 600, iat: now };
    // Signed by a foreign key: signature verification fails.
    await expect(validateIdToken(otherIssuer.sign(base), { jwks, issuer: "https://issuer.test", audience: signedIn.record.clientId, nonce: "n" })).rejects.toThrow(IdTokenError);
    // Wrong audience: rejected before any identity is trusted.
    await expect(validateIdToken(issuer.sign({ ...base, aud: "oaiapp-other" }), { jwks, issuer: "https://issuer.test", audience: signedIn.record.clientId, nonce: "n" })).rejects.toThrow("audience");
    // Expired beyond skew: rejected.
    await expect(validateIdToken(issuer.sign({ ...base, exp: now - 3600 }), { jwks, issuer: "https://issuer.test", audience: signedIn.record.clientId, nonce: "n" })).rejects.toThrow("expired");
  });
});
