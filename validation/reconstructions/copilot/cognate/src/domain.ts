import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bindCapabilities, loadSemanticProjection, type CapabilityBinding } from "@godspeedai/cognate-domainforge";
import type { CapabilityContract } from "@godspeedai/kernel-api";

const MODEL_URL = new URL("../../.sea/interaction/interaction-model.sea", import.meta.url);
const NAMESPACE = "copilotkit-reconstruction.interaction";

export const conversationCapabilities = ["conversation.start", "conversation.send", "conversation.stream", "conversation.observe"] as const;
export type ConversationCapability = (typeof conversationCapabilities)[number];
export const sharedStateCapabilities = ["state.observe", "state.update", "state.stream"] as const;
export type SharedStateCapability = (typeof sharedStateCapabilities)[number];

export interface JourneyABindings {
  readonly conversationStart: CapabilityContract;
  readonly conversationSend: CapabilityContract;
  readonly conversationStream: CapabilityContract;
  readonly conversationObserve: CapabilityContract;
}

export interface JourneyCBindings {
  readonly stateObserve: CapabilityContract;
  readonly stateUpdate: CapabilityContract;
  readonly stateStream: CapabilityContract;
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

/** The J-C state affordances are declared by ApplicationCanvas and realized by general runtime state primitives. */
export async function loadJourneyCBindings(): Promise<JourneyCBindings> {
  const path = fileURLToPath(MODEL_URL);
  const source = await readFile(path, "utf8");
  const loaded = loadSemanticProjection(source, { uri: path });
  if (!loaded.ok) throw new Error(`J-C model failed to load: ${JSON.stringify(loaded.error)}`);

  const semanticId = `${NAMESPACE}::ApplicationCanvas`;
  const bindings: readonly CapabilityBinding[] = sharedStateCapabilities.map((id) => ({ semanticId, capability: { id, version: "1.0.0" } }));
  const contracts = bindCapabilities(loaded.projection, bindings);
  if (contracts.length !== sharedStateCapabilities.length) throw new Error(`J-C expected ${sharedStateCapabilities.length} explicit bindings, got ${contracts.length}`);
  const [stateObserve, stateUpdate, stateStream] = contracts;
  if (!stateObserve || !stateUpdate || !stateStream) throw new Error("J-C binding order is incomplete");
  return { stateObserve, stateUpdate, stateStream };
}
