# @godspeedai/cognate-provider-typesafe

Direct `POST /v1/systemone` adapter for `JudgmentProvider` and `judgment.evaluate`. Supports choice, score, and noul questions; no generative chat interface is faked. The calling controller must deterministically eliminate ineligible actions and obtain a durable operation key before sending a payable evaluation. Missing confidence or usage remains unknown rather than zero. Verify live model availability via the provider's current catalog.

Sources: https://docs.system-one.dev/en/docs/api and https://typesafe-jev.com/en/guides/api/ . Conformance: `bun test packages/provider-typesafe/test`.

License: Apache-2.0.
