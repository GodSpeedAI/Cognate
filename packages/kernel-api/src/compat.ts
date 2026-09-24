import type { CapabilityContract, Requirement } from "./types.ts";

function parse(version: string): [number, number, number] {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(version);
  if (!match) throw new TypeError(`Invalid capability version: ${version}`);
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * Deterministic eligibility of a contract for a requirement (spec §8.2): same identity,
 * same major version with minor/patch >= required, and every required attribute equal.
 */
export function isCompatible(requirement: Requirement, contract: CapabilityContract): boolean {
  if (requirement.capability !== contract.id) return false;
  if (requirement.version !== undefined) {
    const [rMajor, rMinor, rPatch] = parse(requirement.version);
    const [cMajor, cMinor, cPatch] = parse(contract.version);
    if (rMajor !== cMajor) return false;
    if (cMinor < rMinor || (cMinor === rMinor && cPatch < rPatch)) return false;
  }
  for (const [key, value] of Object.entries(requirement.attributes ?? {})) {
    if (contract.attributes?.[key] !== value) return false;
  }
  return true;
}
