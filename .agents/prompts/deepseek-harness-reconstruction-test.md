You are executing the **DeepSeek Harness Reconstruction Test**, a final architectural validation of Cognate.

This is not a demo, mockup, loose imitation, or feature checklist.

Your job is to independently reconstruct the **observable behavior, interaction model, and UI of the current DeepSeek Harness Web application using Cognate as the underlying application framework**, then prove parity against a pinned DeepSeek Harness reference.

The reconstruction must be built from Cognate's existing public primitives and normal application architecture. DeepSeek Harness is the reference product, not an implementation dependency.

Work autonomously through discovery, implementation, testing, critique, correction, and final verification. Do not stop for routine decisions. Follow the repository's `AGENTS.md`, current-status mechanism, implementation plans, and project-local instructions exactly where present.

---

# Objective

Create a standalone **Cognate Harness Reconstruction** that a user familiar with DeepSeek Harness can operate without relearning the product.

It must reproduce the reference application's:

1. core user-visible behavior;
2. primary user journeys;
3. interaction semantics;
4. session and persistence behavior;
5. approval and interruption behavior;
6. tool/agent execution presentation;
7. relevant settings/configuration experience;
8. UI structure and visual hierarchy;
9. loading, empty, running, completed, error, and recovery states.

The implementation underneath must be Cognate.

The proof is:

> DeepSeek Harness behavior and UI can be reconstructed from Cognate without DeepSeek-Harness-specific Cognate kernel primitives.

---

# Hard Architectural Constraints

These constraints are part of the test.

## Do not use DeepSeek Harness as an implementation dependency

The Cognate reconstruction MUST NOT import, embed, wrap, execute through, or otherwise depend at runtime on:

* `deepseek-harness`;
* `@deepseek-ai/dsh-*` packages;
* DeepSeek Harness frontend packages;
* its agent loop;
* its session implementation;
* its UI components;
* its configuration/profile machinery.

The reference installation may exist separately for observation and parity testing only.

## Do not copy the implementation

You MAY inspect the reference repository, tests, documentation, DOM, behavior, network activity, and source code to understand what the observable product does.

You MUST NOT copy its source files, React components, CSS, internal architecture, or implementation structure into the Cognate reconstruction.

Recreate the behavior independently using Cognate.

## Do not add DeepSeek-specific Cognate primitives

Do not add kernel concepts such as:

* `HarnessPlugin`;
* `HarnessSession`;
* `DeepSeekTool`;
* `DSHConversation`;
* other reference-specific escape hatches.

A reference feature must be expressible through existing Cognate concepts such as:

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
* provider;
* client projection.

If a behavior genuinely cannot be expressed from Cognate's existing primitives, **do not hide the failure by adding a special case**.

Record it as an architectural gap and fail the relevant reconstruction gate.

You MAY repair a defect in an existing general Cognate primitive when:

1. the primitive already exists;
2. the change is domain-independent;
3. a regression test proves the general behavior;
4. the fix does not exist solely to make this reconstruction pass.

## Preserve existing semantic boundaries

Do not modify:

* `.sea` grammar;
* DomainForge architecture;
* RealityTrace architecture.

Use their existing Cognate adapters and interfaces.

Do not introduce SEA-Forge or Gauntlet as dependencies of the reconstruction.

## Preserve Cognate's authority model

* SQLite/event history remains authoritative.
* RuVector remains derived cognition.
* RVF remains portable cognitive state.
* Adaptive ranking cannot expand deterministic authority.
* External commitments cannot be disguised as reversible effects.

---

# Phase 1 — Pin the Reference

Before implementing anything, establish an immutable reference.

Clone:

`deepseek-ai/deepseek-harness`

into an isolated reference directory outside the Cognate application implementation.

Resolve the current `master` HEAD to an exact commit SHA.

Record:

* repository;
* exact commit SHA;
* package version;
* capture date;
* Node/pnpm requirements;
* commands used to build and launch it;
* reference Web URL/port;
* relevant browser/runtime versions.

Write this to:

`validation/reconstructions/deepseek-harness/reference-manifest.json`

From this point forward, **do not float the reference** if upstream changes.

All parity claims apply to this exact SHA.

---

# Phase 2 — Characterize the Product Before Rebuilding It

Do not begin by coding from memory.

Treat the pinned application as an executable specification.

Read at minimum:

* root README;
* Web UI user guide;
* provider/model configuration guide;
* architecture documentation;
* Web application/bundle documentation;
* session documentation;
* persistence documentation;
* workspace documentation;
* tool execution documentation;
* approval/policy documentation;
* subagent documentation;
* plan/goal documentation;
* relevant Web/UI tests;
* relevant snapshot tests;
* current frontend source only as necessary to identify observable behavior.

Also inspect recent changes included in the pinned SHA that materially affect the Web product.

Then run the actual reference application.

---

# Deterministic Reference Environment

Do not require a paid model API for the reconstruction tests.

Use a deterministic local model endpoint.

Prefer an existing DeepSeek Harness test/mock model server if the pinned repository contains an appropriate supported one.

Otherwise provide an isolated deterministic server implementing a provider protocol supported by that pinned version.

It must be able to deterministically generate scenarios including:

* plain streamed assistant response;
* file-read tool call;
* file-edit tool call;
* shell/command call;
* multi-step tool sequence;
* approval-required action;
* plan creation/update where supported;
* subagent delegation where supported;
* deliberate model error;
* deliberate interrupted stream;
* deterministic retry/recovery.

Use the exact same scenario fixture for the reference and Cognate reconstruction wherever possible.

Create a deterministic test workspace containing known files and Git state so file tools and changes can be compared.

---

# Phase 3 — Build the Reference Behavior Matrix

Explore the real application using Playwright.

Do not infer UI behavior solely from documentation.

Produce:

`validation/reconstructions/deepseek-harness/reference-behavior-matrix.md`

For every externally observable feature record:

* feature;
* entry condition;
* starting state;
* exact user action;
* expected visible behavior;
* expected persisted behavior;
* relevant network/runtime behavior when material;
* restart/reload behavior;
* error behavior;
* screenshot checkpoints;
* accessibility role/name of important controls;
* reference evidence.

Classify every behavior:

* **P0 — reconstruction blocker**
* **P1 — required for final parity**
* **P2 — peripheral/nonessential**

All P0 and P1 behaviors must pass before settlement.

---

# Minimum Reference Surface to Characterize

The matrix must at least investigate the following against the pinned version.

Do not assume the exact UI based on this list; observe it.

## Startup and shell

* Web startup;
* authenticated initial browser handoff if present;
* initial application shell;
* navigation/sidebar structure;
* first-use state;
* empty states;
* responsive behavior;
* theme behavior if exposed.

## Model configuration

Current Harness exposes model management through **Settings → Models**.

Characterize:

* default provider presentation;
* provider configuration;
* custom/built-in provider flow where present;
* save behavior;
* validation/error state;
* redaction/write-only treatment of credentials;
* changing model configuration without application restart;
* model/route selection exposed in session UI.

The reconstruction does not need to reproduce DeepSeek credential storage internally; reproduce the user-visible contract using Cognate provider abstractions.

## Workspace

A fresh reference UI has no selected workspace, and the composer is unavailable until a workspace is selected.

Characterize:

* Choose workspace;
* add workspace;
* select workspace;
* current workspace presentation;
* composer disabled/enabled transition;
* workspace persistence;
* changing workspaces;
* relationship between workspace and sessions.

## Sessions

Characterize:

* create session;
* session history;
* session title;
* active-session navigation;
* switch between sessions;
* reload;
* process restart;
* restored history;
* empty session;
* active session;
* completed session;
* failed/interrupted session;
* any fork/resume affordances exposed in the pinned UI.

The reference's session log is event-sourced and model history is derived from it. The Cognate reconstruction must achieve equivalent externally visible persistence through Cognate's own event architecture.

## Conversation

Characterize:

* user message;
* streaming assistant response;
* reasoning/status presentation when exposed;
* message formatting;
* Markdown;
* code blocks;
* attachments if part of the primary Web flow;
* tool calls;
* tool results;
* running indicators;
* completion;
* stop/cancel;
* retry/resume where exposed;
* errors.

Capture exact layout and transitions.

## Tools and workspace operations

The current reference agent can:

* read workspace files;
* edit workspace files;
* run commands;
* delegate work;
* maintain a plan.

Exercise each through deterministic scenarios.

Observe how the UI represents:

* tool invocation;
* pending tool;
* successful tool;
* failed tool;
* file path;
* command;
* output;
* file change/diff;
* collapsed/expanded state;
* any preview/viewer behavior.

Do not invent UI that the pinned reference does not expose.

## Approvals

Exercise at least:

1. approved action;
2. denied action;
3. dismissed/cancelled interaction if supported;
4. resumed run after approval;
5. persistence/recovery around a pending approval if the reference supports it.

Characterize:

* visual approval surface;
* wording structure;
* buttons/actions;
* what execution does while waiting;
* what is persisted;
* what happens after resolution.

In the Cognate implementation, approval should be derived from Cognate policy/capability semantics and durable continuation behavior rather than a Harness-specific construct.

## Plans/goals

Exercise a task that causes the reference to maintain a plan.

Capture:

* plan creation;
* plan presentation;
* progress/status;
* update behavior;
* relationship to conversation;
* any sidebar/tab/card used by the pinned UI.

If the pinned application exposes plan-specific UI, reproduce it.

## Subagents/delegation

Exercise delegation.

Capture:

* how the parent indicates delegation;
* how subagent work is displayed;
* whether subagent conversation opens separately or in a sidebar;
* status/progress;
* completion;
* return to the parent agent;
* persistence across session reload.

Reproduce what exists in the pinned SHA, not an older mental model.

## Settings

Inventory the actual P0/P1 settings surfaces present in the pinned Web app.

At minimum inspect:

* Models;
* agent/preset configuration if exposed;
* permissions/approval-related settings if exposed;
* account/general application settings relevant to normal use.

Do not recreate obscure developer-only settings unless needed for a primary journey.

---

# Phase 4 — Capture the Reference UI

For each P0/P1 state create deterministic Playwright screenshots.

Use fixed viewports.

At minimum:

* primary desktop viewport;
* narrower desktop/laptop viewport;
* mobile viewport only if the pinned UI meaningfully supports it.

Capture named checkpoints such as:

```text
01-first-launch
02-model-settings
03-no-workspace
04-workspace-selected
05-empty-session
06-user-message
07-streaming
08-tool-running
09-tool-complete
10-file-change
11-approval-pending
12-approval-resolved
13-plan-active
14-subagent-active
15-completed-session
16-session-history
17-restored-after-reload
18-error
19-cancelled
20-theme-variant
```

Modify this list based on the actual pinned UI.

Save reference screenshots under:

`validation/reconstructions/deepseek-harness/reference/screenshots/`

Also capture the accessible DOM/role tree for important states where feasible.

---

# Phase 5 — Implement the Cognate Reconstruction

Create the reconstruction under the project's established validation structure, preferably:

`validation/reconstructions/deepseek-harness/cognate/`

unless existing repository conventions require another location.

Use the normal Cognate stack.

Expected implementation ingredients include:

* Bun 1.4 reference runtime;
* Cognate public kernel API;
* Cognate Cordis-backed execution implementation;
* Cognate EventStore with `bun:sqlite`;
* Cognate provider interface;
* Cognate capabilities;
* Cognate components/fibers;
* Cognate continuations;
* Cognate artifacts/projections;
* Cognate headless client;
* React 19;
* Astryx;
* Cognate RealityTrace adapter;
* Cognate DomainForge adapter where normal Cognate semantics require it;
* Cognate RuVector integration where appropriate;
* Cognate RVF support without making cognition authoritative.

Do not recreate DeepSeek Harness's internal plugin tree.

Recreate the product behavior from Cognate concepts.

---

# Required Cognate Interpretation

The implementation should naturally produce mappings approximately like these:

| DeepSeek Harness observable concept | Cognate implementation                                 |
| ----------------------------------- | ------------------------------------------------------ |
| plugin/service                      | Component + Capability                                 |
| plugin instance                     | Fiber                                                  |
| service requirement                 | Capability requirement                                 |
| service replacement                 | provider replacement                                   |
| plugin cleanup                      | owned reversible Effect                                |
| session                             | Event stream + projection                              |
| session history                     | durable EventStore projection                          |
| agent                               | Component consuming provider/tool capabilities         |
| tool                                | Capability                                             |
| model provider                      | Capability provider                                    |
| approval                            | policy gate + Continuation                             |
| workspace                           | durable application/domain state + scoped capabilities |
| plan                                | Artifact/projection over durable events                |
| subagent                            | scoped agent Component/child execution                 |
| UI conversation node/tool card      | client Projection/Artifact renderer                    |
| persisted recovery                  | replay from Cognate authoritative events               |

This table is guidance, not permission to force an incorrect mapping.

If actual reference behavior exposes something that demands a different composition of existing Cognate primitives, use the better mapping and explain it.

---

# UI Reconstruction Standard

The Cognate reconstruction must intentionally reproduce the pinned reference UI.

Use React + Astryx as the base implementation.

Astryx may be styled, composed, or swizzled as necessary.

Do not let default Astryx styling turn this into a vaguely similar application.

Match the reference's:

* overall page geometry;
* navigation;
* sidebar widths and hierarchy;
* header structure;
* chat column;
* composer placement;
* settings hierarchy;
* spacing;
* borders;
* radii;
* typography scale;
* icon placement;
* tool cards;
* status indicators;
* approval surfaces;
* plan surfaces;
* session list;
* hover/focus states;
* loading states;
* disabled states;
* error states;
* light/dark behavior where present;
* responsive breakpoints used by the selected journeys.

Use Cognate branding in the reconstructed product where a literal DeepSeek trademark/logo would otherwise be required.

Do not ship copied DeepSeek logos or proprietary visual assets.

Brand substitutions may be masked in visual comparison. The rest of the UI should remain structurally faithful.

---

# Phase 6 — Behavioral Reconstruction Tests

Create one Playwright journey suite that can be parameterized against:

1. the pinned DeepSeek Harness reference;
2. the Cognate reconstruction.

Where controls differ only because of branding, normalize selectors through the test driver rather than weakening behavior assertions.

The same canonical scenario should execute against both systems.

Required journeys include at least:

## Journey A — First use

```text
launch
→ initial UI
→ model configuration
→ choose workspace
→ composer becomes available
```

## Journey B — Basic session

```text
create session
→ send deterministic prompt
→ streamed assistant response
→ complete
→ session appears in history
→ switch away/back
```

## Journey C — Tool execution

```text
send coding task
→ file read
→ shell/command execution
→ file edit
→ visible tool states
→ final answer
→ verify actual workspace mutation
```

## Journey D — Approval

```text
request approval-gated operation
→ UI displays pending approval
→ execution remains pending
→ approve
→ action executes
→ run resumes
→ completion persisted
```

Run a second branch that denies the operation and verify the corresponding behavior.

## Journey E — Plan

```text
request multi-step task
→ plan appears
→ plan changes as work proceeds
→ completed plan state
```

Only assert the specific plan UI demonstrated by the reference.

## Journey F — Delegation

```text
request task requiring delegation
→ parent delegates
→ delegated/subagent activity becomes visible
→ child work completes
→ result returns to parent
→ parent completes
```

Match the pinned reference's actual presentation.

## Journey G — Persistence

```text
perform multi-step session
→ terminate Web/runtime process
→ restart
→ reopen workspace
→ reopen session
→ verify durable visible state
```

## Journey H — Cancellation/error

```text
begin streaming/tool run
→ cancel/interruption
→ verify UI state
→ retry/resume where reference allows
```

Also inject a deterministic provider error and compare failure/recovery behavior.

---

# Phase 7 — Visual Parity Tests

At every reference screenshot checkpoint, capture the same state from Cognate.

Save under:

`validation/reconstructions/deepseek-harness/cognate/screenshots/`

Generate comparison artifacts under:

`validation/reconstructions/deepseek-harness/diffs/`

Use deterministic browser configuration:

* same Chromium version where practical;
* same viewport;
* same device scale factor;
* same font availability;
* same fixture data;
* animations/transitions disabled at screenshot time;
* stable clocks/IDs where visible;
* dynamic tokens/timestamps masked only when unavoidable.

Visual settlement requires:

### Structural parity

The same important:

* controls;
* labels;
* hierarchy;
* sections;
* relative geometry;
* states;
* affordances

must be present.

No missing control may be excused by screenshots that look similar.

### Screenshot evidence (no numeric threshold)

There is no pixel-similarity threshold. For every stable checkpoint, save the reference and Cognate screenshots side by side with a generated diff image. A visible divergence (layout, missing UI, changed controls, spacing, incorrect state) is diagnosed and fixed, or recorded as a deviation with evidence; it is never masked. Only intentional Cognate branding and unavoidable nondeterministic IDs/timestamps may be masked.

---

# Phase 8 — Architectural Purity Tests

Create automated checks proving the reconstruction is actually built on Cognate.

The final validation must assert:

* no dependency on `deepseek-harness`;
* no dependency on `@deepseek-ai/dsh-*`;
* no imports from the reference checkout;
* no copied reference source tree;
* no DeepSeek-Harness-specific primitive added to Cognate kernel;
* Cordis remains behind Cognate interfaces;
* event history remains authoritative;
* RuVector can be deleted and rebuilt without changing deterministic behavior;
* `.sea` grammar is unchanged;
* DomainForge is unchanged;
* RealityTrace is unchanged;
* Cognate works after reference checkout is physically removed.

Perform the last test literally:

1. finish implementation;
2. remove or move the DeepSeek reference checkout out of resolution reach;
3. clean install/build Cognate;
4. launch reconstruction;
5. run the Cognate-only E2E suite.

It must still pass.

---

# Phase 9 — Primitive Provenance Report

Produce:

`validation/reconstructions/deepseek-harness/primitive-provenance.md`

For every P0/P1 reconstructed feature, document exactly which Cognate primitives implement it.

Example format:

| Reference behavior       | Cognate primitives              | Packages | Special case? |
| ------------------------ | ------------------------------- | -------- | ------------- |
| provider hot replacement | Capability + Component + Fiber  | ...      | No            |
| tool registration        | Capability + Effect             | ...      | No            |
| durable session          | Event + EventStore + Projection | ...      | No            |
| approval                 | Continuation + policy + Event   | ...      | No            |
| plan UI                  | Artifact + Projection           | ...      | No            |
| subagent                 | Component + scoped Context      | ...      | No            |

The `Special case?` column must be `No` for settlement.

If it is not, explain why the architecture failed.

---

# Phase 10 — Independent Critic / Verifier

Aggressively use independent subagents.

For each substantial implementation batch:

1. a builder implements the batch;
2. an independent critic receives:

   * the task instructions;
   * the pinned reference behavior;
   * the resulting implementation;
   * test evidence;
3. the critic identifies:

   * missing behavior;
   * incorrect behavior;
   * visual divergences;
   * architectural shortcuts;
   * deviations from Cognate invariants;
4. a fresh builder fixes the issues;
5. rerun the critic;
6. continue until the critic approves with evidence.

The critic MUST NOT approve based on code inspection alone.

Approval requires evidence from:

* automated tests;
* reference/reconstruction comparison;
* screenshots where UI is involved;
* persisted-state inspection where durability is involved;
* dependency/import checks where architecture is involved.

Record critic findings and disposition.

---

# Required Final Artifacts

Produce at minimum:

```text
validation/reconstructions/deepseek-harness/
├── reference-manifest.json
├── reference-behavior-matrix.md
├── primitive-provenance.md
├── parity-report.md
├── parity-report.json
│
├── reference/
│   ├── screenshots/
│   └── observations/
│
├── cognate/
│   ├── screenshots/
│   └── [reconstruction app]
│
├── diffs/
│
└── tests/
    ├── journeys/
    ├── visual/
    └── architecture/
```

Adapt exact locations only when existing project conventions require it.

---

# Final Parity Report

The final report must include:

## Reference

* repository;
* exact SHA;
* version;
* date captured.

## Behavioral parity

For every P0/P1 feature:

* PASS/FAIL;
* reference evidence;
* Cognate evidence;
* test identifier.

## Journey parity

Every required E2E journey:

* reference result;
* Cognate result;
* comparison.

## UI parity

For every screenshot checkpoint:

* structural comparison;
* diff artifact;
* any permitted mask and why.

## Persistence parity

Show:

* pre-restart state;
* restart;
* reconstructed state;
* comparison.

## Architectural purity

Show evidence that no reference runtime or source dependency remains.

## Primitive provenance

Summarize how each major Harness behavior emerges from Cognate primitives.

## Deviations

List every observable deviation, however minor.

Do not hide deviations behind a single aggregate score.

---

# Settlement Gate

The DeepSeek Harness Reconstruction is complete only when ALL of the following are true:

1. The reference is pinned to an exact commit.
2. All P0 behaviors are reproduced.
3. All P1 behaviors are reproduced.
4. All designated E2E journeys pass against both reference and reconstruction.
5. The Cognate implementation behaves equivalently for those journeys.
6. UI structure is functionally equivalent.
7. Stable screenshot states have side-by-side and diff evidence, with every visible divergence fixed or recorded as a deviation.
8. Approval, interruption, streaming, tool execution, planning, delegation, session history, and restart/recovery are exercised.
9. The reconstruction contains no DeepSeek Harness runtime dependency.
10. It still works after the reference checkout is removed.
11. No DeepSeek-specific Cognate kernel primitive was introduced.
12. Every P0/P1 feature has a clean Cognate primitive provenance mapping.
13. `.sea` grammar was not modified.
14. DomainForge was not modified for the reconstruction.
15. RealityTrace was not modified for the reconstruction.
16. Authoritative state remains reconstructable independently of RuVector.
17. All repository tests and architectural gates pass.
18. The independent critic/verifier approves with concrete evidence.
19. `parity-report.md` and `parity-report.json` contain no unresolved P0/P1 failures.

If a condition cannot be met because Cognate lacks a genuinely necessary general abstraction, **do not declare completion**. Document the precise counterexample and the smallest missing domain-independent semantic/runtime capability.

That failure would itself be a successful finding of the reconstruction test.

---

# Completion Standard

Do not ask whether the reconstruction "looks good."

Ask:

> **Can a DeepSeek Harness user perform the same primary tasks, through substantially the same interface and interaction model, while the implementation underneath is entirely Cognate?**

And then ask the harder architectural question:

> **Can every reproduced behavior be explained as a composition of Cognate's existing general primitives rather than a DeepSeek Harness exception?**

The reconstruction settles only when the evidence answers **yes** to both.
