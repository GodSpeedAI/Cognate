import type { Json } from "@cognate/events";
import type { RunContext } from "./types.ts";

/** Continuation condition kind for a capability served by a connected client (e.g. a browser). */
export const FRONTEND_CAPABILITY = "frontend_capability";

export class FrontendCapabilityError extends Error {
  override readonly name = "FrontendCapabilityError";
}

/**
 * Invoke a capability provided by a client, as a durable continuation (no kernel primitive, no bidi streaming):
 * the run waits until a client that registered `capability` executes it and resolves the continuation with
 * `{ ok: true, value }` or `{ ok: false, error }`. Survives disconnects and restarts like any continuation.
 */
export async function invokeFrontend(ctx: RunContext, id: string, capability: string, input: Json, options: { readonly expiresAt?: number } = {}): Promise<Json> {
  const result = (await ctx.waitFor(id, { type: `frontend:${capability}`, condition: { kind: FRONTEND_CAPABILITY, capability }, payload: input, ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }) })) as { ok?: boolean; value?: Json; error?: string } | null;
  if (!result || result.ok !== true) throw new FrontendCapabilityError(`${capability} failed: ${result?.error ?? "no result"}`);
  return result.value ?? null;
}
