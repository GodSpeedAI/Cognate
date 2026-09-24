# AGENTS.md — @cognate/runtime-bun

- Never return stored copies of content: views are folds over events (`fold.ts`) so erasure is honoured.
- Keep step ids and other non-sensitive ids in event metadata; content goes in payloads only.
- Every run event chains `causationId` to the previous run event; only `run.started` has `null`.
- Replay must stay deterministic: new RunContext methods need a step id and a recorded result.
- Use building-block packages (continuations, artifacts, projections, cognitive-api); no Cordis types here.
- Never serialize component closures or configuration into events, records, or the cognitive index.
