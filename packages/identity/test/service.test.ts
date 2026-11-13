import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { DEVICES, IdentityError, SESSIONS, createIdentityService, newChallenge, verifyRegistration } from "../src/index.ts";
import { SoftPasskey } from "./authenticator.ts";

const party = { rpId: "ops.example.test", origin: "https://ops.example.test" };
const tenant = "acme";
const operatorId = "operator-one";

function setup() {
  const store = createMemoryStore();
  let now = Date.UTC(2026, 0, 1);
  const service = createIdentityService(store, { clock: () => now });
  return { store, service, advance: (ms: number) => { now += ms; } };
}

function registration(passkey: SoftPasskey) {
  const challenge = newChallenge();
  return verifyRegistration(passkey.register({ challenge, ...party }), { challenge, ...party });
}

describe("operator and session", () => {
  test("a session resolves to the durable identity and its Caller", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId, label: "Primary" });
    const issued = await service.issueSession({ tenant, operatorId });
    const resolved = await service.resolveSession(issued.token);
    expect(resolved?.caller).toEqual({ tenant, actor: { id: operatorId, kind: "user" } });
    expect(resolved?.operator.status).toBe("active");
  });

  test("only the token hash is stored", async () => {
    const { service, store } = setup();
    await service.registerOperator({ tenant, operatorId });
    const issued = await service.issueSession({ tenant, operatorId });
    const stored = await store.listRecords(SESSIONS);
    expect(JSON.stringify(stored)).not.toContain(issued.token);
    expect(stored[0]?.value.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an unknown token, a forged identity string and a malformed token resolve to nothing", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    expect(await service.resolveSession("idt1." + "A".repeat(43))).toBeUndefined();
    expect(await service.resolveSession(`${tenant}/${operatorId}`)).toBeUndefined();
    expect(await service.resolveSession(undefined)).toBeUndefined();
  });

  test("issuing for an unprovisioned operator fails: sessions never create identities", async () => {
    const { service } = setup();
    await expect(service.issueSession({ tenant, operatorId })).rejects.toBeInstanceOf(IdentityError);
    expect(await service.getOperator(tenant, operatorId)).toBeUndefined();
  });

  test("a revoked session is refused", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    const issued = await service.issueSession({ tenant, operatorId });
    await service.revokeSession(issued.sid, "test");
    expect(await service.resolveSession(issued.token)).toBeUndefined();
  });

  test("an expired session is refused", async () => {
    const { service, advance } = setup();
    await service.registerOperator({ tenant, operatorId });
    const issued = await service.issueSession({ tenant, operatorId, ttlMs: 60_000 });
    advance(60_001);
    expect(await service.resolveSession(issued.token)).toBeUndefined();
  });

  test("bumping the generation revokes all sessions and devices", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    const plain = await service.issueSession({ tenant, operatorId });
    const enrolled = await service.enrolDevice({ tenant, operatorId, label: "phone", registration: registration(new SoftPasskey(1)) });
    const before = (await service.getOperator(tenant, operatorId))?.generation as number;
    await service.revokeAll(tenant, operatorId, "compromise");
    expect((await service.getOperator(tenant, operatorId))?.generation).toBe(before + 1);
    expect(await service.resolveSession(plain.token)).toBeUndefined();
    expect(await service.resolveSession(enrolled.session.token)).toBeUndefined();
    expect((await service.listDevices(tenant, operatorId)).every((device) => device.revokedAt !== null)).toBe(true);
    const fresh = await service.issueSession({ tenant, operatorId });
    expect((await service.resolveSession(fresh.token))?.session.generation).toBe(before + 1);
  });

  test("a suspended operator resolves to nothing", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    const issued = await service.issueSession({ tenant, operatorId });
    await service.revokeAll(tenant, operatorId, "suspend", "suspended");
    expect(await service.resolveSession(issued.token)).toBeUndefined();
    await expect(service.issueSession({ tenant, operatorId })).rejects.toBeInstanceOf(IdentityError);
  });

  test("operators are keyed by tenant and id", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant: "acme", operatorId });
    await service.registerOperator({ tenant: "other", operatorId });
    const issued = await service.issueSession({ tenant: "other", operatorId });
    expect((await service.resolveSession(issued.token))?.caller.tenant).toBe("other");
  });
});

describe("devices", () => {
  test("enrolment needs an existing active operator", async () => {
    const { service } = setup();
    await expect(service.enrolDevice({ tenant, operatorId, label: "phone", registration: registration(new SoftPasskey(1)) })).rejects.toBeInstanceOf(IdentityError);
    expect(await service.getOperator(tenant, operatorId)).toBeUndefined();
  });

  test("enrolment issues a session bound to the device", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    const { session, device } = await service.enrolDevice({ tenant, operatorId, label: "phone", registration: registration(new SoftPasskey(1)) });
    const resolved = await service.resolveSession(session.token);
    expect(resolved?.session.deviceId).toBe(device.id);
  });

  test("replacement revokes the old device and its session", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    const first = await service.enrolDevice({ tenant, operatorId, label: "old", registration: registration(new SoftPasskey(1)) });
    const second = await service.replaceDevices({ tenant, operatorId, label: "new", registration: registration(new SoftPasskey(50)) });
    const devices = await service.listDevices(tenant, operatorId);
    const old = devices.find((device) => device.id === first.device.id);
    expect(old?.revokedAt).not.toBeNull();
    expect(old?.revokedCause).toBe("device replaced");
    expect(devices.find((device) => device.id === second.device.id)?.revokedAt).toBeNull();
    expect(await service.resolveSession(first.session.token)).toBeUndefined();
    expect(await service.resolveSession(second.session.token)).toBeDefined();
  });

  test("revoking a device revokes its session; a credential cannot be enrolled twice", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    const passkey = new SoftPasskey(1);
    const first = await service.enrolDevice({ tenant, operatorId, label: "phone", registration: registration(passkey) });
    await expect(service.enrolDevice({ tenant, operatorId, label: "dup", registration: registration(passkey) })).rejects.toBeInstanceOf(IdentityError);
    await service.revokeDevice(first.device.id, "lost");
    expect(await service.resolveSession(first.session.token)).toBeUndefined();
  });

  test("re-authentication advances the sign count, rotates the session, and refuses replay", async () => {
    const { service, store } = setup();
    await service.registerOperator({ tenant, operatorId });
    const passkey = new SoftPasskey(1);
    const first = await service.enrolDevice({ tenant, operatorId, label: "phone", registration: registration(passkey) });
    const challenge = newChallenge();
    const assertion = passkey.assert({ challenge, ...party, signCount: 1 });
    const rotated = await service.authenticateDevice({ credentialId: passkey.id, credential: assertion, challenge, relyingParty: party });
    expect(await service.resolveSession(first.session.token)).toBeUndefined();
    expect((await service.resolveSession(rotated.token))?.caller.actor.id).toBe(operatorId);
    expect((await store.listRecords(DEVICES))[0]?.value.signCount).toBe(1);
    await expect(service.authenticateDevice({ credentialId: passkey.id, credential: assertion, challenge, relyingParty: party })).rejects.toMatchObject({ code: "sign_count" });
  });

  test("re-authentication is refused for a revoked device and for a wrong origin", async () => {
    const { service } = setup();
    await service.registerOperator({ tenant, operatorId });
    const passkey = new SoftPasskey(1);
    const { device } = await service.enrolDevice({ tenant, operatorId, label: "phone", registration: registration(passkey) });
    const challenge = newChallenge();
    const wrongOrigin = passkey.assert({ challenge, ...party, origin: "https://evil.example.test", signCount: 1 });
    await expect(service.authenticateDevice({ credentialId: passkey.id, credential: wrongOrigin, challenge, relyingParty: party })).rejects.toMatchObject({ code: "origin" });
    await service.revokeDevice(device.id, "lost");
    const good = passkey.assert({ challenge, ...party, signCount: 1 });
    await expect(service.authenticateDevice({ credentialId: passkey.id, credential: good, challenge, relyingParty: party })).rejects.toBeInstanceOf(IdentityError);
  });
});
