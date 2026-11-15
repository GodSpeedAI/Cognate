/**
 * The pairing link: single use, five minutes, a 32-byte secret of which only the SHA-256 verifier is
 * kept. Redeeming it is one synchronous step that checks and consumes together.
 *
 * Authority: the link authorises passkey enrolment, for the operator that an already-approved
 * pairing flow named when the link was started. It never creates an operator identity, never
 * grants a role and never issues a session. Enrolment itself (devices.ts) requires that the
 * operator already exists and is active.
 */
import { createHash, randomBytes } from "node:crypto";
import { ChallengeStore, CHALLENGE_TTL_MS } from "./challenges.ts";
import { b64url, equalBytes, fromB64url, newChallenge } from "./webauthn.ts";

export const PAIRING_TTL_MS = 5 * 60_000;
const SECRET_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** The operator a pairing link may enrol a passkey for, fixed by the approval, never by the redeemer. */
export interface PairingSubject {
  readonly tenant: string;
  readonly operatorId: string;
}

export type RedeemResult =
  | { readonly ok: true; readonly subject: PairingSubject; readonly ticket: string; readonly challenge: Uint8Array; readonly expiresAt: number }
  | { readonly ok: false; readonly reason: "off" | "used" | "expired" | "invalid" };

function verifierOf(secret: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(fromB64url(secret)).digest());
}

export class Pairing {
  readonly challenges = new ChallengeStore();
  private enabled = false;
  private verifier: Uint8Array | null = null;
  private subject: PairingSubject | null = null;
  private expiresAt = 0;
  private dead: { readonly verifier: Uint8Array; readonly reason: "used" | "expired" } | null = null;

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Turn pairing on for an approved flow and issue its first link. */
  start(subject: PairingSubject, now: number): { readonly secret: string; readonly expiresAt: number } {
    this.enabled = true;
    return this.refresh(subject, now);
  }

  /** A new link. The previous link and every outstanding challenge stop working. The secret is returned once and not kept. */
  refresh(subject: PairingSubject, now: number): { readonly secret: string; readonly expiresAt: number } {
    this.challenges.generation += 1;
    this.challenges.clear();
    const secret = b64url(randomBytes(32));
    this.verifier = verifierOf(secret);
    this.subject = { tenant: subject.tenant, operatorId: subject.operatorId };
    this.expiresAt = now + PAIRING_TTL_MS;
    this.dead = null;
    return { secret, expiresAt: this.expiresAt };
  }

  stop(): void {
    this.enabled = false;
    this.challenges.generation += 1;
    this.challenges.clear();
    this.verifier = null;
    this.subject = null;
    this.dead = null;
  }

  /** Whether a link is waiting to be redeemed. The secret itself is not recoverable. */
  pending(now: number): { readonly expiresAt: number } | null {
    if (!this.enabled || this.verifier === null || now >= this.expiresAt) return null;
    return { expiresAt: this.expiresAt };
  }

  /** Check and consume in one synchronous step: two concurrent redemptions cannot both succeed. */
  redeem(secret: unknown, now: number): RedeemResult {
    if (!this.enabled) return { ok: false, reason: "off" };
    if (typeof secret !== "string" || !SECRET_SHAPE.test(secret)) return { ok: false, reason: "invalid" };
    const presented = verifierOf(secret);
    if (this.verifier === null || this.subject === null) {
      const reason = this.dead !== null && equalBytes(presented, this.dead.verifier) ? this.dead.reason : "invalid";
      return { ok: false, reason };
    }
    if (!equalBytes(presented, this.verifier)) return { ok: false, reason: "invalid" };
    const subject = this.subject;
    const expired = now >= this.expiresAt;
    this.dead = { verifier: this.verifier, reason: expired ? "expired" : "used" };
    this.verifier = null;
    this.subject = null;
    if (expired) return { ok: false, reason: "expired" };
    const challenge = newChallenge();
    const ticket = this.challenges.issue(challenge, "register", now);
    return { ok: true, subject, ticket, challenge, expiresAt: now + CHALLENGE_TTL_MS };
  }
}
