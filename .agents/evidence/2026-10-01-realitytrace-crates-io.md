# RealityTrace 0.3.0 from crates.io: observed

| Check | Result |
|---|---|
| `cargo search realitytrace` | `realitytrace = "0.3.0"`, `sxr-core = "0.3.0"` published. |
| `cargo install realitytrace --version 0.3.0 --locked --root .tmp/realitytrace` | Installed in 1m29s; `realitytrace --version` = `realitytrace 0.3.0`. `.tmp/` is git-ignored. |
| `bun scripts/gate.ts --implemented` before / after install | 68/78 -> 70/78: AK-006 and CG-RT-002 now PASS (they failed with "SXR binary not found"). |
| Scoped `bun install` in each `compatibility/phase0/*` dir | AK-002/005/007/009/011 now pass; 75/78 overall. (Install-induced lockfile rewrites from Bun 1.3.14 were reverted, not committed.) |
| `tests/architecture/invariants.test.ts` (CG-ARC-003) | It required `--tag realitytrace-vN` in the justfile; updated to require `cargo install realitytrace --version N --locked` (still an exact pinned release, never a path/source dependency). |
| Remaining 3 failures | AK-004: Bun 1.3.14 segfault (repo targets 1.4.0). AK-010, CG-E2E-001: Playwright chromium build `chromium_headless_shell-1243` absent from `/opt/pw-browsers`. Environmental, unrelated to RealityTrace. |

Changed: `tests/architecture/invariants.test.ts`, `justfile` (`setup-realitytrace`), `docs/reference/commands-and-configuration.md`, `docs/evidence.md`, ADR-0007 addendum, DEBT-010 follow-up. The earlier note that the crates.io upload was blocked (2026-09-25-realitytrace-correlation.md) is historical.
