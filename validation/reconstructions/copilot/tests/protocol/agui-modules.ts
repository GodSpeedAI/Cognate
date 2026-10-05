// Protocol-only AG-UI packages (prompt "AG-UI is allowed"): @ag-ui/core, @ag-ui/encoder and
// @ag-ui/client, resolved from the workspace's existing install under packages/ag-ui.
//
// This suite directory sits outside every package.json workspace, so bare specifiers cannot
// resolve from here; resolving through the one package that already declares these dependencies
// adds no dependency, installs nothing, and changes no manifest. The client is loaded dynamically
// so the suite's static import graph (scanned by purity.test.ts) stays explicit about it.
import { join } from "node:path";

const AG_UI_PACKAGE_DIR = join(import.meta.dir, "../../../../../packages/ag-ui");

export const agUiCoreEntry = Bun.resolveSync("@ag-ui/core", AG_UI_PACKAGE_DIR);
export const agUiSchemasEntry = Bun.resolveSync("@ag-ui/core/schemas", AG_UI_PACKAGE_DIR);
export const agUiEncoderEntry = Bun.resolveSync("@ag-ui/encoder", AG_UI_PACKAGE_DIR);
export const agUiClientEntry = Bun.resolveSync("@ag-ui/client", AG_UI_PACKAGE_DIR);

type SafeParse = { success: boolean; error?: { issues: unknown[] } };

const schemas = (await import(agUiSchemasEntry)) as {
  EventSchema: { safeParse(value: unknown): SafeParse };
  RunAgentInputSchema: { safeParse(value: unknown): SafeParse };
};

/** The pinned AG-UI 1.0.0 event union schema — ground truth for every received frame. */
export const EventSchema = schemas.EventSchema;
/** The pinned AG-UI 1.0.0 RunAgentInput schema — what a standards-compliant client must send. */
export const RunAgentInputSchema = schemas.RunAgentInputSchema;

/** One received AG-UI event as a plain object (the wire is JSON over SSE). */
export type AgUiEvent = { readonly type: string; readonly [key: string]: unknown };

/** The official AG-UI client (HttpAgent), imported by resolved path. */
export async function loadAgUiClient(): Promise<{ HttpAgent: new (config: Record<string, unknown>) => { addMessage(message: Record<string, unknown>): void; runAgent(input: Record<string, unknown>, callbacks?: Record<string, unknown>): Promise<unknown>; messages?: readonly { role: string; content: unknown }[] } }> {
  return (await import(agUiClientEntry)) as never;
}
