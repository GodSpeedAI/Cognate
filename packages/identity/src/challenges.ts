import { randomBytes } from "node:crypto";
import { b64url } from "./webauthn.ts";

export const CHALLENGE_TTL_MS = 2 * 60_000;

export type ChallengeKind = "register" | "auth";

interface Challenge {
  readonly challenge: Uint8Array;
  readonly kind: ChallengeKind;
  readonly generation: number;
  readonly expiresAt: number;
}

/**
 * Single-use WebAuthn challenges with a two minute lifetime, bound to a kind and a generation. In
 * memory by design: a restart drops every outstanding challenge.
 */
export class ChallengeStore {
  private readonly entries = new Map<string, Challenge>();

  /** Bumping the generation makes every outstanding challenge unusable. */
  generation = 0;

  issue(challenge: Uint8Array, kind: ChallengeKind, now: number): string {
    this.purge(now);
    const ticket = b64url(randomBytes(32));
    this.entries.set(ticket, { challenge, kind, generation: this.generation, expiresAt: now + CHALLENGE_TTL_MS });
    return ticket;
  }

  /** The challenge is gone after this call whether or not the caller then succeeds. */
  take(ticket: unknown, kind: ChallengeKind, now: number): Uint8Array | null {
    if (typeof ticket !== "string") return null;
    const entry = this.entries.get(ticket);
    if (entry === undefined) return null;
    this.entries.delete(ticket);
    if (entry.kind !== kind || entry.generation !== this.generation || now >= entry.expiresAt) return null;
    return entry.challenge;
  }

  clear(): void {
    this.entries.clear();
  }

  private purge(now: number): void {
    for (const [ticket, entry] of this.entries) if (now >= entry.expiresAt) this.entries.delete(ticket);
  }
}
