import { EnvelopeValidationError } from "./errors.ts";
import type { Json, NewEvent } from "./types.ts";

export const MAX_PAYLOAD_BYTES = 1_048_576;
const EVENT_TYPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function isJson(value: unknown, depth = 0): value is Json {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJson(item, depth + 1));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value as object).every((item) => item !== undefined && isJson(item, depth + 1));
  }
  return false;
}

const text = (value: unknown) => typeof value === "string" && value.length > 0;

/** Reject envelopes missing spec §10 fields or carrying non-JSON payloads. Stores call this inside `commit`. */
export function validateNewEvent(event: NewEvent): void {
  const issues: string[] = [];
  if (!text(event.eventType) || !EVENT_TYPE.test(event.eventType)) issues.push("eventType must be lower-case dotted text");
  if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) issues.push("schemaVersion must be a positive integer");
  if (!text(event.occurredAt) || Number.isNaN(Date.parse(event.occurredAt))) issues.push("occurredAt must be an ISO-8601 time");
  for (const field of ["tenant", "correlationId", "scopeId"] as const) if (!text(event[field])) issues.push(`${field} is required`);
  for (const field of ["causationId", "runId"] as const) if (!(event[field] === null || text(event[field]))) issues.push(`${field} must be text or null`);
  if (event.eventId !== undefined && !text(event.eventId)) issues.push("eventId must be text when given");
  if (!isJson(event.payload)) issues.push("payload must be JSON");
  else if (new TextEncoder().encode(JSON.stringify(event.payload)).byteLength > MAX_PAYLOAD_BYTES) issues.push(`payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  if (event.metadata !== undefined && !isJson(event.metadata)) issues.push("metadata must be JSON");
  if (event.semanticRef !== undefined) {
    const ref = event.semanticRef;
    if (!text(ref.namespace) || !text(ref.id) || !text(ref.source?.uri) || !text(ref.source?.digest) || !text(ref.projectionVersion)) issues.push("semanticRef must carry namespace, id, source uri/digest, and projectionVersion");
  }
  if (issues.length) throw new EnvelopeValidationError(issues);
}
