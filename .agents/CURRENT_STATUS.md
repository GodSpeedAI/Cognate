# Current status

**Status revision:** 67

**Summary:** Authorized PR44 final source repairs all actionable scoped review findings. Real PostgreSQL/Linux runtime suites pass38/189; full81/81 gates pass. Latest-head CI/packaging and complete linked publication still precede Workbench consumption.

SDK0.4.0 remains published at all45 linked names, release467a5f. Workbench consumes only that
supported release; no local source checkout is an application dependency.

PR44 adds awaitable authoritative resource eligibility and cooperative shutdown/recovery. Final
review repairs preserve cancellation through slot acquisition and the executor's initial store
read; late permits are released. Startup recovery uses durable outbox retry. Monotonic250ms/100
candidate reconciliation bounds scan frequency; the full query remains unpaginated.

The slot-wait, stale-snapshot, late-grant and250-candidate backlog regressions fail before repair and
pass afterward. Final actual PostgreSQL/Linux suite: **38 pass, zero fail,189 assertions**. Full
`just verify` with explicit reviewed Bubblewrap0.12 attestation: **81/81 gates pass**. Typecheck,
diff check and fresh Luna source review pass. Earlier5c85e4cCI/packaging pass but do not cover the
new source; exact new-head checks remain required.

The operator approved PR44 and its linked release. The45-package release configuration and trusted
publishing readiness were rechecked. No merge/publication has happened yet.

Limits: ignored policy callbacks retain capacity; signal-ignoring handlers may delay shutdown.
Interrupted effects require commitments/reconciliation. Outbox fencing is not distributed run-write
ownership; Linux child containment is not production authentication, host isolation or aggregate
resource control. The incorrect distro patch claim is withdrawn; explicit upstream0.12 provenance
and OS receipts replace it. The overall debt mission remains incomplete.
