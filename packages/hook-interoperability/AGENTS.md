# hook-interoperability package guidance

This package owns canonical hook events, provenance and effect authorization. Parse settings passively; never execute discovered commands. Require exact native semantic mapping, trusted sources, explicit policy authorization, and injected effect executor. Unknown matcher syntax fails closed. Add adversarial tests for hook injection, mismatched tools, and failures.

Runtime: Bun >= 1.4.0. License: Apache-2.0. Test: `bun test packages/hook-interoperability/test`.
