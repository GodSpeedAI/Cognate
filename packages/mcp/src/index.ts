// CG-MCP-001 (spec §6 optional protocols, §32; DEBT-013): runtime capabilities as MCP tools, authorized per caller.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Json } from "@godspeedai/cognate-events";
import { ServiceError, type Caller, type RuntimeService } from "@godspeedai/cognate-runtime-api";

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

/** A JSON Schema fragment describing one property or an item type; narrowed enough to translate to zod. */
type JsonSchemaNode = { readonly [key: string]: Json };

/**
 * Translates a JSON Schema fragment into an equivalent zod validator. The MCP SDK's `registerTool` only accepts
 * a raw zod shape for `inputSchema` (see `compatibility/phase0/mcp/API_NOTES.md`), so bindings that advertise a
 * plain JSON Schema object must be converted before registration. Unknown/unsupported schema shapes fall back
 * to `z.unknown()` rather than rejecting the binding.
 */
function jsonSchemaToZod(node: JsonSchemaNode): z.ZodTypeAny {
  const type = node.type;
  switch (type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array": {
      const items = node.items as JsonSchemaNode | undefined;
      return z.array(items ? jsonSchemaToZod(items) : z.unknown());
    }
    case "object":
      return z.object(objectShape(node));
    default:
      return z.unknown();
  }
}

/** Builds a zod raw shape from a JSON Schema object node's `properties`/`required`. */
function objectShape(node: JsonSchemaNode): Record<string, z.ZodTypeAny> {
  const properties = (node.properties as Record<string, JsonSchemaNode> | undefined) ?? {};
  const required = new Set((node.required as readonly string[] | undefined) ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    const validator = jsonSchemaToZod(propertySchema);
    shape[key] = required.has(key) ? validator : validator.optional();
  }
  return shape;
}

/**
 * Build an MCP server (SDK McpServer) whose tools call `RuntimeService.invoke`. Denied, unavailable, or failed
 * invocations return MCP tool errors (`isError: true`) carrying the ServiceError code, never partial success.
 * The returned object is the SDK server; connect it to any MCP transport.
 */
export function createMcpServer(options: McpAdapterOptions): { connect(transport: unknown): Promise<void>; close(): Promise<void> } {
  const server = new McpServer({ name: options.name ?? "cognate", version: options.version ?? "0.0.0" });

  for (const binding of options.tools) {
    const name = binding.name ?? binding.capability.replace(/\./g, "_");
    server.registerTool(
      name,
      { description: binding.description, inputSchema: objectShape(binding.inputSchema) },
      async (args: Record<string, unknown>) => {
        try {
          const output = await options.service.invoke(options.caller, { capability: binding.capability, input: (args ?? {}) as Json });
          return { content: [{ type: "text" as const, text: JSON.stringify(output) }] };
        } catch (error) {
          if (error instanceof ServiceError) {
            return { isError: true, content: [{ type: "text" as const, text: `${error.code}: ${error.message}` }] };
          }
          throw error;
        }
      },
    );
  }

  return server as unknown as { connect(transport: unknown): Promise<void>; close(): Promise<void> };
}
