# Reference: the ledger, gates, and evidence

How this repository decides what is implemented, and what that does and does not mean.

## The three artifacts

| Artifact | Owner of | Machine-read by |
|---|---|---|
| [requirements/ledger.yaml](../../requirements/ledger.yaml) | requirement ids, titles, spec source + digest, acceptance contracts, gate command, proof paths, dependencies, status, evidence, debt | `scripts/check-substrate.ts`, `scripts/gate.ts`, `tests/architecture/*` |
| [.agents/CURRENT_STATUS.yaml](../../.agents/CURRENT_STATUS.yaml) | append-only status snapshots (one JSON object per two lines) | `scripts/check-substrate.ts` |
| [.agents/evidence/](../../.agents/evidence/) | the observed proof behind each `implemented` requirement | `scripts/check-substrate.ts` (existence) |

Plus [.agents/DEBT.md](../../.agents/DEBT.md) (the debt register, keyed `DEBT-NNN`) and
[.agents/OPEN_QUESTIONS.md](../../.agents/OPEN_QUESTIONS.md) (unresolved decisions).

**The ledger is a candidate.** `freeze_hash: candidate` and no contract is frozen. Freezing is an
operator decision, recorded as open question 3.

## Ledger shape

```yaml
ledger_version: 2
freeze_hash: candidate
requirements:
  - id: CG-STA-001
    title: 'Shared application state is bidirectional: a caller writes it and a waiting agent reads it, and vice versa.'
    source: { file: .agents/specs/…, section: '29.1', digest: 'sha256:…' }
    semantic_binding: { entity: 'Shared run state', invariant: '…' }
    acceptance: [AC-STA-001-01]
    gate: { cwd: ., run: 'bun test ./tests/integration/shared-state.test.ts',
            proof_paths: ['tests/integration/shared-state.test.ts'] }
    dependencies: [CG-CLT-001, CG-AGUI-002]
    status: implemented
    evidence: .agents/evidence/2026-09-25-shared-state.md
    debt: DEBT-019            # optional; required when status is blocked
acceptance_contracts:
  - id: AC-STA-001-01
    requirement: CG-STA-001
    expected: '…'
```

Id families: `AK-*` (acceptance/characterization), `CG-KRN` (kernel), `CG-EVT` (events),
`CG-PRJ` (projections), `CG-CON`/`CG-CMT` (continuations/commitments), `CG-ART` (artifacts),
`CG-CAP` (capabilities), `CG-SEC` (security), `CG-OBS` (observability), `CG-WIR` (wire),
`CG-SEM` (semantics), `CG-RT` (RealityTrace), `CG-COG` (cognition), `CG-RVF`, `CG-CLT` (client),
`CG-UI`, `CG-AGUI`, `CG-STA` (state), `CG-MCP`, `CG-A2A`, `CG-PRV` (providers), `CG-PRF`
(profiles), `CG-CLI`, `CG-E2E`, `CG-ARC` (architecture), `CG-EXM` (examples), `CG-DOC`
(documentation), `CG-FAIL` (failure isolation).

Statuses: `candidate`, `implemented`, `blocked`. **No requirement is currently frozen.**

## What `check` enforces

`bun scripts/check-substrate.ts` fails when:

- the ledger is not version 2 with `freeze_hash: candidate`;
- a required substrate file is missing (`AGENTS.md`, `.agents/*`, `package.json`,
  `scripts/gate.ts`, …);
- the status history is not complete two-line documents ending in a newline, revisions do not
  increase, a required field is missing, `recorded_at` is unparseable, a list field is not a list;
- `.agents/CURRENT_STATUS.md` does not match the latest YAML snapshot's revision and summary;
- a requirement id or acceptance-contract id is duplicated;
- a requirement's `source.file`/`source.digest` does not match the spec, or `source.section` is empty;
- a status outside `candidate | implemented | blocked`;
- an `implemented` requirement has no `evidence`, or the evidence file does not exist;
- a `blocked` requirement has no `debt`, or the DEBT id does not exist in `.agents/DEBT.md`;
- an `implemented` requirement's `gate.proof_paths` do not all exist;
- an unknown dependency, or an acceptance contract not bound by its requirement (in either
  direction).

On success it prints:

```text
Substrate check passed: 81 requirements (81 implemented, 0 blocked, 0 candidate); no freeze claimed.
```

## What `gate.ts` does

```bash
bun scripts/gate.ts <ID>          # one requirement
bun scripts/gate.ts --all         # every requirement
bun scripts/gate.ts --implemented  # only those claimed implemented (regression mode)
```

Per requirement it first checks that every `proof_paths` entry exists. A missing proof is an
**unmet gate** (exit 1, printing the acceptance contract's `expected` text) — never a skip. Then
it runs `gate.run` with `sh -c` in `gate.cwd`.

It reports `<-- status drift` when a gate passes but the requirement is `candidate`, or fails
while marked `implemented`. A `blocked` requirement whose gate passes is not drift: the
characterization is the point.

Whole-ledger runs take an exclusive lock on `.tmp/gates.lock`; a concurrent run exits 3 with a
message rather than producing spurious failures from shared SQLite files, temp dirs, and ports.

## Evidence

Each `implemented` requirement names an evidence file under `.agents/evidence/`. Evidence records
what was run, when, the outcome, and the scope — for example the milestone files
(`m2-kernel.md` … `m9-profiles.md`), the Phase 0 dependency characterizations
(`phase0-cordis.md`, `phase0-ruvector.md`, …), and dated closure records
(`2026-09-25-audit-closure.md`, `2026-09-25-shared-state.md`, …).

`check` verifies existence, not content. Reading the evidence file is how you judge whether a
claim was observed or asserted.

## Compatibility fixtures

`compatibility/phase0/<dependency>/` characterizes an upstream dependency under Bun *before* the
framework depends on it: `cordis`, `domainforge`, `ruvector`, `rvf`, `sona`, `ag-ui`, `connect`,
`mcp`, `realitytrace`, `ui`, plus `sqlite.test.ts`. Each fixture asserts only the named behavior.
A fixture that has not been run is an unmet gate, not a pass — which is why
`AGENTS.md` says a missing fixture is never a passing skip.

## The current state

81 requirements, all `implemented`; `just check` reports 81/81 requirements passing. The exact counts are recorded in [`.agents/CURRENT_STATUS.yaml`](../../.agents/CURRENT_STATUS.yaml)
rather than restated here, so this page does not go stale. Recorded limits, verbatim in scope:

| Limit | Id |
|---|---|
| Connect supports unary + server-streaming only | DEBT-004 |
| a single SQLite writer process | DEBT-011 |
| erasure does not reach continuation records or recall step results | DEBT-014 |
| the runtime loop polls and executes runs serially | DEBT-015 |
| packages are unpublished; `create` vendors from a checkout | DEBT-016 |
| Bun 1.4.0 `toMatchObject` mutates its argument | DEBT-017 |
| RVF `FsyncFailed` under concurrent I/O | DEBT-018 |
| RuVector core supports vector search only | DEBT-007 |
| RVF 0.3.4 integrity/metadata/byte-export gaps, mitigated in the adapter | DEBT-006 |
| Cordis 4.0.0-rc.10 lifecycle gaps, mitigated in the adapter | DEBT-005 |
| DomainForge errors share one code; kinds without a V0 accessor | DEBT-002, DEBT-003 |
| Playwright `webServer` probe hangs on this host | DEBT-012 |

## What "implemented" does not mean

- Not production readiness. Nothing here establishes operational fitness.
- Not a frozen contract. The ledger is a candidate; changing a public shape is a deliberate act.
- Not independence from the local environment. The gates ran on Bun 1.4.0 on one host; DEBT-012,
  DEBT-017, and DEBT-018 are environment-specific and were worked around rather than fixed.
- Not equivalence to local conformance's consequence. The repository's own guidance: do not equate
  local conformance with real-world consequence.

## Source trail

- `requirements/ledger.yaml` — the map.
- `scripts/check-substrate.ts` — the substrate check.
- `scripts/gate.ts` — the gate runner and the lock.
- `tests/proof-routing.test.ts` — the runner's own tests.
- `.agents/CURRENT_STATUS.yaml` — the latest snapshot (`just status`).
- `.agents/DEBT.md` — the debt register.
- `.agents/evidence/` — the observed proof.
- `compatibility/phase0/` — the dependency fixtures.
- [../how-to/verify-a-change.md](../how-to/verify-a-change.md) — the loop.
- [../troubleshooting.md](../troubleshooting.md) — when a gate fails.

## Related

- [commands-and-configuration.md](commands-and-configuration.md) — the commands.
- [../getting-started.md](../getting-started.md) — the first commands to run.
