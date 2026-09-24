# packages/provider-openai-compatible

Never let an error message, contract, or log include the raw API key (spec
§32) — `apiKey()` is read fresh per request. Keep the wire mapping aligned
with the real OpenAI chat-completions shape (verify against Context7, not
memory) before changing it. Don't edit `test/`.
