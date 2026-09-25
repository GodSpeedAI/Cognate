You are executing the **CopilotKit Reconstruction Test**, a final architectural validation of Cognate.

This is not a demo, mockup, loose imitation, or feature checklist.

Your job is to independently reconstruct the **observable behavior, interaction model, developer-facing application behavior, and UI of current CopilotKit application surfaces using Cognate as the underlying application framework**, then prove parity against a pinned CopilotKit reference.

CopilotKit is an SDK/framework rather than one canonical end-user application. Therefore the target is a **CopilotKit Reconstruction Suite** composed from the current official examples, current v2 UI components, and current documented application behaviors.

The reconstruction must be built from Cognate's existing public primitives and normal application architecture.

CopilotKit is the reference product.

It is not an implementation dependency.

Work autonomously through discovery, implementation, testing, critique, correction, and final verification.

Follow the Cognate repository's `AGENTS.md`, current-status mechanism, implementation plans, and project-local instructions exactly where present.

---

# Objective

Build a standalone **Cognate CopilotKit Reconstruction Suite** proving that Cognate can recreate the application-facing capabilities for which current CopilotKit exists:

* agent chat;
* streaming;
* frontend tools;
* backend tool rendering;
* shared agent/application state;
* state streaming;
* agent-readable frontend context;
* controlled Generative UI;
* declarative Generative UI;
* open-ended Generative UI;
* Human-in-the-Loop;
* graph/runtime interrupts;
* durable/resumable conversations;
* thread management;
* frontend layouts such as inline chat, popup, and sidebar;
* agent access outside chat;
* AG-UI interoperability.

A user familiar with the pinned CopilotKit examples and UI components should be able to operate the Cognate reconstruction without relearning the interaction model.

The architectural proof is:

> CopilotKit's application-facing behavior and UI can be reconstructed from Cognate without CopilotKit-specific Cognate kernel primitives.

---

# Important Scope Distinction

CopilotKit currently includes both:

1. the open application framework/SDK;
2. CopilotKit Intelligence and hosted/commercial infrastructure.

This reconstruction targets the **application-facing behavior exposed through the SDK and documented product experience**.

It MUST reconstruct application-visible features such as Rich Threads where they are part of the documented frontend experience.

It does NOT need to clone:

* CopilotKit's commercial control plane;
* billing;
* hosted administration;
* enterprise dashboards;
* internal SaaS infrastructure.

Where an application-visible feature normally depends on CopilotKit Intelligence, use the pinned repository's own mocks, tests, fixtures, or publicly executable reference mechanisms wherever available.

Never invent reference behavior.

If a behavior cannot be executed without unavailable proprietary infrastructure and no official local fixture exists, classify it explicitly as:

`DOCUMENTED_REFERENCE`

rather than claiming black-box parity.

---

# Hard Architectural Constraints

These constraints are themselves part of the test.

## Do not use CopilotKit as an implementation dependency

The Cognate reconstruction MUST NOT import, embed, wrap, execute through, or depend at runtime on:

* `@copilotkit/*`;
* `copilotkit`;
* CopilotKit React packages;
* CopilotKit runtime packages;
* CopilotKit core packages;
* CopilotKit UI components;
* CopilotKit hooks;
* CopilotKit source code;
* CopilotKit Intelligence clients.

The pinned reference checkout may exist separately for observation and parity testing only.

## AG-UI is allowed

AG-UI is an interoperability protocol and intentionally sits below/adjacent to both systems.

The reconstruction MAY depend on appropriate official:

* `@ag-ui/core`;
* `@ag-ui/client`;
* protobuf/encoder packages;
* other protocol-only AG-UI packages

when exercising Cognate's AG-UI adapter.

Do not use CopilotKit implementation packages to obtain the behavior being tested.

## Do not copy implementation

You MAY inspect:

* source;
* tests;
* examples;
* DOM;
* CSS;
* network traffic;
* screenshots;
* Storybook;
* documentation

to understand observable behavior.

You MUST NOT copy:

* CopilotKit React components;
* source files;
* CSS files;
* package implementation;
* internal state machinery;
* hooks;
* runtime implementation

into Cognate.

Recreate the behavior independently.

## Do not add CopilotKit-specific Cognate primitives

Do not add concepts such as:

* `CopilotAction`;
* `CopilotThread`;
* `CopilotChatPrimitive`;
* `CopilotGenerativeUI`;
* `CopilotHITL`;
* or another reference-specific kernel escape hatch.

Reference behavior must emerge from existing Cognate concepts such as:

* Context;
* Capability;
* Component;
* Fiber;
* Scope;
* Effect;
* Event;
* Projection;
* Continuation;
* Artifact;
* client;
* provider;
* protocol adapter.

If a behavior genuinely cannot be expressed from Cognate's existing primitives, **do not hide the failure by adding a special case**.

Record the architectural gap and fail that settlement gate.

You MAY repair an existing general Cognate primitive if:

1. the abstraction already exists;
2. the fix is domain-independent;
3. a general regression test proves it;
4. it would remain useful if CopilotKit ceased to exist.

## Preserve Cognate boundaries

Do not modify:

* `.sea` grammar;
* DomainForge architecture;
* RealityTrace architecture.

Do not make SEA-Forge or Gauntlet dependencies of this reconstruction.

SQLite/event history remains authoritative.

RuVector remains derived cognition.

RVF remains portable cognitive state.

Learning/ranking cannot expand deterministic authority.

---

# Phase 1 — Pin the Reference

Clone:

`CopilotKit/CopilotKit`

into an isolated reference directory outside the Cognate reconstruction.

Resolve current `main` to an exact commit SHA.

Record:

* repository;
* SHA;
* capture timestamp;
* repository/package versions relevant to the test;
* Node/pnpm requirements;
* browser version;
* commands used to run each selected reference surface.

Write:

`validation/reconstructions/copilotkit/reference-manifest.json`

Do not allow upstream changes to move the target after characterization begins.

All parity claims apply to this exact SHA.

---

# Phase 2 — Understand the Current Product

Do not begin implementation from prior CopilotKit knowledge.

The current repository explicitly considers the old top-level `examples/v1` and `examples/v2` workspaces legacy.

Do not select them as the primary reference merely because they are familiar.

Read at minimum:

* root `README.md`;
* `examples/README.md`;
* current architecture documentation;
* current v2 React documentation;
* `useAgent`;
* frontend tools;
* shared state;
* Human-in-the-Loop;
* interrupt behavior;
* Generative UI overview;
* thread documentation;
* current UI component reference;
* AG-UI integration documentation;
* current consolidated examples relevant to this test;
* current tests and Storybook stories for selected UI components.

Investigate current behavior first.

Implement second.

---

# Phase 3 — Define the Reference Suite

Because CopilotKit is not one application, create a fixed reference suite from the pinned repository.

The suite MUST use current consolidated examples wherever possible.

At minimum, characterize and reconstruct the following three surfaces.

---

# Surface A — Canonical Agent Application

Use the **current consolidated integration starter** that most comprehensively exercises the standard CopilotKit application model.

At the pinned version, inspect current starters such as the LangGraph JS/TS starter and choose the canonical one based on actual repository state.

The current LangGraph JS starter is expected to be investigated because it presently combines several important behaviors in one application:

* chat;
* thread drawer;
* shared state;
* a side-by-side application canvas;
* frontend tools;
* chat/application mode switching;
* attachments;
* A2UI registration;
* reactive agent state.

Do not assume that remains exactly true.

Verify against the pinned SHA.

This surface should become the primary full-application UI reconstruction.

---

# Surface B — Generative UI Playground

Use the current official Generative UI playground/showcase.

The current product distinguishes multiple Generative UI approaches.

Characterize and reconstruct the actual pinned implementation of:

## Controlled Generative UI

Developer-defined components where the agent selects the component and data.

Investigate examples such as:

* weather;
* stock;
* custom backend-tool rendering;
* frontend component/tool rendering.

Required lifecycle states include where exposed:

```text
arguments streaming
→ pending/in-progress
→ executing
→ complete
→ failed
```

## Declarative Generative UI

At minimum investigate current:

* A2UI;
* Open-JSON-UI if part of the selected pinned public surface.

The agent emits structured UI description/state and the client constructs the interface from an allowed catalog/schema.

## Open-ended Generative UI

Investigate current:

* MCP Apps;
* open component/HTML rendering mechanisms where part of the pinned showcase.

Exercise at least one interactive sandboxed application.

The current playground includes examples such as calculators, travel/booking interactions, trading or other embedded MCP interfaces.

Use the pinned implementation as truth.

---

# Surface C — CopilotKit UI Components

Build a deterministic reference gallery for current v2 UI surfaces.

At minimum investigate the current equivalents of:

* `CopilotChat`;
* `CopilotPopup`;
* `CopilotSidebar`;
* `CopilotThreadsDrawer`;
* chat input;
* message list;
* suggestion UI;
* tool rendering;
* stop/send controls.

If the pinned current API contains another primary chat layout, include it.

Do not require legacy v1-only components.

Use current v2 behavior.

The Cognate reconstruction should expose Cognate-native equivalents through its React/Astryx layer.

---

# Phase 4 — Deterministic Reference Agents

Do not require paid model APIs for parity tests.

Build deterministic scenario drivers.

For CopilotKit reference surfaces, prefer an **AG-UI-compatible deterministic fixture agent** because AG-UI is CopilotKit's public agent/application boundary.

It must deterministically emit scenarios for:

* text streaming;
* reasoning/activity where exposed;
* frontend tool invocation;
* backend tool invocation;
* state snapshot;
* state delta;
* partial/streaming state;
* controlled Generative UI;
* declarative UI;
* HITL;
* runtime interrupt;
* tool failure;
* agent failure;
* cancellation;
* retry;
* active run reconnection.

Where appropriate, use current official repository test fixtures rather than reinventing protocol details.

For the Cognate implementation, define the same scenarios using Cognate-native execution and project them through Cognate's normal client/AG-UI boundaries.

Do not simply use one shared CopilotKit implementation underneath both sides.

The fixture specification may be shared.

The implementation must not be.

---

# Phase 5 — Build the Behavior Matrix

Produce:

`validation/reconstructions/copilotkit/reference-behavior-matrix.md`

For every selected behavior record:

* reference surface;
* feature;
* starting state;
* exact user action;
* visible behavior;
* state behavior;
* persisted behavior;
* event/protocol behavior when relevant;
* error behavior;
* reconnect behavior;
* screenshot checkpoints;
* accessibility semantics;
* evidence.

Classify:

* **P0 — reconstruction blocker**
* **P1 — required for parity**
* **P2 — peripheral**

All P0 and P1 behaviors must settle.

---

# Minimum Behaviors to Characterize

## Chat

Investigate:

* empty chat;
* welcome/initial content;
* user messages;
* assistant messages;
* streaming text;
* Markdown;
* code;
* scroll behavior;
* send;
* stop;
* running state;
* failed state;
* retry if exposed;
* suggestions;
* attachments where enabled.

## Agent access

Exercise the current equivalent of `useAgent`.

Verify UI outside the chat can:

* observe agent state;
* observe execution state;
* update agent state;
* trigger/re-run agent behavior where supported.

## Frontend tools

Characterize:

* registration lifecycle;
* dynamic tool availability where supported;
* argument streaming;
* browser-side execution;
* result returned to agent;
* custom render;
* failed handler;
* unregistration when UI/component disappears.

The Cognate equivalent should naturally map frontend tools to scoped client capabilities.

## Backend tool rendering

Have a backend/native agent invoke a tool.

Verify:

* no frontend handler executes;
* the UI still renders the tool call;
* status updates appear;
* final result appears.

## Shared state

Exercise both directions.

### Agent → UI

```text
agent changes state
→ state event delivered
→ main application UI updates
```

### UI → Agent

```text
user edits application state
→ agent-visible state updates
→ subsequent agent behavior sees new value
```

Also exercise partial/streaming state if supported by the selected reference agent.

## Agent context

Characterize one-way UI-to-agent context where the UI publishes information that should be readable but not agent-writable.

## Controlled Generative UI

Reproduce at least two current reference components.

Use deterministic fixtures so UI output is stable.

Verify:

* streaming args;
* loading;
* execution;
* completion;
* error;
* user interaction where present.

## Declarative Generative UI

Exercise the current A2UI path.

At minimum:

```text
agent emits UI operations/spec
→ client validates against catalog
→ surface renders
→ data binds
→ user interacts
→ interaction returns to execution
```

If Open-JSON-UI is materially part of the pinned reference suite, include it as P1.

## Open-ended Generative UI

Exercise at least one current MCP App.

Verify:

* tool invocation;
* UI resource resolution;
* sandboxed rendering;
* interactive UI;
* return interaction;
* history/replay if supported by the reference.

Also investigate the current `useComponent`/open-generative-UI mechanism if it exists in the pinned public surface.

## Human-in-the-Loop — Tool-Based

Current CopilotKit distinguishes tool-based HITL.

Exercise:

```text
agent chooses HITL tool
→ inline custom UI renders
→ execution waits
→ human answers
→ answer becomes tool result
→ agent continues
```

Test:

* approve;
* reject;
* custom structured response.

## Human-in-the-Loop — Interrupt-Based

Current CopilotKit also distinguishes backend/graph enforced interrupts where supported.

Exercise:

```text
runtime reaches mandatory interrupt
→ run suspends
→ UI renders interrupt payload
→ user responds
→ execution resumes with response
```

Do not collapse this into the same implementation as tool-based HITL in the reference characterization.

In Cognate, both may ultimately map onto the general Continuation abstraction with different initiation semantics.

## Threads

Characterize current application-facing Rich Threads behavior:

* create;
* generated/default title;
* switch;
* rename;
* archive;
* unarchive if exposed;
* delete;
* pagination if exposed;
* new thread;
* refresh/reload;
* restored message history;
* restored tool/generative UI;
* reconnect to live execution where executable;
* thread-list realtime update behavior.

Prefer official local mocks/fixtures for Intelligence-dependent reference behavior.

Do not guess proprietary behavior.

## Multiple UI layouts

Characterize:

* inline chat;
* popup;
* sidebar;
* thread drawer.

Verify opening/closing behavior and responsive layout.

## AG-UI

Capture actual protocol events for representative flows.

At minimum:

* run lifecycle;
* text streaming;
* tool call lifecycle;
* tool result;
* state snapshot;
* state delta;
* custom/activity events used by the selected surfaces.

---

# Phase 6 — Capture Reference UI

Use Playwright against pinned official reference surfaces.

Use fixed viewport/device settings.

At minimum capture:

```text
01-chat-empty
02-chat-streaming
03-chat-complete
04-tool-in-progress
05-tool-complete
06-shared-state-agent-write
07-shared-state-user-write
08-controlled-genui-loading
09-controlled-genui-complete
10-hitl-pending
11-hitl-resolved
12-interrupt-pending
13-interrupt-resolved
14-a2ui-rendered
15-mcp-app-rendered
16-mcp-app-interactive
17-threads-open
18-thread-switched
19-thread-restored
20-popup-closed
21-popup-open
22-sidebar-closed
23-sidebar-open
24-error
25-cancelled
26-dark-theme
```

Modify the exact list according to the pinned reference.

Also capture UI states of the canonical starter:

```text
chat mode
application/canvas mode
split mode if present
agent-modified application state
user-modified application state
thread drawer expanded/collapsed
responsive mobile state
```

Save:

`validation/reconstructions/copilotkit/reference/screenshots/`

Capture accessibility role/name trees for key states where practical.

---

# Phase 7 — Implement the Cognate Reconstruction Suite

Create:

`validation/reconstructions/copilotkit/cognate/`

or follow established Cognate validation conventions.

Build Cognate-native equivalents of the selected surfaces.

Use:

* Bun 1.4;
* Cognate kernel;
* Cognate Cordis-backed runtime;
* Cognate events;
* `bun:sqlite`;
* Cognate capabilities;
* Cognate continuations;
* Cognate projections;
* Cognate artifacts;
* Cognate headless client;
* React 19;
* Astryx;
* Cognate AG-UI adapter;
* Cognate DomainForge adapter where appropriate;
* Cognate RealityTrace adapter;
* RuVector and RVF according to normal Cognate architecture.

Do not reproduce CopilotKit internals.

Reproduce its externally meaningful behavior.

---

# Required Cognate Interpretation

Expected mappings should resemble:

| CopilotKit behavior     | Cognate mechanism                                    |
| ----------------------- | ---------------------------------------------------- |
| AG-UI agent connection  | protocol adapter + client                            |
| `useAgent`              | headless client + agent/run projection               |
| frontend tool           | client-provided Capability                           |
| dynamic frontend tools  | scoped capability registrations/effects              |
| backend tool rendering  | Event + Artifact/Projection                          |
| tool render lifecycle   | tool events + UI projection                          |
| shared state            | Event + Projection                                   |
| read-only agent context | scoped context projection/capability                 |
| Generative UI component | Artifact/Projection                                  |
| A2UI                    | declarative projection adapter                       |
| MCP App                 | protocol/artifact adapter + sandboxed renderer       |
| HITL tool               | Continuation initiated through capability invocation |
| backend interrupt       | runtime Continuation                                 |
| chat thread             | durable event stream                                 |
| Rich Thread restoration | event replay + projections                           |
| threads drawer          | client projection over thread/event metadata         |
| popup/sidebar/chat      | presentation projections                             |
| live run reconnect      | durable run/event position + resubscription          |

The mapping must emerge naturally.

Do not force it merely to satisfy this table.

---

# Phase 8 — Reconstruct the UI Faithfully

Use React + Astryx.

Astryx is the implementation toolkit, not an excuse to impose a different design.

Match the selected current CopilotKit reference surfaces in:

* overall layout;
* chat geometry;
* message spacing;
* typography hierarchy;
* input/composer;
* borders;
* radii;
* shadows;
* icons;
* suggestions;
* tool cards;
* loading indicators;
* execution status;
* HITL surfaces;
* thread drawer;
* popup behavior;
* sidebar behavior;
* generative UI cards;
* A2UI layouts;
* MCP containers;
* state/canvas layout;
* responsive transitions;
* focus and hover states;
* dark/light behavior.

Use Cognate branding where literal CopilotKit logos or trademarks would otherwise be required.

Do not ship copied CopilotKit logos or brand assets.

Brand regions may be masked during screenshot comparison.

Do not mask the rest of the UI.

---

# Phase 9 — Canonical E2E Journeys

Build one canonical journey specification with separate drivers for:

* pinned CopilotKit reference;
* Cognate reconstruction.

The semantic journey should remain the same.

---

## Journey A — Basic Chat

```text
open app
→ send message
→ receive streamed text
→ stop/retry if applicable
→ complete
```

Verify protocol events and visible state.

---

## Journey B — Frontend Capability

```text
open canonical application
→ ask agent to modify client UI
→ frontend tool invoked
→ browser-side state changes
→ tool result returned
→ agent acknowledges result
```

Unmount/remove the component providing the capability.

Verify the capability disappears.

Remount it.

Verify it returns.

This specifically tests Cognate's scoped effect/capability semantics against CopilotKit's registration lifecycle.

---

## Journey C — Shared State

```text
agent updates todo/application state
→ application canvas updates
→ user edits same state in UI
→ agent sees edited state
→ agent responds based on new state
```

Also exercise streamed/intermediate state if reference supports it.

---

## Journey D — Backend Tool Rendering

```text
agent invokes backend tool
→ custom execution UI renders
→ status updates
→ result appears
→ agent continues
```

---

## Journey E — Controlled Generative UI

```text
request deterministic weather/stock/etc.
→ tool args stream
→ loading component
→ execution
→ completed component
→ user-visible result
```

---

## Journey F — Tool-Based HITL

```text
agent decides human input is needed
→ custom inline UI appears
→ run waits
→ user responds
→ response delivered
→ run resumes
→ final output
```

Test approve and reject paths.

---

## Journey G — Runtime Interrupt

Using a reference framework that supports CopilotKit interrupt semantics:

```text
execution reaches mandatory checkpoint
→ runtime pauses
→ interrupt UI appears
→ human responds
→ execution resumes from checkpoint
```

The Cognate implementation should use its general durable Continuation mechanism.

---

## Journey H — Declarative Generative UI

```text
request structured application UI
→ agent emits declarative representation
→ component catalog resolves
→ UI progressively renders
→ user interacts
→ interaction flows back into execution
```

Use current A2UI behavior.

---

## Journey I — MCP App

```text
request MCP-hosted operation
→ agent invokes MCP tool
→ interactive app appears
→ user interacts inside app
→ result returns
→ conversation continues
```

Use an isolated deterministic MCP fixture rather than an external service for automated tests.

---

## Journey J — Rich Thread

```text
create thread
→ complete mixed interaction containing:
    text
    tool
    generative UI
    shared state
→ reload browser
→ restore thread
→ verify all representations restored
→ switch thread
→ switch back
```

Where supported:

```text
start long-running execution
→ disconnect
→ reconnect
→ attach to live run
→ receive remaining events
```

---

## Journey K — Thread Management

```text
new thread
→ generated/default title
→ rename
→ second thread
→ switch
→ archive
→ restore/unarchive if supported
→ delete
```

Verify actual pinned behavior.

---

## Journey L — UI Layouts

Exercise equivalent current:

```text
CopilotChat
CopilotPopup
CopilotSidebar
CopilotThreadsDrawer
```

Capture:

* open;
* closed;
* expanded;
* collapsed;
* desktop;
* mobile.

---

# Phase 10 — AG-UI Wire Compatibility

This is a separate hard gate.

Connect a standards-compliant AG-UI client/fixture directly to the Cognate AG-UI adapter.

Verify valid handling of the event classes exercised by the reference:

```text
RUN_STARTED
RUN_FINISHED

TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT
TEXT_MESSAGE_END

TOOL_CALL_START
TOOL_CALL_ARGS
TOOL_CALL_END
TOOL_CALL_RESULT

STATE_SNAPSHOT
STATE_DELTA

relevant custom/activity events
```

Use the exact pinned protocol shapes.

Do not treat CopilotKit-specific internal structures as AG-UI.

Also verify a normal AG-UI client can communicate with Cognate **without CopilotKit installed**.

---

# Phase 11 — Visual Parity

Capture each stable reference checkpoint and its Cognate equivalent.

Use:

* same Chromium;
* same viewport;
* same scale factor;
* same fixture data;
* stable clock;
* deterministic IDs where displayed;
* disabled screenshot-time animation;
* matching fonts where legally/distributably available.

Compare two dimensions.

## Structural parity

All meaningful controls, information, hierarchy, affordances, and states must be equivalent.

A missing control is a failure regardless of how similar the screenshots look.

## Visual comparison (evidence, not a numeric gate)

There is no pixel-similarity threshold. For every stable checkpoint, save the reference and Cognate screenshots side by side with a generated diff image, so a reviewer can judge fidelity directly. Use the same Chromium, viewport, scale factor, fixture data and stable clock for both, and disable animation at capture time.

Structural parity above is the gate. A visible divergence found in the diffs (wrong layout, spacing, controls, typography hierarchy, cards or state) is recorded as a deviation and fixed or explained; it is never masked.

For dynamic declarative/open-ended UI, verify equivalent information, controls, interaction possibilities, hierarchy and outcome.

---

# Phase 12 — Protocol and State Evidence

For every canonical journey capture:

```text
reference:
    user actions
    network events
    AG-UI events
    state transitions
    screenshots

cognate:
    user actions
    Cognate events
    AG-UI projection
    state transitions
    screenshots
```

Generate machine-readable comparison artifacts.

The point is not merely:

"both ended with the same text."

The test must prove that meaningful intermediate interaction semantics also correspond.

---

# Phase 13 — Architectural Purity Tests

Automatically prove:

* no `@copilotkit/*` dependency in reconstruction;
* no `copilotkit` runtime dependency;
* no imports from reference checkout;
* no copied CopilotKit source/CSS;
* no CopilotKit-specific Cognate kernel primitive;
* AG-UI exists only behind the intended adapter boundary;
* Astryx exists only in presentation implementation;
* Cordis remains hidden behind Cognate;
* SQLite remains authoritative;
* RuVector is rebuildable derived state;
* `.sea` is unchanged;
* DomainForge required no reconstruction-specific modification;
* RealityTrace required no reconstruction-specific modification.

Then physically move/remove the CopilotKit reference checkout.

From a clean Cognate checkout:

```text
install
build
launch
run Cognate E2E suite
```

The reconstruction must work completely without the reference repository.

---

# Phase 14 — Cognitive Non-Authority Test

The CopilotKit reconstruction may use Cognate cognition for features such as:

* memory;
* relevant prior-thread recall;
* tool/provider ranking.

Prove:

```text
delete RuVector index
→ restart
→ deterministic application behavior remains correct
→ authorization remains identical
→ threads/events remain intact
→ rebuild cognition
→ retrieval returns
```

Do not make CopilotKit-like memories or thread history authoritative inside RuVector.

Durable events remain truth.

---

# Phase 15 — Primitive Provenance

Produce:

`validation/reconstructions/copilotkit/primitive-provenance.md`

For every P0/P1 capability document exactly how Cognate implements it.

Example:

| CopilotKit behavior | Cognate primitives         | Packages | Special case? |
| ------------------- | -------------------------- | -------- | ------------- |
| frontend tool       | Capability + scoped Effect | ...      | No            |
| tool render UI      | Event + Projection         | ...      | No            |
| shared state        | Event + Projection         | ...      | No            |
| tool-based HITL     | Capability + Continuation  | ...      | No            |
| graph interrupt     | Continuation               | ...      | No            |
| thread              | Event stream + Projection  | ...      | No            |
| Generative UI       | Artifact + Projection      | ...      | No            |
| A2UI                | projection adapter         | ...      | No            |
| MCP App             | adapter + Artifact         | ...      | No            |
| agent context       | Context projection         | ...      | No            |

Every settled P0/P1 row must end:

`Special case? No`

Otherwise the architectural test has found a weakness.

---

# Phase 16 — Independent Critic / Verifier

Aggressively use subagents.

For every substantial tranche:

1. builder implements;
2. independent verifier receives:

   * original instructions;
   * pinned reference evidence;
   * implementation;
   * test evidence;
   * screenshots;
3. verifier compares implementation against reference;
4. verifier explicitly lists:

   * omitted behavior;
   * wrong behavior;
   * UI divergence;
   * protocol divergence;
   * persistence divergence;
   * architectural shortcuts;
   * special cases;
5. fresh builder fixes findings;
6. rerun verification;
7. repeat until evidence-based approval.

The verifier MUST NOT approve on code review alone.

Approval requires execution evidence.

---

# Required Artifacts

Produce at minimum:

```text
validation/reconstructions/copilotkit/
├── reference-manifest.json
├── reference-suite.md
├── reference-behavior-matrix.md
├── primitive-provenance.md
├── parity-report.md
├── parity-report.json
│
├── reference/
│   ├── starter/
│   │   ├── screenshots/
│   │   └── observations/
│   ├── generative-ui/
│   │   ├── screenshots/
│   │   └── observations/
│   └── ui-components/
│       ├── screenshots/
│       └── observations/
│
├── cognate/
│   ├── [reconstruction application]
│   └── screenshots/
│
├── diffs/
│
└── tests/
    ├── journeys/
    ├── protocol/
    ├── visual/
    ├── persistence/
    └── architecture/
```

Use repository-standard locations if they differ.

---

# Final Parity Report

The report must distinguish:

## BLACK_BOX_REFERENCE

Actually executed against pinned CopilotKit.

## OFFICIAL_FIXTURE_REFERENCE

Executed using official CopilotKit test fixtures/mocks.

## DOCUMENTED_REFERENCE

Supported by current official docs/source but not executable locally because it depends on unavailable external/proprietary infrastructure.

Do not mix those evidence levels.

For every P0/P1 feature include:

* evidence class;
* reference evidence;
* Cognate evidence;
* PASS/FAIL;
* test ID;
* screenshots where applicable;
* protocol evidence where applicable.

---

# Settlement Gates

The CopilotKit Reconstruction settles only when ALL applicable conditions hold:

1. Reference commit is pinned.
2. Current consolidated examples, not legacy v1/v2 examples, define the primary reference suite.
3. All P0 behaviors pass.
4. All P1 behaviors pass.
5. Canonical agent-application UI is faithfully reconstructed.
6. Chat streaming matches reference interaction semantics.
7. Frontend tools work.
8. Backend tool rendering works.
9. Shared state works bidirectionally.
10. Agent context works.
11. Controlled Generative UI works.
12. Declarative A2UI works.
13. Selected open-ended/MCP application works.
14. Tool-based HITL works.
15. Runtime interrupt HITL works against a reference backend that supports it.
16. Thread creation, switching, restoration, and relevant management behavior work.
17. Rich UI is restored with its thread rather than only plain text.
18. Inline chat, popup, sidebar, and thread drawer parity is demonstrated where they exist in pinned v2.
19. AG-UI interoperability passes independently of CopilotKit.
20. Stable reference screens have side-by-side screenshot and diff evidence, and every visible divergence is fixed or recorded as a deviation.
21. Responsive interaction is equivalent for selected viewports.
22. No CopilotKit runtime dependency exists.
23. Reconstruction still works after reference source is removed.
24. No CopilotKit-specific Cognate kernel primitive was added.
25. Every P0/P1 feature maps cleanly to general Cognate primitives.
26. `.sea` grammar was not modified.
27. DomainForge was not modified specifically for this reconstruction.
28. RealityTrace was not modified specifically for this reconstruction.
29. RuVector remains disposable/rebuildable derived cognition.
30. All Cognate architecture and regression tests pass.
31. Independent verifier approves with evidence.
32. No unresolved P0/P1 failures remain.

---

# Failure Is Valuable

Do not make Cognate pass by cheating.

If an important current CopilotKit behavior cannot be reconstructed cleanly from the existing Cognate model, stop treating that as an implementation inconvenience.

Create an architectural counterexample containing:

```text
reference behavior
current Cognate primitives
why composition fails
smallest missing general abstraction
why it is not CopilotKit-specific
impact on other Cognate applications
```

That is a legitimate failed reconstruction result.

It means the test found something Cognate's abstraction does not yet express.

---

# Completion Standard

Do not ask:

> "Does this resemble CopilotKit?"

Ask:

> **Can a developer/user familiar with current CopilotKit perform the same important application interactions through substantially the same interfaces and UI behaviors, while Cognate is doing all of the work underneath?**

Then ask:

> **Can every reconstructed behavior be explained as a composition or projection of existing general Cognate primitives rather than a CopilotKit exception?**

Then ask:

> **Can an ordinary AG-UI participant interoperate with the Cognate implementation without CopilotKit being present at all?**

The reconstruction settles only when the evidence answers **yes** to all three.
