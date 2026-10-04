import type { CapabilityContract, SemanticRef } from "@cognate/kernel-api";

export const PROJECTION_SCHEMA = "cognate.semantic.v1";
export const BINDING = "@godspeedai/domainforge@0.19.0";

export type SemanticKind =
  | "Entity" | "Resource" | "Flow" | "Role" | "Relation" | "Instance"
  | "EntityInstance" | "Pattern" | "ConceptChange" | "Policy" | "Metric"
  | "Dimension" | "Unit" | "Mapping" | "Projection";

export type SemanticValue = string | number | boolean | null | readonly SemanticValue[] | { readonly [key: string]: SemanticValue };

/** A read-only semantic object with provenance. Never an executable capability by itself (spec §19). */
export interface SemanticObject {
  readonly ref: SemanticRef;
  readonly kind: SemanticKind;
  readonly name: string;
  readonly namespace: string;
  /** Kind-specific values; semantic references are expressed as SemanticRef ids where applicable. */
  readonly fields: { readonly [key: string]: SemanticValue };
}

export interface SemanticRelation {
  readonly type: string;
  readonly from: string;
  readonly to: string;
}

/** Cognate-owned, versioned serialized projection of one `.sea` source (spec §19). */
export interface SemanticProjection {
  readonly schema: typeof PROJECTION_SCHEMA;
  readonly binding: typeof BINDING;
  readonly source: { readonly uri: string; readonly digest: string };
  readonly objects: readonly SemanticObject[];
  readonly relations: readonly SemanticRelation[];
  /** Kinds present in DomainForge that V0 does not map, with counts where observable. */
  readonly unmapped: readonly { readonly kind: string; readonly reason: string }[];
}

export type SemanticError =
  | { readonly kind: "syntax"; readonly message: string }
  | { readonly kind: "unresolved_reference"; readonly message: string }
  | { readonly kind: "ambiguous_identity"; readonly id: string }
  | { readonly kind: "binding_unavailable"; readonly message: string }
  | { readonly kind: "unknown"; readonly message: string };

export type LoadResult = { readonly ok: true; readonly projection: SemanticProjection } | { readonly ok: false; readonly error: SemanticError };

export interface MappingRow {
  readonly kind: string;
  readonly supported: boolean;
  /** Framework view produced, e.g. "read-only semantic object" or "referenced constraint". */
  readonly view: string;
  readonly meaning: string;
  readonly cardinality: string;
  readonly provenance: string;
  readonly reason?: string;
}

export type ResolveResult =
  | { readonly kind: "resolved"; readonly object: SemanticObject; readonly projection: SemanticProjection }
  /** Typed unresolved result; never silently re-mapped to a same-named current object (spec §7.1). */
  | { readonly kind: "unresolved"; readonly ref: SemanticRef; readonly reason: "unknown_source" | "not_in_source" };

export interface CapabilityBinding {
  /** SemanticRef id the application binds, e.g. `billing::Refund`. */
  readonly semanticId: string;
  readonly capability: Omit<CapabilityContract, "semanticRef">;
}
