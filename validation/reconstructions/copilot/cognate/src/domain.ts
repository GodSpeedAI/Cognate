import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bindCapabilities, loadSemanticProjection, type CapabilityBinding } from "@cognate/domainforge";
import type { CapabilityContract } from "@cognate/kernel-api";

const MODEL_URL = new URL("../../.sea/interaction/interaction-model.sea", import.meta.url);
const NAMESPACE = "copilotkit-reconstruction.interaction";

export const conversationCapabilities = ["conversation.start", "conversation.send", "conversation.stream", "conversation.observe"] as const;
export type ConversationCapability = (typeof conversationCapabilities)[number];

export interface JourneyABindings {
  readonly conversationStart: CapabilityContract;
  readonly conversationSend: CapabilityContract;
  readonly conversationStream: CapabilityContract;
  readonly conversationObserve: CapabilityContract;
}

/** Load the IDM in place; the reconstruction never copies or writes its semantic source. */
export async function loadJourneyABindings(): Promise<JourneyABindings> {
  const path = fileURLToPath(MODEL_URL);
  const source = await readFile(path, "utf8");
  const loaded = loadSemanticProjection(source, { uri: path });
  if (!loaded.ok) throw new Error(`J-A model failed to load: ${JSON.stringify(loaded.error)}`);

  const semanticId = `${NAMESPACE}::ConversationThread`;
  const bindings: readonly CapabilityBinding[] = conversationCapabilities.map((id) => ({ semanticId, capability: { id, version: "1.0.0" } }));
  const contracts = bindCapabilities(loaded.projection, bindings);
  if (contracts.length !== conversationCapabilities.length) throw new Error(`J-A expected ${conversationCapabilities.length} explicit bindings, got ${contracts.length}`);
  const [conversationStart, conversationSend, conversationStream, conversationObserve] = contracts;
  if (!conversationStart || !conversationSend || !conversationStream || !conversationObserve) throw new Error("J-A binding order is incomplete");
  return { conversationStart, conversationSend, conversationStream, conversationObserve };
}
