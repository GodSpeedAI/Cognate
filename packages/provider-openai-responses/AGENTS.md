# provider-openai-responses package guidance

Use OpenAI Responses API wire semantics; never translate to /chat/completions. Store=false and require response.completed before final settlement. Resolve credentials per request; do not imply a provided bearer token is verified SIWC OAuth. Test tool outputs, lifecycle failures, cancellation and credentials redaction.

Runtime: Bun >= 1.4.0. License: Apache-2.0. Test: `bun test packages/provider-openai-responses/test`.
