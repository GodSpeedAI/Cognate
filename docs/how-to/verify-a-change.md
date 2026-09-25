# How to: verify a change

The repository treats proof as part of the change, not as a follow-up. This is the loop.

**Goal.** Know what to run, in what order, and what a pass does and does not mean.

**Prerequisites.** A checkout with `bun install` run.

## 1. The baseline

```bash
just verify
```

Four things, in order:

1. `bun run check` — the substrate check: the ledger is a version-2 candidate, the spec digest
   matches every requirement's `source`, every `implemented` requirement has an existing evidence
   file and existing proof paths, every `blocked` one has a DEBT entry, and
   `CURRENT_STATUS.yaml`/`CURRENT_STATUS.md` agree on the latest revision.
2. `bun run typecheck` — `tsc -p tsconfig.json` across packages, profiles, tests, and scripts.
3. `bun test ./tests/proof-routing.test.ts` — the gate-runner's own tests.
4. `bun scripts/gate.ts --implemented` — every requirement claimed `implemented`, each by its own
   recorded gate command.

A pass means: the substrate checked in so far proves what the ledger claims **on this machine,
under Bun 1.4.0**. It does not mean the application builds for deployment, and it does not mean
the open debt is closed.

## 2. The narrow gate first

While developing, run only what you touched:

```bash
just gate CG-KRN-001          # one requirement's proof command, verbatim from the ledger
just gates                    # every gate, with PASS/FAIL and status drift
```

`just gates` prints a `<-- status drift` marker when a gate passes but the requirement is still
`candidate`, or fails while marked `implemented`. Drift in either direction is a signal to update
the ledger or the code, not to ignore the line.

Whole-ledger runs take an exclusive lock on `.tmp/gates.lock`; a second concurrent run exits 3
rather than producing spurious failures from shared SQLite files, temp dirs, and ports.

## 3. The suites

| Suite | Command | What it proves |
|---|---|---|
| everything | `bun run test` | the whole workspace, including RED contracts for unimplemented requirements |
| one package | `bun test ./packages/kernel-api` | that package |
| properties | `bun run test:properties` | reversibility, dependency closure, scope isolation, disposal idempotence, replay determinism, cognitive non-authority, adaptive containment |
| architecture | `bun test ./tests/architecture` | dependency direction, no forbidden edges, engine boundaries, structural invariants, documentation, acceptance criteria A–M |
| integration | `bun test ./tests/integration` | causality, append-only, rebuild, crash recovery, erasure, secrets, second process, CLI, shared state, failure isolation |
| examples | `bun test ./tests/examples.test.ts` | each of the 15 README examples runs and prints `ok:` |
| E2E | `bun run test:e2e` | the §36 browser journey, verified against the SQLite file from a separate process |

## 4. Add a proof when you add a behavior

If your change satisfies a ledger requirement, the requirement's `gate.proof_paths` must exist —
`check` fails an `implemented` requirement whose proof file is missing. Put the proof where the
requirement's gate says, or amend the ledger deliberately.

If the change is new behavior with no requirement, the honest move is to say so in the status
snapshot's `next` and let the operator decide whether the ledger grows. Do not quietly widen a
requirement's scope.

## 5. Record the result

Per [.agents/AGENTS.md](../../.agents/AGENTS.md):

- append exactly two lines to `.agents/CURRENT_STATUS.yaml`: `---` and one JSON-compatible YAML
  object with a **higher** `revision`, plus `recorded_at`, `stage`, `summary`, `verified`, `limits`,
  `next`, `evidence`, `spec`, `ledger`. Carry forward facts that remain true; an entry is a
  complete snapshot, not a delta. Never edit earlier entries.
- update `.agents/CURRENT_STATUS.md` in place, with a matching revision and summary. Do not append
  history there.
- record a command, an outcome, and a scope before calling a gate passed.
- record evidence-backed debt in `.agents/DEBT.md` when you find a gap.

`check` enforces the two-file agreement, so a mismatched pair fails the baseline.

## 6. Known environment caveats

| Caveat | Effect | Where |
|---|---|---|
| Bun 1.4.0 `toMatchObject` mutates its argument | clone the received object before matching in tests | DEBT-017 |
| Playwright's `webServer` readiness probe hangs on WSL2 | fixtures use a `globalSetup` that waits on stdout | DEBT-012 |
| RVF `FsyncFailed` under concurrent I/O | the E2E app retries | DEBT-018 |
| RealityTrace gates need a pinned CLI | `just setup-realitytrace` | DEBT-010 |

## 7. Read the result honestly

| Claim | Supported by |
|---|---|
| "this requirement is implemented" | its gate passes locally |
| "the architecture holds" | `tests/architecture` passes, including criteria A–M |
| "the invariants hold" | `tests/properties` passes |
| "the UI works" | `tests/e2e` passes, and `verify.ts` confirms the same state from the SQLite file |
| "this is production-ready" | **nothing in this repository establishes that** |

## Related

- [../reference/verification.md](../reference/verification.md) — the full command and environment
  reference.
- [../troubleshooting.md](../troubleshooting.md) — when a gate fails.
- [../../AGENTS.md](../../AGENTS.md) — the agent operating surface.

## Source trail

- `justfile` — the recipes.
- `scripts/check-substrate.ts` — the substrate check.
- `scripts/gate.ts` — the gate runner and the lock.
- `tests/architecture/docs.test.ts` — the documentation guard.
- `tests/proof-routing.test.ts` — the gate runner's own tests.
- [.agents/AGENTS.md](../../.agents/AGENTS.md) — the status protocol.
- `.agents/CURRENT_STATUS.yaml` — the latest snapshot (`just status`).
