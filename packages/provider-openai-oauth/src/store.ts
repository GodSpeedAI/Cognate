/**
 * Local credential persistence for SIWC accounts: one protected record per issued client id +
 * verified identity, written atomically with owner-only permissions, refresh-token rotation
 * replacing the whole token set together. Automation consent is stored SEPARATELY, in a
 * secret-free record — durable event logs and this consent file never contain tokens.
 */
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TokenResponse } from "./protocol.ts";

export interface AccountRecord {
  /** Validated ID-token identity — sub, never email alone. */
  readonly subject: string;
  readonly issuer: string;
  readonly email?: string;
  readonly clientId: string;
  readonly extAgentHostId: string;
  /** Retained for the next id_token_hint; may be expired by definition. */
  readonly idToken: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly grantedScopes: readonly string[];
  readonly savedAt: number;
}

/** Secret-free, separately-stored usage authorization evidence (spec §32). */
export interface AutomationConsent {
  readonly subject: string;
  readonly approvedAt: number;
  /** Human-readable recording of what the operator approved; never contains credentials. */
  readonly note?: string;
}

export function accountsDirectory(options: { readonly home: string; readonly appName: string }): string {
  return join(options.home, ".config", options.appName, "openai");
}

export function accountPath(accountsDir: string, clientId: string): string {
  // Client ids are issuer-minted (oaiapp_...); validate so a crafted id cannot traverse paths.
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clientId)) throw new Error("siwc: malformed client id");
  return join(accountsDir, "accounts", `${clientId}.json`);
}

export async function writeAccountRecord(accountsDir: string, record: AccountRecord): Promise<void> {
  const path = accountPath(accountsDir, record.clientId);
  await mkdir(dirname(path), { recursive: true });
  // Write-then-rename keeps readers from ever seeing a torn record.
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
}

export async function readAccountRecord(accountsDir: string, clientId: string): Promise<AccountRecord | undefined> {
  try {
    const raw = JSON.parse(await readFile(accountPath(accountsDir, clientId), "utf8")) as AccountRecord;
    if (typeof raw.clientId !== "string" || typeof raw.refreshToken !== "string") return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

export async function listAccountRecords(accountsDir: string): Promise<AccountRecord[]> {
  const dir = join(accountsDir, "accounts");
  const records: AccountRecord[] = [];
  const names = await readdirNames(dir);
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    try {
      records.push(JSON.parse(await readFile(join(dir, name), "utf8")) as AccountRecord);
    } catch {
      // A torn/unreadable record is skipped, never crashed on.
    }
  }
  return records.sort((a, b) => a.savedAt - b.savedAt);
}

async function readdirNames(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    return await readdir(dir);
  } catch {
    return [];
  }
}

/** Clears token material but keeps the client/identity mapping for a later sign-in. */
export async function clearAccountTokens(accountsDir: string, clientId: string): Promise<void> {
  const record = await readAccountRecord(accountsDir, clientId);
  if (!record) return;
  await writeAccountRecord(accountsDir, {
    ...record, accessToken: "", refreshToken: "", idToken: "", expiresAt: 0, savedAt: Date.now(),
  });
}

export async function removeAccountRecord(accountsDir: string, clientId: string): Promise<void> {
  await rm(accountPath(accountsDir, clientId), { force: true });
}

export function fromTokenResponse(base: Omit<AccountRecord, "accessToken" | "refreshToken" | "idToken" | "expiresAt" | "grantedScopes" | "savedAt">, tokens: TokenResponse, now: number): AccountRecord {
  return {
    ...base,
    idToken: tokens.idToken,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: now + tokens.expiresInSeconds * 1000,
    grantedScopes: tokens.grantedScopes,
    savedAt: now,
  };
}

const consentPath = (accountsDir: string, subject: string): string =>
  join(accountsDir, "automation", `${subject.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);

export async function approveAutomation(accountsDir: string, subject: string, note?: string): Promise<void> {
  const path = consentPath(accountsDir, subject);
  await mkdir(dirname(path), { recursive: true });
  const consent: AutomationConsent = { subject, approvedAt: Date.now(), ...(note ? { note } : {}) };
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(consent, null, 2), { mode: 0o600 });
  await rename(temp, path);
}

export async function automationApproved(accountsDir: string, subject: string): Promise<boolean> {
  try {
    const consent = JSON.parse(await readFile(consentPath(accountsDir, subject), "utf8")) as AutomationConsent;
    return consent.subject === subject && typeof consent.approvedAt === "number";
  } catch {
    return false;
  }
}

export async function revokeAutomationApproval(accountsDir: string, subject: string): Promise<void> {
  await rm(consentPath(accountsDir, subject), { force: true });
}

/**
 * Stable per-host ext_agent_host_id (urn:uuid form). Created once and reused; it is an opaque
 * label, never a credential, and is kept beside the runtime it identifies.
 */
export async function ensureHostId(accountsDir: string): Promise<string> {
  const path = join(accountsDir, "host-id");
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (/^urn:uuid:[0-9a-f-]{36}$/.test(existing)) return existing;
  } catch {
    // First run on this host.
  }
  const hostId = `urn:uuid:${randomUUID()}`;
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${hostId}\n`, { mode: 0o600 });
  await rename(temp, path);
  return hostId;
}
