// Phase 0 compatibility fixture: RealityTrace (SXR) Rust CLI + CEP record
// schema, as the target of Cognate's optional observation adapter. Read-only
// characterization against a local checkout — see
// .agents/evidence/phase0-realitytrace.md and API_NOTES.md for the write-up,
// and docs/decisions/ADR-0007-observations-realitytrace.md for the decision.
//
// Spec anchors: software-design-spec-cognate.-frameworkmd §3.3, §20, §31.6,
// §37 Phase 0 / Phase 5.
//
// The RealityTrace source is NEVER modified by this
// fixture.
// Uses the pinned released CLI from `just setup-realitytrace` (.tmp/realitytrace, gitignored). All SXR runtime
// state (XDG_DATA_HOME / XDG_STATE_HOME) lives in per-test temp directories.
//
// This file MUST NOT skip on a missing binary: every test calls
// requireBinary() first, which throws a clear, descriptive error so the run
// shows real failures rather than silently-green skips.

import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Binary discovery — never invented, always the real local build output.
// ---------------------------------------------------------------------------

// Pinned released CLI installed by `just setup-realitytrace` (RealityTrace v0.2.0; DEBT-010).
const DEFAULT_SXR_BIN = join(
  import.meta.dir,
  "..", "..", "..", ".tmp", "realitytrace", "bin", "realitytrace",
);
const SXR_BIN = process.env.SXR_BIN ?? DEFAULT_SXR_BIN;

function requireBinary(): void {
  if (!existsSync(SXR_BIN)) {
    throw new Error(
      `RealityTrace CLI not found at ${SXR_BIN}. Install the pinned release with \`just setup-realitytrace\` ` +
        `or set SXR_BIN to an installed binary. This test intentionally FAILS ` +
        `(not skips) when the binary is unavailable, per the Phase 0 fixture contract.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Process + workspace helpers
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface SxrResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: any;
}

async function runSxr(
  home: string,
  args: string[],
  stdin?: Uint8Array | string,
): Promise<SxrResult> {
  const proc = Bun.spawn([SXR_BIN, ...args], {
    env: {
      ...process.env,
      XDG_DATA_HOME: join(home, "data"),
      XDG_STATE_HOME: join(home, "state"),
    },
    stdin: stdin === undefined ? undefined : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined && proc.stdin && typeof proc.stdin !== "number") {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  let json: any = undefined;
  try {
    json = JSON.parse(stdout);
  } catch {
    // not every command emits parseable JSON on failure; callers check stderr too
  }
  return { exitCode, stdout, stderr, json };
}

function freshHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "cognate-sxr-home-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "data"), { recursive: true });
  mkdirSync(join(dir, "state"), { recursive: true });
  return dir;
}

/** Creates a minimal enrollable git repo with one passing test, mirroring
 * the sxr quickstart tutorial (docs/tutorials/quickstart.md Step 2). */
function makeToyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "cognate-sxr-repo-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "Cargo.toml"),
    `[package]\nname = "toy-project"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\npath = "src/lib.rs"\n`,
  );
  writeFileSync(
    join(dir, "src", "lib.rs"),
    `pub fn add(a: i32, b: i32) -> i32 { a + b }\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn it_adds() {\n        assert_eq!(add(2, 2), 4);\n    }\n}\n`,
  );
  Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
  Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
  Bun.spawnSync(
    ["git", "-c", "user.email=dev@example.com", "-c", "user.name=Developer", "commit", "-qm", "Initial commit"],
    { cwd: dir },
  );
  return dir;
}

/** Runs the documented sxr prerequisite workflow (repo enroll -> question
 * declare -> threshold declare -> run begin -> plan create) exactly as shown
 * in docs/tutorials/quickstart.md and docs/reference/cli.md. Returns every
 * minted id so callers can submit/inspect observations. */
async function bootstrapRun(home: string, repoPath: string) {
  const enroll = await runSxr(home, ["repo", "enroll", repoPath, "--json"]);
  expect(enroll.exitCode).toBe(0);
  const repoId: string = enroll.json.repo_id;
  expect(typeof repoId).toBe("string");

  const questionFile = join(home, "question.json");
  writeFileSync(
    questionFile,
    JSON.stringify({
      question_form: "is_true",
      question_type: "declared_semantics",
      target_entities: "concept:addition_logic",
    }),
  );
  const question = await runSxr(home, ["question", "declare", "--repo", repoId, "--file", questionFile, "--json"]);
  expect(question.exitCode).toBe(0);
  const questionId: string = question.json.question_id;

  const thresholdFile = join(home, "threshold.json");
  writeFileSync(
    thresholdFile,
    JSON.stringify({ threshold_id: "t1", kind: "AllEvidenceSupports", minimum_reliability: "medium" }),
  );
  const threshold = await runSxr(
    home,
    ["threshold", "declare", "--repo", repoId, "--question", questionId, "--file", thresholdFile, "--json"],
  );
  expect(threshold.exitCode).toBe(0);
  const thresholdId: string = threshold.json.threshold_id;

  const run = await runSxr(
    home,
    ["run", "begin", "--repo", repoId, "--snapshot", "snapshot:genesis", "--question", questionId, "--threshold", thresholdId, "--json"],
  );
  expect(run.exitCode).toBe(0);
  const runId: string = run.json.run_id;

  const plan = await runSxr(
    home,
    ["plan", "create", "--run", runId, "--verifier", "cargo-test", "--target", "concept:addition_logic", "--json"],
  );
  expect(plan.exitCode).toBe(0);

  return { repoId, questionId, thresholdId, runId, planId: plan.json.plan_id as string };
}

// ---------------------------------------------------------------------------
// Minimal closed-schema checker for the shipped CEP Semantic Envelope schema.
// Not a general JSON Schema engine: it implements only the subset this
// schema actually uses at the levels we probe (required / properties /
// additionalProperties / array-of-object items), read live from the sxr
// checkout's own schema file every run (never hand-copied).
// ---------------------------------------------------------------------------

function loadCepSchema(): any {
  // Vendored from realitytrace-v0.2.0 (fixtures/PROVENANCE.md) so no local checkout is needed.
  const path = join(import.meta.dir, "fixtures", "cep-semantic-envelope.schema.json");
  if (!existsSync(path)) {
    throw new Error(`CEP schema not found at ${path}; the sxr checkout may have moved or been reorganized.`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Checks one level: required keys present, and (if additionalProperties is
 * false) every key present in `schema.properties`. Recurses into
 * array-of-object properties one level (covers `representations`,
 * `observations`, etc.). Returns a list of violation strings (empty = ok). */
function checkClosedShape(schema: any, instance: any, path = "$"): string[] {
  const violations: string[] = [];
  if (typeof instance !== "object" || instance === null || Array.isArray(instance)) return violations;
  const props: Record<string, any> = schema.properties ?? {};
  for (const req of schema.required ?? []) {
    if (!(req in instance)) violations.push(`${path}: missing required "${req}"`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(instance)) {
      if (!(key in props)) violations.push(`${path}: unknown property "${key}" (closed schema)`);
    }
  }
  for (const [key, subSchema] of Object.entries(props)) {
    if (!(key in instance)) continue;
    const val = (instance as any)[key];
    const s = subSchema as any;
    if (s?.type === "array" && s.items?.type === "object" && Array.isArray(val)) {
      val.forEach((item: any, i: number) => {
        violations.push(...checkClosedShape(s.items, item, `${path}.${key}[${i}]`));
      });
    } else if (s?.type === "object" && s.properties) {
      violations.push(...checkClosedShape(s, val, `${path}.${key}`));
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Behaviour 1: prerequisites workflow completes in a temp repo
// ---------------------------------------------------------------------------

describe("prerequisites workflow", () => {
  test("enroll -> question declare -> threshold declare -> run begin -> plan create all commit", async () => {
    requireBinary();
    const home = freshHome();
    const repo = makeToyRepo();
    const { repoId, questionId, thresholdId, runId, planId } = await bootstrapRun(home, repo);
    expect(repoId).toMatch(/^[0-9A-Z]{26}$/); // ULID
    expect(questionId.length).toBeGreaterThan(0);
    expect(thresholdId).toBe("t1");
    expect(runId.length).toBeGreaterThan(0);
    expect(typeof planId).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Behaviour 2: a schema-valid CEP observation carrying Cognate correlation
// ids, ONLY in documented extension/reference fields, is accepted with a
// receipt.
//
// IMPORTANT, characterized finding: the real `sxr ingest` CLI (the only
// documented entry point that produces an `observation.recorded` record from
// externally-supplied bytes) does NOT expose a flag to attach caller-supplied
// correlation data to the envelope. It mints the entire envelope itself from
// --run/--verifier/stdin bytes (sxr-cli/src/commands.rs build_ingest_envelope).
// So this behaviour is proven in two parts:
//   (a) against the REAL binary: `sxr ingest` accepts an arbitrary verifier
//       stream and returns a receipt (ledger position + observation_id) for
//       an `observation.recorded` record — the actual, exercisable path.
//   (b) against the REAL schema file: a hand-built envelope shaped exactly
//       like the one `sxr ingest` builds, but with a Cognate correlation
//       payload added under the documented `extensions` object (CEP-0008
//       §39) and under `representations[].inline_content` (open per the
//       schema, `inline_content: {}`), validates as schema-valid.
// The gap between (a) and (b) — no CLI flag bridges them — is the Phase 0
// finding recorded in the ADR and API_NOTES.
// ---------------------------------------------------------------------------

describe("observation ingestion + correlation-id schema validity", () => {
  test("sxr ingest accepts a verifier stream and returns a receipt for observation.recorded", async () => {
    requireBinary();
    const home = freshHome();
    const repo = makeToyRepo();
    const { runId } = await bootstrapRun(home, repo);

    const stream = new TextEncoder().encode("test result: ok. 1 passed; 0 failed; 0 ignored\n");
    const ingest = await runSxr(home, ["ingest", "--run", runId, "--verifier", "cargo-test", "--stdin-format", "text", "--json"], stream);

    expect(ingest.exitCode).toBe(0);
    expect(ingest.json.durability).toBe("committed");
    expect(typeof ingest.json.observation_id).toBe("string");
    expect(typeof ingest.json.idempotency_key).toBe("string");
    expect(ingest.json.ledger_position).toBeTruthy();
    expect(ingest.json.already_committed).toBe(false);
  });

  test("observed: sxr ingest has no flag to attach caller-supplied correlation data to the envelope", async () => {
    requireBinary();
    const home = freshHome();
    // `--help` is the documented way to discover the real flag surface; we
    // assert against it rather than assuming, per "discover before inventing".
    const help = await runSxr(home, ["ingest", "--help"]);
    expect(help.exitCode).toBe(0);
    for (const flag of ["--correlation", "--extension", "--reference", "--metadata", "--extra"]) {
      expect(help.stdout).not.toContain(flag);
    }
    // Only these flags are documented (docs/reference/cli.md + main.rs IngestCmd).
    for (const flag of ["--run", "--verifier", "--stdin-format", "--spool", "--async-mode"]) {
      expect(help.stdout).toContain(flag);
    }
  });

  test("a hand-built observation.recorded envelope with Cognate correlation ids in extensions/inline_content is schema-valid", () => {
    const schema = loadCepSchema();
    const observationId = "01J7COGNATEOBSERVATION0001";
    const runId = "01J7COGNATERUN00000000001";
    const envelope = {
      envelope_id: "01J7ENVELOPE000000000001",
      cep_version: "cep-0008",
      envelope_version: "1",
      envelope_kind: "execution_trace",
      created_at: "2026-09-24T00:00:00Z",
      created_by: "sxr-cli/0.1.0",
      scope: { repo_id: "repo:1", checkout_id: "checkout:1", run_id: runId },
      boundary_record: {
        scope: "run",
        included_sections: ["observations", "representations"],
        excluded_sections: [],
        known_omissions: [],
        unknowns: [],
        limitations: ["sxr slice-1 runtime record"],
      },
      completeness_status: "complete_for_declared_state",
      provenance_refs: ["ledger:gen:1"],
      omission_status: "none_known",
      lineage_refs: [],
      validation_status: "valid",
      observations: [{ observation_id: observationId, scope: `run:${runId}` }],
      representations: [
        {
          representation_id: `rep:obs:${observationId}`,
          representation_kind: "atomic",
          representation_type: "verifier_stdout",
          content_hash: "sha256:" + "0".repeat(64),
          // Documented open extension point: CEP-0008 §14.2, `inline_content: {}`.
          inline_content: {
            exit_code: 0,
            crashed: false,
            stderr_ref: null,
            parsed: { test_count: 1, passed: 1, failed: 0, ignored: 0 },
            // Cognate correlation ids, carried ONLY here — not as new root keys.
            cognate: {
              event_id: "evt-123",
              run_id: "cognate-run-456",
              correlation_id: "corr-789",
            },
          },
        },
      ],
      // Documented open extension point: CEP-0008 §39.
      extensions: {
        cognate: { event_id: "evt-123", correlation_id: "corr-789" },
      },
    };

    const violations = checkClosedShape(schema, envelope);
    expect(violations).toEqual([]);
    for (const required of schema.required) {
      expect(envelope).toHaveProperty(required);
    }
  });
});

// ---------------------------------------------------------------------------
// Behaviour 3: a record with an unknown root property is rejected (closed
// schema) — characterized against the real schema file (the CLI itself
// exposes no raw-envelope submission surface to round-trip through).
// ---------------------------------------------------------------------------

describe("closed schema rejects unknown root properties", () => {
  test("adding an unknown top-level field violates additionalProperties:false at the schema root", () => {
    const schema = loadCepSchema();
    expect(schema.additionalProperties).toBe(false);

    const minimal = {
      envelope_id: "01J7ENVELOPE000000000002",
      cep_version: "cep-0008",
      envelope_version: "1",
      envelope_kind: "execution_trace",
      created_at: "2026-09-24T00:00:00Z",
      created_by: "sxr-cli/0.1.0",
      scope: { repo_id: "repo:1", checkout_id: "checkout:1" },
      boundary_record: { scope: "run" },
      completeness_status: "complete_for_declared_state",
      provenance_refs: ["ledger:gen:1"],
      omission_status: "none_known",
      lineage_refs: [],
      validation_status: "valid",
      observations: [{ observation_id: "01J7OBS0000000000000000001" }],
    };
    expect(checkClosedShape(schema, minimal)).toEqual([]);

    const withUnknownRoot = { ...minimal, cognate_correlation_id: "should-not-be-here" };
    const violations = checkClosedShape(schema, withUnknownRoot);
    expect(violations).toEqual([`$: unknown property "cognate_correlation_id" (closed schema)`]);
  });

  test("observed: unknown properties inside a closed observation record item are also rejected", () => {
    const schema = loadCepSchema();
    const observationsSchema = schema.properties.observations;
    expect(observationsSchema.items.additionalProperties).toBe(false);
    const violations = checkClosedShape(observationsSchema.items, {
      observation_id: "01J7OBS0000000000000000002",
      cognate_extra_field: "not documented",
    });
    expect(violations).toEqual([`$: unknown property "cognate_extra_field" (closed schema)`]);
  });
});

// ---------------------------------------------------------------------------
// Behaviour 4: duplicate delivery of the same observation is detected and
// reconciled by sxr's own idempotency key (sha256(run_id + verifier +
// "+ingest+1")) — NOT by any caller-supplied observation id.
// ---------------------------------------------------------------------------

describe("duplicate delivery reconciliation", () => {
  test("re-ingesting the same run+verifier stream is a ledger no-op: same idempotency key, same ledger position, already_committed flips to true", async () => {
    requireBinary();
    const home = freshHome();
    const repo = makeToyRepo();
    const { runId } = await bootstrapRun(home, repo);
    const stream = new TextEncoder().encode("test result: ok. 1 passed; 0 failed; 0 ignored\n");

    const first = await runSxr(home, ["ingest", "--run", runId, "--verifier", "cargo-test", "--stdin-format", "text", "--json"], stream);
    expect(first.exitCode).toBe(0);
    expect(first.json.already_committed).toBe(false);

    const second = await runSxr(home, ["ingest", "--run", runId, "--verifier", "cargo-test", "--stdin-format", "text", "--json"], stream);
    expect(second.exitCode).toBe(0);
    expect(second.json.idempotency_key).toBe(first.json.idempotency_key);
    expect(second.json.already_committed).toBe(true);
    // Same ledger row is reused for the duplicate — no new append_ordinal.
    expect(second.json.ledger_position).toEqual(first.json.ledger_position);
  });

  test("observed: the observation_id reported on a duplicate call does not match the originally committed observation_id", async () => {
    requireBinary();
    const home = freshHome();
    const repo = makeToyRepo();
    const { runId } = await bootstrapRun(home, repo);
    const stream = new TextEncoder().encode("test result: ok. 1 passed; 0 failed; 0 ignored\n");

    const first = await runSxr(home, ["ingest", "--run", runId, "--verifier", "cargo-test", "--stdin-format", "text", "--json"], stream);
    const second = await runSxr(home, ["ingest", "--run", runId, "--verifier", "cargo-test", "--stdin-format", "text", "--json"], stream);

    // sxr mints a fresh ULID for `observation_id` on every call to
    // build_ingest_envelope, before checking the idempotency key. The ledger
    // append is a correctly-deduplicated no-op (see previous test), but the
    // CLI's own JSON response on the duplicate call reports the freshly
    // minted (and never-committed) id, not the id of the row actually on
    // the ledger. A caller that only reads `observation_id` from the
    // response — without also checking `already_committed` — would believe
    // a second, distinct observation was recorded.
    expect(second.json.observation_id).not.toBe(first.json.observation_id);
    expect(second.json.already_committed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Behaviour 5: the receipt does not imply evidence or settlement — those are
// separate, later commands that require the declared question/threshold and
// use sxr's own rules.
// ---------------------------------------------------------------------------

describe("receipt vs evidence vs settlement are distinct operations", () => {
  test("an ingest receipt carries no evidence or settlement fields; evidence/settlement require separate commands", async () => {
    requireBinary();
    const home = freshHome();
    const repo = makeToyRepo();
    const { runId, questionId, thresholdId } = await bootstrapRun(home, repo);
    const stream = new TextEncoder().encode("test result: ok. 1 passed; 0 failed; 0 ignored\n");

    const ingest = await runSxr(home, ["ingest", "--run", runId, "--verifier", "cargo-test", "--stdin-format", "text", "--json"], stream);
    expect(ingest.exitCode).toBe(0);
    const observationId: string = ingest.json.observation_id;

    // The receipt itself carries no evidence/settlement vocabulary.
    for (const forbidden of ["direction", "relevance", "reliability", "settlement_id", "settlement_status"]) {
      expect(ingest.json).not.toHaveProperty(forbidden);
    }

    // Evidence derivation is a separate, explicit command against the
    // committed observation.
    const evidence = await runSxr(
      home,
      ["evidence", "create", "--run", runId, "--observation", observationId, "--derive", "--json"],
    );
    expect(evidence.exitCode).toBe(0);
    expect(typeof evidence.json.evidence_id).toBe("string");
    // observed: docs/reference/cli.md documents the output shape as
    // `{ evidence_id, direction: "supports" | "contradicts" }`, but the
    // built binary's actual response has NO top-level `direction` field —
    // the derived direction only appears nested inside `derivations[]`
    // (the `confidence_impact` entry's `inputs.direction`). Documented here
    // as observed doc drift, not asserted as a stable contract.
    expect(evidence.json).not.toHaveProperty("direction");
    const confidenceImpact = evidence.json.derivations.find((d: any) => d.field === "confidence_impact");
    expect(["supports", "contradicts", "unknown"]).toContain(confidenceImpact.inputs.direction);

    // Settlement is a further, separate, explicit command against the
    // declared question/threshold — never inferred from the observation or
    // evidence receipts alone.
    const finish = await runSxr(home, ["run", "finish", "--run", runId, "--json"]);
    expect(finish.exitCode).toBe(0);

    const settlement = await runSxr(
      home,
      [
        "settlement", "register",
        "--run", runId,
        "--question", questionId,
        "--threshold", thresholdId,
        "--transformation", `tx:${runId}`,
        "--json",
      ],
    );
    // Characterize whichever outcome the real binary produces (accepted or
    // precondition-rejected) rather than assuming; either way it MUST be a
    // command distinct from ingest/evidence, proving settlement is not
    // implied by the observation receipt.
    expect([0, 3]).toContain(settlement.exitCode);
    if (settlement.exitCode === 0) {
      expect(typeof settlement.json.settlement_id ?? settlement.json.status).not.toBe("undefined");
    }
  });
});
