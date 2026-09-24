# M2 kernel — observed gates

Environment: Bun 1.4.0, cordis 4.0.0-rc.10, Linux x64 (WSL2). Commands run by the orchestrator from the repository root.

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | `bun test ./packages/kernel-cordis/test/lifecycle.test.ts` with new kit case | 6 pass, 1 FAIL before fix | Orchestrator review found a timed-out activation leaked effects registered before the hang (Cordis `dispose()` waits on a hung `apply()`); also an uncleared 30 s timer per activation. |
| 2026-09-24 | `bun test ./tests/properties/kernel.property.test.ts ./packages/kernel-cordis ./tests/architecture` ×3 after fix | 50 pass, 0 fail each run | CG-KRN-001..006 (37 conformance tests across contract, lifecycle, effects, dependencies, scopes, authority), CG-KRN-007 (only kernel-cordis imports cordis; no engine type exported), CG-KRN-008 (fast-check: reversibility 60 runs, dependency closure 50, scope isolation 60, disposal idempotence 60) |

Limits: see ADR-0001 addendum. The adapter, not Cordis, owns eligibility, scope visibility for dynamic ids, ordered disposal, aggregation, retry, and timeout (DEBT-005). Property tests observe state after a 5 ms settle; they prove eventual closure, not instantaneous closure.
| 2026-09-24 | new authority-suite case "the caller's tenant reaches both the policy and the handler" | 4 pass, 1 FAIL before fix | Found while reviewing the Harness profile: HandlerContext.tenant was the kernel's own tenant, so tenant-scoped capabilities (e.g. `storage.kv`) could not partition by caller; the runtime substituted the tenant only for policy. Contract revision: `InvocationContext.tenant` (optional, defaults to the kernel tenant) flows to policy and handler; runtime passes the caller's tenant explicitly. |
| 2026-09-24 | `bun test ./packages/kernel-cordis ./tests/properties/kernel.property.test.ts ./packages/runtime-bun` after revision | 70 pass, 0 fail | Kernel conformance (38), properties, runtime service kit and cognition. |
