import { createHash } from "node:crypto";
import type { Json } from "./types.ts";

function canonical(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key] as Json)}`).join(",")}}`;
}

/** Stable request fingerprint for idempotency (key order independent). */
export function fingerprint(value: Json): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}
