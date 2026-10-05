# Current status

**Status revision:** 35

**Stage:** CEP/world_ref migration Stage 7: governance escalation, durable continuation, revalidated resume

**Summary:** An escalated capability call inside a run now waits durably instead of failing. The escalation is recorded once (a replay never opens a second approval), the run waits on a governance-approval continuation that expires with the approval window, and any resume only triggers revalidation: SEA-Forge re-evaluates policy and checks the approval is approved, unexpired, unused and for exactly this operation. A rejected, expired or used approval closes the wait and fails the run; the provider never runs before an allow. Runtime.pollApprovals() (optionally timed via governance.approvalPollMs) resumes approved waits idempotently. Escalated actions (startRun and similar) are still refused, naming the approval.

**Verified:**
- bun test packages/runtime-bun: 94 pass, 0 fail (+7 scripted-authority escalation tests); just sea-forge-live: 17 pass, 0 skipped (9 live against a real sea-forge-server including approval by a different identity, single use, a refused unapproved poke, rejection)
- just verify 78/78 on 3 of 3 serial runs; tsc exit 0
- Live: requester's own identity cannot approve; an authorized different identity can; a hand-made resume without approval is revalidated and refused at SEA-Forge, the run fails closed

**Limits:**
- Escalated actions (startRun, continuation resume, etc.) are refused rather than waited on
- Crash window: if the process dies after the approval is consumed but before the invocation is recorded, the replay is refused (single use); the provider may have run once. At-most-once authority, not exactly-once effect
- pollApprovals is manual unless governance.approvalPollMs is set; nothing sets it by default
- Cognate approvals live in a separate ledger stream and do not appear in SEA-Forge's workbench approval inbox
- AK-006 flake (one unexplained failure earlier) and the environment-dependent full-suite failures remain uninvestigated

**Next:** Stage 8: execution -> RealityTrace -> evidence -> settlement

**Evidence:**
- .agents/evidence/2026-10-05-stage7-escalation.md
