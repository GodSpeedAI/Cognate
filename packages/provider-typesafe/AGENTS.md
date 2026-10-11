# provider-typesafe package guidance

Use /v1/systemone native typed choices, scores, and noul questions: not a chat provider. Caller must deterministically eliminate invalid choices before judgment, budget payable credits, and persist operation key/body before retries. Keep idempotency and missing-value semantics intact. No credential exposure.

Runtime: Bun >= 1.4.0. License: Apache-2.0. Test: `bun test packages/provider-typesafe/test`.
