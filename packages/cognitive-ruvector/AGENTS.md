# cognitive-ruvector — agent notes

- Contract lives in `@cognate/cognitive-api`; do not edit it or the conformance kit here.
- RuVector metadata filtering is broken (DEBT-007); never rely on `search`'s `filter` option.
- Always pass an explicit `storagePath`; the adapter resets it on open (non-persistent by design).
- Reference semantics: `packages/cognitive-memory/src/index.ts`.
