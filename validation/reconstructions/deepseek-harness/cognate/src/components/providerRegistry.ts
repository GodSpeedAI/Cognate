// Builds a live `ModelProvider` from saved (non-secret) config plus the secret store, and hot-swaps
// the mounted `model.generate` component: dispose the old fiber, mount the new one. No restart.
import type { ModelProvider } from "@godspeedai/cognate-capabilities";
import type { ComponentHandle, Kernel, SemanticRef } from "@godspeedai/cognate-kernel-api";
import { openAICompatible } from "@godspeedai/cognate-provider-openai-compatible";
import { streamingProviderComponent } from "./modelProvider.ts";
import type { SecretStore } from "../secrets.ts";

export interface ModelConfig {
  readonly providerId: string;
  readonly baseURL: string;
  readonly protocol: "openai-compatible";
  readonly model: string;
}

export function buildProvider(config: ModelConfig, secrets: SecretStore): ModelProvider {
  return openAICompatible({
    id: config.providerId,
    baseURL: config.baseURL,
    model: config.model,
    apiKey: async () => (await secrets.get(`model-provider:${config.providerId}`)) ?? "",
  });
}

export class ProviderRegistry {
  #kernel: Kernel;
  #semanticRef: SemanticRef | undefined;
  #handle: ComponentHandle | undefined;
  #current: ModelConfig | undefined;

  constructor(kernel: Kernel, semanticRef?: SemanticRef) {
    this.#kernel = kernel;
    this.#semanticRef = semanticRef;
  }

  get current(): ModelConfig | undefined {
    return this.#current;
  }

  /** Mount `config` as the live `model.generate` provider; dispose whatever was mounted before. */
  async swap(config: ModelConfig, secrets: SecretStore): Promise<void> {
    const provider = buildProvider(config, secrets);
    const nextHandle = await this.#kernel.mount(streamingProviderComponent(provider, this.#semanticRef));
    await nextHandle.waitFor("ACTIVE", 5000);
    const previous = this.#handle;
    this.#handle = nextHandle;
    this.#current = config;
    if (previous) await previous.dispose(`hot-swap to provider ${config.providerId}`);
  }
}
