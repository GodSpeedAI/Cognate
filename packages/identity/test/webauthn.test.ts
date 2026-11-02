import { describe, expect, test } from "bun:test";
import { ChallengeStore, assertRelyingParty, newChallenge, verifyAssertion, verifyRegistration, WebAuthnError } from "../src/index.ts";
import { SoftPasskey } from "./authenticator.ts";

const party = { rpId: "ops.example.test", origin: "https://ops.example.test" };

function enrolled(passkey = new SoftPasskey()) {
  const challenge = newChallenge();
  const registration = verifyRegistration(passkey.register({ challenge, ...party }), { challenge, ...party });
  return { passkey, registration };
}

async function code(run: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof WebAuthnError) return error.code;
    throw error;
  }
  return "accepted";
}

describe("registration", () => {
  test("accepts a valid registration", () => {
    expect(enrolled().registration.signCount).toBe(0);
  });

  test("rejects wrong origin, wrong RP ID and missing user verification", async () => {
    const passkey = new SoftPasskey();
    const challenge = newChallenge();
    expect(await code(() => verifyRegistration(passkey.register({ challenge, ...party, origin: "https://evil.example.test" }), { challenge, ...party }))).toBe("origin");
    expect(await code(() => verifyRegistration(passkey.register({ challenge, ...party, rpId: "other.example.test" }), { challenge, ...party }))).toBe("rp_id");
    expect(await code(() => verifyRegistration(passkey.register({ challenge, ...party, flags: { uv: false } }), { challenge, ...party }))).toBe("flags");
  });
});

describe("assertion", () => {
  test("accepts a valid assertion and reports the new sign count", async () => {
    const { passkey, registration } = enrolled();
    const challenge = newChallenge();
    const result = await verifyAssertion(passkey.assert({ challenge, ...party, signCount: 1 }), { challenge, ...party, publicKey: registration.publicKey, signCount: 0 });
    expect(result.signCount).toBe(1);
  });

  test("rejects wrong origin and wrong RP ID", async () => {
    const { passkey, registration } = enrolled();
    const challenge = newChallenge();
    const expected = { challenge, ...party, publicKey: registration.publicKey, signCount: 0 };
    expect(await code(() => verifyAssertion(passkey.assert({ challenge, ...party, origin: "https://evil.example.test", signCount: 1 }), expected))).toBe("origin");
    expect(await code(() => verifyAssertion(passkey.assert({ challenge, ...party, rpId: "other.example.test", signCount: 1 }), expected))).toBe("rp_id");
  });

  test("rejects missing user verification and missing user presence", async () => {
    const { passkey, registration } = enrolled();
    const challenge = newChallenge();
    const expected = { challenge, ...party, publicKey: registration.publicKey, signCount: 0 };
    expect(await code(() => verifyAssertion(passkey.assert({ challenge, ...party, signCount: 1, flags: { uv: false } }), expected))).toBe("flags");
    expect(await code(() => verifyAssertion(passkey.assert({ challenge, ...party, signCount: 1, flags: { up: false } }), expected))).toBe("flags");
  });

  test("rejects a sign count that does not increase", async () => {
    const { passkey, registration } = enrolled();
    const challenge = newChallenge();
    const expected = { challenge, ...party, publicKey: registration.publicKey, signCount: 5 };
    expect(await code(() => verifyAssertion(passkey.assert({ challenge, ...party, signCount: 5 }), expected))).toBe("sign_count");
    expect(await code(() => verifyAssertion(passkey.assert({ challenge, ...party, signCount: 3 }), expected))).toBe("sign_count");
  });

  test("rejects a signature made by another key", async () => {
    const { registration } = enrolled();
    const intruder = new SoftPasskey();
    const challenge = newChallenge();
    expect(await code(() => verifyAssertion(intruder.assert({ challenge, ...party, signCount: 1 }), { challenge, ...party, publicKey: registration.publicKey, signCount: 0 }))).toBe("signature");
  });

  test("a replayed challenge is refused: it can be taken only once", async () => {
    const { passkey, registration } = enrolled();
    const store = new ChallengeStore();
    const challenge = newChallenge();
    const ticket = store.issue(challenge, "auth", 0);
    const assertion = passkey.assert({ challenge, ...party, signCount: 1 });
    const first = store.take(ticket, "auth", 1);
    expect(first).not.toBeNull();
    await verifyAssertion(assertion, { challenge: first as Uint8Array, ...party, publicKey: registration.publicKey, signCount: 0 });
    expect(store.take(ticket, "auth", 2)).toBeNull();
    // A different challenge cannot satisfy the same signed client data either.
    expect(await code(() => verifyAssertion(assertion, { challenge: newChallenge(), ...party, publicKey: registration.publicKey, signCount: 1 }))).toBe("challenge");
  });
});

describe("relying party configuration", () => {
  test("is required and validated, never derived", () => {
    expect(assertRelyingParty(party)).toEqual(party);
    expect(() => assertRelyingParty({ rpId: "", origin: "https://a.test" })).toThrow(WebAuthnError);
    expect(() => assertRelyingParty({ rpId: "a.test", origin: "not a url" })).toThrow(WebAuthnError);
    expect(() => assertRelyingParty({ rpId: "a.test", origin: "https://b.test" })).toThrow(WebAuthnError);
    expect(() => assertRelyingParty({ rpId: "a.test", origin: "https://a.test/path" })).toThrow(WebAuthnError);
  });
});
