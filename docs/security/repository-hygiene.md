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

- **Historical exposure remains in the live repository** (private paths only; no secrets).
- All refs were scanned (branches, tags, remote-tracking, 49 local checkpoint refs, working tree, staged index — no stashes, no submodules, no LFS objects).
- Isolated rehearsal: mirror clone → `git filter-repo --replace-text` (`/home/<user>/projects/<repo>` → `~/projects/<repo>`; remaining `/home/<user>` → `~`; bare developer username → neutral placeholder) → 407/408 commits rewritten (one local-only checkpoint commit became empty and was pruned, as expected) → **0 residual private paths and 0 residual username occurrences** by `git grep` over all rewritten commits; TruffleHog and Gitleaks re-scans return only the known synthetic/FP findings.
- Applying the rewrite changes every commit hash: open PRs, downstream clones, the second local worktree, and release tooling must be coordinated. Exact commands and the rollback procedure are recorded in the approval package (see *Outstanding actions*).

## Validation

Adversarial suite (isolated throwaway repository, synthetic values only) — **15/15 pass**:
clean commits pass; high-entropy synthetic credential blocks; private home path blocks with redacted output; portable paths and safe placeholders pass; missing gitleaks fails closed with an install message; simulated scanner crash (exit 70) blocks; secret present only in the staged index is detected; clean staged version commits despite an unstaged leak; other hook types still execute; `--range` mode (CI path) detects a leak between refs with redaction; repeated setup is idempotent; filenames with spaces are guarded; Windows-escaped and `file://`-URI private paths block. Hook latency on a small staged set: 0.38–0.68 s.

CI: `security.yml` parses (YAML-validated; actionlint unavailable locally). Actual enforcement must be observed on the first CI run after merge — recorded as a limitation, not assumed.

Regression: `just verify` exit 0 (81/81 ledger gates); `just typecheck` exit 0; `just check` substrate check 81/81; copilot protocol gate 12/12; modified JSON/JSONL files parse; modified shell script passes `bash -n`.

## Coverage boundaries and residual uncertainty

- Scanner results cover locally reachable history and the working tree. GitHub-hosted artifacts (cached PR refs not fetched locally, archived releases, forks) were not scanned.
- Gitleaks' git mode reports a commit count lower than `git rev-list --all --count` (dedup/ref-coverage difference); TruffleHog's all-refs scan was used as the cross-check.
- TruffleHog ran **without** network verification (`--no-update` offline posture in CI and locally); no candidate was confirmed live against a provider. Given all findings were synthetic or false positives, this does not change the verdict.
- The private-path guard is pattern-based; novel encodings (double-encoding, exotic quoting) may evade it. It complements, and is complemented by, the secret scanners.
- CI enforcement is configured but not yet observed in a live run.

## Outstanding actions

1. **Commit the remediation and prevention changes** (operator intent required by repository policy; no commit was made).
2. **Approve or decline the history rewrite.** The rehearsed procedure, affected-ref inventory, migration steps (re-clone or rebase, PR rebases, worktree refresh), and rollback plan are held outside the repository in the audit workspace; on approval the rewrite is applied from that workspace, re-verified, and force-pushed with coordination for any open PRs. Rewriting history is not a substitute for rotation — no rotation is currently indicated.
3. **Enable GitHub-native secret scanning and push protection** (currently disabled on a public repository) — requires repository-admin authorization; assessed as a valuable additional layer behind the local controls.
4. After the first PR, confirm the `security` workflow runs and enforces.
5. Optional: delete the 49 local-only Cline checkpoint refs once the rewrite lands (they hold pre-rewrite snapshots).

*Acceptance criteria:* no unresolved secrets or actionable private-path exposures in current tracked content (met); historical exposure remediated in a validated isolated rewrite pending application (documented); pre-commit protection and private-path detection operational and adversarially validated (met); CI protection configured, enforcement to be observed (documented); no unrelated functionality broken (typecheck, substrate check, and touched gates pass).
