# CopilotKit reconstruction — R3 tests/protocol: AG-UI wire interop, no CopilotKit (gates 19/22) — 2026-09-30

Environment: Bun 1.4.0, Linux (WSL2). Scope: `validation/reconstructions/copilot/tests/protocol/`
(new) — the Phase 10 wire-compatibility suite of plan §R3. Nothing outside that directory and this
evidence file was created or modified; packages/**, the reconstruction application, and the
reference tree were read-only inputs. The reference stack was not booted; no fixed port was used
(the reconstruction server is started by the suite itself on port 0 with a throwaway data home);
no paid endpoint or external service is contacted.

## Gate command (green standalone from a cold start)

```sh
cd /home/sprime01/projects/cognate/validation/reconstructions/copilot && bun test tests/protocol/
```

| Command | Exit | Observed result |
| --- | --- | --- |
| `cd validation/reconstructions/copilot && bun test tests/protocol/` (run 1) | 1 | 10 pass, 1 fail — the fail was the suite's own archive path (ENOENT on the reference wire archive, a test bug), diagnosed from the error, fixed, and re-run. |
| Same command (run 2, clean) | 0 | **11 pass, 0 fail, 148 `expect()` calls**, 0.56 s. |
| Same command (run 3, clean) | 0 | **11 pass, 0 fail, 148 `expect()` calls**, 0.60 s. |

Per-test timings on the final run were 0.4–220 ms; the slowest is the purity graph scan (545
modules). Working tree stayed clean apart from pre-existing modifications owned by other
sessions; the tracked generated browser entry (`cognate/.generated/entry.tsx`) that the served
app rewrites at boot was verified byte-identical after runs.

## What the suite proves (Phase 10, settlement gates 19 and 22)

- **Interop without CopilotKit.** Standards-compliant AG-UI participants are connected directly
  to the real reconstruction endpoint (`cognate/src/server.ts` → `@cognate/ag-ui`
  `createAgUiHandler`, all journey agents registered): a hand-written SSE participant holding
  only the pinned `@ag-ui/core` schemas, and the official `@ag-ui/client` `HttpAgent`. No
  CopilotKit module is involved anywhere.
- **Every frame schema-valid.** The SSE client validates each received frame against the pinned
  `EventSchema` (1.0.0) and reports per-frame failures; all tests assert zero failures.
- **Pinned shapes, not invented ones.** The input test sends the reference application's own wire
  request (`reference/logs/runs/run-req-J-A-00.json`) verbatim — field set, tools, context,
  forwardedProps, state, message — after confirming it parses under `RunAgentInputSchema`.
- **Event classes and ordering**, asserted with index comparisons on the received stream:
  RUN_STARTED first / RUN_FINISHED last with `result.status` `completed`; TEXT_MESSAGE_START <
  CONTENT* < TEXT_MESSAGE_END with deltas reassembling exactly (J-A reply, J-K's
  `LIVE_RECOVERY_CHUNKS`, J-F's continuation message); STATE_SNAPSHOT before TEXT_MESSAGE_* (J-K);
  TOOL_CALL_START < TOOL_CALL_ARGS < TOOL_CALL_END < RUN_FINISHED(waiting) (J-F frontend tool,
  J-B remote capability); TOOL_CALL_RESULT after the END of the same tool call, proven via the
  durable `rawEvent.cognate.position` each projected event carries (J-B: the RESULT's durable
  position strictly greater than the END's, across the two streams); STATE_SNAPSHOT anchor then
  STATE_DELTA on a cursor reconnect, with the RFC 6902
  patch equality-checked; the J-G runtime interrupt as CUSTOM `cognate.unsupported_interaction`
  carrying `value { type: "run-interrupt", kind: "interrupt", payload: { reason } }`, then
  RUN_FINISHED `waiting_unsupported`, then resume → completed and cancel → RUN_ERROR
  `code: "cancelled"`. Durable provenance (`rawEvent.cognate { eventId, position, runId }`) is
  asserted for every event that carries it.
- **CopilotKit absence, mechanically.** `modulegraph.ts` walks the transitive static import graph
  of the served entry + the suite's entries + the AG-UI protocol packages
  (Bun.Transpiler.scanImports + Bun.resolveSync; unresolved specifiers are still checked against
  the regex, so an uninstalled import cannot hide). Observed scan: 545 modules, 0 unscannable,
  0 hits. Non-vacuity is asserted three ways: the scan must have visited the server entry, the
  `@cognate/ag-ui` adapter source, and the `@ag-ui/core` dist; and the scanner is run live
  against a synthetic graph containing an `@copilotkit/react-ui` specifier and a
  `copilotkit`-named module, which it flags. The reconstruction app manifest declares no
  CopilotKit dependency.

## Findings (not fixable inside this unit's scope; no adapter change was made)

- **Remote-offer tool calls cannot be resolved through the AG-UI tool-message path.** For a
  frontend-capability wait (J-F) the adapter projects `toolCallId = continuationId`, so the
  standards-compliant "send a tool message" resolve works. For a remote-offer wait (J-B) it
  projects `toolCallId = <remoteId>` (e.g. `apply-browser-selection`) while the continuation id
  is `<runId>.wait.remote:<remoteId>`; a tool message naming the tool call therefore resolves
  nothing and surfaces as RUN_ERROR `not_found` (observed during probing). The suite resolves the
  J-B arc through the endpoint's documented `forwardedProps.cognate.resolve` extension using the
  continuation id the endpoint itself exposed in `RUN_FINISHED.result.continuations`, which works.
  A general AG-UI client that never learns that extension cannot complete a remote-offer round
  trip by the standard flow — an adapter-level gap for `packages/ag-ui` to consider, not a
  protocol-suite defect.
- The suite resolved `@ag-ui/*` (protocol-only packages, allowed by the prompt) from the existing
  install under `packages/ag-ui` via resolved-path dynamic imports, because `tests/protocol/` is
  outside every package.json workspace and installing anything was out of scope.

## Files created

- `validation/reconstructions/copilot/tests/protocol/README.md` (gate command + scope)
- `validation/reconstructions/copilot/tests/protocol/agui-modules.ts`
- `validation/reconstructions/copilot/tests/protocol/sse.ts`
- `validation/reconstructions/copilot/tests/protocol/modulegraph.ts`
- `validation/reconstructions/copilot/tests/protocol/protocol.test.ts`
- `validation/reconstructions/copilot/tests/protocol/purity.test.ts`

---

## Addendum 2026-09-30 — independent critic re-run of the purity scan

An independent re-run observed **522 modules**, not 545: the count varies with install state.
The suite asserts only >50 modules and 0 unscannable, so no claim above rests on the exact
figure.
