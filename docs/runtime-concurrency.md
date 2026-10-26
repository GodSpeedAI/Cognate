# Bounded native run execution

SDK 0.4.0 publishes bounded execution with synchronous eligibility. This branch adds awaitable
eligibility and its cancellation signal; that extension requires a subsequent supported release.

A cancelled eligibility callback retains its lookup permit until it actually settles. The waiting
run can stop promptly, and late failures remain observed. A callback that ignores cancellation and
never settles can exhaust lookup capacity; trusted policies must bound their own I/O.

Runtime shutdown also aborts cooperative active execution through `RunContext.signal`, including
provider capability calls. It does not cancel durable objectives or close open continuations.
Committed checkpoints replay on restart; unfinished provider calls may be invoked again. A remote
provider may have accepted an earlier request before its response was lost, so shutdown cannot
establish exactly-once effects or billing. Use native commitments and reconciliation for protected
effects. A handler that ignores its signal can still delay shutdown indefinitely.

`RuntimeOptions.execution.maxConcurrentRuns` defaults to one and accepts integers 1–64. Capacity above one requires an explicit `execution.resourceKeys(run)` eligibility policy; returning an empty array explicitly declares independence. The policy may return keys synchronously or asynchronously, and receives an optional `AbortSignal` that is aborted when the run is cancelled or the runtime closes. This supports trusted lookups against authoritative application metadata without moving that metadata into caller-controlled run input. The policy must be trusted and side-effect free. Concurrent authoritative lookups are bounded by the same capacity as execution. Run-local chains still serialize replay and continuation delivery. Independent runs may overlap up to this bound. Runs with any common key cannot execute concurrently in the same process. Keys do not grant authority. Throwing or malformed admission fails closed through the native outbox retry path. The caller must canonicalize resource identities, including filesystem aliases, before returning keys.

The same execution gate covers started, recovered and resumed runs. Eligibility resolves before execution-slot acquisition or agent effects; cancellation is rechecked by the native executor before the agent enters. A pending policy lookup races run cancellation and runtime shutdown, so either can abort the supplied signal and release the waiting execution path even if the callback ignores it. The callback's eventual rejection remains observed. Run and continuation outbox dispatch share one process-local pre-claim admission budget at the configured capacity. A denied permit leaves the item unclaimed; empty claims and every settlement/error path release it. Tick order alternates between the two topics so an empty first topic cannot starve the other at capacity one. Startup and expired-continuation recovery are persisted as `run.execute` outbox intents, so eligibility errors use the same durable bounded backoff and retry path as new runs. Recovery reuses an existing pending `run.execute` intent to preserve its `availableAt`; it creates a new runtime-epoch identity only after prior intents are no longer pending. Resource acquisition lasts for one agent execution entry and releases when it completes or suspends. Resource keys should be derived from frozen run input and trusted authoritative metadata, and must cover every shared writable resource. This mechanism is process-local and cannot establish distributed run-write ownership or OS isolation.

Compatibility: default capacity one preserves current scheduling. Existing providers, run inputs and event formats remain valid. Agents using process-global mutable state must remain serialized or declare resource keys; concurrent operation is an explicitly granted affordance. Workbench must not consume this source checkout as its runtime dependency. A published linked SDK release and application eligibility tests are required for integration.

Production setting: the default stays `maxConcurrentRuns: 1`, which is the right choice for local and
development profiles. For server profiles that run agents with independent workspaces, a value of
`4` is the recommended starting point, paired with an `execution.resourceKeys` policy that returns
the canonical workspace or resource identity for each run (and `[]` only for runs that share no
writable resource). `resourceKeys` decides which runs may overlap; `maxConcurrentRuns` only caps how
many may overlap at once. Runs with a common key still serialize in the same process, so a policy
that returns one key for everything gives capacity-1 behaviour regardless of the setting. Capacity
above one also multiplies authoritative eligibility lookups and PostgreSQL outbox lease traffic by up
to the same factor, so keep the policy cheap and side-effect free. Measured with the `runtime` mode of `scripts/bench-stores.ts` (200 no-op runs submitted as one burst,
one process, event-driven wake-ups): capacity 8 gave about 4,300 runs/s against 3,900 at capacity 1
on SQLite, and about 64 against 48 runs/s on PostgreSQL, where per-run round trips dominate. These
no-op runs carry almost no work, so real agents with slower steps may gain more. Raise the value only
after measuring the target workload.

Acceptance: capacities 1/2/4/8 show exact observed maxima with distinguishable outputs; conflicting workspace keys serialize while independent keys overlap; cancellation, continuation, deterministic replay and service conformance pass. No exactly-once external effect claim is made.

Injected legacy/custom stores without the complete fenced claim/renew/settle trio are rejected
before opening runtime resources when capacity is above one. Otherwise the background dispatcher
would reject only during draining, leaving accepted runs queued without an executable configuration.
Default capacity one retains legacy-adapter compatibility.
