# Cognate — agent operating surface

## Identity and priorities

Cognate is a proposed Bun-native semantic application substrate. The [design spec](.agents/specs/software-design-spec-cognate.-frameworkmd) is the normative target; [README.md](README.md) describes the intended end state. Preserve the distinction between planned and implemented behavior.

## Repository map

- Current reality and next work: the last line of [.agents/CURRENT_STATUS.yaml](.agents/CURRENT_STATUS.yaml) (`just status`); human view: [.agents/CURRENT_STATUS.md](.agents/CURRENT_STATUS.md). Material uncertainty: [.agents/OPEN_QUESTIONS.md](.agents/OPEN_QUESTIONS.md).
- Implementation route: [.agents/plans/implementation.md](.agents/plans/implementation.md); candidate requirement and proof map: [requirements/ledger.yaml](requirements/ledger.yaml).
- Phase 0 fixtures: `compatibility/phase0/`; package homes and dependency direction are specified in spec §§27–28. Create a package when its phase and compatibility gates warrant it.

## Development loop

Run `just status`, select one requirement, run its narrow gate, make the bounded change, then run `just verify`. Append a complete YAML status snapshot and update the Markdown latest view in place; see [.agents/AGENTS.md](.agents/AGENTS.md).

## Build and validation

Run `just --list` for current commands. `just verify` checks the existing substrate and Bun compatibility fixture; it does not claim the application builds. `just build` and `just dev` become available when a runtime package exists.

## Code conventions

Use Bun and TypeScript for runtime packages. Keep public interfaces free of adapter implementation types. Let package manifests and generated schemas own machine-consumed contracts; do not copy them into prose.

## Testing strategy

Phase 0 fixtures prove only the named dependency behavior. Later, use contract tests for ports, real-adapter integration tests, boundary checks, and external-surface E2E tests (spec §§34–36). A missing fixture is an unmet gate, never a passing skip.

## Documentation conventions

The spec owns requirements; the README owns the target-state overview; `.agents/` owns status, questions, plans, and observed evidence. Link to the owner rather than repeating its content.

## Architecture and boundaries

Follow spec §§3, 7, 27–28. SQLite owns durable framework truth; cognition is derived; `.sea` and DomainForge remain independent; RealityTrace is an optional evidence adapter. No contract is frozen yet: the [ledger](requirements/ledger.yaml) is a candidate. Change public contracts deliberately and update their proofs.

## Security and privacy

Follow spec §32. Default to no authority; authorize at invocation and before external commitments. Keep credentials and personal payloads out of events, logs, cognitive indexes, and committed configuration.

## Git and change policy

Preserve working changes and history. Do not fetch, pull, reset, clean, rebase, merge, commit, or publish without operator intent. Document a proposed contract revision before changing a frozen ruler in a future run.

## Operational constraints

Phase 0 compatibility remains unproven except for fixtures whose results are recorded in status. Optional adapters stay absent until their fixtures pass. Use portable paths and no machine-specific executable locations in committed files.

## Task completion criteria

A task is done when its narrow gate and relevant regression checks pass, observed evidence is recorded, and the latest YAML snapshot and Markdown view agree. Do not equate local conformance with real-world consequence.
