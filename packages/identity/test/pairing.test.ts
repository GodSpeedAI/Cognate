import { describe, expect, test } from "bun:test";
import { ChallengeStore, CHALLENGE_TTL_MS, PAIRING_TTL_MS, Pairing } from "../src/index.ts";

const subject = { tenant: "acme", operatorId: "op-1" };

describe("pairing link", () => {
  test("lifetime constants are 5 minutes and 2 minutes", () => {
    expect(PAIRING_TTL_MS).toBe(300_000);
    expect(CHALLENGE_TTL_MS).toBe(120_000);
  });

  test("a link is single use", () => {
    const pairing = new Pairing();
    const { secret } = pairing.start(subject, 1_000);
    const first = pairing.redeem(secret, 2_000);
    expect(first.ok).toBe(true);
    expect(pairing.redeem(secret, 2_001)).toEqual({ ok: false, reason: "used" });
  });

  test("redeeming yields enrolment only for the approved subject", () => {
    const pairing = new Pairing();
    const { secret } = pairing.start(subject, 0);
    const result = pairing.redeem(secret, 1);
    if (!result.ok) throw new Error("expected redeem");
    expect(result.subject).toEqual(subject);
    expect(Object.keys(result).sort()).toEqual(["challenge", "expiresAt", "ok", "subject", "ticket"]);
  });

  test("a link expires after five minutes", () => {
    const pairing = new Pairing();
    const { secret, expiresAt } = pairing.start(subject, 0);
    expect(expiresAt).toBe(PAIRING_TTL_MS);
    expect(pairing.redeem(secret, PAIRING_TTL_MS)).toEqual({ ok: false, reason: "expired" });
    expect(pairing.redeem(secret, 1)).toEqual({ ok: false, reason: "expired" });
  });

  test("the secret is not recoverable and malformed or wrong secrets are invalid", () => {
    const pairing = new Pairing();
    const { secret } = pairing.start(subject, 0);
    expect(pairing.pending(1)).toEqual({ expiresAt: PAIRING_TTL_MS });
    expect(JSON.stringify(pairing)).not.toContain(secret);
    expect(pairing.redeem("short", 1)).toEqual({ ok: false, reason: "invalid" });
    expect(pairing.redeem(42, 1)).toEqual({ ok: false, reason: "invalid" });
    expect(pairing.redeem(secret.replace(/^./, secret.startsWith("A") ? "B" : "A"), 1)).toEqual({ ok: false, reason: "invalid" });
    expect(pairing.redeem(secret, 1).ok).toBe(true);
  });

  test("off, refresh and stop fence older links", () => {
    const pairing = new Pairing();
    expect(pairing.redeem("x".repeat(43), 0)).toEqual({ ok: false, reason: "off" });
    const first = pairing.start(subject, 0);
    const second = pairing.refresh(subject, 1);
    expect(pairing.redeem(first.secret, 2)).toEqual({ ok: false, reason: "invalid" });
    pairing.stop();
    expect(pairing.redeem(second.secret, 2)).toEqual({ ok: false, reason: "off" });
  });
});

describe("challenge store", () => {
  test("a challenge is taken once", () => {
    const store = new ChallengeStore();
    const ticket = store.issue(new Uint8Array([1]), "auth", 0);
    expect(store.take(ticket, "auth", 1)).toEqual(new Uint8Array([1]));
    expect(store.take(ticket, "auth", 2)).toBeNull();
  });

  test("a challenge expires after two minutes, and a wrong kind burns it", () => {
    const store = new ChallengeStore();
    const late = store.issue(new Uint8Array([1]), "auth", 0);
    expect(store.take(late, "auth", CHALLENGE_TTL_MS)).toBeNull();
    const wrong = store.issue(new Uint8Array([2]), "auth", 0);
    expect(store.take(wrong, "register", 1)).toBeNull();
    expect(store.take(wrong, "auth", 2)).toBeNull();
  });
});
