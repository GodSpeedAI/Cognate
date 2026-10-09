# Independent Adversarial Audit — Cognate — 2026-09-25

Auditor: independent read-only review, no prior authorship. Verified by running commands, not by trusting prose. Repo: ~/projects/cognate, branch `build/cognate-v0`, HEAD `5e6690a`.

## Summary verdict

The repository's self-reported state (73 requirements: 71 implemented, 2 blocked; `just verify` and `just gates` both green) is **substantially accurate when the gate runner is executed sequentially**. Both commands were re-run clean: `just verify` → 71/71, `just gates` → 73/73 (see Commands section). An initial parallel run of the two commands produced two different spurious "status drift" failures (AK-010, then CG-E2E-001 on a separate run) purely from resource contention (shared SQLite files / ports / tmp dirs across concurrently-running processes); both requirements pass in isolation. This is a **real fragility** (tests are not safe to run concurrently against shared state) but it is already substantially covered by existing debt entries (DEBT-011, DEBT-017, DEBT-018) — it is not a hidden gap, it is a reproduction of documented, known risk.

Spot-checked test bodies (kernel, continuations, commitments, cognition-retrieval authorization, wire limits, AG-UI, CLI, E2E, profiles) are **not tautological**. They assert on concrete state transitions, event-stream shapes, and negative cases (denial, leak-absence, size/depth/auth rejection) rather than trivially-true conditions. No `TODO`/`FIXME`/`not implemented` stub, no skipped test (`.skip`/`.todo`/`xtest`), no machine-specific path, and no hardcoded real secret were found in `packages/`, `tests/`, or `profiles/` source (test fixtures use obviously-fake secret strings, which is correct practice, not a leak).

The main substantive finding is **spec-coverage gaps**: several normative MUST/SHALL clauses in §3, §8–9, §13, §23, and §31 have no ledger requirement and no gate citing that section number. None of these look like undisclosed defects — they read as reasonable candidates for the DEBT register or a future ledger row that were simply never entered. This is a documentation/traceability gap, not (from what I could verify) a behavioral one.

**Counts:** 0 critical, 3 major, 6 minor findings (see table). No cross-tenant leak, authorization bypass, or unauthenticated path found in the areas sampled (protocol-connect-bun, ag-ui, runtime-bun, cognition recall). One historical cross-tenant leak (harness `storage.kv` / `subagent.start`) was found and fixed during development per `.agents/evidence/m9-profiles.md`; I independently re-verified the fix is present in the current tree (see F-05).

## Findings table

| ID | Severity | Area | Finding | Evidence | Suggested fix |
|----|----------|------|---------|----------|----------------|
| F-01 | major | Spec coverage | §9.2 "Durable Fact" (`Durable facts SHALL be appended... MUST NOT be "undone" by deleting history`) has no ledger row citing section 9.2 and no gate that asserts append-only/immutability of the event log directly. | `requirements/ledger.yaml` section list (extracted programmatically) contains no `9.2`; spec lines 706-724 (`.agents/specs/software-design-spec-cognate.-frameworkmd:706`). `packages/store-sqlite/src/index.ts:277` does an `UPDATE events SET erasure_reason...` for erasure, the one sanctioned mutation path — but nothing in the ledger proves ordinary events are never updated/deleted outside erasure. | Add a ledger requirement (or extend CG-EVT-00x) citing §9.2 with a gate asserting the store rejects/has no API for mutating or deleting a committed event outside the erasure path. |
| F-02 | major | Spec coverage | §8.3 "Component" (`Component definitions MUST be independent from one instantiated runtime occurrence`, i.e., reusable across runtimes) is never cited by any ledger `source.section`. | Ledger section list has no bare `8.3`; spec lines 607-624. | Add acceptance test instantiating the same component definition into two independent runtimes and asserting no shared/leaked state, cite §8.3. |
| F-03 | major | Spec coverage | §31.4–§31.7 (RVF failure isolation, DomainForge-unavailable wait/fail behavior, RealityTrace-down continuation, UI-failure non-corruption) have no ledger citation at all — only §31.1/31.2/31.3/31.8 are covered. Given DEBT-018 already documents intermittent RVF `FsyncFailed` under concurrent I/O, §31.4 ("Failure to create a cognitive snapshot MUST NOT corrupt the active cognitive index or event store") is exactly the untested claim that debt entry puts pressure on. | Ledger section list (programmatic extraction) omits `31.4`,`31.5`,`31.6`,`31.7`; spec lines 1719-1744. | Add a fault-injection test that forces RVF snapshot creation to fail and asserts the event store/cognitive index are unaffected; cite §31.4. Same pattern for 31.5–31.7. |
| F-04 | minor | Spec coverage | §3.1, §3.2, §3.3, §3.7 (`.sea`/DomainForge/RealityTrace independence, proto-not-ontology) have no ledger citation. Spot-checked independently: `packages/domainforge/package.json:8` and `packages/realitytrace/package.json:8` depend only on `@godspeedai/*` + the upstream library (correct direction — the Cognate *adapter* depends on DomainForge/RealityTrace, not vice versa), and no `rxjs` dependency exists anywhere in the workspace (§23 constraint upheld). These invariants appear to hold in practice but are asserted only by manual package.json inspection, not by an automated architecture test tied to the ledger. | `.agents/specs/...:103,111,134,213`; `packages/domainforge/package.json`, `packages/realitytrace/package.json`. | Extend `tests/architecture/dependencies.test.ts` (already exists per CG-ARC-00x) to assert `@godspeedai/domainforge`/RealityTrace CLI never appear as reverse dependents of `@godspeedai/*`, and cite §3.1–3.3 in the ledger. |
| F-05 | informational (not a live bug) | Security process | A real cross-tenant leak (`storage.kv` not tenant-partitioned; `subagent.start` accepted tenant from caller input) was found during the harness milestone and is recorded as fixed in `.agents/evidence/m9-profiles.md` ("M10 profiles — observed gates"). I independently re-verified the fix is present: `profiles/harness/src/*.ts:91` keys storage by `` `${ctx.tenant}/${input.key}` `` and line 122 passes `tenant: ctx.tenant` (from `HandlerContext`, not request input) into `startRun`. | `profiles/harness/src/index.ts:83-122` (grep-verified); `.agents/evidence/m9-profiles.md`. | None needed — cited as a positive control showing the adversarial-review process catches real issues; no action required beyond keeping the regression test that caught it (`profiles/harness/test/harness.test.ts`) in the suite. |
| F-06 | minor | Test isolation / DEBT accuracy | Running `just verify` and `just gates` concurrently produces nondeterministic "status drift" failures on unrelated requirements (AK-010 in one run, CG-E2E-001 in another) purely from shared SQLite/tmp/port resources across processes. Both pass cleanly when run sequentially or alone. | Command transcript below; `just gate AK-010` and `bun scripts/gate.ts CG-E2E-001` both pass in isolation. | Already substantially tracked by DEBT-011 (single-writer SQLite assumption), DEBT-017 (Bun 1.4.0 `toMatchObject` mutation bug), DEBT-018 (RVF `FsyncFailed` under concurrent I/O). Recommend an explicit note in `justfile`/CI docs: "do not run `verify` and `gates` concurrently against the same working tree" — this is currently undocumented and could mislead a CI matrix that parallelizes targets. |
| F-07 | minor | Debt register | DEBT-014 (erasure doesn't reach continuation payloads or recall-derived step results) is honest and current — I found no test or code path that silently closes this gap without the debt entry; `tests/integration/erasure.test.ts` scope matches what DEBT-014 says is NOT covered (it doesn't over-claim). Register quality is good; no drift found in the ~6 entries sampled against their cited requirements (DEBT-006/008/009/011/014/017/018). | `.agents/DEBT.md` DEBT-014; `tests/integration/erasure.test.ts` (44 lines, asserts payload scrub + index removal, does not assert continuation-record scrubbing). | No fix required; keep as-is. |
| F-08 | minor | Wire/limits test strength | `packages/protocol-connect-bun/test/limits.test.ts` is a strong, non-tautological suite (asserts `401`/`resource_exhausted`/`invalid_argument`/`deadline_exceeded` codes for unauth, oversized, over-deep, and slow requests respectively) but does not test the interaction of two limits at once (e.g., an oversized AND malformed body) nor a boundary-exact case (body at exactly `maxBodyBytes`). Not a defect, just thinner boundary coverage than the rest of the suite. | `packages/protocol-connect-bun/test/limits.test.ts:1-67`. | Add one boundary test at exactly the configured limit. |
| F-09 | minor | Documentation | README's status banner is appropriately hedged ("implemented and verified against a candidate requirement ledger... known gaps are tracked... RealityTrace structured correlation and SONA adaptive ranking remain blocked") and does not overclaim; `docs/` pages are enforced against staleness by `tests/architecture/docs.test.ts` (per evidence log, a real staleness bug was caught and fixed on 2026-09-25). No unverified claim was found in the top ~120 lines of README.md. | `README.md:1-40`; `.agents/evidence/m9-profiles.md` "M10 profiles" row for `docs.test.ts`. | None; noted as a positive finding for completeness of the audit trail. |

## Uncovered normative spec clauses (systematic sample across requested sections)

Method: extracted every `source.section` value from `requirements/ledger.yaml` (146 rows programmatically parsed) and diffed against the full `##`/`###` heading list of the spec, restricted to the requested ranges (§3, §8–13, §16–22, §24, §31–33).

- **§3.1** `.sea` remains unchanged — not cited.
- **§3.2** DomainForge remains unchanged — not cited.
- **§3.3** RealityTrace remains unchanged — not cited.
- **§3.7** Wire representation is not semantic ontology — not cited.
- **§3.9** External side effects are not reversible effects — not cited directly (§9.3, a related but distinct clause, is covered by CG-CMT-001).
- **§8.3** Component (definitions must be runtime-occurrence-independent) — not cited.
- **§9.2** Durable Fact (append-only, no history deletion) — not cited.
- **§13.2** Suggested logical tables — SHOULD/MAY language, low priority, not cited (acceptable to leave uncovered).
- **§23** Streaming (Web-standard primitives; RxJS MUST NOT be required by kernel) — no ledger row cites section 23 at all; verified independently that no `rxjs` dependency exists in the workspace, so the invariant currently holds, but nothing in the ledger enforces it against regression.
- **§31.4** RVF failure isolation — not cited (see F-03).
- **§31.5** DomainForge integration failure — not cited.
- **§31.6** RealityTrace failure — not cited.
- **§31.7** UI failure (rendering failure must not corrupt authoritative state) — not cited.

Sections confirmed covered by at least one ledger row: §3.4, 3.5, 3.6, 3.8; §6; §7.1; §8.1, 8.2, 8.4, 8.5; §9.1, 9.3; §10; §11; §12; §13.1, 13.3; §14; §15; §16; §17; §18 (18.1–18.3 rolled into the single §18 citation); §19; §20; §21; §22; §24; §25.1–25.3; §26; §28; §29, 29.1, 29.2; §30; §31.1, 31.2, 31.3, 31.8; §32; §33; §34.2; §35; §36; §37 phases; §38; §40.

## Test-strength spot check (12 requirements sampled across areas)

All 12 sampled tests read their outcomes from real state transitions (event streams, HTTP status/error codes, DOM assertions in a real browser via Playwright, a real subprocess client) rather than mocked return values asserted against themselves. None found tautological.

| Requirement | Gate file | Verdict |
|---|---|---|
| CG-KRN-001/005 (kernel contract/scopes) | `packages/kernel-cordis/test/{contract,scopes}.test.ts` | Strong — asserts idempotent dispose, lease invalidation post-dispose, reverse-order effect cleanup, scope-close cascades. |
| CG-EVT-003 (atomic commit) | `packages/store-sqlite/test/conformance.test.ts` (uses shared `storeConformance` harness) | Adequate — a shared conformance suite parameterized over persistent/memory stores; strength depends on `@godspeedai/cognate-events/conformance` body (not separately re-audited line by line here). |
| CG-CON-001 (continuation races) | `packages/continuations/test/lifecycle.test.ts:` racing-resume/cancel/expire test runs 10 rounds of `Promise.all` and asserts exactly one terminal transition and exactly one stream write — this is a genuine concurrency proof, not a mock. |
| CG-CMT-001 (commitments) | `packages/continuations/test/commitments.test.ts` — uses a fake remote with injected socket-timeout-after-effect behavior to test idempotent reconciliation of "effect happened, response lost" — realistic failure-mode coverage. |
| CG-COG-004 (index rebuild determinism) | `tests/integration/cognitive-rebuild.test.ts` — asserts identical authorization/outcome behavior across delete+rebuild using a real runtime, not a stub. |
| CG-RVF-001 (RVF attach/detach) | `packages/cognitive-rvf/test/rvf.test.ts` | Not fully re-read line-by-line; README-documented semantics (attached only on matching lineage + recorded digest) look consistent with DEBT-006's known gaps. |
| CG-WIR-002 (second process) | `tests/integration/second-process.test.ts` — spawns an actual separate `bun` process running a generated client against a live server; strong, genuinely end-to-end. |
| CG-WIR-004 (wire limits) | `packages/protocol-connect-bun/test/limits.test.ts` — see F-08; strong overall. |
| CG-AGUI-001 (AG-UI outbound) | `packages/ag-ui/test/outbound.test.ts` — asserts full event-type coverage of the AG-UI 1.0.0 enum, well-bracketed TEXT_MESSAGE events, exact delta content, and consumes the stream through a real `@ag-ui/client` `HttpAgent`. Strong. |
| CG-COG (retrieval authorization) | `packages/cognitive-api/test/retrieval.test.ts` — explicitly tests: cross-tenant candidate excluded from resolver calls entirely (`fetched` list assertion), restricted-hit leaves **no trace** (serialized-result string search for leaked terms), and a forged high-similarity metadata payload cannot make content authoritative. This is exactly the adversarial test the spec's §16/§32 threat model calls for, and it is not tautological. |
| CG-PRF-001/003 (profiles) | `packages/profile/test/profile.test.ts`, `profiles/harness/test/harness.test.ts` | Harness test caught and forced a fix for the real tenant leak noted in F-05 — strong evidence the test is meaningful, not decorative. |
| CG-CLI-001 (CLI create/dev) | `tests/integration/cli-create.test.ts` — spins up a real `bun dev` server, calls health/StartRun/GetRun over real HTTP, kills and restarts the server to prove durability across restart. Strong, not mocked. |
| CG-SEC-001 (erasure) | `tests/integration/erasure.test.ts` — asserts payload scrub and cognitive-index removal via a real runtime; correctly does **not** assert continuation-record scrubbing (matches DEBT-014, no over-claim). |

No test in this sample degraded behavior silently without a corresponding DEBT entry.

## Security (§32) spot check

Areas sampled: `packages/protocol-connect-bun` (auth/limits), `packages/ag-ui`, `packages/runtime-bun`, `packages/cognitive-api` (recall/retrieval). No cross-tenant leak, authorization bypass, or unauthenticated path found:

- Unauthenticated requests rejected before reaching the service (`limits.test.ts`, 401/`unauthenticated`).
- Retrieval pipeline filters by tenant/scope before authoritative dereference and leaks nothing (titles/scores/provenance) for denied hits (`retrieval.test.ts`).
- Similarity cannot forge authority — a crafted high-similarity/forged-metadata entry cannot inject content the resolver didn't return (`retrieval.test.ts` final test).
- Harness `storage.kv`/subagent tenant-smuggling bug (found during development, not currently live) — re-verified fixed, see F-05.
- Did not attempt to fuzz `packages/a2a` or `packages/mcp` in depth (time-boxed); a deeper pass on those two plus the CLI dev server would be a reasonable follow-up given they were only lightly sampled here.

## Commands run and results

```
$ just verify   (first run, in parallel with `just gates`)
...
FAIL  AK-010       [implemented] exit 1  <-- status drift
error: recipe `verify` failed on line 27 with exit code 1

$ just gates    (first run, in parallel with `just verify`)
...
FAIL  CG-E2E-001   [implemented] exit 1  <-- status drift
72/73 gates pass
error: recipe `gates` failed on line 35 with exit code 1

$ bun scripts/gate.ts AK-010        # isolated re-run
✓ 1 passed (914ms)  -- hydration.spec.ts

$ bun scripts/gate.ts CG-E2E-001    # isolated re-run
✓ 1 passed (1.4s)   -- journey.e2e.ts

$ just verify        (second run, alone)
71/71 gates pass, exit 0

$ just gates          (second run, alone)
73/73 gates pass, exit 0
```

Conclusion: the ledger's PASS/FAIL claims are accurate under normal (non-concurrent) execution. The concurrency fragility itself is a legitimate, if minor, finding (F-06) that is already substantially anticipated by existing DEBT entries.
