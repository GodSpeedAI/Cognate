# provider-wire package guidance

Keep shared fetch and streaming primitives protocol-neutral. HTTP errors must be typed without copying untrusted upstream bodies into logs. SSE decoder must preserve framing across chunks and preserve the consumer's cancellation. Only protocol adapters may determine terminal settlement events.

Runtime: Bun >= 1.4.0. License: Apache-2.0. Test: `bun test packages/provider-wire/test`.
