# AGENTS.md — packages/projections

- Do not edit `src/types.ts`, `test/projections.test.ts`, the store port
  (`packages/events/src/{types,errors}.ts`), or `tests/support/stores.ts`.
- `runner.ts` keeps `ProjectionRunner`'s exported constructor/method signatures.
- One `store.commitProjection` per batch attempt; never skip a failing event.
