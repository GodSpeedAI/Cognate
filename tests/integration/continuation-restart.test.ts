// CG-CON-002: continuations survive process restart and resume via a newly mounted handler (spec §12).
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ContinuationService } from "@cognate/continuations";
import { openSqliteStore } from "@cognate/store-sqlite";

const dir = mkdtempSync(join(tmpdir(), "cognate-restart-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const allow = { authorize: () => ({ allow: true, reason: "test" }) };

async function runChild(body: string) {
  const file = join(dir, `child-${crypto.randomUUID()}.ts`);
  writeFileSync(
    file,
    `import { ContinuationService } from ${JSON.stringify(resolve("packages/continuations/src/index.ts"))};
     import { openSqliteStore } from ${JSON.stringify(resolve("packages/store-sqlite/src/index.ts"))};
     ${body}`,
  );
  const proc = Bun.spawn(["bun", file], { stdout: "pipe", stderr: "pipe" });
  const [exit, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if (exit !== 0) throw new Error(`child failed (${exit}): ${err}`);
  return out.trim();
}

test("a continuation opened and resumed in one process is delivered by a handler mounted in the next", async () => {
  const path = join(dir, "restart.sqlite");
  const id = await runChild(`
    const store = openSqliteStore({ path: ${JSON.stringify(path)} });
    const svc = new ContinuationService(store, { policy: { authorize: () => ({ allow: true, reason: "t" }) } });
    const record = await svc.open({ type: "approval", tenant: "t", runId: "run-1", scopeId: "root", correlationId: "c", condition: { kind: "human_approval" }, payload: { amount: 5 }, handler: { id: "approval.resume", version: "1.0.0" } });
    await svc.resume(record.id, { actor: { id: "alice", kind: "user" }, idempotencyKey: "k1", input: { approved: true } });
    const report = await svc.dispatchResumes();
    if (report.delivered.length !== 0) throw new Error("delivered without a handler");
    await store.close();
    console.log(record.id);
  `);
  const store = openSqliteStore({ path });
  const svc = new ContinuationService(store, { policy: allow, now: () => Date.now() + 3_600_000 });
  const handled: unknown[] = [];
  svc.registerHandler({ id: "approval.resume", version: "1.2.0", supports: (v) => v.startsWith("1."), handle: async (record) => void handled.push(record.resolution?.input) });
  expect((await svc.get(id))!.status).toBe("RESUMED");
  expect((await svc.dispatchResumes()).delivered).toHaveLength(1);
  expect(handled).toEqual([{ approved: true }]);
  await store.close();
});

test("a pending OPEN continuation outlives the process and remains resumable", async () => {
  const path = join(dir, "open.sqlite");
  const id = await runChild(`
    const store = openSqliteStore({ path: ${JSON.stringify(path)} });
    const svc = new ContinuationService(store, { policy: { authorize: () => ({ allow: true, reason: "t" }) } });
    const record = await svc.open({ type: "oauth", tenant: "t", runId: "run-2", scopeId: "root", correlationId: "c", condition: { kind: "oauth_callback" }, payload: {}, handler: { id: "oauth.resume", version: "1.0.0" } });
    await store.close();
    console.log(record.id);
  `);
  const store = openSqliteStore({ path });
  const svc = new ContinuationService(store, { policy: allow });
  expect((await svc.list({ status: "OPEN" })).map((r) => r.id)).toEqual([id]);
  expect(await svc.resume(id, { actor: { id: "alice", kind: "user" }, idempotencyKey: "cb", input: { code: "xyz" } })).toMatchObject({ kind: "transitioned" });
  await store.close();
});
