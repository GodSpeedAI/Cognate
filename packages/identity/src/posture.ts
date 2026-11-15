/**
 * Execution posture: where agent effects may run on a host. `contained` is the default;
 * `uncontained-local` is the explicit operator opt-in. Anything else is a startup error, never a guess.
 * Enforcement (the registry wrapper that refuses effects in local worlds) stays with the application.
 */
export type ExecutionPosture = "contained" | "uncontained-local";

export const EXECUTION_POSTURE_ENV = "COGNATE_EXECUTION_POSTURE";

export function parseExecutionPosture(raw: string | undefined): ExecutionPosture {
  if (raw === undefined || raw === "") return "contained";
  if (raw === "contained" || raw === "uncontained-local") return raw;
  throw new Error(`${EXECUTION_POSTURE_ENV} must be 'contained' (default) or 'uncontained-local'`);
}
