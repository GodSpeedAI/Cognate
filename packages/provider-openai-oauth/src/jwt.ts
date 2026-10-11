/**
 * Minimal JWT validation against a JWKS. RS256 and ES256 only — the algorithms OpenAI's
 * discovery documents publish — so an `alg` confusion or "none" token cannot pass.
 * No third-party JWT library: the validation surface is small and fully tested here.
 */
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
import type { HttpFetch } from "./protocol.ts";

export interface Jwk {
  readonly kty: string;
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
  readonly n?: string;
  readonly e?: string;
  readonly crv?: string;
  readonly x?: string;
  readonly y?: string;
  readonly [key: string]: unknown;
}

export interface ValidatedIdToken {
  readonly issuer: string;
  readonly subject: string;
  readonly audience: string;
  readonly nonce: string | undefined;
  readonly claims: Readonly<Record<string, unknown>>;
}

export class IdTokenError extends Error {
  constructor(reason: string) {
    super(`siwc: id token rejected (${reason})`);
  }
}

interface JwksCache {
  readonly keys: readonly Jwk[];
  readonly fetchedAt: number;
}

/** Keys are cached briefly; an unfamiliar kid forces exactly one refresh (never a loop). */
export class JwksClient {
  #cache: JwksCache | undefined;
  #refreshing: Promise<readonly Jwk[]> | undefined;
  constructor(private readonly jwksUri: string, private readonly fetchFn: HttpFetch = fetch, private readonly ttlMs = 300_000) {}

  async keyFor(kid: string | undefined, alg: string): Promise<Jwk> {
    if (!this.#cache || Date.now() - this.#cache.fetchedAt > this.ttlMs) await this.#refresh();
    const found = this.#select(kid, alg);
    if (found) return found;
    await this.#refresh();
    const retry = this.#select(kid, alg);
    if (!retry) throw new IdTokenError("no JWKS key matches kid/alg");
    return retry;
  }

  #select(kid: string | undefined, alg: string): Jwk | undefined {
    const keys = this.#cache?.keys ?? [];
    return keys.find((key) => (kid === undefined || key.kid === kid) && (key.alg === undefined || key.alg === alg) && key.use !== "enc");
  }

  async #refresh(): Promise<void> {
    if (this.#refreshing) return void (await this.#refreshing);
    this.#refreshing = (async () => {
      const response = await this.fetchFn(this.jwksUri, {});
      if (!response.ok) throw new IdTokenError(`JWKS fetch failed (HTTP ${response.status})`);
      const document = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(document.keys)) throw new IdTokenError("JWKS document has no keys array");
      const keys = document.keys.filter((k): k is Jwk => !!k && typeof k === "object" && ((k as Jwk).kty === "RSA" || (k as Jwk).kty === "EC"));
      this.#cache = { keys, fetchedAt: Date.now() };
      return keys;
    })();
    try {
      await this.#refreshing;
    } finally {
      this.#refreshing = undefined;
    }
  }
}

export function base64UrlDecode(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export interface IdTokenValidation {
  readonly jwks: JwksClient;
  readonly issuer: string;
  readonly audience: string;
  readonly nonce: string | undefined;
  readonly now?: () => number;
  readonly clockSkewSeconds?: number;
}

/** Verifies signature (against JWKS), iss, aud, exp/nbf/iat with small skew, and nonce. */
export async function validateIdToken(idToken: string, options: IdTokenValidation): Promise<ValidatedIdToken> {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new IdTokenError("malformed token structure");
  let header: { alg?: unknown; kid?: unknown }, claims: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as { alg?: unknown; kid?: unknown };
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as Record<string, unknown>;
  } catch {
    throw new IdTokenError("undecodable header or payload");
  }
  const alg = typeof header.alg === "string" ? header.alg : undefined;
  const kid = typeof header.kid === "string" ? header.kid : undefined;
  if (alg !== "RS256" && alg !== "ES256") throw new IdTokenError(`unsupported alg ${String(alg)}`);
  const jwk = await options.jwks.keyFor(kid, alg);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);
  // ES256 JWS signatures are raw r||s; node expects ieee-p1363 for WebCrypto parity.
  const valid = cryptoVerify("sha256", signed, { key: createPublicKey({ key: jwk as never, format: "jwk" }), dsaEncoding: "ieee-p1363" }, signature);
  if (!valid) throw new IdTokenError("signature verification failed");

  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  const issuer = typeof claims.iss === "string" ? claims.iss : undefined;
  if (issuer !== options.issuer) throw new IdTokenError(`issuer mismatch: ${issuer ?? "missing"}`);
  const audience = claims.aud;
  const audienceOk = typeof audience === "string" ? audience === options.audience : Array.isArray(audience) && audience.includes(options.audience);
  if (!audienceOk) throw new IdTokenError("audience does not include the issued client id");
  if (typeof claims.exp !== "number" || claims.exp <= now - skew) throw new IdTokenError("token expired");
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > now + skew)) throw new IdTokenError("token not yet valid");
  if (claims.iat !== undefined && typeof claims.iat !== "number") throw new IdTokenError("malformed iat");
  const subject = typeof claims.sub === "string" && claims.sub ? claims.sub : undefined;
  if (!subject) throw new IdTokenError("missing subject");
  if (options.nonce !== undefined && claims.nonce !== options.nonce) throw new IdTokenError("nonce mismatch");
  return { issuer, subject, audience: options.audience, nonce: typeof claims.nonce === "string" ? claims.nonce : undefined, claims };
}

/** PKCE S256: base64url(SHA-256(verifier)), unpadded. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return Buffer.from(randomBytes(bytes)).toString("base64url");
}
