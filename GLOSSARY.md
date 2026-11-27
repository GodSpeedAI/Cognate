# Cognate execution

Cognate runs agent procedures and records the effects, waits, and outcome of each execution.

## Language

**Agent Procedure**:
A named, resumable procedure that a run executes and that requests effects through available capabilities.
_Avoid_: Expert, principal, provider

**Run**:
A single execution of an Agent Procedure with its own identity and lifecycle.

**Continuation**:
A durable unresolved condition on which a run waits for a decision or signal before resuming.

**Execution World**:
An environment that bounds where an execution can read, write, or run a process.
_Avoid_: Semantic World, Candidate State

**Case Anchor**:
The case, declared semantic element, and pinned world under which a Cognate run acts. Evaluated work also identifies its frozen episode.

**Child Run**:
A run started with lineage to a parent run and admitted under the applicable authority boundary.

**Capability Contract**:
A declaration of a callable operation’s intended input, effect, and output.

**Execution Posture**:
The operating conditions under which effects are admitted and the enforcement that applies in those conditions.

**Model Provider**:
A service or adapter through which a run can request model inference.

**Run Projection**:
A derived view of run facts and state reconstructed from the run’s events.

**Working Context**:
The selected instructions, evidence, history, and intermediate material available to a particular running procedure.

**Execution World Provider**:
A provider that supplies the environment and effect boundary where an execution takes place.

## Sources and boundary

The [runtime API](packages/runtime-api/README.md), [execution port](packages/execution/src/types.ts), and [assignment validator](packages/runtime-api/src/assignment.ts) govern these terms. `CaseContext` carries the Case Anchor. `Assignment` in the runtime API implements the SEA-Forge-authored `assignment.v1` Case Assignment contract. Run creation and continuation track execution of the case-bound attempt. Workbench Expert Assignments retain independent work, review and acceptance lifecycles.

A Run tracks execution and immediate outcome. Any settlement belongs to the responsible settlement authority. Agent Procedure, authenticated Principal and Model Provider identify different parts of execution. A Child Run enters under its applicable authority and budget, bounded by the parent’s grant when delegation supplies that grant.
