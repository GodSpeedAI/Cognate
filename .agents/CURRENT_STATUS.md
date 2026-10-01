# Current status

**Status revision:** 27

**Stage:** CopilotKit reconstruction post-settlement follow-ups resolved: FU-1 (standard AG-UI tool-message resolution of remote-offer waits) and FU-3 (self-sufficient run-level CUSTOM payloads) implemented in packages/ag-ui with regression tests; all gates re-observed green

**Summary:** The two adapter follow-ups recorded at settlement are resolved under the primitive-repair rules, and the working tree is ready for the operator's commit. FU-1: the AG-UI adapter's tool-message resolve path now accepts both wire shapes — a full continuation id (frontend waits) or a bare remote id, which it addresses to the thread's current run's remote continuation (<runId>.wait.remote:<remoteId>) — so a standards-compliant AG-UI client completes a remote-offer round trip with no cognate extension; unknown ids still fail closed through the service's continuation lookup, and wire projection is unchanged so archived shapes stay valid. FU-3: run-level waits surface as CUSTOM events (AG-UI 1.0.0 has no interrupt event, and projecting a tool call for them would contradict the reference's own RUN_FINISHED-plus-payload characterization); their payloads now carry continuation id, type, kind, payload, runId and threadId, so a generic client resolves interrupts through the standard RunAgentInput.forwardedProps field without parsing rawEvent. Regression tests: packages/ag-ui/test/remote-offer.test.ts (generic client round trip via standard tool message — the exact flow that produced RUN_ERROR not_found before — plus payload self-sufficiency assertions) and a new protocol-suite test proving the standard path against the reconstruction's J-B surface; the protocol suite's runtime-interrupt test now asserts the enriched payload fields. FU-2 remains recorded (reference-side MCP leg needs a future pin with a locally executable surface — not actionable without inventing reference behavior). Observed after the changes: packages/ag-ui 23/0 across 7 files, copilot protocol suite 12/0/163, cognate journeys 12/0/239 with typecheck clean, persistence 5/0, architecture 45/0, just verify 78/78, DeepSeek Harness regression 37/0.

**Verified:** - FU-1: bun test ./packages/ag-ui → 23 pass / 0 fail across 7 files (new remote-offer.test.ts: standard tool-message round trip with bare toolCallId, TOOL_CALL_RESULT projection, run completion; frontend waits' exact-id path unchanged per inbound.test.ts)
- Protocol suite: bun test tests/protocol/ → 12 pass / 0 fail / 163 expect() — new 'generic AG-UI client completes the remote-offer round trip via the standard tool-message path (FU-1)' test and enriched runtime-interrupt payload assertions (FU-3)
- Full battery re-observed after the adapter changes, serial: cognate journeys 12/0/239 + typecheck exit 0; persistence 5/0/166; architecture 45/0/134; just verify exit 0, 78/78 gates (CG-AGUI-001..003 green with the changes); DeepSeek Harness regression 37/0/253
- parity-report.json/.md updated: FU-1 and FU-3 marked resolved with evidence paths and the resolving mechanism; gate 19 notes updated; checker exit 0 over cited paths
- One root typecheck failure caught and fixed during the work (agent fixture return-shape union) before any gate ran green-with-error

**Limits:** - FU-2 stays open by design: the reference-side MCP leg requires a future pin shipping a locally executable MCP-app surface; it must not be simulated
- The tolerant remote-id resolution addresses the thread's CURRENT run (listRuns latest); a tool message naming an id from an older run still needs the full continuation id — an accepted, documented bound
- Wire projection unchanged: bare remote ids remain what clients see on TOOL_CALL_START; only the resolve path became tolerant
- No commits made yet in revisions 25-27: all work sits uncommitted in the working tree on cognate/harness awaiting the operator's commit intent

**Next:** Commit the settled reconstruction and the adapter follow-ups (operator intent received this session): stage explicit paths only — validation/reconstructions/copilot/**, .agents/CURRENT_STATUS.*, .agents/evidence/2026-09-30-* and 2026-10-01-*, .agents/plans/copilot-reconstruction-remaining.md, scripts/check-substrate.ts, packages/client/{src,test}, packages/ag-ui/{src,test}, and the root lockfile — after checking .git/index.lock; never stage deepseek-harness, justfile, or scripts/harness.ts paths.

**Evidence:** - .agents/evidence/2026-10-01-copilot-r6-critic.md
- .agents/evidence/2026-09-30-copilot-protocol-suite.md
- .agents/evidence/2026-09-30-copilot-architecture-purity.md
- .agents/evidence/2026-09-30-copilot-persistence-suite.md
- .agents/evidence/2026-09-30-copilot-visual-parity.md
- .agents/evidence/2026-09-30-copilot-parity-report.md
- .agents/evidence/2026-10-01-copilot-mcp-open-ended.md

**Spec:** .agents/specs/software-design-spec-cognate.-frameworkmd

**Ledger:** requirements/ledger.yaml
