# Assumptions and Unknowns

## Declared / documented reference

- The pin and selected surfaces are owned by `../../reference-manifest.json` and
  `../../reference-suite.md`.
- R-A01–R-A14 are source/fixture characterized only. No live reference behavior is claimed.

## Proposed Cognate composition

- J-C uses durable versioned state; J-D captures immutable invocation input and must not use the
  agent-writable state channel.
- J-E retains renderer provenance as invocation evidence independent of a current capability offer.
- J-F and J-G are continuations with distinct conditions/results; J-H is catalog-constrained.
- J-J replays authoritative events/artifacts and cannot reactivate an old browser offer.

## Architectural gaps / repair status

- **C1 open:** a caller/scope/lease-bound remote capability offer must be visible to authorized
  planning, revoke new calls on unmount/disconnect, and preserve committed continuations plus
  renderable provenance. It is a general capability-discovery primitive: a spreadsheet editor's
  scoped `selection.replace` is another use case.
- **AG-UI delivery repair:** live ordered delivery is an adapter defect, not a new primitive. J-K
  requires `events({ afterPosition, follow: true })` and cursor recovery proof.

## Unknown / unexecuted

- All selected fixture and black-box results: initial content, Markdown, scroll, attachments,
  stop/retry/error, accessibility, responsive visuals, and reconnect UI.
- Exact durable representation of reference partial state/stream chunks; live context mutation.
- Managed threads, Open-JSON-UI, MCP Apps/open-ended UI where no local fixture has executed.
