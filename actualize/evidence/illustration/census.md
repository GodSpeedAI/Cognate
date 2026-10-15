# Parts census: verified anchors (Phase 1)

Verified by `landing/scripts/verify-sources.ts` (14 excerpts, 16 edge lines, PASS). Full SHAs: Cognate `dd13c8422220ecbac61a92bdd90829218844bc2e`; Workbench main `d208cd0491d5d76839ed4dedbababc589383ad09`; Workbench expert-teams branch `fdc709b9ccff47d52619185f6e9e03fdd9ae8d08`.

## Changes vs the spec

- **C-11 MEMORY replaced by C-11 SANDBOX WORLDS.** Nothing in the code is a memory of what agents can recall. `src/capabilities/cognitive.ts` provides fork, verify, derive and a human-only settle over disposable execution worlds. The lines cited are `cognitive.ts:8-11`.
- **L2 "MEMORY AGENT" changed to COGNITIVE AGENT.** `src/server.ts:220` registers `[agentConfigAgent, agentCodingAgent, agentCognitiveAgent]`. Labels are CONFIG, CODING and COGNITIVE.
- **C-03 anchor.** `executionWorlds.ts:163` (a single `$HOME` probe line) replaced by `:27-29`, the `WorldConnection` ssh/wsl union.
- **C-05 anchor.** `agentCoding.ts:527-529` (the `waitFor` human-approval step) is the excerpt. `approvalGate.ts:52-59` is the second source.
- **C-06 anchor.** `contract.ts:5,51` (two function signatures) replaced by `:14-26`, the goal, skills and authority checks.
- **C-07 anchor.** `ledger.ts:163-188` (a doc comment) replaced by `:174-186`, `reviewReadiness`.
- **C-08 anchor.** `workbench.ts:279-310` replaced by `:283-286`, workflow instantiation checks.
- **C-09 anchor.** `skillOs.ts:1` (an import) replaced by `workbench.ts:315-319`, skill.register.
- **C-10 anchor.** `sessionTrace.ts:78` (a declaration) and `store.ts:14-23` replaced by `store.ts:18-23`. The store is Postgres or embedded pg0, so the label "Event log · PostgreSQL" is kept with that qualification.
- **C-12 anchor.** `server.ts:403-422` narrowed to `:412-415` (Connect RPC route), plus `:403-405` as the second source.
- **C-13 anchor.** `service.ts:467` (one signature line) extended to `:467-469`. Branch only.
- **C-14 anchor.** `service.ts:100` (occurrenceId) and `evaluator.ts:200` replaced by `service.ts:269-273` (the dispatch contract) and the `evaluator.ts:199` edge. Branch only.
- **Label changes.** "EXPERTS & TEAMS" and "SCHEDULES" kept. Cartridge labels are shown in title case, following R4 (uppercase only for part numbers).

## Parts (kind, branch)

| Part | Label | Kind | Excerpt source |
|---|---|---|---|
| C-01 | MODELS | both | wb `src/components/providerRegistry.ts:3-11` |
| C-02 | TOOLS | workbench | wb `src/capabilities/tools.ts:164-177` |
| C-03 | WORKSPACE | both | wb `src/capabilities/executionWorlds.ts:27-29` |
| C-04 | PERMISSIONS | cognate | cognate `packages/kernel-cordis/src/lease.ts:56-68` |
| C-05 | APPROVALS | both | wb `src/agents/agentCoding.ts:527-529` |
| C-06 | WORK | workbench | wb `src/workbench/contract.ts:14-26` |
| C-07 | EVIDENCE | workbench | wb `src/workbench/ledger.ts:174-186` |
| C-08 | WORKFLOWS | workbench | wb `src/capabilities/workbench.ts:283-286` |
| C-09 | SKILLS | workbench | wb `src/capabilities/workbench.ts:315-319` |
| C-10 | HISTORY | both | wb `src/store.ts:18-23` |
| C-11 | SANDBOX WORLDS | workbench | wb `src/capabilities/cognitive.ts:8-11` |
| C-12 | INTERFACES | workbench | wb `src/server.ts:412-415` |
| C-13 | EXPERTS & TEAMS | workbench, branch | wb@fdc709b `src/experts/service.ts:467-469` |
| C-14 | SCHEDULES | workbench, branch | wb@fdc709b `src/schedules/service.ts:269-273` |

Layers: L1 Interface (capture e2e-03). L2 Agents (CONFIG, CODING, COGNITIVE). L3 Capabilities (C-01…C-14). L4 Durable record (ledger plate, Event log · PostgreSQL). Keyframe shows C-01…C-12 only. C-13 and C-14 join in Sequence G.

## Dependency edges (16, all verified)

`from` depends on `to`. Evidence is `repo@sha:path:line`.

1. C-02 → C-03, requires: wb `src/capabilities/tools.ts:177` (world chosen per call)
2. C-02 → C-04, requires: wb `src/capabilities/tools.ts:30` (`lease.invoke`)
3. C-04 → C-10, stores in: cognate `packages/kernel-cordis/src/lease.ts:67` (emits the invocation decision)
4. C-05 → C-04, invokes: wb `src/agents/agentCoding.ts:423` (`authority.check`)
5. C-05 → C-10, stores in: wb `src/agents/agentCoding.ts:527` (durable `waitFor`)
6. C-06 → C-10, stores in: wb `src/capabilities/workbench.ts:136` (`workbench.task.created`)
7. C-07 → C-06, requires: wb `src/workbench/ledger.ts:175` (acceptance criteria input)
8. C-07 → C-10, stores in: wb `src/capabilities/workbench.ts:195` (evidence recorded)
9. C-08 → C-10, stores in: wb `src/capabilities/workbench.ts:279` (workflow defined)
10. C-09 → C-10, stores in: wb `src/capabilities/workbench.ts:317` (capability registered)
11. C-11 → C-03, requires: wb `src/capabilities/cognitive.ts:3` (sits on the execution package)
12. C-11 → C-10, stores in: wb `src/capabilities/cognitive.ts:4` (event log records facts)
13. C-12 → C-10, invokes: wb `src/server.ts:413` (Connect handler for the runtime service)
14. C-13 → C-10, stores in: wb@fdc709b `src/experts/persistence.ts:208` (manifest over the runtime service)
15. C-14 → C-13, invokes: wb@fdc709b `src/schedules/evaluator.ts:199` (`team.cancel`)
16. C-14 → C-13, stores in: wb@fdc709b `src/schedules/service.ts:49` (shared state thread)

C-01 has no verified cartridge-to-cartridge edge. Its use is by the coding agent (`agentCoding.ts:128`, `model.generate`), and the agent layer is not a cartridge. No edge is drawn for it.

Edge kinds are: `invokes`, `requires`, `stores-in`. "stores-in" means the source writes to or reads from the target's durable state. Edge 1 and edge 11 cite source comments or call sites, not runtime behaviour.

## Not used

`actualize/evidence/recon-software/workbench.md` and `cognate-core.md` were consulted for context but were not re-read in full. Anchors were verified directly in the pinned source. `journey-and-states.md` and `narrative-beat-map.md` were not read in Phase 1.
