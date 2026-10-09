# @godspeedai/cognate-artifacts

Durable, content-addressed, access-controlled file storage for Cognate applications. Artifacts
are the supported way for a run to produce or consume binary content — reports, documents,
images, data files — that must survive restarts and stay auditable.

**When to use this package:** your agents or capabilities need to attach files to a run and
read them back later, with per-tenant access control, retention metadata, and deletions that
leave an explicit tombstone instead of silently vanishing. It stores everything in any
[`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events)
`DurableStore`, so persistence is exactly as durable as your store.

## Installation

```sh
bun add @godspeedai/cognate-artifacts
```

Requires [Bun](https://bun.sh) >= 1.4.0. You also need a store:
[`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite)
for durable storage or
[`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory)
for tests. The SDK ships Bun-native TypeScript source, so add `@types/bun` and `@types/node`
as dev dependencies when typechecking your project.

## Quick start

```ts
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { ArtifactService } from "@godspeedai/cognate-artifacts";

const store = openSqliteStore({ path: "./app.sqlite" });
const artifacts = new ArtifactService(store);

const alice = { id: "alice", kind: "user" } as const;

const record = await artifacts.put({
  name: "refund-report.md",
  mediaType: "text/markdown",
  bytes: new TextEncoder().encode("# Refund\napproved"),
  access: { tenant: "tenant-a", scopeId: "root", readers: ["alice"] },
  runId: "run-1",
  correlationId: "corr-1",
  retention: { class: "case-7y", until: "2033-01-01T00:00:00Z" },
});

const read = await artifacts.get(record.id, alice, "tenant-a");
if (read.kind === "ok") {
  console.log(record.contentHash); // `sha256:<hex>` of the bytes
  console.log(new TextDecoder().decode(read.bytes));
}

// Only principals in `readers` of the right tenant may read:
await artifacts.get(record.id, { id: "bob", kind: "user" }, "tenant-a"); // { kind: "denied" }
```

## How it behaves

- **Write-ahead bytes.** `put` stores the bytes content-addressed (`sha256:<hex>`) *before*
  committing the record and its `artifact.created` event, so a record is never visible without
  its content. Identical bytes are stored once, even across artifacts.
- **Honest reads.** `get` returns a discriminated result: `ok`, `denied` (wrong tenant or not
  on the reader allowlist), `not_found`, `tombstoned` (deliberately removed under your
  retention/privacy policy), or `lost` (record exists but its bytes are gone — reported
  distinctly as data loss, never hidden behind a not-found answer).
- **Deletion is a tombstone.** `delete(id, reason, actor)` marks the record `tombstoned` with
  who deleted it and why, then deletes byte blobs that no remaining artifact references —
  shared content survives deletion of any one referencer.
- **Representations.** One artifact can carry multiple media types (for example a markdown
  original plus a JSON table view); `get(id, actor, tenant, "application/json")` selects one.
- **Listing.** `list({ tenant, runId? }, actor)` returns only records the actor is authorized
  to read.

## Limitations

- Retention (`class` and `until`) is recorded metadata. Nothing in this package schedules or
  enforces expiry — build that on top with your own job.
- Access control is a flat reader-id allowlist per artifact plus tenant matching. Roles,
  groups, and per-scope policies are your application's job.
- `list` scans all artifact records; there is no secondary index.
- Tombstoned records keep their event history in the store. Erasing event payloads is the
  store's payload-erasure feature, not something this package does.

## Related packages

- [`@godspeedai/cognate-events`](https://www.npmjs.com/package/@godspeedai/cognate-events) —
  the `DurableStore` contract and event envelope this service is built on.
- [`@godspeedai/cognate-store-sqlite`](https://www.npmjs.com/package/@godspeedai/cognate-store-sqlite) —
  durable SQLite store; [`@godspeedai/cognate-store-memory`](https://www.npmjs.com/package/@godspeedai/cognate-store-memory) —
  the in-memory store for tests.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) —
  the reference runtime; it runs this service for you and exposes artifacts through its API.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK
  umbrella; the easiest way to get a runtime with artifact support.

## License

Apache-2.0
