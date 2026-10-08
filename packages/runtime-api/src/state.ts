// Shared run state (spec §29.1): the single definition of how `state.changed` events fold into a run's state.
// Agents write with `ctx.emit("state.changed", …)`; callers write with `RuntimeService.updateState`. Both append a
// `state.changed` event carrying `{ snapshot }` or `{ patch }` (RFC 6902); the state is the fold of those events in
// store position order.
import type { Json, StoredEvent } from "@godspeedai/events";

export type JsonPatchOp =
  | { readonly op: "add"; readonly path: string; readonly value: Json }
  | { readonly op: "remove"; readonly path: string }
  | { readonly op: "replace"; readonly path: string; readonly value: Json }
  | { readonly op: "move"; readonly from: string; readonly path: string }
  | { readonly op: "copy"; readonly from: string; readonly path: string }
  | { readonly op: "test"; readonly path: string; readonly value: Json };

/** A caller's state write: replace the whole state, or apply an RFC 6902 patch to it. */
export type StateUpdate = { readonly snapshot: Json } | { readonly patch: readonly JsonPatchOp[] };

/** An RFC 6902 operation that cannot apply to the document (missing target, bad pointer, failed `test`). */
export class StatePatchError extends Error {
  override readonly name = "StatePatchError";
}

type JsonObject = { [key: string]: Json };

function isObject(value: Json | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new StatePatchError(`invalid JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function arrayIndex(array: readonly Json[], segment: string, allowEnd: boolean, pointer: string): number {
  if (segment === "-" && allowEnd) return array.length;
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new StatePatchError(`invalid array index "${segment}" in ${pointer}`);
  const index = Number(segment);
  if (index > array.length || (!allowEnd && index === array.length)) throw new StatePatchError(`array index ${index} out of bounds in ${pointer}`);
  return index;
}

function get(doc: Json, pointer: string): Json {
  let cursor: Json = doc;
  for (const segment of parsePointer(pointer)) {
    if (Array.isArray(cursor)) cursor = cursor[arrayIndex(cursor, segment, false, pointer)]!;
    else if (isObject(cursor) && Object.hasOwn(cursor, segment)) cursor = cursor[segment]!;
    else throw new StatePatchError(`path ${pointer} does not exist`);
  }
  return cursor;
}

/** Returns a new document with `pointer` added, replaced, or removed; the input is never mutated. */
function put(doc: Json, pointer: string, mode: "add" | "replace" | "remove", value: Json = null): Json {
  const path = parsePointer(pointer);
  if (path.length === 0) {
    if (mode === "remove") throw new StatePatchError("cannot remove the document root");
    return structuredClone(value);
  }
  const root = structuredClone(doc);
  let parent: Json = root;
  for (const segment of path.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[arrayIndex(parent, segment, false, pointer)]!;
    else if (isObject(parent) && Object.hasOwn(parent, segment)) parent = parent[segment]!;
    else throw new StatePatchError(`path ${pointer} does not exist`);
  }
  const last = path.at(-1)!;
  if (Array.isArray(parent)) {
    const index = arrayIndex(parent, last, mode === "add", pointer);
    if (mode === "add") parent.splice(index, 0, structuredClone(value));
    else if (mode === "replace") parent[index] = structuredClone(value);
    else parent.splice(index, 1);
  } else if (isObject(parent)) {
    if (mode !== "add" && !Object.hasOwn(parent, last)) throw new StatePatchError(`path ${pointer} does not exist`);
    if (mode === "remove") delete parent[last];
    else parent[last] = structuredClone(value);
  } else {
    throw new StatePatchError(`path ${pointer} does not exist`);
  }
  return root;
}

function equal(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]!));
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && equal(a[k]!, b[k]!));
  }
  return false;
}

/** Applies an RFC 6902 patch atomically: throws `StatePatchError` and leaves `doc` untouched if any operation fails. */
export function applyJsonPatch(doc: Json, ops: readonly JsonPatchOp[]): Json {
  let result = doc;
  for (const op of ops) {
    switch (op.op) {
      case "add":
      case "replace":
        result = put(result, op.path, op.op, op.value);
        break;
      case "remove":
        result = put(result, op.path, "remove");
        break;
      case "move": {
        if (op.path.startsWith(`${op.from}/`)) throw new StatePatchError(`cannot move ${op.from} into its own child ${op.path}`);
        const value = get(result, op.from);
        result = put(put(result, op.from, "remove"), op.path, "add", value);
        break;
      }
      case "copy":
        result = put(result, op.path, "add", get(result, op.from));
        break;
      case "test":
        if (!equal(get(result, op.path), op.value)) throw new StatePatchError(`test failed at ${op.path}`);
        break;
      default:
        throw new StatePatchError(`unsupported JSON Patch op ${JSON.stringify(op)}`);
    }
  }
  return result;
}

/** Applies one `state.changed` update. Throws `StatePatchError` when a patch does not apply. */
export function applyStateUpdate(state: Json, update: StateUpdate): Json {
  if ("snapshot" in update) return structuredClone(update.snapshot);
  if (!Array.isArray(update.patch)) throw new StatePatchError("patch must be an array of RFC 6902 operations");
  return applyJsonPatch(state, update.patch);
}

/**
 * Folds `state.changed` events (in store position order) into the run's state, starting from `{}`. A patch that
 * does not apply to the state at that point is skipped rather than aborting the fold, so one bad agent-emitted
 * patch cannot hide later updates; caller writes are validated before commit and never land in that case.
 */
export function foldState(events: Iterable<StoredEvent>): Json {
  const ordered = [...events].filter((e) => e.eventType === "state.changed").sort((a, b) => a.position - b.position);
  let state: Json = {};
  for (const event of ordered) {
    const payload = event.payload as Partial<{ snapshot: Json; patch: JsonPatchOp[] }> | null;
    if (!payload || typeof payload !== "object") continue;
    try {
      if (payload.snapshot !== undefined) state = applyStateUpdate(state, { snapshot: payload.snapshot });
      else if (payload.patch !== undefined) state = applyStateUpdate(state, { patch: payload.patch });
    } catch (error) {
      if (!(error instanceof StatePatchError)) throw error;
    }
  }
  return state;
}
