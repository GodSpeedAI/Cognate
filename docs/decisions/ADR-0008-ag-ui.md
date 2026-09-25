# ADR-0008: AG-UI as an optional interoperability adapter

<!-- Index: [decisions/README.md](README.md). The Status line below is historical; the current implementation status is in [requirements/ledger.yaml](../../requirements/ledger.yaml).
-->
## Status

Accepted (Phase 0 characterization complete; no adapter code built yet).

## Context

Spec §3.8, §6 ("Optional protocols"), §24, and §38 describe AG-UI as an
*adapter*, not part of the internal event model: "AG-UI remains an
adapter rather than an internal event model. Its role is agent/user
bidirectional interaction through standardized event streams." §40.H
requires that native Framework execution and UI remain functional if
AG-UI is removed entirely.

Before committing to AG-UI as the reference interoperability profile, we
needed to prove the package loads and validates under Bun 1.4.0, per the
project's Phase 0 discipline (`.agents/plans/build-v0.md` operating rule
4: "Each third-party boundary gets an isolated fixture ... Adapters are
built only on a passing fixture").

## Decision

Adopt `@ag-ui/core@1.0.0` (plus `@ag-ui/encoder@1.0.0` and
`@ag-ui/proto@1.0.0`) as the pinned AG-UI dependency set for the eventual
`packages/ag-ui` adapter, based on the passing fixture at
`compatibility/phase0/ag-ui/` (evidence:
`.agents/evidence/phase0-ag-ui.md`).

Key findings that inform adapter design:

1. **Import surface.** Runtime types/enums come from `@ag-ui/core`; every
   Zod validator comes from the separate `@ag-ui/core/schemas` subpath
   export. The adapter's own code should import schemas only where
   validation is actually needed (e.g. at a wire boundary), keeping the
   dependency on `zod` explicit rather than incidental.
2. **Event surface is much larger than originally scoped.** 1.0.0 ships
   31 `EventType` values, not the 14 named when this Phase 0 task was
   written (`REASONING_*`, `SUBAGENT_*`, `ACTIVITY_*`, `STEP_*`, and the
   `_CHUNK` shorthand variants are new). The adapter's event-mapping layer
   (Cognate event → AG-UI event) should be written against the full
   discriminated union (`EventSchema`), not a hand-picked subset, so a
   protocol upgrade doesn't silently drop event kinds.
3. **Wire format choice deferred.** Both `@ag-ui/encoder` (SSE/JSON) and
   `@ag-ui/proto` (binary protobuf) work under Bun with no native
   bindings. Spec §38 lists them as "or" — the adapter should pick SSE as
   the default (matches the common HTTP streaming case) and treat proto
   as an opt-in for binary transports, rather than depending on both by
   default.
4. **`RunAgentInput` is the adapter's inbound contract.** Its shape
   (`threadId`, `runId`, `messages`, optional `state`/`tools`/`context`/
   `forwardedProps`) is the boundary the adapter accepts from an AG-UI
   client; Cognate's own run/continuation model maps onto it rather than
   vice versa, preserving §40.H (AG-UI is removable without breaking
   native execution).

## Consequences

- The `packages/ag-ui` adapter (Phase 9 in `.agents/plans/build-v0.md`)
  can proceed with `@ag-ui/core@1.0.0` pinned, subject to the dependency
  maturity policy (§39): exact version pin, isolated adapter boundary, no
  AG-UI types leaking into the headless client contract (§3.8).
- The adapter must map Cognate's own event/run model onto the full
  31-event AG-UI surface deliberately, not just the 14 originally listed,
  to avoid a silent compatibility gap as AG-UI evolves.
- No CopilotKit-compatible-consumer test was run (spec §24's "SHOULD"
  requirement); tracked as an open question, not a blocker, since it is
  a "SHOULD" not a "MUST."

## Alternatives considered

- Rolling a bespoke Cognate-specific event stream instead of AG-UI:
  rejected because it would duplicate an existing, already-Bun-compatible
  standard and increase the surface area a UI consumer must learn (spec
  §6 explicitly lists AG-UI as the reference optional protocol).
