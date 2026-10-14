# Current status

**Status revision:** 55

**Summary:** Native dispatch, bounded run admission, transaction-local PostgreSQL replay and opt-in Linux namespace ports are tested; no new release or production-trust closure is claimed.

The isolated `feature/durable-dispatch-debt` branch preserves the original sibling's status changes.
Commit `ab4dd2a` is pushed. No new SDK release has been published; Workbench remains on published
0.2.0 until supported integration passes.

Native outbox owner/generation renewal and settlement now cover all built-in stores. Enrolled rows
cannot bypass fencing through legacy APIs. Bounded run admission preserves default capacity one;
higher capacity requires a trusted resource eligibility policy. Conflicting resources serialize,
and independent runs overlap at configured capacities one/two/four/eight with run-local ordering.

Workbench's membership regression exposed a real PostgreSQL pool-starvation deadlock in duplicate
receipt loading. Reads now stay on the owning transaction. The saturated-pool test fails before
the fix and passes three repeated runs afterward; the full adapter passes 42 tests/192 assertions.
Runtime/service/continuation tests pass 96/371. The latest full verification passes all 81 gates,
now including that pool regression.

The opt-in Linux execution-world provider uses the existing filesystem/process ports with new
namespaces, denied network, explicit read-only public runtime mounts, one writable workspace,
minimal environment and verified patched binary hash. Both filesystem effects and nested Bun
children run inside the namespace. The explicit real-OS gate passes ten tests/28 assertions,
including symlink/host-secret refusal, egress and nested namespace denial, timeout/abort descendant
cleanup, output limits and changed-binary refusal.

This is child-process containment, not host-application containment or production certification.
Aggregate CPU/memory/process/disk quotas, production authentication and independent security review
remain required. Outbox fencing still does not fence distributed run writes or establish physically
exactly-once external effects; caller-clock skew remains documented. No multiprocess runtime mode
is advertised.

Next: publish reviewable commits, follow the linked-version release procedure, then verify a
clean-room Workbench consumer. Keep distributed ownership and production identity work separately
gated. The task plan and contract/evidence documents contain exact commands and scope.
