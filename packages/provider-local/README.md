# @cognate/provider-local

A deterministic, rule-scripted `ModelProvider` (spec §26) for tests, demos,
and offline fallback. It is never a real model: `localProvider(options)`
matches `rules` in order by a case-insensitive substring of the last user
message and returns the first match's `respond(request)`. No match returns
a fixed "no scripted answer" reply.

Provider id is `local:<id ?? "default">`, model is the constant
`"local-rules"`, and every feature flag is `true` except
`multimodal_input`. `generate` and `stream` on the same request always
agree: `stream` chunks the generated content into `chunkSize` (default 16)
character text deltas, then yields `done` with the exact response
`generate` would return.
