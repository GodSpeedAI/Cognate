import type { Json } from "@godspeedai/cognate-events";
import type { CapabilityContract } from "@godspeedai/cognate-kernel-api";

export type JudgmentQuestion =
  | { readonly type: "choice"; readonly instructions: string; readonly criteria: Readonly<Record<string,string>> }
  | { readonly type: "score"; readonly instructions: string; readonly criteria: readonly string[] }
  | { readonly type: "noul"; readonly instructions: string; readonly criteria?: { readonly true?: string; readonly false?: string } };
export interface JudgmentRequest {
  readonly state: Json;
  readonly questions: Readonly<Record<string, JudgmentQuestion>>;
  /** Idempotent operation identity, minted/persisted by the caller before payable requests. */
  readonly operationKey?: string;
}
export type JudgmentAnswer =
  | { readonly type: "choice"; readonly choice: string; readonly probabilities?: Readonly<Record<string, number>>; readonly confidence?: number }
  | { readonly type: "score"; readonly score: number; readonly probabilities?: Readonly<Record<string, number>>; readonly confidence?: number }
  | { readonly type: "noul"; readonly noul: number; readonly confidence?: number };
export interface JudgmentResponse {
  readonly model: string;
  readonly answers: Readonly<Record<string, JudgmentAnswer>>;
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number };
}
export interface JudgmentProvider {
  readonly id: string;
  readonly model: string;
  evaluate(request: JudgmentRequest, signal?: AbortSignal): Promise<JudgmentResponse>;
}
export function judgmentContract(provider: JudgmentProvider): CapabilityContract {
  return { id: "judgment.evaluate", version: "1.0.0", attributes: { provider: provider.id, model: provider.model, modes: ["choice", "score", "noul"] } };
}
