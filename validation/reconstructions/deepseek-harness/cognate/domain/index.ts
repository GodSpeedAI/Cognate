// Loads the validated Interaction Domain Model (IDM) for the DeepSeek Harness reconstruction.
//
// Per idm-to-cognate.md "Gaps": there is no canonical `.sea/interaction/` -> `domain/*.sea` wiring
// step in the CLI or the domainforge package. This app's decision: `domain/` does NOT copy or
// symlink the `.sea` source — it re-exports it in place, reading directly from
// `APP/.sea/interaction/interaction-model.sea` at startup via `loadSemanticProjection`. That file
// remains the single source of truth for the IDM; this module is the one place that knows its path.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bindCapabilities, loadSemanticProjection, type CapabilityBinding, type SemanticProjection } from "@cognate/domainforge";
import type { CapabilityContract } from "@cognate/kernel-api";

const INTERACTION_MODEL_URL = new URL("../.sea/interaction/interaction-model.sea", import.meta.url);

export interface Domain {
  readonly projection: SemanticProjection;
  /** `${namespace}::${EntityName}` semantic ids used by bindings below. */
  readonly semanticId: (name: string) => string;
}

/** Parse the IDM and fail fast on any error (spec: "fail fast on errors"). */
export async function loadDomain(): Promise<Domain> {
  const path = fileURLToPath(INTERACTION_MODEL_URL);
  const source = await readFile(path, "utf8");
  const result = loadSemanticProjection(source, { uri: `domain/${path}` });
  if (!result.ok) {
    throw new Error(`domain: failed to parse interaction-model.sea: ${JSON.stringify(result.error)}`);
  }
  const { projection } = result;
  const namespace = "deepseek-harness.interaction";
  // eslint-disable-next-line no-console
  console.log(`[domain] loaded ${projection.objects.length} semantic objects (digest ${projection.source.digest}) from ${path}`);
  return { projection, semanticId: (name) => `${namespace}::${name}` };
}

/**
 * Explicit capability bindings for this tranche (T5). Only capabilities this app actually publishes
 * are bound — no speculative bindings (idm-to-cognate.md traceability rule #1, handoff.md "What
 * downstream agents should NOT do").
 */
export function tranche5Bindings(domain: Domain): readonly CapabilityBinding[] {
  return [
    { semanticId: domain.semanticId("ModelProvider"), capability: { id: "model.generate", version: "1.0.0" } },
    { semanticId: domain.semanticId("ModelProvider"), capability: { id: "secret.put", version: "1.0.0" } },
    { semanticId: domain.semanticId("ModelProvider"), capability: { id: "model.configure", version: "1.0.0" } },
    { semanticId: domain.semanticId("WorkspaceRecord"), capability: { id: "workspace.select", version: "1.0.0" } },
    { semanticId: domain.semanticId("Session"), capability: { id: "session.history", version: "1.0.0" } },
  ];
}

export function bindTranche5(domain: Domain) {
  const contracts = bindCapabilities(domain.projection, tranche5Bindings(domain));
  if (contracts.length !== 5) throw new Error(`domain: expected 5 bound contracts, got ${contracts.length}`);
  const [modelGenerate, secretPut, modelConfigure, workspaceSelect, sessionHistory] = contracts as [
    CapabilityContract,
    CapabilityContract,
    CapabilityContract,
    CapabilityContract,
    CapabilityContract,
  ];
  return { modelGenerate, secretPut, modelConfigure, workspaceSelect, sessionHistory };
}

/**
 * T7 additions: `Tool` (`tool.read`/`tool.edit`/`tool.bash`/`tool.run_code`) and `WorkspaceRecord`
 * (`workspace.path`, the tool loop's root-resolution lookup). `ApprovalGate` is deliberately left
 * unbound here — it is realized as a pure decision function (`src/domain/approvalGate.ts`) plus a
 * `ctx.waitFor` continuation inside `agent.coding`, not as a `CapabilityContract`; see BINDINGS.md.
 */
export function tranche7Bindings(domain: Domain): readonly CapabilityBinding[] {
  return [
    { semanticId: domain.semanticId("Tool"), capability: { id: "tool.read", version: "1.0.0" } },
    { semanticId: domain.semanticId("Tool"), capability: { id: "tool.edit", version: "1.0.0" } },
    { semanticId: domain.semanticId("Tool"), capability: { id: "tool.bash", version: "1.0.0" } },
    { semanticId: domain.semanticId("Tool"), capability: { id: "tool.run_code", version: "1.0.0" } },
    { semanticId: domain.semanticId("WorkspaceRecord"), capability: { id: "workspace.path", version: "1.0.0" } },
  ];
}

export function bindTranche7(domain: Domain) {
  const contracts = bindCapabilities(domain.projection, tranche7Bindings(domain));
  if (contracts.length !== 5) throw new Error(`domain: expected 5 bound contracts, got ${contracts.length}`);
  const [toolRead, toolEdit, toolBash, toolRunCode, workspacePath] = contracts as [
    CapabilityContract,
    CapabilityContract,
    CapabilityContract,
    CapabilityContract,
    CapabilityContract,
  ];
  return { toolRead, toolEdit, toolBash, toolRunCode, workspacePath };
}
