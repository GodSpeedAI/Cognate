# tests/protocol — AG-UI wire interop with no CopilotKit present

CopilotKit reconstruction plan §R3, prompt Phase 10, settlement gates 19 and 22.

## Gate command

```sh
cd /home/sprime01/projects/cognate/validation/reconstructions/copilot && bun test tests/protocol/
```

Runs green standalone from a cold start. No Playwright, no fixed ports (the reconstruction
server is started on an ephemeral port 0 with a throwaway data home), no external service, no
paid endpoint. Requires the workspace dependencies to be installed (`bun install` at the repo
root); nothing else is installed or modified by the suite.

## What is proven

- `protocol.test.ts` — connects standards-compliant AG-UI participants **directly** to the real
  reconstruction endpoint (`cognate/src/server.ts`, which wires `@cognate/ag-ui`'s
  `createAgUiHandler` and registers every canonical journey agent):
  - the pinned reference `RunAgentInput` shape (`../../reference/logs/runs/run-req-J-A-00.json`),
    sent verbatim, streams a schema-valid run;
  - every received SSE frame validates against the pinned `@ag-ui/core` `EventSchema`;
  - correct ordering of RUN_STARTED/RUN_FINISHED, TEXT_MESSAGE_START/CONTENT/END,
    TOOL_CALL_START/ARGS/END/RESULT, STATE_SNAPSHOT/STATE_DELTA, and the CUSTOM events the
    journeys emit (the J-G runtime-interrupt payload); ordering across streams is anchored to
    the durable Cognate positions each event was projected from;
  - the official `@ag-ui/client` `HttpAgent` — a normal AG-UI participant with no CopilotKit —
    completes a run and assembles the assistant message.
- `purity.test.ts` — CopilotKit absence is proven mechanically: the transitive static import
  graph of the served endpoint entry plus this suite plus the AG-UI protocol packages is scanned
  (`modulegraph.ts`), and any `@copilotkit/*` / `copilotkit` specifier or module path fails. The
  scanner is exercised against a synthetic dirty graph in the same suite so the proof cannot pass
  vacuously.

## Files

| File | Role |
| --- | --- |
| `agui-modules.ts` | Resolves the protocol-only `@ag-ui/*` packages from the existing workspace install (`packages/ag-ui`); installs nothing. |
| `sse.ts` | Minimal AG-UI SSE participant client: POST `RunAgentInput`, parse frames, validate every frame. |
| `modulegraph.ts` | Transitive static import scanner backing the purity assertions. |
| `protocol.test.ts` | The wire tests (Phase 10). |
| `purity.test.ts` | The CopilotKit-absence tests (gates 19/22). |

AG-UI is a protocol dependency only (prompt "AG-UI is allowed"); no CopilotKit package is
imported anywhere under `tests/` or the reconstruction application.
