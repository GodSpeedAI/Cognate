import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Json } from "@cognate/events";
import type { DeliveryReceipt, Observation, ObservationPort } from "./types.ts";

export interface SxrCliOptions {
  /** Path to the pinned `sxr` binary (DEBT-010). */
  readonly bin: string;
  /** Working directory holding the enrolled repository and SXR state. */
  readonly repoDir: string;
  /** Extra environment (e.g. SXR home) for isolation. */
  readonly env?: Record<string, string>;
}

/** Identifiers produced by the SXR prerequisite workflow (enroll → question → threshold → run). */
export interface SxrWorkflow {
  readonly repoId: string;
  readonly questionId: string;
  readonly thresholdId: string;
  readonly runId: string;
  readonly target: string;
}

/** The `--target` used for the declared question, threshold's plans, and every per-observation `plan create`. */
const TARGET = "concept:runtime_execution";

interface SxrResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly json: any;
}

async function runSxr(bin: string, env: Record<string, string | undefined>, cwd: string, args: string[], stdin?: string): Promise<SxrResult> {
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    env,
    stdin: stdin === undefined ? undefined : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined && proc.stdin && typeof proc.stdin !== "number") {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  let json: any = undefined;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Not every command emits parseable JSON on failure; callers check stderr too.
  }
  return { exitCode, stdout, stderr, json };
}

function requireOk(result: SxrResult, description: string): any {
  if (result.exitCode !== 0) {
    throw new Error(`realitytrace: sxr ${description} failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
  }
  return result.json;
}

/**
 * ObservationPort over the documented SXR CLI. `prepare()` completes the prerequisite workflow; `record()` creates a
 * plan with verifier `cognate.<observationId>` and ingests the observation JSON on stdin. SXR deduplicates by
 * (run, verifier), so retries of one observation reconcile as `duplicate` with the same ledger position. Cognate's
 * correlation ids travel as the record's CEP `extensions.cognate` (`ingest --extensions`, RealityTrace ≥ 0.3.0) and
 * are read back from the committed record with `readCorrelation(targetRef)`. SXR keeps the first committed record, so a
 * duplicate delivery never rewrites them.
 */
export function createSxrCliPort(
  options: SxrCliOptions,
): ObservationPort & { prepare(question: { readonly title: string }): Promise<SxrWorkflow>; readCorrelation(targetRef: string): Promise<Json | null> } {
  const env: Record<string, string | undefined> = { ...process.env, ...options.env };
  let workflow: SxrWorkflow | undefined;

  const sxr = (args: string[], stdin?: string) => runSxr(options.bin, env, options.repoDir, args, stdin);

  return {
    id: "sxr-cli",

    async prepare(question) {
      mkdirSync(options.repoDir, { recursive: true });
      Bun.spawnSync(["git", "init", "-q"], { cwd: options.repoDir, env });
      Bun.spawnSync(["git", "-c", "user.email=realitytrace@cognate.local", "-c", "user.name=realitytrace", "commit", "--allow-empty", "-qm", "realitytrace enrollment"], { cwd: options.repoDir, env });

      const enroll = requireOk(await sxr(["repo", "enroll", options.repoDir, "--json"]), "repo enroll");
      const repoId: string = enroll.repo_id;

      const scratch = mkdtempSync(join(tmpdir(), "cognate-sxr-prereq-"));
      try {
        const questionFile = join(scratch, "question.json");
        writeFileSync(questionFile, JSON.stringify({ question_form: "is_true", question_type: "declared_semantics", target_entities: TARGET, title: question.title }));
        const declaredQuestion = requireOk(await sxr(["question", "declare", "--repo", repoId, "--file", questionFile, "--json"]), "question declare");
        const questionId: string = declaredQuestion.question_id;

        const thresholdFile = join(scratch, "threshold.json");
        writeFileSync(thresholdFile, JSON.stringify({ threshold_id: "cognate-threshold", kind: "AllEvidenceSupports", minimum_reliability: "medium" }));
        const declaredThreshold = requireOk(await sxr(["threshold", "declare", "--repo", repoId, "--question", questionId, "--file", thresholdFile, "--json"]), "threshold declare");
        const thresholdId: string = declaredThreshold.threshold_id;

        const run = requireOk(await sxr(["run", "begin", "--repo", repoId, "--snapshot", "snapshot:genesis", "--question", questionId, "--threshold", thresholdId, "--json"]), "run begin");
        const runId: string = run.run_id;

        workflow = { repoId, questionId, thresholdId, runId, target: TARGET };
        return workflow;
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },

    async record(observation: Observation): Promise<DeliveryReceipt> {
      if (!workflow) throw new Error("realitytrace: sxr-cli port used before prepare()");
      const verifier = `cognate.${observation.observationId}`;

      const plan = await sxr(["plan", "create", "--run", workflow.runId, "--verifier", verifier, "--target", workflow.target, "--json"]);
      if (plan.exitCode !== 0 && !/already exists/i.test(plan.stderr)) {
        throw new Error(`realitytrace: sxr plan create failed (exit ${plan.exitCode}): ${plan.stderr || plan.stdout}`);
      }

      const extensions = JSON.stringify({ cognate: correlationOf(observation) });
      const ingest = await sxr(["ingest", "--run", workflow.runId, "--verifier", verifier, "--stdin-format", "json", "--extensions", extensions, "--json"], JSON.stringify(observation));
      if (ingest.exitCode !== 0) {
        throw new Error(`realitytrace: sxr ingest failed (exit ${ingest.exitCode}): ${ingest.stderr || ingest.stdout}`);
      }

      const receipt = ingest.json;
      const targetRef = `${receipt.ledger_position.ledger_id}:${receipt.ledger_position.append_ordinal}`;
      const status: "accepted" | "duplicate" = receipt.already_committed ? "duplicate" : "accepted";
      return { status, observationId: observation.observationId, targetRef, detail: receipt as Json };
    },

    async readCorrelation(targetRef) {
      if (!workflow) throw new Error("realitytrace: sxr-cli port used before prepare()");
      const split = targetRef.lastIndexOf(":");
      const ledgerId = targetRef.slice(0, split);
      const ordinal = Number(targetRef.slice(split + 1));
      const rows = requireOk(await sxr(["ledger", "export", "--repo", workflow.repoId]), "ledger export") as { ledger_id: string; append_ordinal: number; payload: { extensions?: { cognate?: Json } } }[];
      const row = rows.find((r) => r.ledger_id === ledgerId && r.append_ordinal === ordinal);
      return row?.payload.extensions?.cognate ?? null;
    },
  };
}

/** Cognate's correlation fields for `extensions.cognate`; undefined optional fields are omitted. */
function correlationOf(observation: Observation): Json {
  const { observationId, eventId, tenant, correlationId, causationId, runId, scopeId, componentId, fiberId, capabilityId, continuationId, semanticRef } = observation;
  return JSON.parse(JSON.stringify({ observationId, eventId, tenant, correlationId, causationId, runId, scopeId, componentId, fiberId, capabilityId, continuationId, semanticRef })) as Json;
}
