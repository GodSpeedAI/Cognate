# @cognate/store-memory

An in-memory `DurableStore` (spec §10, §11, §13) with the same observable
semantics as the SQLite store: atomic multi-part commits, optimistic
concurrency on streams and records, idempotent commits, an outbox, projection
checkpoints, content-addressed blobs, and GDPR-style payload erasure.

State lives only in process memory — nothing survives a restart. Use it for
tests and ephemeral runtimes, not as a production store.

```ts
import { createMemoryStore } from "@cognate/store-memory";

const store = createMemoryStore();
await store.commit({ appends: [{ streamId: "s", expectedVersion: 0, events: [...] }] });
```

Commits are serialized internally (a promise queue), so concurrent `commit()`
calls resolve one at a time even though the API is async. All values returned
from the store are deep copies; mutating a result never affects store state.

See `../events/src/conformance.ts` for the full contract this store passes.
