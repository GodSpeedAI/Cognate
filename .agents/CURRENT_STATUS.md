# Current status

**Status revision:** 17

**Stage:** CopilotKit reconstruction: tranche committed, session torn down, mock-LLM path ready

**Summary:** The interrupted session's work is committed and its leftovers are gone. Three commits landed: the thread-shared-state tranche including the J-C fix (a1d72f7), the revised reconstruction instructions that require CopilotKit's own mock LLM (b8d3331), and the DomainForge 0.18.1 revalidation records (3212b4e). The J-C fix is no longer trapped in an untracked file. The stale dev server on port 4178 is stopped and the interrupted session's /tmp artifacts are removed, and a second inherited claim is retracted: that server was not from the interrupted session at all but a two-day-old dev server belonging to the separate sea-rs project. The reference is verified and the mock is proven to serve both streaming and non-streaming OpenAI-shaped traffic with no API key, so the next step is executing the reference application against it.

**Verified:** Three commits landed: `a1d72f7` (the durable thread-scoped shared-state tranche,
including the J-C fix), `b8d3331` (the revised instructions requiring CopilotKit's own mock LLM),
and `3212b4e` (the DomainForge 0.18.1 revalidation records). Only `.jolli/jollimemory/debug.log`
remains modified and it was deliberately left out. `just verify` ran **78/78 gates, exit 0**
immediately before committing - with `CG-PRF-002` passing, confirming revision 15's transient
failure was load-related. The port 4178 dev server is stopped and the interrupted session's 41 MB of
`/tmp` artifacts are removed. The reference checkout is verified byte-identical to the pinned commit
(21,195/21,195 files), and the mock serves both streaming and non-streaming OpenAI-shaped traffic
with no API key.

**Limits:** A **second inherited claim is retracted**: revision 15 recorded the port 4178 dev server
as a leftover from the interrupted session. It was not - it had run since 2026-09-26 17:52 from
`projects/sea-rs/apps/godspeed-cognitive-ui`, an unrelated project, about two days before the
session began, and it was stopped only after explicit operator authorization for that process.
Revisions 13-15's claim that the reference clone was absent stays retracted as well. No reconstruction
journey work was done here: J-A, J-B and J-C remain the only implemented journeys of 10, with J-D,
J-E, J-F, J-G, J-H, J-J and J-K modeled but unbuilt. The reference application has **still never been
executed end to end** - the mock is proven in isolation but not yet wired into the starter, so there
is no `BLACK_BOX_REFERENCE` evidence, no screenshot, and no parity report. The journey fixtures have
not been surveyed. 294 tiny `/tmp/deepseek-harness-*` directories from the earlier DeepSeek session
remain, and a separate cognate process still listens on port 4177 (`scripts/show-documents.ts`, from
the earlier Artifact Viewer work) - both left in place. DEBT-021 remains open, `showcase/scripts`
blocked the esbuild postinstall under npm `allowScripts`, and the carried-forward framework limits
(DEBT-004, DEBT-011, DEBT-014 through DEBT-017, DEBT-020, process-local remote offer leases, unfrozen
ledger) still apply.

**Next:** Execute the reference. Survey the `showcase/aimock` fixture tree for the ten canonical
journeys, start the canonical starter against the mock by overriding `OPENAI_BASE_URL`, drive it
under Playwright at fixed viewports, and capture the Phase 6 screenshots - converting the
`DOCUMENTED_REFERENCE` matrix rows to `BLACK_BOX_REFERENCE`. Then build the remaining journeys in
dependency order (J-D, J-E, J-F, J-G, J-H, J-J, J-K) and add the missing artifacts
(`primitive-provenance.md`, `parity-report.md/json`, `diffs/`, screenshots, `tests/protocol`,
`tests/visual`, `tests/architecture`), re-auditing the 32 settlement gates as each closes. Treat
DEBT-021 as a separate framework change, not an app workaround.
