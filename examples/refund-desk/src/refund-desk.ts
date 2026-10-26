// Refund desk on published Cognate SDK packages (no source checkout).
// A support agent proposes a refund. Refunds up to APPROVAL_THRESHOLD_CENTS complete
// automatically. Larger refunds suspend on a durable human-approval continuation.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@godspeedai/cognate-client";
import { bindCapabilities, loadSemanticProjection } from "@godspeedai/cognate-domainforge";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import type { CapabilityContract, Component } from "@godspeedai/cognate-kernel-api";
import { allowCapabilities } from "@godspeedai/cognate-kernel-api";
import { createRuntime, type Json, type RuntimeStoreConfig } from "@godspeedai/cognate-runtime-bun";

export const APPROVAL_THRESHOLD_CENTS = 5000;
export const AGENT_ID = "agent.refund-desk";

// Demo identity. A real app would take the caller from its authenticator, never from the body.
const CALLER = { actor: { id: "support-agent-1", kind: "user" }, tenant: "tenant-a" } as const;

export interface Order {
  readonly orderId: number;
  readonly customer: string;
  readonly totalCents: number;
  refundedCents: number;
}

export interface Refund {
  readonly refundId: string;
  readonly orderId: number;
  readonly amountCents: number;
}

export interface Receipt {
  readonly refundId: string;
  readonly orderId: number;
  readonly amountCents: number;
  readonly customer: string;
}

interface DeskState {
  readonly orders: Map<number, Order>;
  readonly ledger: Refund[];
}

function seedState(): DeskState {
  const orders = new Map<number, Order>(
    [
      { orderId: 1001, customer: "Ada", totalCents: 12000, refundedCents: 0 },
      { orderId: 1002, customer: "Grace", totalCents: 3000, refundedCents: 0 },
      { orderId: 1003, customer: "Linus", totalCents: 7500, refundedCents: 0 },
    ].map((o) => [o.orderId, o]),
  );
  return { orders, ledger: [] };
}

// The domain model is the source of truth for capability semantic ids. Only the two ids bound here
// become capabilities; no other semantic object is callable.
async function loadCommerceContracts(): Promise<{ lookup: CapabilityContract; issue: CapabilityContract }> {
  const source = await readFile(new URL("../domain/refund-desk.sea", import.meta.url), "utf8");
  const loaded = loadSemanticProjection(source, { uri: "refund-desk:///domain/refund-desk.sea" });
  if (!loaded.ok) throw new Error(`domain/refund-desk.sea did not load: ${JSON.stringify(loaded.error)}`);
  const [lookup, issue] = bindCapabilities(loaded.projection, [
    { semanticId: "refunds::Order", capability: { id: "orders.lookup", version: "1.0.0" } },
    { semanticId: "refunds::Refund", capability: { id: "refunds.issue", version: "1.0.0" } },
  ]);
  return { lookup: lookup!, issue: issue! };
}

// Capabilities are the only way the agent touches orders or money.
function commerceComponent(state: DeskState, lookup: CapabilityContract, issue: CapabilityContract): Component {
  return {
    id: "commerce",
    provides: [lookup, issue],
    activate(fiber) {
      fiber.provide(lookup, async (input) => {
        const { orderId } = input as { orderId: number };
        const order = state.orders.get(orderId);
        return order ? { ...order } : null;
      });
      fiber.provide(issue, async (input) => {
        const { orderId, amountCents, refundId } = input as Refund;
        const order = state.orders.get(orderId);
        if (!order) throw new Error(`order ${orderId} not found`);
        // Idempotent per refundId: a run resumed at startup may reach this before the restore fold has run.
        if (!state.ledger.some((r) => r.refundId === refundId)) {
          order.refundedCents += amountCents;
          state.ledger.push({ refundId, orderId, amountCents });
        }
        return { refundId, status: "issued" };
      });
    },
  };
}

// Extension: a fake outbox stands in for an email provider. Receipts are not restored on restart.
function notificationsComponent(outbox: Receipt[]): Component {
  const receipt: CapabilityContract = { id: "notify.receipt", version: "1.0.0" };
  return {
    id: "notifications",
    provides: [receipt],
    activate(fiber) {
      fiber.provide(receipt, async (input) => {
        outbox.push({ ...(input as Receipt) });
        return { sent: true };
      });
    },
  };
}

const refundAgent: AgentDefinition = {
  id: AGENT_ID,
  version: "1.0.0",
  async run(input, ctx): Promise<Json> {
    const { orderId, amountCents } = input as { orderId: number; amountCents: number };
    const order = (await ctx.invoke("orders.lookup", { orderId })) as Order | null;
    if (!order) {
      await ctx.emit("refund.rejected", { orderId, reason: "order_not_found" });
      return { status: "rejected", reason: "order_not_found" };
    }
    const refundable = order.totalCents - order.refundedCents;
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > refundable) {
      await ctx.emit("refund.rejected", { orderId, amountCents, refundable, reason: "exceeds_refundable" });
      return { status: "rejected", reason: "exceeds_refundable", refundable };
    }
    await ctx.emit("refund.proposed", { orderId, amountCents });

    if (amountCents > APPROVAL_THRESHOLD_CENTS) {
      await ctx.emit("refund.awaiting_approval", { orderId, amountCents, thresholdCents: APPROVAL_THRESHOLD_CENTS });
      const decision = (await ctx.waitFor("approve-refund", {
        type: "refund-approval",
        condition: { kind: "human_approval" },
        payload: { orderId, amountCents },
      })) as { readonly approved: boolean; readonly by?: string };
      if (!decision.approved) {
        await ctx.emit("refund.denied", { orderId, amountCents, by: decision.by ?? null });
        return { status: "denied", orderId, amountCents };
      }
      await ctx.emit("refund.approved", { orderId, amountCents, by: decision.by ?? null });
    } else {
      await ctx.emit("refund.auto_approved", { orderId, amountCents });
    }

    const refundId = `RF-${ctx.runId}`;
    await ctx.invoke("refunds.issue", { orderId, amountCents, refundId });
    await ctx.emit("refund.issued", { orderId, amountCents, refundId });
    await ctx.invoke("notify.receipt", { refundId, orderId, amountCents, customer: order.customer });
    return { status: "refunded", orderId, amountCents, refundId };
  },
};

export interface RefundDeskOptions {
  readonly store?: RuntimeStoreConfig;
}

export async function createRefundDesk(options: RefundDeskOptions = {}) {
  const state = seedState();
  const receipts: Receipt[] = [];
  const { lookup, issue } = await loadCommerceContracts();
  const runtime = await createRuntime({
    store: options.store ?? ":memory:",
    policy: allowCapabilities("refund-desk", ["orders.lookup", "refunds.issue", "notify.receipt"]),
    actions: { authorize: () => ({ allow: true, reason: "demo: support agent is authorized" }) },
    agents: [refundAgent],
    components: [commerceComponent(state, lookup, issue), notificationsComponent(receipts)],
  });
  const client = createClient({ service: runtime.service, caller: CALLER });

  // Restore business state from the durable log. Each completed refund left a refund.issued event, and the
  // fold runs before any new run starts, so the in-process checks see every earlier refund. (A read model
  // served asynchronously would need a projection; this one is read synchronously by the refund check.)
  for await (const event of runtime.service.events(CALLER, { follow: false })) {
    if (event.eventType !== "refund.issued") continue;
    const { orderId, amountCents, refundId } = event.payload as unknown as Refund;
    const order = state.orders.get(orderId);
    if (!order) throw new Error(`refund.issued for unknown order ${orderId}`);
    if (state.ledger.some((r) => r.refundId === refundId)) continue;
    order.refundedCents += amountCents;
    state.ledger.push({ refundId, orderId, amountCents });
  }

  return {
    orders: state.orders,
    ledger: state.ledger,
    receipts,

    /** Start a refund run. Returns the run id. */
    async propose(orderId: number, amountCents: number): Promise<string> {
      const { runId } = await client.startRun(AGENT_ID, { orderId, amountCents }, { idempotencyKey: randomUUID() });
      return runId;
    },

    /** Current run view, including any open approval continuations. */
    status(runId: string) {
      return client.run(runId).get();
    },

    /** Resolve an approval continuation. approved=false denies and the run ends without a refund. */
    async decide(continuationId: string, approved: boolean, by: string) {
      return client.resolveContinuation(continuationId, "resume", { approved, by });
    },

    /** Durable event log for one run, in stream order. */
    async history(runId: string): Promise<Array<{ type: string; payload: unknown }>> {
      const out: Array<{ type: string; payload: unknown }> = [];
      for await (const event of runtime.service.events(CALLER, { runId, follow: false })) {
        out.push({ type: event.eventType, payload: event.payload });
      }
      return out;
    },

    async close() {
      await client.close();
      await runtime.close();
    },
  };
}
