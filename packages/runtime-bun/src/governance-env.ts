// Governance configuration from the environment. Opt-in and explicit: nothing set means `off`, and a
// partially or wrongly set environment is an error, never a silent fallback to a weaker mode.
import { isWorldRef, type GovernanceOptions, timeoutSecsEnforcer } from "./governed-operation.ts";
import { SeaForgeAuthority } from "./sea-forge-authority.ts";

export const ENV_MODE = "COGNATE_GOVERNANCE";
export const ENV_SOCKET = "COGNATE_SEA_FORGE_SOCKET";
export const ENV_WORLD = "COGNATE_WORLD_REF";
export const ENV_ACTOR = "COGNATE_SEA_FORGE_ACTOR";

/**
 * `COGNATE_GOVERNANCE=sea-forge` needs `COGNATE_SEA_FORGE_SOCKET` and `COGNATE_WORLD_REF`
 * (`COGNATE_SEA_FORGE_ACTOR` optionally names the service identity, default `cognate-service`).
 * `off` or unset gives `{ mode: "off" }`. Anything else throws.
 */
export function governanceFromEnv(env: Readonly<Record<string, string | undefined>>): GovernanceOptions {
  const mode = env[ENV_MODE]?.trim();
  if (mode === undefined || mode === "" || mode === "off") {
    const stray = [ENV_SOCKET, ENV_WORLD, ENV_ACTOR].filter((name) => env[name] !== undefined && env[name] !== "");
    if (stray.length) throw new Error(`${stray.join(", ")} set but ${ENV_MODE} is not 'sea-forge'; refusing to guess`);
    return { mode: "off" };
  }
  if (mode !== "sea-forge") throw new Error(`${ENV_MODE} must be 'sea-forge' or 'off', got '${mode}'`);
  const socketPath = env[ENV_SOCKET]?.trim();
  if (!socketPath) throw new Error(`${ENV_SOCKET} is required when ${ENV_MODE}=sea-forge`);
  const worldRef = env[ENV_WORLD]?.trim();
  if (!isWorldRef(worldRef)) throw new Error(`${ENV_WORLD} must be world:<name>@sha256:<64 hex>`);
  const actorId = env[ENV_ACTOR]?.trim();
  return {
    mode: "sea-forge",
    worldRef,
    authority: new SeaForgeAuthority({ socketPath, ...(actorId ? { actor: { actor_id: actorId, role: "service" } } : {}) }),
    enforcers: { timeout_secs: timeoutSecsEnforcer },
  };
}
