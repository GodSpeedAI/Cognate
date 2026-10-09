# Security

This page follows spec §32 directly. Every claim below that names a requirement id is `implemented` per [`requirements/ledger.yaml`](../requirements/ledger.yaml) unless marked otherwise.

## Default deny

Capabilities default to no authority (spec §32; see [concepts.md](concepts.md#capabilities-eligibility-vs-selection)). `denyAll` is the kernel's default `Policy` ([`packages/kernel-api/src/policy.ts`](../packages/kernel-api/src/policy.ts)): every invocation is denied unless a rule explicitly allows it. Resolution (`kernel.resolve`) never consults policy and grants no authority by itself — only invocation does.

A `Context` carries an authenticated principal and tenant/workspace scope as values separate from capability visibility. A child scope may narrow authority; it MUST NOT gain a permission by inheriting or discovering a capability (proven scope-isolation property, `CG-KRN-005`).

## Invocation-time authorization

Server-side policy is checked **at invocation, and again before an irreversible external commitment** — never earlier and never assumed from a client projection or a model/tool declaration, which are never an authorization decision. Every capability invocation carries: caller identity/context, scope, capability identity, selected provider, applicable policy information, and trace/correlation identity (`HandlerContext`, [`packages/kernel-api/src/types.ts`](../packages/kernel-api/src/types.ts)). Invocation never throws for a denial: it returns a typed `InvocationResult` (`unavailable | denied | deadline_exceeded | cancelled | failed`), and every invocation emits an `invocation` audit event (spec §32, §33).

## The service boundary is a separate gate

A `RuntimeService` applies a second, independent `ActionPolicy` to the actions that are not
capability invocations — `run.start`, `run.cancel`, `continuation.resume`, `continuation.cancel`,
and `run.state.update` (the bidirectional shared-state write, `CG-STA-001`). It defaults to deny and
is configured on `createRuntime` as `actions`; see
[subsystems/runtime.md](subsystems/runtime.md#core-abstractions). A caller that may invoke every
capability still cannot start someone else's run.

Inside a runtime, `ContinuationService` is constructed with an always-allow policy because it is
only reachable through that service ([`packages/runtime-bun/src/runtime.ts`](../packages/runtime-bun/src/runtime.ts)).
A `ContinuationService` you construct and use directly bypasses this check; supply a real
`ContinuationPolicy` if it is reachable from anything but the service.

## Tenant isolation

Framework observations, events, and cognitive entries carry `scope_id`/tenant identity, and a policy decision is scoped to `tenant` + `scopeId` (`AuthorizationRequest`). `@godspeedai/cognate-cognitive-ruvector`'s `similar` filters by tenant/scope before disclosure and never discloses another tenant's id, compensating for RuVector's own `filter` option not actually filtering ([DEBT-007](../.agents/DEBT.md); see [cognition.md](cognition.md)).

## Retrieval authorization

Sensitive cognitive retrieval enforces authorization independently of similarity (spec §32). The retrieval path constrains candidates by tenant/scope before disclosing metadata where supported, and authorizes each authoritative dereference before returning content — an unauthorized hit must not leak a title, embedding, count, or any provenance that would reveal a restricted object exists. `@godspeedai/cognate-cognitive-api`'s `createRecall` implements this: embed → `similar` (tenant/scope pre-filter) → provenance post-filter → authorized fetch; a denied or missing source drops silently rather than surfacing (`CG-COG-002`; see [cognition.md](cognition.md#retrieval-pipeline-spec-16)).

An imported or **detached** RVF snapshot remains untrusted data: it cannot grant capabilities or bypass these checks, and only an **attached** classification (verified lineage and checkpoint match) may affect authorization or automatic provider selection at all — see [rvf.md](rvf.md#attached-vs-detached-spec-182-183).

## Secrets

Credentials stay in provider-specific secret storage and must not be serialized into events, artifacts, traces, cognitive entries, or RVF snapshots (spec §32, `CG-SEC-002`). `@godspeedai/cognate-provider-openai-compatible` calls `apiKey()` per request and never stores, logs, or includes it in an error message or capability contract ([extensions.md](extensions.md)). Audit records include the policy decision and a principal reference, never a secret value.

## Erasure

Applications must define retention and erasure policy before storing personal or regulated content. Erasure removes or cryptographically destroys eligible payloads, records a tombstone and legal reason, and invalidates or rebuilds derived indexes and snapshots; the remaining event envelope preserves causality without preserving erased content. Replay after erasure reports a redacted gap rather than reconstructing deleted data (spec §32).

`runtime.erase` (`CG-SEC-001`, implemented) scrubs event payloads (`erasePayload`, `secure_delete`, WAL truncate in `@godspeedai/cognate-store-sqlite`), derived run views, and cognitive entries (the indexer handles `erasure.recorded`). **[DEBT-014](../.agents/DEBT.md) — erasure does not yet reach every derived copy**: continuation records (`payload`/`resolution.input`), idempotency result snapshots, and `run.recall` step results recorded into *later* runs' events (kept for replay determinism, spec §11) all currently survive erasure of their source event. Keep personal content out of continuation payloads until this closes.

## Protocol limits

Protocol input is schema validated; untrusted protobuf/JSON payloads must not construct arbitrary runtime components without authorization (spec §32, `CG-WIR-004`, implemented). Each external request binds authenticated actor, requested operation, idempotency key, and causation identity. `@godspeedai/cognate-protocol-connect`'s `registerRuntimeService` takes the caller from request headers via `authenticate`, never from the message body, and depth-checks `google.protobuf.Value` inputs (`maxJsonDepth`); see [protocols.md](protocols.md). The server enforces size/depth limits and deadlines on untrusted payloads and streams.

## Known gaps affecting security posture

- **[DEBT-011](../.agents/DEBT.md) — single writer process.** `@godspeedai/cognate-store-sqlite` assumes one writer process per database. Running two writers against the same database is not a supported or safe configuration; it is an operational constraint on deployment, not an authorization gap, but it affects availability guarantees any security review should account for.
- **[DEBT-014](../.agents/DEBT.md) — erasure gaps.** See above.
- **[DEBT-015](../.agents/DEBT.md) — serial run execution.** `@godspeedai/cognate-runtime-bun` drives runs, resumes, and continuation expiry from one 10ms-tick loop, executing runs serially. Not a confidentiality or integrity issue, but a throughput/availability limit worth knowing before relying on this for latency-sensitive authorization-adjacent flows (e.g. timely continuation expiry).
- **[DEBT-016](../.agents/DEBT.md) — unpublished packages.** `cognate create --source <checkout>` vendors packed local packages rather than pulling from a registry; there is no release provenance process yet, which matters for anyone auditing supply-chain integrity of a generated application.

## Status

`CG-SEC-001` (erasure — tombstones, redacted replay gaps, invalidated derived views) and `CG-SEC-002` (credentials never reach events/artifacts/traces/cognitive entries/snapshots) are both `implemented`, per [`requirements/ledger.yaml`](../requirements/ledger.yaml). `CG-OBS-001` (causal identity chain is machine inspectable) and `CG-WIR-004` (untrusted protocol input validated, bounded, deadlined, authenticated) are also `implemented`.

## Related

- [concepts.md](concepts.md) — capabilities, scopes, and the eligibility/policy split this page assumes.
- [cognition.md](cognition.md) and [rvf.md](rvf.md) — retrieval authorization and untrusted snapshot handling in depth.
- [workflows/capability-invocation.md](workflows/capability-invocation.md) — the exact path where authorization happens, and where it does not.
- [subsystems/wire-and-protocols.md](subsystems/wire-and-protocols.md) — the trust boundary each protocol adapter must hold.
- [troubleshooting.md](troubleshooting.md) — the symptom view of every rule on this page.
- [../.agents/DEBT.md](../.agents/DEBT.md) — the full debt register.
