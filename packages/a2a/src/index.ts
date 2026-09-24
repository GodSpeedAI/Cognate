import type { Caller, RuntimeService } from "@cognate/runtime-api";

export interface A2AAdapterOptions {
  readonly service: RuntimeService;
  /** Runtime agent id served, e.g. `agent.refund`. */
  readonly agent: string;
  readonly card: { readonly name: string; readonly description: string; readonly version: string; readonly skills: readonly { readonly id: string; readonly name: string; readonly description: string }[] };
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  /** Public base URL written into the agent card. */
  readonly baseUrl: string;
}

/**
 * Fetch handler serving the A2A agent card at `/.well-known/agent-card.json` and JSON-RPC at `/a2a`.
 * `message/send` starts (or, with a taskId, resumes) a durable run: A2A task id = Cognate run id; an open
 * continuation surfaces as `input-required`; completion returns the run output as an artifact/message.
 */
export function createA2AHandler(_options: A2AAdapterOptions): (request: Request) => Promise<Response> {
  throw new Error("a2a: not implemented");
}
