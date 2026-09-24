import type { ConnectRouter, Transport } from "@connectrpc/connect";
import type { Caller, RuntimeService, ServiceErrorCode } from "@cognate/runtime-api";

export interface HandlerOptions {
  /** Establish the caller from request headers (e.g. `authorization: Bearer …`); undefined → unauthenticated. */
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  /** Maximum nesting depth of JSON values (google.protobuf.Value) accepted from clients. */
  readonly maxJsonDepth: number;
}

/** Register the RuntimeService routes on a Connect router. ServiceError codes map to Connect codes. */
export function registerRuntimeService(_router: ConnectRouter, _service: RuntimeService, _options: HandlerOptions): void {
  throw new Error("protocol-connect: not implemented");
}

/** A RuntimeService backed by a remote Connect endpoint. `tokenFor` supplies the credential that authenticates a caller. */
export function createRemoteRuntimeService(_transport: Transport, _tokenFor: (caller: Caller) => string): RuntimeService {
  throw new Error("protocol-connect: not implemented");
}

/** The ServiceError ↔ Connect code table (exported for tests and other transports). */
export const errorCodes: Readonly<Record<ServiceErrorCode, number>> = {} as never;
