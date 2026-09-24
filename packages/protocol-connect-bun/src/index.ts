import type { Transport } from "@connectrpc/connect";
import type { Caller, RuntimeService } from "@cognate/runtime-api";

export interface ServeOptions {
  readonly service: RuntimeService;
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  readonly port?: number;
  readonly hostname?: string;
  readonly limits?: {
    /** Reject request bodies larger than this (default 1 MiB) with resource_exhausted. */
    readonly maxBodyBytes?: number;
    /** Reject JSON values nested deeper than this (default 32) with invalid_argument. */
    readonly maxJsonDepth?: number;
    /** Server-side deadline applied to unary calls without a shorter client deadline (default 30 s). */
    readonly defaultDeadlineMs?: number;
  };
}

export interface RuntimeServer {
  readonly url: string;
  stop(): Promise<void>;
}

/** Serve RuntimeService over the Connect protocol (HTTP/1.1: unary + server streaming; DEBT-004). */
export function serveRuntime(_options: ServeOptions): RuntimeServer {
  throw new Error("protocol-connect-bun: not implemented");
}

/** A fetch-based Connect transport usable from Bun and browsers. */
export function connectTransport(_baseUrl: string, _options?: { readonly useBinaryFormat?: boolean }): Transport {
  throw new Error("protocol-connect-bun: not implemented");
}

/** Test/dev authenticator: `Bearer <tenant>:<principalId>`. Not for production use. */
export function devTokenAuthenticator(headers: Headers): Caller | undefined {
  const match = /^Bearer ([^:\s]+):([^:\s]+)$/.exec(headers.get("authorization") ?? "");
  return match ? { tenant: match[1]!, actor: { id: match[2]!, kind: "user" } } : undefined;
}

export const devToken = (caller: Caller): string => `${caller.tenant}:${caller.actor.id}`;
