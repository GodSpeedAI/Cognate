import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUBLIC_NPM_REGISTRY = "https://registry.npmjs.org";
const MAX_CONCURRENCY = 5;
const MAX_RESPONSE_BYTES = 256 * 1024;

class PermanentVerificationError extends Error {}

function validVersion(version) {
  return typeof version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}

function validHead(head) {
  return typeof head === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head);
}

function packageUrl(name, version) {
  if (typeof name !== "string" || !/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new PermanentVerificationError(`Invalid package name ${JSON.stringify(name)}`);
  }
  const encodedName = name.startsWith("@") ? `${name.slice(0, name.indexOf("/"))}%2f${name.slice(name.indexOf("/") + 1)}` : name;
  return `${PUBLIC_NPM_REGISTRY}/${encodedName}/${encodeURIComponent(version)}`;
}

async function boundedJson(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new PermanentVerificationError("Registry metadata exceeded the response size limit");
  }
  if (!response.body) throw new PermanentVerificationError("Registry returned an empty metadata response");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new PermanentVerificationError("Registry metadata exceeded the response size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PermanentVerificationError("Registry returned malformed package metadata");
  }
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function fetchReceiptOnce(target, { version, head, fetchImpl, deadline, now, requestTimeoutMs }) {
  const url = packageUrl(target.name, version);
  const remaining = deadline - now();
  if (remaining <= 0) return { retry: true, reason: "retry deadline reached" };
  try {
    const timeout = Math.max(1, Math.min(requestTimeoutMs, remaining));
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(timeout),
    });
    if (response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500) {
      return { retry: true, reason: `HTTP ${response.status}` };
    }
    if (!response.ok) throw new PermanentVerificationError(`Registry returned HTTP ${response.status}`);
    const metadata = await boundedJson(response);
    if (!metadata || metadata.name !== target.name || metadata.version !== version) {
      throw new PermanentVerificationError("Registry returned a different package name or version");
    }
    if (metadata.gitHead !== head) {
      throw new PermanentVerificationError(`Published gitHead did not match release ${head}`);
    }
    return { receipt: { name: target.name, version, gitHead: metadata.gitHead } };
  } catch (error) {
    if (error instanceof PermanentVerificationError) throw error;
    const reason = error?.name === "TimeoutError" || error?.name === "AbortError" ? "request timed out" : "registry request failed";
    return { retry: true, reason };
  }
}

/** Verify exact public npm publication receipts without credentials or npm client configuration. */
export async function verifySdkPublication({
  packages,
  version,
  head,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = wait,
  retryWindowMs = 30 * 60_000,
  requestTimeoutMs = 10_000,
  initialRetryDelayMs = 1_000,
  maxRetryDelayMs = 30_000,
}) {
  if (!validVersion(version)) throw new RangeError("Expected an exact SDK release version");
  if (!validHead(head)) throw new RangeError("Expected a full release commit SHA");
  if (!Array.isArray(packages) || packages.length === 0) throw new RangeError("Expected the complete non-empty release package set");
  if (typeof fetchImpl !== "function" || typeof now !== "function" || typeof sleep !== "function") throw new TypeError("Invalid registry verifier dependencies");
  if (![retryWindowMs, requestTimeoutMs, initialRetryDelayMs, maxRetryDelayMs].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Registry verification timing limits must be positive");
  }
  if (maxRetryDelayMs < initialRetryDelayMs) throw new RangeError("Maximum retry delay cannot be smaller than the initial delay");
  const names = new Set();
  for (const target of packages) {
    if (!target || typeof target.name !== "string" || names.has(target.name)) throw new RangeError("Release package names must be valid and unique");
    packageUrl(target.name, version);
    names.add(target.name);
  }

  const deadline = now() + retryWindowMs;
  const receipts = [];
  const failures = [];
  const pending = packages.map((target) => ({ target, retryAt: now(), delay: initialRetryDelayMs, lastFailure: "registry response unavailable" }));
  while (pending.length > 0 && now() < deadline) {
    const current = now();
    const due = pending.filter((item) => item.retryAt <= current);
    if (due.length === 0) {
      const next = Math.min(...pending.map((item) => item.retryAt));
      await sleep(Math.max(1, Math.min(deadline - current, next - current)));
      continue;
    }
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const item = due[cursor++];
        if (!item) return;
        try {
          const result = await fetchReceiptOnce(item.target, { version, head, fetchImpl, deadline, now, requestTimeoutMs });
          if (result.receipt) {
            receipts.push(result.receipt);
            const index = pending.indexOf(item);
            if (index >= 0) pending.splice(index, 1);
          } else {
            item.lastFailure = result.reason;
            item.retryAt = now() + item.delay;
            item.delay = Math.min(Math.max(item.delay * 2, initialRetryDelayMs), maxRetryDelayMs);
          }
        } catch (error) {
          failures.push({ name: item.target.name, message: error instanceof Error ? error.message : "Registry verification failed" });
          const index = pending.indexOf(item);
          if (index >= 0) pending.splice(index, 1);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, due.length) }, worker));
  }
  for (const item of pending) failures.push({
    name: item.target.name,
    message: `Package did not become verifiable before the retry deadline (${item.lastFailure})`,
  });
  if (failures.length) {
    const details = failures.map((failure) => `${failure.name}: ${failure.message}`).join("; ");
    throw new Error(`Public npm verification failed for ${failures.length}/${packages.length} package(s): ${details}`);
  }
  return {
    registry: PUBLIC_NPM_REGISTRY,
    version,
    gitHead: head,
    verifiedAt: new Date(now()).toISOString(),
    verifiedCount: receipts.length,
    packages: receipts,
  };
}

export async function loadReleaseTargets(root = process.cwd()) {
  const config = JSON.parse(await readFile(resolve(root, "release-please-config.json"), "utf8"));
  const manifest = JSON.parse(await readFile(resolve(root, ".release-please-manifest.json"), "utf8"));
  const version = manifest["packages/cognate"];
  if (!validVersion(version)) throw new Error("Release Please manifest has no exact umbrella SDK version");
  const paths = Object.keys(config.packages ?? {}).sort();
  if (paths.length === 0) throw new Error("Release Please config has no SDK package paths");
  const packages = [];
  const names = new Set();
  for (const path of paths) {
    const absolute = resolve(root, path);
    const rel = relative(root, absolute);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Invalid release package path ${path}`);
    const pkg = JSON.parse(await readFile(resolve(absolute, "package.json"), "utf8"));
    if (pkg.version !== version || manifest[path] !== version) throw new Error(`Release package version mismatch at ${path}`);
    if (typeof pkg.name !== "string" || names.has(pkg.name)) throw new Error(`Release package name is missing or duplicated at ${path}`);
    names.add(pkg.name);
    packages.push({ name: pkg.name, path });
  }
  return { version, packages };
}

async function main(args = process.argv.slice(2)) {
  const head = args[0] ?? process.env.GITHUB_SHA;
  if (!validHead(head)) throw new Error("Pass the full release commit SHA as the first argument or GITHUB_SHA");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { version, packages } = await loadReleaseTargets(root);
  const receipt = await verifySdkPublication({ packages, version, head });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Public npm verification failed"}\n`);
    process.exitCode = 1;
  });
}
