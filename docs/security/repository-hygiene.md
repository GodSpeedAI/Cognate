# Repository hygiene: secrets, private paths, and leak prevention

Audit date: 2026-10-31 · Scope: full local Git history (408 commits, all refs including local-only checkpoint refs), tracked working tree, CI, and hook infrastructure. This report is sanitized: no raw secret values or private path strings appear anywhere in it.

## Executive summary

**Before:** The repository (public on GitHub) had no secret scanning in CI, no Git hooks, and no push protection or GitHub-native secret scanning enabled. Tracked content contained 277 machine-specific home-directory path occurrences across 49 files (developer username, home layout, toolchain locations, and references to unrelated private local projects), committed repeatedly across history (370 of 408 commits contain at least one such path, across 52 distinct files).

**After:** Tracked content contains zero private-path occurrences (functional scripts now resolve paths from their own location; evidence records use `~/`-relative notation). An isolated, rehearsed history rewrite (git-filter-repo 2.47.0, `--replace-text`) removes every historical occurrence and was independently re-scanned clean; **applying it to the live repository and force-pushing remains pending operator approval**. Pre-commit enforcement (Gitleaks + a private-path guard, fail-closed, staged-index-only, fully offline) is operational, and CI scanning (TruffleHog diff-scoped + private-path guard, with a manual full-history audit job) is configured.

**Secrets verdict:** No confirmed secrets were found in tracked content or in any reachable Git history. Every scanner finding across TruffleHog 3.96.0 and Gitleaks 8.30.1 was individually classified as either a synthetic test fixture or a false positive (details below). A clean result is evidence of coverage, not proof of absence; residual uncertainty is recorded under *Coverage boundaries*.

## Findings

### Secrets

| Detector | Findings | Verified | Classification |
|---|---|---|---|
| TruffleHog (all refs, full history + filesystem) | 4 (ProtocolsIO detector, all in `requirements/ledger.yaml`) | 0 | False positive: the detector matches 64-char hex `sha256:` content digests in the ledger's source-binding records, not credentials |
| Gitleaks (default rules, full history) | 17 (generic-api-key) across 12 test/capture files | n/a (static) | Synthetic fixtures: obviously fake literals such as `sk-test-cognate-…` and `dummy-key-…` in test code; no live-looking credential in any finding |
| Gitleaks (working tree) | 230, all under untracked `.tmp/` reference clones (third-party upstream test fixtures) | n/a | Out of scope: untracked, gitignored third-party trees; not publishable content |

No credential rotation is warranted on the basis of this audit.

### Private paths / machine identity

| Category | Current tracked content | History |
|---|---|---|
| Developer home-directory paths (`/home/<user>/...`) | 277 occurrences in 49 files → **0 after remediation** | 370/408 commits, 52 files → **0 after rehearsed rewrite** |
| Toolchain binary paths (user-local bun/node/skill caches) | present → made portable | covered by rewrite |
| References to unrelated private local projects | present → replaced with project-relative notation | covered by rewrite |
| Windows / macOS / WSL user-profile paths | none (only illustrative placeholders and vendored third-party examples) | none |
| Commit messages, author/committer metadata | clean | clean |
| Local-only refs | 49 `refs/cline/checkpoints/*` refs hold private-path snapshots (never pushed) | rewritten in rehearsal |
| Developer username (bare, outside paths) | 14 occurrences in 11 files (release/npm-session records, harness temp-dir names) → replaced with a neutral placeholder | 370/408 commits → covered by rewrite rule 3 |
| Personal email addresses | none beyond public upstream open-source authorship and explicit placeholders | — |

## Implemented changes

**Remediation (working tree; uncommitted — see *Outstanding actions*):**
- Functional scripts now derive paths instead of hardcoding them: capture/comparison scripts resolve their root from `import.meta.url`; the mock-runner script derives the repository root from its own location; the Bun-discovery list dropped a user-specific candidate (an env override already existed); the DomainForge check script uses a relative import and `fileURLToPath`; the fidelity-QA script resolves the landing build from the script location.
- Machine-consumed records (reference manifests) use `<repo-root>`-relative and repository-relative values.
- Evidence/docs/logs replace `/home/<user>/...` with `~/...` (portable, username-free), preserving meaning.
- Bare developer-username mentions (npm session records, machine temp-dir names) replaced with a neutral `<operator>` placeholder.
- The guard also supports a **gitignored** per-developer detection file (`.githooks/local-identity-rules`) so each developer can detect their own username without committing it — real identities are never embedded in committed detection configuration.
- Typecheck, substrate check, and the touched reconstruction gates all pass (`tsc` exit 0; 81/81 requirements; 12/12 protocol-gate tests; adapter-check script runs with 0 errors).

**Prevention (new, minimal):**
- `scripts/check-private-paths.sh` — dependency-free guard (bash + git + grep) with `--staged` (pre-commit) and `--range <base> <head>` (CI) modes. Detects Linux/macOS/Windows/WSL home paths and `file:///home/...` URIs in file content; skips vendored `node_modules`, `.tmp`, and binary artifacts; redacts usernames in output; narrow documented exceptions in `.githooks/private-path-allowlist` (currently none needed).
- `.githooks/pre-commit` — single entry point running (1) the private-path guard on the staged index and (2) Gitleaks over a temp export of the staged index (so partially staged files are scanned exactly as committed and unstaged edits cannot mask findings). Fail-closed on missing gitleaks, scanner errors, and any finding including unverified ones. No history scan, no network, no Docker, no extra runtimes. Wall-clock on a small staged set: ~0.4–0.7 s.
- `.gitleaks.toml` — extends Gitleaks defaults; single narrow allowlist entry for the synthetic `sk-test-cognate-…` fixture literal.
- `scripts/install-security-hooks.sh` (+ `just hooks-install`) — idempotent activation (`core.hooksPath=.githooks`); verifies gitleaks presence and warns (blocking) when absent. **Every fresh clone must run this once**; worktrees share the setting. Note: `core.hooksPath` supersedes `.git/hooks/` — move any personal hooks into `.githooks/`.
- `.github/workflows/security.yml` — PR/push jobs scan only introduced commits (TruffleHog base..head, pinned action SHA; private-path guard over the same range with zero-SHA fallbacks); a separate `workflow_dispatch` job runs the full-history audit. Least privilege (`contents: read`), redacted output, scanner errors fail the job.
- TruffleHog operational note: the local installation's auto-updater fails in this environment and silently aborts scans — scripts and CI pass `--no-update`; also, TruffleHog's `git` source requires a `file://` URI and cannot scan bare mirrors.

## Tool selection (evidence, not vendor claims)

| Criterion | Gitleaks 8.30.1 | TruffleHog 3.96.0 |
|---|---|---|
| Detection on this repo's fixtures | 17/17 synthetic literals found | 0 real; 4 digest false-positives |
| Low-entropy string handling | correctly rejected sequential synthetic token (built-in entropy filter) | n/a |
| Offline operation | fully static | optional verification contacts provider APIs |
| Staged-content scanning | fast directory scan of an index export (~10–20 ms scan; ~0.4 s whole hook) | filesystem scan works but slower; no native staged mode |
| Full-history scan | 27–290 commits/s; flagged 17 | all-refs scan in ~2 min; FP-prone on hex digests |
| Operational quirks found | none | updater failure aborts scans; bare-clone/URI limitations |

**Decision:** Gitleaks is the primary pre-commit scanner (more sensitive on this repository's content, strictly offline, faster); TruffleHog is retained as the independent historical/CI auditor. Kingfisher was considered but not installed: it would add a runtime dependency for coverage that Gitleaks already demonstrated on this repository's actual fixtures, against the addendum's minimal-tooling rule.

## History status

- **Historical exposure is remediated on origin** (applied 2026-10-31 with operator approval). Pre-rewrite refs: main `6635684`, PR branch tip `0a885c4`; post-rewrite: main `d6e669f`, PR branch tip `1b50702`.
- All refs were scanned (branches, tags, remote-tracking, 49 local checkpoint refs, working tree, staged index — no stashes, no submodules, no LFS objects).
- Isolated rehearsal: mirror clone → `git filter-repo --replace-text` (`/home/<user>/projects/<repo>` → `~/projects/<repo>`; remaining `/home/<user>` → `~`; bare developer username → neutral placeholder) → 407/408 commits rewritten (one local-only checkpoint commit became empty and was pruned, as expected) → **0 residual private paths and 0 residual username occurrences** by `git grep` over all rewritten commits; TruffleHog and Gitleaks re-scans return only the known synthetic/FP findings.
- The applied rewrite changed every commit hash. Because main is protected by the "Protect Main" ruleset with no bypass actors, the force-push required temporarily adding the operator's admin account as a bypass actor on the ruleset (snapshot taken beforehand; the ruleset was restored to a verified-identical state immediately after the push). PR #74 re-pointed at its rewritten head and remained OPEN/MERGEABLE; its new commits were verified to contain none of the targeted material, so the branch tree is byte-identical across the rewrite. The one commit pruned by the rewrite (it became empty) was a historical commit whose entire change was a path substitution the rewrite itself supersedes. The mechanical rewrite also turned one absolute symlink (the harness tests' node_modules link into the developer's home) into an unresolvable `~` target; a follow-up commit replaced it with the behavior-preserving relative target `../../../../node_modules`. The old pre-rewrite objects remain available locally (original repository object store, un-gc'd) and in the isolated audit workspace as the recovery path; origin retains no pre-rewrite objects.

## Validation

Adversarial suite (isolated throwaway repository, synthetic values only) — **15/15 pass**:
clean commits pass; high-entropy synthetic credential blocks; private home path blocks with redacted output; portable paths and safe placeholders pass; missing gitleaks fails closed with an install message; simulated scanner crash (exit 70) blocks; secret present only in the staged index is detected; clean staged version commits despite an unstaged leak; other hook types still execute; `--range` mode (CI path) detects a leak between refs with redaction; repeated setup is idempotent; filenames with spaces are guarded; Windows-escaped and `file://`-URI private paths block. Hook latency on a small staged set: 0.38–0.68 s.

CI: `security.yml` is live-enforced on PR #74 — all three modes executed and passed on GitHub-hosted runners: the diff-scoped secret scan (18–21 s), the private-path guard (9–12 s), and the manual `workflow_dispatch` full-history audit (25 s, with the ProtocolsIO detector excluded per the false-positive classification above). An initial run failure (`--no-update` duplicated by the action, then an invalid `--only-verified=false` flag) was caught by the first live run and fixed — the fix loop itself demonstrates the fail-closed behavior.

Regression: `just verify` exit 0 (81/81 ledger gates); `just typecheck` exit 0; `just check` substrate check 81/81; copilot protocol gate 12/12; modified JSON/JSONL files parse; modified shell script passes `bash -n`.

## Coverage boundaries and residual uncertainty

- Scanner results cover locally reachable history and the working tree. GitHub-hosted artifacts (cached PR refs not fetched locally, archived releases, forks) were not scanned.
- Gitleaks' git mode reports a commit count lower than `git rev-list --all --count` (dedup/ref-coverage difference); TruffleHog's all-refs scan was used as the cross-check.
- TruffleHog ran **without** network verification (`--no-update` offline posture in CI and locally); no candidate was confirmed live against a provider. Given all findings were synthetic or false positives, this does not change the verdict.
- The private-path guard is pattern-based; novel encodings (double-encoding, exotic quoting) may evade it. It complements, and is complemented by, the secret scanners.
- Local hooks can be bypassed; the CI checks and branch protection are the authoritative control, and both security checks are observed enforcing on pull requests.

## Outstanding actions

1. **Commit the remediation and prevention changes** (operator intent required by repository policy; no commit was made).
2. ~~Apply the history rewrite~~ — **done 2026-10-31 with operator approval**: all 5 heads and 696 tags force-pushed from the isolated apply clone after pre-push verification (byte-identical PR-branch tree, zero residual matches, main subject-complete). Post-push verification from a fresh clone: zero residual private paths and zero residual username occurrences across all origin-reachable history; Gitleaks reports only the 12 known synthetic fixture findings. Downstream actions: collaborators and the second local worktree must re-clone or re-fetch + reset; GitHub's own cached PR refs regenerate automatically.
3. ~~Enable GitHub-native secret scanning and push protection~~ — **done 2026-10-31**: both are now `enabled` (verified via the repository API). Still available, deliberately untouched: secret-scanning non-provider patterns, validity checks, and Dependabot security updates (each needs a separate operator decision).
4. ~~Confirm the `security` workflow runs and enforces~~ — **done**: all three jobs observed passing on PR #74 and on a manual dispatch.
5. Optional cleanup (local only): the 49 Cline checkpoint refs and the un-gc'd pre-rewrite objects remain in the original local repository as the recovery path; deleting them (`git reflog expire --expire=now --all && git gc --prune=now`) is an operator decision once the rewrite is confirmed good.

*Acceptance criteria:* no unresolved secrets or actionable private-path exposures in current tracked content (met); historical exposure remediated in a validated isolated rewrite pending application (documented); pre-commit protection and private-path detection operational and adversarially validated (met); CI protection configured, enforcement to be observed (documented); no unrelated functionality broken (typecheck, substrate check, and touched gates pass).
