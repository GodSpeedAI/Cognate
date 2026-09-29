# Current status

**Status revision:** 16

**Stage:** CopilotKit reconstruction: reference verified, mock-LLM path enabled, instructions revised

**Summary:** Correction and enablement. Revisions 13-15 wrongly recorded the pinned reference checkout as absent from .tmp/ref/copilotkit; it is present and was just verified byte-identical to the pinned SHA (all 21,195 files from the pinned tarball present, zero differing; the 1,098 extra files are dist build outputs), so that inherited claim is retracted. The reconstruction's biggest blocker is also cleared: CopilotKit ships its own fixture-based LLM mock, @copilotkit/aimock 1.37.4, installed here and proven to serve both non-streaming and streaming OpenAI-shaped traffic from fixtures with no API key, which makes BLACK_BOX_REFERENCE evidence achievable for the reference application instead of unreachable. The reconstruction instructions were revised to require that mechanism rather than a live paid endpoint. No reconstruction journey code changed in this revision; J-A, J-B and J-C remain the only implemented journeys and the wider parity work is still open.

**Verified:** The pinned reference checkout at `.tmp/ref/copilotkit` was verified byte-identical to
the pinned commit by downloading the pinned tarball and comparing: **21,195 of 21,195 files
content-identical, zero differing, zero missing**. The 1,098 local-only files are all `dist/` build
artifacts. `@copilotkit/aimock` **1.37.4** installs from `showcase/scripts` and ships two bins whose
CLIs match the pinned repository's own forbidden-pattern test exactly. A smoke test proved the mock
serves `GET /v1/models` (200), returns fixture content (`OK`) for a non-streaming chat completion,
and emits well-formed SSE deltas plus `[DONE]` for `stream:true` — **with no `OPENAI_API_KEY` set**.
The reconstruction instructions were revised in six places to require this mechanism. `just verify`
passes 78/78 gates and `just check` passes; J-A, J-B and J-C still pass their 4 tests.

**Limits:** A claim I carried into revisions 13–15 is **retracted**: they reported the reference
clone as absent. It was present the whole time — the claim came from the interrupted session's own
narration rather than verification, and it propagated into three snapshots. No reconstruction
journey work was done in this revision: J-A, J-B and J-C remain the only implemented journeys of the
10 in the IDM catalog, and J-D, J-E, J-F, J-G, J-H, J-J and J-K are modeled but unbuilt. The
reference application has **still never been executed end to end** — the mock makes that achievable
but it is not done, so there is still no `BLACK_BOX_REFERENCE` evidence, no screenshots, and no
parity report. The fixtures for the ten journeys have not been surveyed (only shared fixtures were
smoke-tested), and `showcase/scripts` blocked the esbuild postinstall under npm `allowScripts`.
DEBT-021 remains open. The thread-shared-state tranche and the J-C fix remain uncommitted, with the
fix living only in an untracked file. Carried-forward framework limits (DEBT-004, DEBT-011,
DEBT-014 through DEBT-017, DEBT-020, process-local remote offer leases, candidate ledger) still
apply, as does the transient unreproduced CG-PRF-002 observation from revision 15.

**Next:** Proceed from Phase 1 with the reference verified and the mock path working: run the
canonical starter and selected reference surfaces against fixtures and capture the Phase 6
screenshots, converting `DOCUMENTED_REFERENCE` matrix rows into `BLACK_BOX_REFERENCE`. Then work the
unbuilt journeys in dependency order (J-D, J-E, J-F, J-G, J-H, J-J, J-K), add the missing artifacts
(`primitive-provenance.md`, `parity-report.md/json`, `diffs/`, screenshots, `tests/protocol`,
`tests/visual`, `tests/architecture`), and re-audit the 32 settlement gates as each closes. Get
operator intent before committing the uncommitted tranche. Treat DEBT-021 as a separate framework
change.
