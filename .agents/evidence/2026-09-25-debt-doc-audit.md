# DomainForge and RealityTrace debt documentation audit

Observed on 2026-09-25 UTC in this workspace. This record separates prior M6 proof from today's checks; a failed local gate does not erase an earlier passing run.

| Command | Outcome | Scope |
| --- | --- | --- |
| `just status` | Revision 2 was the latest snapshot before this audit. | The human and YAML views still described adapters and profiles as future work. |
| `just gate CG-SEM-002` | 7 pass, 0 fail. | Pinned DomainForge identity, including stable derived Flow identity and typed missing-reference/syntax results. This meets DEBT-001's adapter exit criterion, but does not establish exhaustive diagnostic-message coverage for DEBT-002. |
| `just gate CG-RT-002` | 0 pass, 1 fail: `sxr repo enroll` reported `Read-only file system (os error 30)`. | The local SXR invocation did not reach the delivery assertions. Prior real-CLI proof remains in [M6 evidence](m6-semantics-evidence.md); structured CEP correlation remains unproven (DEBT-009). |
| `just verify` before ledger proof-path correction | Stopped at `check`: CG-PRF-002 named `profiles/copilot/test/copilot.test.ts`, while the file is `.tsx`. | Existing candidate-ledger path typo; corrected in this documentation update. |
| `just verify` after ledger proof-path correction | `check`, typecheck, and proof-routing tests passed; 52/66 implemented gates passed, 14 failed. | Current workspace regression baseline is red. Failures: AK-004, AK-010, CG-WIR-002..004, CG-RT-002, CG-UI-003, CG-AGUI-001..003, CG-MCP-001, CG-A2A-001, CG-PRV-001, CG-ARC-001. Causes beyond the observed SXR filesystem error were not investigated here. |

The [M6 adapter record](m6-semantics-evidence.md) reports three earlier passing runs of both adapter suites against Bun 1.4.0, DomainForge 0.16.0, and locally built sxr f7fb1c3. It proves the scoped behavior stated there, not AK-006's structured correlation requirement or a portable SXR setup.

## RealityTrace release reported later on 2026-09-25 UTC

The operator reported publishing RealityTrace. `git -C /home/sprime01/projects/sxr show -s realitytrace-v0.2.0` resolves the local tag to commit `6966fa4`. At that tag, `sxr-cli/Cargo.toml` declares crate and binary `realitytrace` version 0.2.0. The tagged release workflow invokes `scripts/publish-crates.sh` for crates.io and has no binary-asset upload step. GitHub's release API was unreachable from this workspace, so remote publication, assets, and a clean `cargo install` were not independently verified. Cognate still points its fixture at the locally built `sxr` binary by default; no released-CLI gate run was made in this update.
