# Debt and open-question verification — 2026-10-21

Scope: every open entry in `.agents/DEBT.md` and every item in `.agents/OPEN_QUESTIONS.md`, checked against `main` at `a477933`. Haiku subagents did the read-only recon. Key claims were spot-checked by hand, and the Cordis kernel suite was run (`packages/kernel-cordis`: 39 pass, 0 fail).

Recommendations prefer existing files, seams, and dependencies. None adds a dependency. Where a test is needed, it extends an existing test file.

## Summary

| ID | Verdict | Production impact | Recommended action (short) |
|---|---|---|---|
| DEBT-002 | Valid; pin evidence stale | Medium | Re-run goldens on 0.21.1, record evidence, sync local install |
| DEBT-004 | Valid | Low | Close by decision: unary + server streaming is the 1.0 contract |
| DEBT-005 | Valid (mitigated) | Low | Keep; conformance kit already gates every bump |
| DEBT-006 | Partially stale | Low | Mark local half closed; keep upstream note |
| DEBT-007 | Valid (by design) | Low | Reclassify as documented design limit |
| DEBT-012 | Valid | Medium | Run the E2E suite in CI (Chromium is already installed there) |
| DEBT-015 | Partially stale | **High** | Wake the loop on `store.onCommitted`; add a load measurement |
| DEBT-016 | Partially stale | **High** | Registry-only `cognate create`; fix the stale README Quick Start |
| DEBT-017 | Valid | Low | Bundle with DEBT-027 into one Bun-bump check |
| DEBT-018 | Valid | Medium | Move the retry into `createRvfIndex` |
| DEBT-020 | Valid | Medium | Export the subagent-completion resolver |
| DEBT-022 | Valid (environment) | Low | Use the existing bubblewrap provider for forks where available |
| DEBT-023 | Partially stale (now unblocked) | Low | Add entities and bindings; the blocker is gone |
| DEBT-024 | Valid | Low | Implement two cheap items, drop the rest by decision |
| DEBT-025 | Valid | Medium | Gate the approval card on the open continuation; drop the 1.5 s hedge |
| DEBT-026 | Valid | Medium | Nanosecond mtime + inode version; accept the containment limit |
| DEBT-027 | Valid (mitigated) | Low | Keep; bundle with DEBT-017 |
| DEBT-028 | Valid | Medium (if shipped) | Mark preview/unsupported until the operator does a live sign-in |
| DEBT-029 | Valid | Low | Extend the existing first-use journey with an Anthropic case |

**Stale-entry removal.** No open DEBT entry is wholly stale. The ten Closed entries were **not** removed, for two reasons: `DEBT.md`'s own rule says to mark entries Closed, not delete them, and `requirements/ledger.yaml` still cites six of them (001, 003, 008, 011, 013, 014) in `debt:` fields. Open question 2 (Cordis lifecycle fit) was answered and has been removed from `OPEN_QUESTIONS.md`; the remaining items were renumbered.

## Verified debt entries

### DEBT-002 — DomainForge errors share one code (valid; evidence stale)
- The pin is `0.21.1` (`packages/domainforge/package.json:26`, `bun.lock:837`). The entry's progress notes stop at 0.18.2, and no evidence file covers 0.19.0 or 0.21.1.
- The classifier still matches messages with regexes (`packages/domainforge/src/index.ts:73-76`). The goldens are in `packages/domainforge/test/diagnostics.test.ts:9-31`.
- **Local install drift:** `packages/domainforge/node_modules/@godspeedai/domainforge` is **0.19.0**, but the lockfile says 0.21.1. Local test runs are therefore not testing the pinned binding.
- Upstream still has no typed error codes. The 0.19.0 `.d.ts` exports only `DiagnosticSeverity`.

**Recommend:** run `bun install`, re-run `diagnostics.test.ts` and the adapter gates on 0.21.1, and add a progress line plus an evidence file. Add one assertion to the existing `diagnostics.test.ts` that the installed binding's `package.json` version equals the adapter's `BINDING` constant, so a stale install or unrecorded bump fails the test. Keep the entry open until upstream ships typed diagnostics.

### DEBT-004 — No client or bidi streaming on Bun (valid)
- `proto/cognate/v1/runtime.proto:12` already declares the contract as unary + server streaming only. No product RPC needs more. The only client-streaming RPC is in the Phase 0 fixture.

**Recommend:** close by decision. Add a short addendum to the existing Connect ADR stating that client and bidi streaming are out of scope for 1.0. Change the exit criterion to "reopen if a product RPC needs client streaming." This also settles the open point that blocks the ledger freeze (open question 2).

### DEBT-005 — Cordis rc gaps owned by the adapter (valid, mitigated)
- `cordis` is pinned at `4.0.0-rc.10`. Aggregation (`kernel-api/src/errors.ts:2`), reverse sequential disposal (`kernel-cordis/src/fiber.ts:250`), cancellation (`fiber.ts:184,287,294`, `lease.ts:24`) and provide ownership (`fiber.ts:379`) are adapter code.
- The conformance kit passes today: 39/39.

**Recommend:** no code change. Before 1.0, confirm that `verify.yml` runs `packages/kernel-cordis` tests, so a Cordis bump cannot merge without the kit. Change the status to "Accepted risk (prerelease pinned, kit-gated)".

### DEBT-006 — RVF import integrity (partially stale)
- The local exit criterion is met. The digest is verified before open (`cognitive-rvf/src/index.ts:147,359-361,384`), the sidecar is copied (`:135,381`), and branches are isolated (`:284-290`). Tests are in `cognitive-rvf/test/rvf.test.ts:31,46,63,80`.
- The upstream half is still true: 0.3.4 `open()` does not verify files.

**Recommend:** change the status to "Closed locally (CG-RVF-001); upstream gap tracked". Keep the upstream note so a future bump re-tests `open()`.

### DEBT-007 — RuVector core supports vector search only (valid, by design)
- The adapter advertises only `vector_search` (`cognitive-ruvector/src/index.ts:57`), requires `storagePath` (`:7,54`), and filters by tenant and scope in Cognate (`:96-106`).

**Recommend:** this is a deliberate design limit, not a defect. Mark it "Accepted design limit (ADR-0004)" and keep the extension exit criterion for when graph retrieval is actually needed.

### DEBT-012 — Playwright `webServer` hang (valid; CI half missing)
- The spawn-and-wait setup is the only pattern in use and is documented (`docs/ui.md:53`, `docs/troubleshooting.md:153`).
- CI installs Chromium (`.github/workflows/verify.yml:54`) but **never runs** `test:e2e` (`package.json:35`).

**Recommend:** add one step to `verify.yml` after the Chromium install: `bun run test:e2e`. A green CI run satisfies the second half of the exit criterion, and the entry can close. This is also a production gap in its own right: the §36 journey is not gated today.

### DEBT-015 — Runtime loop polls (partially stale; high priority)
- Bounded concurrency now exists (`runtime-bun/src/runtime.ts:28-37,294-320`, `docs/runtime-concurrency.md`), but the default is still `maxConcurrentRuns: 1`.
- The loop still uses `setInterval(kick, tickMs ?? 10)` (`runtime.ts:462`) and never subscribes to `onCommitted`. All three stores implement `onCommitted` (`events/src/types.ts:200`), and the projections runner already uses it (`projections/src/runner.ts:65`).
- There is no runtime load test. `scripts/bench-stores.ts` benchmarks stores only.

**Recommend:**
1. In `runtime.ts`, subscribe `store.onCommitted(() => kick())`, the same pattern as `projections/src/runner.ts`. Set a single `setTimeout` for the next continuation expiry instead of scanning every tick. Keep a slow safety-net interval (about 1 s) for missed notifications.
2. Raise the default `maxConcurrentRuns` for server profiles, or document the production setting in `docs/runtime-concurrency.md`.
3. Add a runtime mode to the existing `scripts/bench-stores.ts` (N runs, p50/p99 start→complete) and record one PostgreSQL result as evidence. This also removes the PG flake noted on 2026-10-09.

### DEBT-016 — `cognate create` needs a checkout (partially stale; high priority)
- Publishing is done: every package is at 0.6.1 in `.release-please-manifest.json`. `create` still exits without `--source` (`packages/cli/src/bin.ts:32-35`).
- **The README is stale.** `README.md:68` still says `cognate-cli@0.1 … --source ./cognate`.

**Recommend:** make `--source` optional. Without it, `create` writes `@godspeedai/cognate-*` dependencies at the CLI's own version, read from its `package.json` (the packages ship in lockstep under `linked-versions`). It then skips the `bun pm pack` and `overrides` step in `packages/cli/src/index.ts:96-105`. Keep `--source` for unreleased local work. Extend `tests/integration/cli-create.test.ts` with a registry-mode case, then update the README Quick Start to `bunx @godspeedai/cognate-cli create my-app --profile copilot`. This is the main first-run blocker for external users.

### DEBT-017 — Bun 1.4.0 `toMatchObject` mutation (valid)
- Bun is pinned via `packageManager: "bun@1.4.0"` (`package.json:6`), and CI reads it from there. 74 files use `toMatchObject`, and only one is known to clone first (`tests/integration/cli-create.test.ts:58`). The multi-line audit was never done.

**Recommend:** don't audit 74 files by hand. Handle this together with DEBT-027 as one "Bun bump" task: try the newest Bun, run the isolated repro and `protocol-connect-bun/test/no-store.test.ts`, and close both entries if they pass. If they fail, keep the pin and note the date checked.

### DEBT-018 — RVF `create` fsync flake (valid)
- The retry is inline in `tests/e2e/app.ts:228-261` and catches every error. `cognitive-rvf` has no retry (`src/index.ts:316`).

**Recommend:** move a narrow retry, matching only `RvfErrorCode` FsyncFailed and allowing 3–5 attempts with a fresh path, into `createRvfIndex` in `cognitive-rvf/src/index.ts`. Add an optional `create` function to its options as a test seam, and add an injected-FsyncFailed case to the existing `test/rvf.test.ts`. Then remove the inline loop from `tests/e2e/app.ts`. This meets the exit criterion and protects every caller, including `examples/rvf-branching`.

### DEBT-020 — `spawnSubagent` hangs outside `createHarness` (valid)
- The resolver is private (`profiles/harness/src/index.ts:275-311`) and uses only public surfaces: `getRun`, `listContinuations`, `resolveContinuation`, `onCommitted`.

**Recommend:** in the same file, extract `export function watchSubagentCompletions(runtime, caller): () => void` and have `createHarness` call it. Add a hand-composed `createRuntime` case to `profiles/harness/test/harness.test.ts`. This is a public API trap, so fix it before 1.0.

### DEBT-022 — No microVM sandbox (valid; environment-bound)
- `/dev/kvm` is absent. `world.fork` registers a directory copy (`validation/reconstructions/deepseek-harness/cognate/src/capabilities/cognitive.ts:160-167`).
- The repo already ships a **bubblewrap** `ExecutionWorldProvider` in `packages/`.

**Recommend:** have `world.fork` register the copy through the bubblewrap provider when `bwrap` is available, and fall back to local otherwise. This adds namespace isolation with no new dependency. Record the isolation level in metadata instead of `cubeSandbox: "absent"`. Keep the entry open for a KVM provider, but it should not block release.

### DEBT-023 — Cognitive capabilities unbound to `.sea` (now unblocked)
- The blocker is gone: the remote-workspaces edits are committed and the tree is clean.
- Still unbound: the `case.*`, `criterion.freeze`, `world.*`, `verification.run`, `risk.assess`, `experiment.*`, `method.*` and `ui.focus.*` capabilities. The model has no Case, Criterion or WorldSnapshot entity.

**Recommend:** add the entities to the existing `.sea` model using the existing grammar, add `bindCapabilities` entries, regenerate the two output files, and update `BINDINGS.md`. This is mechanical work now.

### DEBT-024 — Cybernetic-navigation proof gaps (valid; reconstruction-only)
All items are in the DeepSeek-harness reconstruction, not the SDK.

**Recommend:** implement two items that are nearly done:
- Render the existing preflight Revise action in `ApprovalBar` (`src/ui/App.tsx:2025-2060`); the data already exists at `src/cognitive/preflight.ts:43`.
- Call the existing `capabilityNeighborhood` (`src/cognitive/affordance.ts:83-91`) where the tool catalog is built (`src/agents/agentCoding.ts:~156`).

For the rest (parallel search, budget estimates, worldHash recovery, plan deviation, extra method controls, Case-from-purpose UI, `criterion.revise`), record a decision in the spec dropping them from the proof's scope. The exit criterion explicitly allows this.

### DEBT-025 — Approval card can be a silent no-op (valid)
- `decideApproval` returns silently when no `tool-approval` continuation is open (`App.tsx:3669-3675`), and the buttons are never disabled. The 1.5 s refresh hedge is still at `src/ui/CognitiveFrame.tsx:119`, although DEBT-021 made it unnecessary.

**Recommend:** pass `openContinuations` (already in scope) to `ApprovalBar` and disable Reject/Allow until a `tool-approval` continuation exists. The plan-review card (~`App.tsx:2160-2200`) already follows this contract. Delete the 1.5 s hedge. For native WebMCP, state in the docs that it is verified only against a polyfill. That closes the actionable half.

### DEBT-026 — Remote execution world residual risks (valid)
- The version string is still `mtime(seconds):size` (`execution-ssh/src/index.ts:202`, `execution/src/command.ts:32`). The containment check is still check-then-use (`execution/src/posix.ts:41-70`).

**Recommend:**
- **Version:** both providers can already run commands. Build the version from `stat -c '%.9Y:%s:%i'` (nanosecond mtime, size, inode) through the existing command channel, and use it where the SFTP stat is used today. This catches same-second rewrites without hashing whole files. Add a same-size rewrite case to `execution/src/conformance.ts:77-80`.
- **Containment:** SFTP has no `openat`. Document it as accepted for trusted hosts the operator has enrolled, and keep it in the release notes.
- **Native Windows:** declare it unsupported for 1.0 unless someone runs the live gate there.

### DEBT-027 — Bun caches identical POSTs (valid, mitigated)
- Both mitigations and the regression test are in place (`protocol-connect-bun/src/index.ts:87,106-107`, `test/no-store.test.ts`).

**Recommend:** handle it with DEBT-017's Bun bump check. Nothing else to do.

### DEBT-028 — SIWC live sign-in pending (valid)
- There is no live evidence (`.agents/evidence/2026-10-11-provider-protocol-siwc.md:79`). The package is off only because nothing wires it; there is no explicit flag or doc.

**Recommend:** mark `provider-openai-oauth` as preview in its README and in release notes ("not validated against production"). The live sign-in is an operator task and cannot be delegated.

### DEBT-029 — No browser test for wizard protocol selection (valid)
- Every journey configures `openai-completions`. The wizard offers `anthropic-messages` (`src/ui/App.tsx:617,625`).

**Recommend:** add one case to the existing `validation/reconstructions/deepseek-harness/tests/journeys/A-first-use.spec.ts`. It should drive the dropdown to "Anthropic Messages", save, and assert that the `model.configured` event records `anthropic-messages`.

## Open questions

| # (old) | Verdict | Recommendation |
|---|---|---|
| 1. Dependency upgrades | **Still open; DomainForge text stale** | The product pin is 0.21.1, but the Phase 0 fixture (`compatibility/phase0/domainforge/package.json:8`) is still 0.19.0, and neither 0.21.1 nor the 0.19.0 claim has an evidence file. Bump the fixture to 0.21.1, re-run it with the goldens (see DEBT-002), and update the text. Cordis, Connect, RVF, RealityTrace (0.3.0) and aimock (1.43.0) pins are unchanged, so their recorded results still hold. |
| 2. Cordis lifecycle fit | **Answered, removed** | The conformance kit covers activation (`kernel-api/src/conformance/suites.ts:31`), dependency loss (`:456,486`), partial-setup rollback (`:292,395`) and reverse disposal (`:363`). It passed 39/39 on 2026-10-21. AK-002 is implemented. |
| 3. Ledger freeze (now #2) | **Still open; count stale** | The ledger has **81** requirements (not 77), all implemented and none blocked; `freeze_hash: candidate`. Close DEBT-004 by decision (above), then freeze. Freezing is your decision. |
| 4. SemanticPack (now #3) | **Still open** | There is no proof test and no release claim. Recommend stating in release notes that SemanticPack is unsupported in 1.0, then closing the question until an application needs it. |

The text of the remaining open questions was left unchanged. Update question 1's DomainForge sentence and question 2's requirement count when the actions above land.

## Other production-readiness findings (in scope)

1. **README Quick Start is wrong for new users** (`README.md:68`: `@0.1`, `--source`). Fix it alongside DEBT-016.
2. **`CURRENT_STATUS.md` is stale.** It reports SDK 0.5.0 across 45 packages, but the release manifest is at 0.6.1. Refresh it when the next release lands.
3. **Local `node_modules` doesn't match the lockfile** (DomainForge 0.19.0 installed vs 0.21.1 locked). Run `bun install`. Confirm CI installs with `--frozen-lockfile` so this can't happen there.
4. **Dangling-reference guard.** `scripts/check-substrate.ts:56,65` validates DEBT ids only for `blocked` requirements. Extend the same check to every `debt:` field in `requirements/ledger.yaml`, so each cited id must exist in `DEBT.md`. This makes future pruning of `DEBT.md` safe.
5. **Status vocabulary.** Several "Open" entries are really accepted limits (004, 005, 007, 022, 027). Using a status such as "Accepted limit (ref)" would make the remaining work list honest: 002, 012, 015, 016, 018, 020, 023, 025, 026, plus the operator tasks 028 and the ledger freeze.

## Suggested order to production

1. DEBT-016 + README (first-run path) · DEBT-015 (runtime under load) · DEBT-012 (E2E in CI)
2. DEBT-020 · DEBT-025 · DEBT-018 · DEBT-002 / open question 1 re-run
3. Decisions: close DEBT-004 → ledger freeze; SemanticPack unsupported; DEBT-024 scope
4. DEBT-026 version fix · DEBT-023 bindings · DEBT-029 · Bun bump check (017/027)
5. Operator: DEBT-028 live sign-in or preview label
