# packages/provider-local

Keep it deterministic: same request must always produce the same response,
and `stream`'s concatenated text deltas must always equal `generate`'s
content exactly (no randomness, no clock/env reads). Don't edit `test/`.
