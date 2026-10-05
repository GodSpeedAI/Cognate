# Current status

**Status revision:** 36

**Stage:** CEP/world_ref migration Stage 8: execution, RealityTrace, evidence, settlement

**Summary:** A governed run's execution trace, evidence packet and settlement now cross to SEA-Forge as CEP envelopes. Evidence is an append-only ledger fact; settlement criteria are bound into the allow decision by hash; only an allow operation can settle. RealityTrace's own settlement stays a separate fact from SEA-Forge's.

**Verified:**
- bun run typecheck clean; just verify 78/78 on 3 of 3 serial runs
- just sea-forge-live: 22 pass, 0 fail, including the end-to-end governed-settlement test against a real sxr verify
- sea-rs just test 1170 passed, 0 failed at the Stage 8 commit

**Limits:**
- Only sxr verify records an exit code; other evidence sources have no derived direction
- AK-006 had one unexplained gate failure that did not reproduce
- The full bun test suite fails 68 to 78 tests in this environment; cause not investigated

**Next:** Stage 9: remaining boundaries (Context Kernel, Gauntlet, SWE_SEED, GodSpeed Agent); Cognate itself is unchanged by Stage 9

**Evidence:**
- .agents/evidence/2026-10-05-stage8-settlement.md
