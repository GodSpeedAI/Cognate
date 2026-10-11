// DEBT-021 convergence across the wire and across processes (mission §3.3): the checkpoint flows
// through the Connect protocol, a client in a SECOND process converges after the final
// materialising event with no second event and no fixed sleep, and the runtime's fold is gated from
// the parent so the first read is deterministically stale.
// Needs the development database: `just db-up` (pg0), or set COGNATE_TEST_POSTGRES_URL.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { openPostgresStore } from "@godspeedai/cognate-store-postgres";

const url = process.env.COGNATE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const dir = mkdtempSync(join(tmpdir(), "cognate-conv-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// ── Runtime host (process A): gated fold, Connect server, command loop on stdin ──
writeFileSync(
  join(dir, "host.ts"),
  `import { openPostgresStore } from ${JSON.stringify(resolve("packages/store-postgres/src/index.ts"))};
import { serveRuntime, devTokenAuthenticator } from ${JSON.stringify(resolve("packages/protocol-connect-bun/src/index.ts"))};
import type { DurableStore, ProjectionCommit } from ${JSON.stringify(resolve("packages/events/src/index.ts"))};
import type { Projection } from ${JSON.stringify(resolve("packages/projections/src/index.ts"))};
import { createRuntime } from ${JSON.stringify(resolve("packages/runtime-bun/src/index.ts"))};

const [schema] = process.argv.slice(2);
const inner = (await openPostgresStore({ url: ${JSON.stringify(url)}, schema, pollMs: 0 })).store;
let open = true;
let releases: (() => void)[] = [];
const gated: DurableStore = Object.assign(Object.create(Object.getPrototypeOf(inner)) as DurableStore, inner, {
  async commitProjection(commit: ProjectionCommit): Promise<void> {
    if (!open) await new Promise<void>((resolve) => releases.push(resolve));
    await inner.commitProjection(commit);
  },
});
const items: Projection = {
  name: "items",
  version: "1",
  apply(event, state) {
    if (event.eventType !== "item.added") return [];
    const key = event.tenant + "/list";
    const current = (state.get(key) as readonly string[] | undefined) ?? [];
    return [{ key, value: [...current, (event.payload as { name: string }).name] }];
  },
};
const runtime = await createRuntime({
  store: { store: gated },
  policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) },
  actions: { authorize: () => ({ allow: true, reason: "ok" }) },
  agents: [],
  projections: [{ projection: items, public: true }],
});
const server = serveRuntime({ service: runtime.service, authenticate: devTokenAuthenticator, port: 0 });
console.log(JSON.stringify({ ready: true, url: server.url }));
const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let buffer = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let index: number;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line === "close") open = false;
    else if (line === "open") {
      open = true;
      for (const r of releases.splice(0)) r();
    }
    else if (line.startsWith("commit ")) {
      const name = line.slice("commit ".length);
      await runtime.store.commit({ appends: [{ streamId: "catalog", expectedVersion: await runtime.store.streamVersion("catalog"), events: [{ eventType: "item.added", schemaVersion: 1, occurredAt: new Date().toISOString(), tenant: "tenant-a", correlationId: "corr", causationId: null, runId: null, scopeId: "root", payload: { name } }] }] });
      console.log(JSON.stringify({ committed: name }));
    }
  }
}
`,
);

// ── Client (process B): reads through the Connect wire; reports every accepted read ──
writeFileSync(
  join(dir, "client.ts"),
  `import { createClient } from ${JSON.stringify(resolve("packages/client/src/index.ts"))};
import { createRemoteRuntimeService } from ${JSON.stringify(resolve("packages/protocol-connect/src/index.ts"))};
import { createConnectTransport } from ${JSON.stringify(Bun.resolveSync("@connectrpc/connect-web", resolve("packages/protocol-connect-bun")))};
const [url] = process.argv.slice(2);
// Bun's fetch caches repeated identical unary POST responses (DEBT-027); bypass it so the client's
// re-reads actually reach the server. The framework's Bun transport helper does the same by default.
const bypassBunFetchCache = ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" })) as typeof fetch;
const service = createRemoteRuntimeService(createConnectTransport({ baseUrl: url, useBinaryFormat: true, fetch: bypassBunFetchCache }), () => "tenant-a:alice");
const caller = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const client = createClient({ service, caller });
// Bootstrap wait: let the engine's initial catch-up dispatch before creating the projection store,
// so its convergence target includes every event already committed. The parent's stale-then-converged
// proof starts only after this.
await new Promise((resolve) => setTimeout(resolve, 250));
const store = client.projection("items");
store.subscribe((rows) => console.log(JSON.stringify({ value: rows })));
await new Promise((resolve) => setTimeout(resolve, 60_000));
`,
  );

interface Process {
  proc: ReturnType<typeof Bun.spawn>;
  next: () => Promise<Record<string, unknown>>;
  write: (line: string) => void;
  kill(): Promise<void>;
}

function spawn(script: string, args: string[] = []): Process {
  const proc = Bun.spawn(["bun", join(dir, script), ...args], { stdout: "pipe", stdin: "pipe", stderr: "pipe" });
  const queue: (Record<string, unknown> | null)[] = [];
  let wake: (() => void) | undefined;
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) queue.push(JSON.parse(line) as Record<string, unknown>);
        wake?.();
        wake = undefined;
      }
    }
    queue.push(null);
    wake?.();
    wake = undefined;
  })();
  return {
    proc,
    async next() {
      for (;;) {
        const line = queue.shift();
        if (line === null) throw new Error(`${script} exited before the expected line`);
        if (line !== undefined) return line;
        await new Promise<void>((resolve) => (wake = resolve));
      }
    },
    write(line: string) {
      proc.stdin.write(line + "\n");
      proc.stdin.flush();
    },
    async kill() {
      proc.kill();
      await proc.exited;
    },
  };
}

const rowsOf = (message: Record<string, unknown>): unknown[] => (message.value as unknown[] | undefined) ?? [];
const listsEqual = (a: unknown[], b: string[]): boolean => JSON.stringify(a) === JSON.stringify([{ key: "list", value: b }]);

test("a second-process client converges through the wire after the final event", async () => {
  const schema = `cognate_conv_${Date.now().toString(36)}`;
  const host = spawn("host.ts", [schema]);
  try {
    const ready = await host.next();
    // The runtime is on PostgreSQL; a fold already landed for the first event below.
    await host.write("commit a");
    expect(await host.next()).toMatchObject({ committed: "a" });

    const client = spawn("client.ts", [(ready as { url: string }).url]);
    // 1. The projection is initially materialized at the old position: the client's first accepted
    //    read covers ["a"].
    for (let i = 0; i < 1000; i++) {
      const message = await client.next();
        if (listsEqual(rowsOf(message), ["a"])) break;
    }
    // 2-4. Close the gate, commit the final materialising event; the client's read is stale.
    await host.write("close");
    await host.write("commit b");
    await host.next(); // committed b
    let sawStale = false;
    for (let i = 0; i < 40; i++) {
      const message = await client.next();
        if (listsEqual(rowsOf(message), ["a"])) {
        sawStale = true;
        break;
      }
      if (listsEqual(rowsOf(message), ["a", "b"])) throw new Error("converged before the fold was released");
    }
    expect(sawStale).toBe(true);
    // 5-8. Release the fold: the checkpoint-aware re-reads converge with no second event.
    await host.write("open");
    for (let i = 0; i < 1000; i++) {
      const message = await client.next();
        if (listsEqual(rowsOf(message), ["a", "b"])) break;
    }
    client.kill();
    await client.proc.exited;
  } finally {
    host.write("open");
    host.proc.kill();
    await host.proc.exited;
    const cleaner = await openPostgresStore({ url, schema, pollMs: 0 });
    await cleaner.dropSchema();
    await cleaner.close();
    void postgres;
  }
}, 90_000);
