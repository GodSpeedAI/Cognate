// Host identity verification. A connection is refused unless the server's key matches an expected
// SHA-256 fingerprint or an OpenSSH `known_hosts` entry; there is no trust-on-first-use and no
// "accept anything" mode. Hashed (`|1|salt|hash`) and plain entries, `[host]:port`, wildcards,
// negation and `@revoked` are honoured; `@cert-authority` entries are ignored (not supported).
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

export interface HostKeyPolicy {
  /** Accept exactly these `SHA256:<base64>` fingerprints (as printed by `ssh-keygen -lf`). */
  readonly fingerprints?: readonly string[];
  /** OpenSSH known_hosts file contents. */
  readonly knownHosts?: string;
  /** Path to an OpenSSH known_hosts file, read at connect time. */
  readonly knownHostsPath?: string;
}

export function fingerprintOf(key: Buffer): string {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

export function policyIsEmpty(policy: HostKeyPolicy): boolean {
  return !(policy.fingerprints?.length || policy.knownHosts || policy.knownHostsPath);
}

function wildcard(pattern: string, value: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  return re.test(value);
}

function hostMatches(field: string, names: readonly string[]): boolean {
  if (field.startsWith("|1|")) {
    const [, , salt, hash] = field.split("|");
    if (!salt || !hash) return false;
    const saltBytes = Buffer.from(salt, "base64");
    return names.some((n) => createHmac("sha1", saltBytes).update(n).digest("base64") === hash);
  }
  let matched = false;
  for (const raw of field.split(",")) {
    const negated = raw.startsWith("!");
    const hit = names.some((n) => wildcard(negated ? raw.slice(1) : raw, n));
    if (hit && negated) return false;
    if (hit) matched = true;
  }
  return matched;
}

/** Returns "trusted" | "revoked" | "unknown" for one server key against known_hosts text. */
export function checkKnownHosts(text: string, host: string, port: number, key: Buffer): "trusted" | "revoked" | "unknown" {
  const names = port === 22 ? [host, `[${host}]:22`] : [`[${host}]:${port}`];
  const b64 = key.toString("base64");
  let trusted = false;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/);
    let marker: string | undefined;
    if (parts[0]!.startsWith("@")) marker = parts.shift();
    if (marker === "@cert-authority") continue;
    const [hosts, , keyB64] = parts;
    if (!hosts || !keyB64 || keyB64 !== b64 || !hostMatches(hosts, names)) continue;
    if (marker === "@revoked") return "revoked";
    trusted = true;
  }
  return trusted ? "trusted" : "unknown";
}

export function verifyHostKey(policy: HostKeyPolicy, host: string, port: number, key: Buffer): boolean {
  const text = policy.knownHosts ?? (policy.knownHostsPath ? safeRead(policy.knownHostsPath) : undefined);
  const known = text === undefined ? "unknown" : checkKnownHosts(text, host, port, key);
  if (known === "revoked") return false; // a revoked key is never accepted, even if pinned elsewhere
  return known === "trusted" || policy.fingerprints?.includes(fingerprintOf(key)) === true;
}

function safeRead(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
