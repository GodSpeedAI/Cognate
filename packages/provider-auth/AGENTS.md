# provider-auth package guidance

This package owns ephemeral per-request credential leasing and plan-usage policy. Never persist, log, emit, or include token material in a contract. OAuth sign-in is NOT implemented here; accepting an arbitrary bearer is not authentication. Unattended plan usage requires separately established express user consent.

Runtime: Bun >= 1.4.0. License: Apache-2.0. Test: `bun test packages/provider-auth/test`.
