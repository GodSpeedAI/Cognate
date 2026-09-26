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
  type SemanticValue,
} from "./types.ts";

/** Internal signal for a computed-id collision, classified before the generic error mapper. */
class AmbiguousIdentityError extends Error {
  constructor(readonly id: string) {
    super(`ambiguous identity: ${id}`);
  }
}

/** Kinds with no SEA declaration/Graph accessor. Keep each reason explicit and source-backed. */
const UNSUPPORTED_KINDS: readonly { readonly kind: string; readonly reason: string }[] = [
  { kind: "External", reason: "not a SEA grammar, AST, or Graph declaration; it exists only as a semantic-pack enum variant" },
];

/** The explicit mapping table for every DomainForge kind, including unsupported ones (spec §19). */
export const mappingTable: readonly MappingRow[] = [
  { kind: "Entity", supported: true, view: "read-only semantic object", meaning: "a named domain concept", cardinality: "many per namespace, unique by name", provenance: "Graph.allEntities()" },
  { kind: "Resource", supported: true, view: "read-only semantic object", meaning: "a named, unit-typed domain resource", cardinality: "many per namespace, unique by name", provenance: "Graph.allResources()" },
  { kind: "Flow", supported: true, view: "read-only semantic object", meaning: "a quantified movement of a resource between two entities", cardinality: "many, unordered", provenance: "Graph.allFlows()" },
  { kind: "Role", supported: true, view: "read-only semantic object", meaning: "a named participant role in a relation", cardinality: "many per namespace, unique by name", provenance: "Graph.allRoles()" },
  { kind: "Relation", supported: true, view: "read-only semantic object", meaning: "a named predicate edge between two roles", cardinality: "many per namespace, unique by name", provenance: "Graph.allRelations()" },
  { kind: "Instance", supported: true, view: "read-only semantic object", meaning: "a resource instance created through the Graph API; no SEA declaration", cardinality: "many, declaration order", provenance: "Graph.allInstances()" },
  { kind: "EntityInstance", supported: true, view: "read-only semantic object", meaning: "an entity-typed instance declared in SEA", cardinality: "many, declaration order", provenance: "Graph.allEntityInstances()" },
  { kind: "Pattern", supported: true, view: "read-only semantic object", meaning: "a named matching pattern", cardinality: "many per namespace, unique by name", provenance: "Graph.allPatterns()" },
  { kind: "ConceptChange", supported: true, view: "read-only semantic object", meaning: "a declared concept version change", cardinality: "many per namespace, unique by name", provenance: "Graph.allConceptChanges()" },
  { kind: "Policy", supported: true, view: "read-only semantic object; referenced constraint only", meaning: "a governance constraint declared in the semantic model", cardinality: "many per namespace, unique by name", provenance: "Graph.allPolicies()" },
  { kind: "Metric", supported: true, view: "read-only semantic object", meaning: "a named expression and its unit", cardinality: "many per namespace, unique by name", provenance: "Graph.allMetrics()" },
  { kind: "Dimension", supported: true, view: "read-only semantic object", meaning: "a unit dimension", cardinality: "many per namespace, unique by name", provenance: "Graph.allDimensions()" },
  { kind: "Unit", supported: true, view: "read-only semantic object", meaning: "a declared unit and base conversion factor", cardinality: "many per namespace, unique by name", provenance: "Graph.allUnits()" },
  { kind: "Mapping", supported: true, view: "read-only semantic object", meaning: "a source mapping for a target format", cardinality: "many per namespace, unique by name", provenance: "Graph.allMappings()" },
  { kind: "Projection", supported: true, view: "read-only semantic object", meaning: "a source projection for a target format", cardinality: "many per namespace, unique by name", provenance: "Graph.allProjections()" },
  ...UNSUPPORTED_KINDS.map((u) => ({
    kind: u.kind,
    supported: false,
    view: "unmapped",
    meaning: `a ${u.kind.toLowerCase()} enum value without a SEA declaration`,
    cardinality: "not applicable (not declared in SEA)",
    provenance: "none (no Graph declaration)",
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
    for (const inst of graph.allInstances()) {
      let namespace = inst.namespace ?? "default";
      const resourceRef = resourceByNativeId.get(inst.resourceId);
      const entityRef = entityByNativeId.get(inst.entityId);
      namespace = entityRef?.namespace ?? resourceRef?.namespace ?? namespace;
      const id = `${namespace}::instance(${resourceRef?.id ?? inst.resourceId}|${entityRef?.id ?? inst.entityId})`;
      const fields = { resource: resourceRef?.id ?? null, entity: entityRef?.id ?? null };
      claim(id, inst.id);
      const ref = makeRef(namespace, id, "Instance");
      objects.push({ ref, kind: "Instance", name: id, namespace, fields });
    }

    const addNamed = (kind: SemanticKind, value: { readonly id: string; readonly name: string; readonly namespace: string | null }, fields: SemanticObject["fields"]): void => {
      const namespace = value.namespace ?? "default";
      const id = `${namespace}::${value.name}`;
      claim(id, value.id);
      const ref = makeRef(namespace, id, kind);
      objects.push({ ref, kind, name: value.name, namespace, fields });
    };

    for (const policy of graph.allPolicies()) {
      addNamed("Policy", policy, {
        expression: policy.expression,
        modality: policy.modality,
        policyKind: policy.kind,
        priority: policy.priority,
        rationale: policy.rationale,
        tags: [...policy.tags],
      });
    }
    for (const metric of graph.allMetrics()) addNamed("Metric", metric, { expression: metric.expression, unit: metric.unit });
    for (const dimension of graph.allDimensions()) addNamed("Dimension", dimension, {});
    for (const unit of graph.allUnits()) addNamed("Unit", unit, { dimension: unit.dimension, baseFactor: unit.baseFactor, baseUnit: unit.baseUnit });
    for (const mapping of graph.allMappings()) {
      addNamed("Mapping", mapping, { target: mapping.targetFormat, source: JSON.parse(mapping.rulesJson) as SemanticValue });
    }
    for (const projection of graph.allProjections()) {
      addNamed("Projection", projection, { target: projection.targetFormat, source: JSON.parse(projection.overridesJson) as SemanticValue });
    }
    for (const pattern of graph.allPatterns()) addNamed("Pattern", pattern, { regex: pattern.regex });
    for (const change of graph.allConceptChanges()) {
      addNamed("ConceptChange", change, {
        fromVersion: change.fromVersion,
        toVersion: change.toVersion,
        migrationPolicy: change.migrationPolicy,
        breakingChange: change.breakingChange,
      });
    }
    for (const instance of graph.allEntityInstances()) {
      addNamed("EntityInstance", instance, { entityType: instance.entityType, fields: JSON.parse(instance.fieldsJson) as SemanticValue });
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
    if (object.kind === "Policy") throw new Error(`domainforge: Policy "${binding.semanticId}" is a referenced constraint and cannot be bound as a capability`);
    return { ...binding.capability, semanticRef: object.ref };
  });
}
