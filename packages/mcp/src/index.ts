import type { Json } from "@cognate/events";
import type { Caller, RuntimeService } from "@cognate/runtime-api";

export interface McpToolBinding {
  /** Runtime capability invoked by this tool, e.g. `billing.quote`. */
  readonly capability: string;
  /** MCP tool name (defaults to the capability id with dots replaced by underscores). */
  readonly name?: string;
  readonly description: string;
  /** JSON Schema for the tool input (object schema). */
  readonly inputSchema: { readonly [key: string]: Json };
}

export interface McpAdapterOptions {
  readonly service: RuntimeService;
  /** The authenticated caller for this MCP connection; every call is authorized as this caller (spec §32). */
  readonly caller: Caller;
  readonly tools: readonly McpToolBinding[];
  readonly name?: string;
  readonly version?: string;
}

/**
 * Build an MCP server (SDK McpServer) whose tools call `RuntimeService.invoke`. Denied, unavailable, or failed
 * invocations return MCP tool errors (`isError: true`) carrying the ServiceError code, never partial success.
 * The returned object is the SDK server; connect it to any MCP transport.
 */
export function createMcpServer(_options: McpAdapterOptions): { connect(transport: unknown): Promise<void>; close(): Promise<void> } {
  throw new Error("mcp: not implemented");
}
