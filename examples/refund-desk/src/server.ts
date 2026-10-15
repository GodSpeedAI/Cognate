// HTTP front for the refund desk. Run: bun run dev
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createRefundDesk } from "./refund-desk.ts";

const port = Number(process.env.PORT ?? 3210);
const storePath = process.env.COGNATE_STORE ?? ".cognate/refund-desk.sqlite";
// The SQLite store does not create its parent directory.
await mkdir(dirname(storePath), { recursive: true });
const desk = await createRefundDesk({ store: storePath });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/orders") {
        return json([...desk.orders.values()]);
      }
      if (req.method === "GET" && path === "/receipts") {
        return json(desk.receipts);
      }
      if (req.method === "POST" && path === "/refunds") {
        const body = (await req.json()) as { orderId: number; amountCents: number };
        const runId = await desk.propose(body.orderId, body.amountCents);
        return json({ runId }, 202);
      }
      const runMatch = path.match(/^\/runs\/([^/]+)$/);
      if (req.method === "GET" && runMatch) {
        const s = desk.status(runMatch[1]!);
        return json({
          runId: s.runId,
          status: s.status,
          output: s.output,
          pendingApprovals: s.openContinuations.map((c) => ({ id: c.id, type: c.type, payload: c.payload })),
        });
      }
      const historyMatch = path.match(/^\/runs\/([^/]+)\/history$/);
      if (req.method === "GET" && historyMatch) {
        return json(await desk.history(historyMatch[1]!));
      }
      const approvalMatch = path.match(/^\/approvals\/([^/]+)$/);
      if (req.method === "POST" && approvalMatch) {
        const body = (await req.json()) as { approved: boolean; by: string };
        const result = await desk.decide(approvalMatch[1]!, body.approved, body.by);
        return json(result);
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      return json({ error: String(err instanceof Error ? err.message : err) }, 400);
    }
  },
});

console.log(`refund desk listening on http://${server.hostname}:${server.port}`);
