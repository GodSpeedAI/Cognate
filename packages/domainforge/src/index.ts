export * from "./types.ts";
import { createHash } from "node:crypto";
import { Graph, type Entity, type Flow, type Relation, type Resource, type Role } from "@godspeedai/domainforge";
import type { CapabilityContract, SemanticRef } from "@cognate/kernel-api";
import {
  BINDING,
  PROJECTION_SCHEMA,
  type CapabilityBinding,
  type LoadResult,
  type MappingRow,
  type ResolveResult,
  type SemanticError,
  type SemanticKind,
  type SemanticObject,
  type SemanticProjection,
  type SemanticRelation,
} from "./types.ts";

/** Internal signal for a computed-id collision, classified before the generic error mapper. */
class AmbiguousIdentityError extends Error {
  constructor(readonly id: string) {
    super(`ambiguous identity: ${id}`);
  }
}

/** Unsupported-in-V0 kinds, with the reason recorded once and reused in both the mapping table and `unmapped` (DEBT-003). */
const UNSUPPORTED_KINDS: readonly { readonly kind: string; readonly reason: string }[] = [
  { kind: "Policy", reason: "add/evaluate-only via JSON string in 0.16.0; never a capability or permission, only a referenced constraint (spec §19)" },
  { kind: "Metric", reason: "standalone value class with no Graph.addX/allX accessor in 0.16.0 (DEBT-003)" },
  { kind: "Dimension", reason: "standalone value class with no Graph.addX/allX accessor in 0.16.0 (DEBT-003)" },
  { kind: "Unit", reason: "standalone value class with no Graph.addX/allX accessor in 0.16.0 (DEBT-003)" },
  { kind: "Mapping", reason: "standalone value class with no Graph.addX/allX accessor in 0.16.0 (DEBT-003)" },
  { kind: "Projection", reason: "standalone value class with no Graph.addX/allX accessor in 0.16.0 (DEBT-003)" },
  { kind: "External", reason: "no discovered constructor or Graph accessor at all in 0.16.0 (DEBT-003)" },
];

/** The explicit mapping table for every DomainForge kind, including unsupported ones (spec §19). */
export const mappingTable: readonly MappingRow[] = [
  { kind: "Entity", supported: true, view: "read-only semantic object", meaning: "a named domain concept", cardinality: "many per namespace, unique by name", provenance: "Graph.allEntities()" },
  { kind: "Resource", supported: true, view: "read-only semantic object", meaning: "a named, unit-typed domain resource", cardinality: "many per namespace, unique by name", provenance: "Graph.allResources()" },
  { kind: "Flow", supported: true, view: "read-only semantic object", meaning: "a quantified movement of a resource between two entities", cardinality: "many, unordered", provenance: "Graph.allFlows()" },
  { kind: "Role", supported: true, view: "read-only semantic object", meaning: "a named participant role in a relation", cardinality: "many per namespace, unique by name", provenance: "Graph.allRoles()" },
  { kind: "Relation", supported: true, view: "read-only semantic object", meaning: "a named predicate edge between two roles", cardinality: "many per namespace, unique by name", provenance: "Graph.allRelations()" },
  { kind: "Instance", supported: true, view: "read-only semantic object", meaning: "an entity-typed or resource-located instance", cardinality: "many, unordered", provenance: "Graph.allInstances()" },
  ...UNSUPPORTED_KINDS.map((u) => ({
    kind: u.kind,
    supported: false,
    view: "referenced constraint only",
    meaning: u.kind === "Policy" ? "a governance constraint evaluated against the graph" : `a ${u.kind.toLowerCase()} concept declared in DomainForge`,
    cardinality: "unknown (no V0 accessor)",
    provenance: "none (unmapped in V0)",
    reason: u.reason,
  })),
];

const sha256 = (source: string): string => `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`;

/**
 * Classify a Graph.parse failure. The binding reports every failure as `GenericFailure` (DEBT-002), so this matches
 * message shapes pinned by test/diagnostics.test.ts; anything unrecognized stays `unknown` with its text.
 */
export function classifyParseError(err: unknown): SemanticError {
  if (err instanceof AmbiguousIdentityError) return { kind: "ambiguous_identity", id: err.id };
  const message = err instanceof Error ? err.message : String(err);
  const duplicate = /Duplicate declaration: \w+ '([^']+)' already declared in namespace '([^']+)'/.exec(message);
  if (duplicate) return { kind: "ambiguous_identity", id: `${duplicate[2]}::${duplicate[1]}` };
  if (/undefined\s+\w+/i.test(message)) return { kind: "unresolved_reference", message };
  if (/syntax error/i.test(message)) return { kind: "syntax", message };
  if (/binding|dlopen|native module|cannot find module|failed to load/i.test(message)) return { kind: "binding_unavailable", message };
  return { kind: "unknown", message };
}

/** Parse a `.sea` source with the pinned Graph binding and produce the Cognate projection. Never throws. */
export function loadSemanticProjection(source: string, options: { readonly uri: string }): LoadResult {
  const projectionSource = { uri: options.uri, digest: sha256(source) };

  try {
    const graph = Graph.parse(source);

    const objects: SemanticObject[] = [];
    const relations: SemanticRelation[] = [];
    const seenIds = new Map<string, string>(); // computed id -> native id, to detect collisions

    const claim = (id: string, nativeId: string): void => {
      const existing = seenIds.get(id);
      if (existing !== undefined && existing !== nativeId) throw new AmbiguousIdentityError(id);
      seenIds.set(id, nativeId);
    };

    const makeRef = (namespace: string, id: string, kind: SemanticKind): SemanticRef => ({
      namespace,
      id,
      kind,
      source: projectionSource,
      projectionVersion: PROJECTION_SCHEMA,
    });

    const entityByNativeId = new Map<string, SemanticRef>();
    for (const e of graph.allEntities() as Entity[]) {
      const namespace = e.namespace ?? "default";
      const id = `${namespace}::${e.name}`;
      claim(id, e.id);
      const ref = makeRef(namespace, id, "Entity");
      entityByNativeId.set(e.id, ref);
      objects.push({ ref, kind: "Entity", name: e.name, namespace, fields: {} });
    }

    const resourceByNativeId = new Map<string, SemanticRef>();
    for (const r of graph.allResources() as Resource[]) {
      const namespace = r.namespace ?? "default";
      const id = `${namespace}::${r.name}`;
      claim(id, r.id);
      const ref = makeRef(namespace, id, "Resource");
      resourceByNativeId.set(r.id, ref);
      objects.push({ ref, kind: "Resource", name: r.name, namespace, fields: { unit: r.unit } });
    }

    const roleByNativeId = new Map<string, SemanticRef>();
    for (const role of graph.allRoles() as Role[]) {
      const namespace = role.namespace ?? "default";
      const id = `${namespace}::${role.name}`;
      claim(id, role.id);
      const ref = makeRef(namespace, id, "Role");
      roleByNativeId.set(role.id, ref);
      objects.push({ ref, kind: "Role", name: role.name, namespace, fields: {} });
    }

    // Flow identity is DomainForge-random per parse (DEBT-001); derive a deterministic id instead.
    const flowByNativeId = new Map<string, SemanticRef>();
    for (const flow of graph.allFlows() as Flow[]) {
      const resourceRef = resourceByNativeId.get(flow.resourceId);
      const fromRef = entityByNativeId.get(flow.fromId);
      const toRef = entityByNativeId.get(flow.toId);
      if (!resourceRef || !fromRef || !toRef) throw new Error(`Undefined reference on flow ${flow.id}`);
      const namespace = flow.namespace ?? resourceRef.namespace ?? "default";
      const id = `${namespace}::flow(${resourceRef.id}|${fromRef.id}|${toRef.id})`;
      claim(id, flow.id);
      const ref = makeRef(namespace, id, "Flow");
      flowByNativeId.set(flow.id, ref);
      objects.push({
        ref,
        kind: "Flow",
        name: id,
        namespace,
        fields: { resource: resourceRef.id, from: fromRef.id, to: toRef.id, quantity: flow.quantity },
      });
      relations.push({ type: "flow.from", from: ref.id, to: fromRef.id });
      relations.push({ type: "flow.to", from: ref.id, to: toRef.id });
      relations.push({ type: "flow.resource", from: ref.id, to: resourceRef.id });
    }

    for (const rel of graph.allRelations() as Relation[]) {
      const namespace = rel.namespace ?? "default";
      const id = `${namespace}::${rel.name}`;
      claim(id, rel.id);
      const ref = makeRef(namespace, id, "Relation");
      const subjectRef = roleByNativeId.get(rel.subjectRoleId);
      const objectRef = roleByNativeId.get(rel.objectRoleId);
      if (!subjectRef || !objectRef) throw new Error(`Undefined role reference on relation ${rel.name}`);
      const viaFlowRef = rel.viaFlowId ? flowByNativeId.get(rel.viaFlowId) : undefined;
      objects.push({
        ref,
        kind: "Relation",
        name: rel.name,
        namespace,
        fields: { predicate: rel.predicate, subject: subjectRef.id, object: objectRef.id, via: viaFlowRef?.id ?? null },
      });
      relations.push({ type: "relation.subject", from: ref.id, to: subjectRef.id });
      relations.push({ type: "relation.object", from: ref.id, to: objectRef.id });
      if (viaFlowRef) relations.push({ type: "relation.via", from: ref.id, to: viaFlowRef.id });
    }

    // ResourceInstance (Graph's typed "Instance" collection). Named when a `name` is exposed;
    // otherwise identity is derived from its resource/entity references (no native name field).
    for (const inst of graph.allInstances() as unknown as Array<
      { readonly id: string; readonly namespace: string | null; readonly name?: string; readonly resourceId?: string; readonly entityId?: string; readonly entityType?: string }
    >) {
      const hasName = typeof inst.name === "string";
      let namespace = inst.namespace ?? "default";
      let id: string;
      let fields: Record<string, string | number | boolean | null>;
      if (hasName) {
        id = `${namespace}::${inst.name}`;
        fields = { entityType: inst.entityType ?? null };
      } else {
        const resourceRef = inst.resourceId ? resourceByNativeId.get(inst.resourceId) : undefined;
        const entityRef = inst.entityId ? entityByNativeId.get(inst.entityId) : undefined;
        namespace = entityRef?.namespace ?? resourceRef?.namespace ?? namespace;
        id = `${namespace}::instance(${resourceRef?.id ?? inst.resourceId ?? ""}|${entityRef?.id ?? inst.entityId ?? ""})`;
        fields = { resource: resourceRef?.id ?? null, entity: entityRef?.id ?? null };
      }
      claim(id, inst.id);
      const ref = makeRef(namespace, id, "Instance");
      objects.push({ ref, kind: "Instance", name: hasName ? (inst.name as string) : id, namespace, fields });
    }

    const projection: SemanticProjection = {
      schema: PROJECTION_SCHEMA,
      binding: BINDING,
      source: projectionSource,
      objects,
      relations,
      unmapped: UNSUPPORTED_KINDS,
    };

    return { ok: true, projection };
  } catch (err) {
    return { ok: false, error: classifyParseError(err) };
  }
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    return sorted;
  }
  return value;
}

/** Deterministic JSON of a projection (stable key order), for archiving and golden fixtures. */
export function serializeProjection(projection: SemanticProjection): string {
  const objects = [...projection.objects].sort((a, b) => (a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0));
  const relations = [...projection.relations].sort((a, b) => {
    const ka = `${a.type}|${a.from}|${a.to}`;
    const kb = `${b.type}|${b.from}|${b.to}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const unmapped = [...projection.unmapped].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  const canonical = { schema: projection.schema, binding: projection.binding, source: projection.source, objects, relations, unmapped };
  return JSON.stringify(sortDeep(canonical));
}

interface AliasRecord {
  readonly from: SemanticRef;
  readonly to: SemanticRef;
  readonly reviewedBy: string;
  readonly meaningCheck: string;
}

const refKey = (ref: SemanticRef): string => `${ref.source.digest}::${ref.id}`;

/**
 * Archive of projections by source digest. Historical refs resolve only against the projection pinned by their
 * digest; renames need an explicit, reviewed alias (spec §7.1, §13.3).
 */
export class SemanticRegistry {
  #byDigest = new Map<string, SemanticProjection>();
  #aliases: AliasRecord[] = [];

  register(projection: SemanticProjection): void {
    this.#byDigest.set(projection.source.digest, projection);
  }

  resolve(ref: SemanticRef): ResolveResult {
    const projection = this.#byDigest.get(ref.source.digest);
    if (!projection) return { kind: "unresolved", ref, reason: "unknown_source" };
    const object = projection.objects.find((o) => o.ref.id === ref.id);
    if (!object) return { kind: "unresolved", ref, reason: "not_in_source" };
    return { kind: "resolved", object, projection };
  }

  /** Record an application-reviewed relationship between an old and new identity. Returns nothing implicitly. */
  alias(from: SemanticRef, to: SemanticRef, review: { readonly reviewedBy: string; readonly meaningCheck: string }): void {
    this.#aliases.push({ from, to, reviewedBy: review.reviewedBy, meaningCheck: review.meaningCheck });
  }

  aliasesOf(ref: SemanticRef): readonly { readonly to: SemanticRef; readonly reviewedBy: string; readonly meaningCheck: string }[] {
    const key = refKey(ref);
    return this.#aliases.filter((a) => refKey(a.from) === key).map(({ to, reviewedBy, meaningCheck }) => ({ to, reviewedBy, meaningCheck }));
  }
}

/**
 * Application manifest binding: only explicitly bound semantic ids become capability contracts, each carrying its
 * SemanticRef. Unknown ids are an error; unbound objects produce nothing (spec §19).
 */
export function bindCapabilities(projection: SemanticProjection, bindings: readonly CapabilityBinding[]): CapabilityContract[] {
  return bindings.map((binding) => {
    const object = projection.objects.find((o) => o.ref.id === binding.semanticId);
    if (!object) throw new Error(`domainforge: unknown semantic id "${binding.semanticId}"`);
    return { ...binding.capability, semanticRef: object.ref };
  });
}
