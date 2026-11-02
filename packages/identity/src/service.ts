/**
 * Durable operator identity, sessions and remote devices over any `DurableStore`.
 *
 * Records (collections below) are written with `store.commit({ appends: [], records })` and
 * expected versions, the same record API the runtime uses. Every write that creates or changes a
 * session or device also rewrites the operator record, so a concurrent generation bump or status
 * change makes the write fail its version check and retry against the new state.
 *
 * An operator is a logical id inside a tenant, not an OS account. A session stores only the hash
 * of its token and resolves to the durable operator; the `Caller` is built from that record alone.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { RecordConflictError } from "@godspeedai/cognate-events";
import type { DurableStore, Json, RecordWrite, StoredRecord } from "@godspeedai/cognate-events";
import type { Caller } from "@godspeedai/cognate-runtime-api";
import { assertRelyingParty, verifyAssertion, type RelyingParty, type VerifiedRegistration } from "./webauthn.ts";

export const OPERATORS = "identity.operators";
export const SESSIONS = "identity.sessions";
export const DEVICES = "identity.devices";
export const SESSION_TOKEN_PREFIX = "idt1.";
export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_TTL_MS = 60_000;
const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ATTEMPTS = 20;

export type OperatorStatus = "active" | "suspended" | "revoked";
export type SessionStatus = "active" | "revoked";

export interface OperatorRecord {
  readonly tenant: string;
  readonly operatorId: string;
  readonly status: OperatorStatus;
  /** Bumped to revoke every session and device issued under an earlier value. */
  readonly generation: number;
  readonly label: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SessionRecord {
  readonly sid: string;
  readonly tenant: string;
  readonly operatorId: string;
  /** SHA-256 hex of the minted token. The token itself exists only in the issue result. */
  readonly tokenHash: string;
  readonly generation: number;
  readonly deviceId: string | null;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly cause: string | null;
}

export interface DeviceRecord {
  readonly id: string;
  readonly tenant: string;
  readonly operatorId: string;
  readonly label: string;
  readonly credentialId: string;
  /** COSE_Key bytes, base64url. */
  readonly publicKey: string;
  readonly signCount: number;
  readonly generation: number;
  /** The device's current session id. */
  readonly sid: string | null;
  readonly pairedAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
  readonly revokedCause: string | null;
}

export class IdentityError extends Error {
  override readonly name = "IdentityError";
  constructor(
    readonly kind: "invalid_input" | "not_found" | "conflict" | "forbidden" | "busy",
    message: string,
  ) {
    super(message);
  }
}

export interface IssuedSession {
  readonly sid: string;
  /** Shown exactly once. */
  readonly token: string;
  readonly expiresAt: string;
}

export interface ResolvedSession {
  /** Built only from the durable operator record. */
  readonly caller: Caller;
  readonly session: SessionRecord;
  readonly operator: OperatorRecord;
}

const TENANT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const OPERATOR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const sessionTokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");
export const mintSessionToken = (): string => `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

export function isSessionTokenFormat(token: unknown): token is string {
  if (typeof token !== "string" || !token.startsWith(SESSION_TOKEN_PREFIX)) return false;
  const body = token.slice(SESSION_TOKEN_PREFIX.length);
  return body.length >= 32 && body.length <= 128 && /^[A-Za-z0-9_-]+$/.test(body);
}

const operatorKey = (tenant: string, operatorId: string): string => `${tenant}/${operatorId}`;
const asValue = (record: unknown): { [key: string]: Json } => JSON.parse(JSON.stringify(record)) as { [key: string]: Json };
const iso = (ms: number): string => new Date(ms).toISOString();

function checkNames(tenant: string, operatorId: string): void {
  if (!TENANT.test(tenant)) throw new IdentityError("invalid_input", "tenant must be a lowercase slug of 1-64 safe characters");
  if (!OPERATOR.test(operatorId)) throw new IdentityError("invalid_input", "operatorId must be 1-64 safe characters");
}

function checkTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) throw new IdentityError("invalid_input", "session ttl must be between one minute and ninety days");
}

export interface IdentityServiceOptions {
  /** Epoch milliseconds. Injected so tests and hosts control time. */
  readonly clock?: () => number;
}

export function createIdentityService(store: DurableStore, options: IdentityServiceOptions = {}) {
  const clock = options.clock ?? Date.now;

  async function retrying<T>(what: string, attempt: () => Promise<T>): Promise<T> {
    for (let index = 0; index < ATTEMPTS; index += 1) {
      try {
        return await attempt();
      } catch (error) {
        if (error instanceof RecordConflictError) continue;
        throw error;
      }
    }
    throw new IdentityError("busy", `identity ledger is busy; retry ${what}`);
  }

  async function readOperator(tenant: string, operatorId: string): Promise<{ operator: OperatorRecord; version: number } | undefined> {
    const stored = await store.getRecord(OPERATORS, operatorKey(tenant, operatorId));
    return stored ? { operator: stored.value as unknown as OperatorRecord, version: stored.version } : undefined;
  }

  async function requireActive(tenant: string, operatorId: string): Promise<{ operator: OperatorRecord; version: number }> {
    checkNames(tenant, operatorId);
    const found = await readOperator(tenant, operatorId);
    if (!found) throw new IdentityError("not_found", "operator is not provisioned");
    if (found.operator.status !== "active") throw new IdentityError("forbidden", "operator is not active");
    return found;
  }

  /** A same-value rewrite of the operator record: fences this commit against concurrent operator changes. */
  const fence = (found: { operator: OperatorRecord; version: number }): RecordWrite => ({
    collection: OPERATORS,
    id: operatorKey(found.operator.tenant, found.operator.operatorId),
    expectedVersion: found.version,
    value: asValue(found.operator),
  });

  function newSession(operator: OperatorRecord, deviceId: string | null, ttlMs: number, now: number): { record: SessionRecord; issued: IssuedSession } {
    checkTtl(ttlMs);
    const token = mintSessionToken();
    const sid = `session-${randomUUID()}`;
    const record: SessionRecord = {
      sid, tenant: operator.tenant, operatorId: operator.operatorId, tokenHash: sessionTokenHash(token), generation: operator.generation,
      deviceId, status: "active", createdAt: iso(now), expiresAt: iso(now + ttlMs), revokedAt: null, cause: null,
    };
    return { record, issued: { sid, token, expiresAt: record.expiresAt } };
  }

  const sessionWrite = (record: SessionRecord): RecordWrite => ({ collection: SESSIONS, id: record.sid, expectedVersion: 0, value: asValue(record) });

  async function revokeSessionWrites(sids: readonly (string | null)[], cause: string, now: number): Promise<RecordWrite[]> {
    const writes: RecordWrite[] = [];
    for (const sid of sids) {
      if (sid === null) continue;
      const stored = await store.getRecord(SESSIONS, sid);
      const session = stored?.value as unknown as SessionRecord | undefined;
      if (!stored || !session || session.status === "revoked") continue;
      writes.push({ collection: SESSIONS, id: sid, expectedVersion: stored.version, value: asValue({ ...session, status: "revoked", revokedAt: iso(now), cause }) });
    }
    return writes;
  }

  async function activeDevices(tenant: string, operatorId: string): Promise<StoredRecord[]> {
    const all = await store.listRecords(DEVICES, { tenant, operatorId });
    return all.filter((record) => (record.value as unknown as DeviceRecord).revokedAt === null);
  }

  const revokedDeviceWrite = (stored: StoredRecord, cause: string, now: number): RecordWrite => ({
    collection: DEVICES, id: stored.id, expectedVersion: stored.version,
    value: asValue({ ...(stored.value as unknown as DeviceRecord), revokedAt: iso(now), revokedCause: cause }),
  });

  return {
    /**
     * Provision (or return) the durable operator for one tenant and operator id. This is an explicit
     * administrative act by the host. A pairing link can never reach it.
     */
    async registerOperator(input: { tenant: string; operatorId: string; label?: string }): Promise<OperatorRecord> {
      checkNames(input.tenant, input.operatorId);
      return retrying("provisioning", async () => {
        const existing = await readOperator(input.tenant, input.operatorId);
        if (existing) return existing.operator;
        const now = iso(clock());
        const operator: OperatorRecord = { tenant: input.tenant, operatorId: input.operatorId, status: "active", generation: 1, label: input.label ?? null, createdAt: now, updatedAt: now };
        await store.commit({ appends: [], records: [{ collection: OPERATORS, id: operatorKey(input.tenant, input.operatorId), expectedVersion: 0, value: asValue(operator) }] });
        return operator;
      });
    },

    async getOperator(tenant: string, operatorId: string): Promise<OperatorRecord | undefined> {
      return (await readOperator(tenant, operatorId))?.operator;
    },

    /**
     * Revoke every session and device of the operator: the generation moves on, and the sessions and
     * devices that were active are marked revoked in the same commit. A non-active `status` also
     * blocks all future sessions until the operator is set active again (which still needs a new enrolment).
     */
    async revokeAll(tenant: string, operatorId: string, cause: string, status: OperatorStatus = "active"): Promise<OperatorRecord> {
      checkNames(tenant, operatorId);
      return retrying("revocation", async () => {
        const found = await readOperator(tenant, operatorId);
        if (!found) throw new IdentityError("not_found", "operator is not provisioned");
        const now = clock();
        const devices = await activeDevices(tenant, operatorId);
        const live = (await store.listRecords(SESSIONS, { tenant, operatorId })).filter((record) => (record.value as unknown as SessionRecord).status === "active");
        const operator: OperatorRecord = { ...found.operator, status, generation: found.operator.generation + 1, updatedAt: iso(now) };
        const records: RecordWrite[] = [
          { collection: OPERATORS, id: operatorKey(tenant, operatorId), expectedVersion: found.version, value: asValue(operator) },
          ...devices.map((device) => revokedDeviceWrite(device, cause, now)),
          ...(await revokeSessionWrites(live.map((record) => record.id), cause, now)),
        ];
        await store.commit({ appends: [], records });
        return operator;
      });
    },

    /** Issue a session for an active operator. The token is returned once. */
    async issueSession(input: { tenant: string; operatorId: string; ttlMs?: number }): Promise<IssuedSession> {
      return retrying("issuance", async () => {
        const found = await requireActive(input.tenant, input.operatorId);
        const { record, issued } = newSession(found.operator, null, input.ttlMs ?? DEFAULT_SESSION_TTL_MS, clock());
        await store.commit({ appends: [], records: [fence(found), sessionWrite(record)] });
        return issued;
      });
    },

    async revokeSession(sid: string, cause: string): Promise<void> {
      if (typeof sid !== "string" || !/^[A-Za-z0-9-]+$/.test(sid)) throw new IdentityError("invalid_input", "session id is malformed");
      await retrying("revocation", async () => {
        if (!(await store.getRecord(SESSIONS, sid))) throw new IdentityError("not_found", "session does not exist");
        const writes = await revokeSessionWrites([sid], cause, clock());
        if (writes.length > 0) await store.commit({ appends: [], records: writes });
      });
    },

    /**
     * Resolve a presented token. Refused (undefined): bad format, unknown hash, revoked or expired
     * session, inactive operator, stale generation, revoked bound device. The Caller comes from the
     * durable operator record only.
     */
    async resolveSession(token: unknown): Promise<ResolvedSession | undefined> {
      if (!isSessionTokenFormat(token)) return undefined;
      const matches = await store.listRecords(SESSIONS, { tokenHash: sessionTokenHash(token) });
      const stored = matches[0];
      if (!stored) return undefined;
      const session = stored.value as unknown as SessionRecord;
      if (session.status !== "active" || Date.parse(session.expiresAt) <= clock()) return undefined;
      const found = await readOperator(session.tenant, session.operatorId);
      if (!found || found.operator.status !== "active" || found.operator.generation !== session.generation) return undefined;
      if (session.deviceId !== null) {
        const device = await store.getRecord(DEVICES, session.deviceId);
        const value = device?.value as unknown as DeviceRecord | undefined;
        if (!value || value.revokedAt !== null || value.generation !== found.operator.generation) return undefined;
      }
      const caller: Caller = { tenant: found.operator.tenant, actor: { id: found.operator.operatorId, kind: "user" } };
      return { caller, session, operator: found.operator };
    },

    /** Enrol a verified passkey for an existing, active operator and issue its session. Keeps other devices. */
    enrolDevice(input: EnrolInput): Promise<EnrolResult> {
      return enrol(input, false);
    },

    /** Enrol a verified passkey as the operator's only device: every earlier device and its session is revoked first. */
    replaceDevices(input: EnrolInput): Promise<EnrolResult> {
      return enrol(input, true);
    },

    async revokeDevice(deviceId: string, cause: string): Promise<void> {
      await retrying("device revocation", async () => {
        const stored = await store.getRecord(DEVICES, deviceId);
        if (!stored) throw new IdentityError("not_found", "device does not exist");
        const device = stored.value as unknown as DeviceRecord;
        if (device.revokedAt !== null) return;
        const found = await readOperator(device.tenant, device.operatorId);
        if (!found) throw new IdentityError("not_found", "operator is not provisioned");
        const now = clock();
        await store.commit({ appends: [], records: [fence(found), revokedDeviceWrite(stored, cause, now), ...(await revokeSessionWrites([device.sid], cause, now))] });
      });
    },

    async listDevices(tenant: string, operatorId: string): Promise<DeviceRecord[]> {
      return (await store.listRecords(DEVICES, { tenant, operatorId })).map((record) => record.value as unknown as DeviceRecord);
    },

    /**
     * Verify a passkey assertion for an enrolled device, advance its sign count and rotate its session.
     * The challenge must already have been taken from a `ChallengeStore` (single use).
     */
    async authenticateDevice(input: {
      credentialId: string;
      credential: Parameters<typeof verifyAssertion>[0];
      challenge: Uint8Array;
      relyingParty: RelyingParty;
      ttlMs?: number;
    }): Promise<IssuedSession> {
      const party = assertRelyingParty(input.relyingParty);
      const matches = await store.listRecords(DEVICES, { credentialId: input.credentialId });
      const stored = matches[0];
      if (!stored) throw new IdentityError("not_found", "credential is not enrolled");
      const device = stored.value as unknown as DeviceRecord;
      if (device.revokedAt !== null) throw new IdentityError("forbidden", "device is revoked");
      const verified = await verifyAssertion(input.credential, { challenge: input.challenge, origin: party.origin, rpId: party.rpId, publicKey: device.publicKey, signCount: device.signCount });
      return retrying("device authentication", async () => {
        const current = await store.getRecord(DEVICES, stored.id);
        const latest = current?.value as unknown as DeviceRecord | undefined;
        if (!current || !latest || latest.revokedAt !== null) throw new IdentityError("forbidden", "device is revoked");
        if (latest.signCount !== device.signCount) throw new IdentityError("conflict", "device was used concurrently; sign count moved");
        const found = await requireActive(device.tenant, device.operatorId);
        if (found.operator.generation !== latest.generation) throw new IdentityError("forbidden", "device belongs to an earlier generation");
        const now = clock();
        const { record, issued } = newSession(found.operator, device.id, input.ttlMs ?? DEFAULT_SESSION_TTL_MS, now);
        const records: RecordWrite[] = [
          fence(found),
          { collection: DEVICES, id: device.id, expectedVersion: current.version, value: asValue({ ...latest, signCount: verified.signCount, lastSeenAt: iso(now), sid: record.sid }) },
          ...(await revokeSessionWrites([latest.sid], "rotated by re-authentication", now)),
          sessionWrite(record),
        ];
        await store.commit({ appends: [], records });
        return issued;
      });
    },
  };

  async function enrol(input: EnrolInput, replace: boolean): Promise<EnrolResult> {
    return retrying("enrolment", async () => {
      const found = await requireActive(input.tenant, input.operatorId);
      const now = clock();
      const duplicate = await store.listRecords(DEVICES, { credentialId: input.registration.credentialId });
      if (duplicate.length > 0) throw new IdentityError("conflict", "credential is already enrolled");
      const existing = replace ? await activeDevices(input.tenant, input.operatorId) : [];
      const id = `device-${randomUUID()}`;
      const { record, issued } = newSession(found.operator, id, input.ttlMs ?? DEFAULT_SESSION_TTL_MS, now);
      const device: DeviceRecord = {
        id, tenant: input.tenant, operatorId: input.operatorId, label: input.label, credentialId: input.registration.credentialId,
        publicKey: input.registration.publicKey, signCount: input.registration.signCount, generation: found.operator.generation,
        sid: record.sid, pairedAt: iso(now), lastSeenAt: null, revokedAt: null, revokedCause: null,
      };
      const records: RecordWrite[] = [
        fence(found),
        ...existing.map((old) => revokedDeviceWrite(old, "device replaced", now)),
        ...(await revokeSessionWrites(existing.map((old) => (old.value as unknown as DeviceRecord).sid), "device replaced", now)),
        { collection: DEVICES, id, expectedVersion: 0, value: asValue(device) },
        sessionWrite(record),
      ];
      await store.commit({ appends: [], records });
      return { device, session: issued };
    });
  }
}

export interface EnrolInput {
  readonly tenant: string;
  readonly operatorId: string;
  readonly label: string;
  /** Output of `verifyRegistration`. */
  readonly registration: VerifiedRegistration;
  readonly ttlMs?: number;
}

export interface EnrolResult {
  readonly device: DeviceRecord;
  readonly session: IssuedSession;
}

export type IdentityService = ReturnType<typeof createIdentityService>;
