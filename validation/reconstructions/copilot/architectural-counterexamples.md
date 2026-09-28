# Architectural counterexamples and repair decisions

Reference: `CopilotKit/CopilotKit` at `6e452e5342db53e9ab23d8b3c0a4592ec25ff554`.
These findings are about the pinned v2 source and the current Cognate checkout. They do not claim UI or journey parity.

## C1 — Scoped client capability discovery (open)

**Reference behavior.** A mounted v2 `useFrontendTool` contributes a tool definition to the agent's available tools; registration can change during the component lifecycle. The pinned `packages/core/src/core/run-handler.ts` keeps hook registrations separate from provider registrations and sends `buildFrontendTools(agent.agentId)` into `connectAgent`. Its `run-handler-tool-registry.test.ts` proves a hook tool survives provider resync and is advertised to the agent. The reconstruction must also prove removal on unmount against the selected reference surface.

**Existing primitives.** `useCapability` registers a handler with the local `@cognate/client` engine. `invokeFrontend` creates a durable `frontend_capability` continuation, and the client resolves it when a matching handler exists. Component/Fiber/Scope/Effect provide local lifetime semantics; the kernel owns server capability eligibility and invocation.

**Why composition fails.** The runtime cannot query which remote client capability definitions are currently offered for a run or caller. `createCopilotApp` advertises frontend tool definitions from its static `frontendTools` option even when their UI providers are unmounted. The client can execute an already selected tool, but its registration has no path back into the server's eligible tool set. A missing provider can leave an advertised invocation waiting indefinitely. Server kernel components cannot directly represent a browser's independent connection and disposal lifetime.

**Workaround rejected.** A static frontend tool list, a UI-supplied tool manifest in each prompt, or a parallel app-specific registry would duplicate capability identity and availability outside Cognate's authorization boundary.

**Smallest general repair.** A caller-scoped, lease-bound remote capability offer: the client publishes a contract/description/schema with a lease identity; the runtime exposes only currently valid offers to authorized invocation planning and routes selection into its existing durable continuation path. Unregister/connection loss revokes availability for *new* calls; an in-flight call retains its durable continuation and explicit expiry/recovery semantics. This is a general capability offer, not a CopilotKit tool type.

**Other use case.** A browser-based spreadsheet editor offers `selection.replace` only while a sheet is open; an agent should not choose it after the editor unmounts.

**Invariant.** An offer never grants authority: selection and invocation still check the caller, scope, policy, contract version, and live lease. A previously committed invocation and continuation remain replayable after the offering client disconnects. Tenant isolation and deterministic replay must hold.

**Required proof before closure.** Conformance tests for mount/replace/unmount/expiry, per-agent and tenant isolation, stale offer rejection, in-flight disconnect/resume, and no authority expansion; then run the Copilot and DeepSeek Harness reconstructions.

## A1 — Live AG-UI delivery (adapter defect repaired)

The original `@cognate/ag-ui` handler waited for a run to settle and only then encoded its durable events as SSE. A run that emitted text and kept executing therefore gave the client no live text. This was an adapter implementation defect: `RuntimeService.events({ afterPosition, follow: true })` already expressed live, ordered delivery. `packages/ag-ui/test/live.test.ts` first failed because no response arrived while the run was active; commit `999a1a3` made it green by following the durable event cursor. Independent review then found that a full resync stopped at an old wait after a run had resumed and completed. `packages/ag-ui/test/reconnect.test.ts` reproduced that case; commit `755db6c` fixed it. The adapter still needs reference-side protocol comparison before parity can be claimed.

## Context interpretation (composition, pending journey proof)

Pinned v2 `packages/core/src/__tests__/core-context-injection.test.ts` proves UI context is forwarded on both run and connect paths and filtered per agent. For a run, Cognate represents a captured context snapshot as immutable run input, separate from `state.changed`; the AG-UI adapter projects `RunAgentInput.context` into that input. `packages/ag-ui/test/inbound.test.ts` verifies the agent sees context while shared state remains a separate `state.changed` snapshot. This is a composition of existing input, Context and Event semantics. A live change during an already executing run would require a separate reference observation before claiming a new primitive.
