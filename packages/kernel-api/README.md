# @godspeedai/cognate-kernel-api

Framework-owned kernel contract (spec §8, §8.5, §9.1, §32): `Kernel`, `Scope`, `Component`, `FiberContext`, `CapabilityLease`, `Effects`, `Policy`.
No engine type appears here; engines (e.g. `@godspeedai/cognate-kernel-cordis`) implement `KernelFactory`.

- `@godspeedai/cognate-kernel-api` — types, `isCompatible` (deterministic eligibility), policies (`denyAll` default), typed errors.
- `@godspeedai/cognate-kernel-api/conformance` — the executable contract. Every engine runs all six suites unchanged.

Semantics that the suites pin down:
- resolution never consults policy; every invocation does (default deny) and emits an `invocation` audit event;
- invocation never throws: it returns `InvocationResult` (`unavailable | denied | deadline_exceeded | cancelled | failed`);
- activation is all-or-nothing; failed setup disposes that attempt's effects in reverse order and publishes nothing;
- dispose is idempotent, runs every disposer in reverse order, and rejects once with `CleanupError`;
- a provider is visible in its scope and descendants only; closing a scope closes children first.
