# AGENTS.md — cognitive-memory

- Must keep passing `cognitiveIndexConformance` unchanged (see `test/conformance.test.ts`).
- Similarity is exact cosine, not approximate — do not swap in an ANN structure silently.
- Embeddings are stored and returned as defensive copies; never hand out the live array.
- Run `bun test` in this package before committing.
