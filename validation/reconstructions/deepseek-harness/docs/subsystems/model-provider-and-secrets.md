# Subsystem: model provider and secrets

Two small modules that together make "configure a model, then use it, then change it" work without a
restart and without leaking a credential into the durable log.

- `cognate/src/components/modelProvider.ts` — publishes `model.generate` with streaming.
- `cognate/src/components/providerRegistry.ts` — mounts, replaces, and disposes that provider.
- `cognate/src/secrets.ts` — the write-only credential file.

## Purpose

Let the operator point the app at any OpenAI-compatible endpoint with a write-only API key, and let
the agent stream from it, with a live swap that does not disturb in-flight durable state.

## Responsibilities

- Adapt a `ModelProvider` to the `model.generate` capability, forwarding text deltas into the
  invoking run's durable progress channel.
- Build a provider from non-secret config plus a lazily-read key.
- Mount the new provider, wait for it to be `ACTIVE`, and only then dispose the old one.
- Persist credentials to a `0600` JSON file and hand them out only to provider construction.

## Non-responsibilities

- They do not validate credentials. A wrong key surfaces as a provider failure classified by
  `classifyModelFailure`.
- They do not store provider configuration. That is the `model-config` projection, folded from
  `model.configured`.
- They do not log anything. There is no logging in either module.
- They do not implement retry. That is `agent.coding`'s `invokeModelGenerate`.

---

## `streamingProviderComponent`

```ts
if (!provider.features.stream || !ctx.progress) return provider.generate(request, ctx.signal);
for await (const delta of provider.stream(request, ctx.signal)) {
  if (delta.type === "text") { text += delta.text; await ctx.progress({kind: "text", text: delta.text}); }
  else if (delta.type === "done") final = delta.response;
}
return final ?? { message: {role: "assistant", content: text}, toolCalls: [], finishReason: "stop", model: provider.model };
```

**Why this exists instead of the packaged `providerComponent`.** `@cognate/profile-harness` exports a
`providerComponent` that only calls `generate`. This app needs live deltas inside the invoking run, so
it must call `provider.stream` from inside the handler and push each delta through `ctx.progress`.
The doc comment says it is "deliberately parallel to, not a copy of" the packaged one. The
`ctx.progress` channel is the G1 framework addition that made streaming through a policy-gated,
hot-swappable capability expressible at all.

**Why the fallback return matters.** A provider that advertises streaming but ends without a `done`
delta would otherwise return `undefined` to the agent. The synthesised response keeps the loop
contract intact: no tool calls, `finishReason: "stop"`.

**Component id** is `model-provider:<provider.id>`, so two providers for different base URLs produce
distinct component ids.

## `ProviderRegistry`

`buildProvider(config, secrets)` calls `openAICompatible({id, baseURL, model, apiKey})` where
`apiKey` is an **async closure** — `await secrets.get("model-provider:<providerId>") ?? ""`. The key
is therefore read at request time, not captured at mount time, and never held in a config object.

`swap(config, secrets)`:

```mermaid
sequenceDiagram
  participant Caller
  participant R as ProviderRegistry
  participant K as Kernel
  Caller->>R: swap(config, secrets)
  R->>R: buildProvider(config, secrets)
  R->>K: mount(streamingProviderComponent(provider, semanticRef))
  K-->>R: nextHandle
  R->>R: await nextHandle.waitFor("ACTIVE", 5000)
  R->>R: handle = nextHandle; current = config
  opt there was a previous handle
    R->>K: await previous.dispose("hot-swap to provider <id>")
  end
```

Mount-then-dispose, and dispose only after the new handle is `ACTIVE`. Swapping in the other order
would leave a window with no `model.generate` published, and an agent mid-turn would fail.

`J-CFG-model-provider.test.ts` proves the swap end to end: it configures against mock A, generates,
reconfigures against mock B, generates again, and asserts the `model-config` projection's `current`
row holds B's base URL — with no restart between.

**Boot re-mount.** `server.ts` reads the `model-config` projection after the components are mounted
and calls `registry.swap` if a row exists. This exists because a run resumed after a restart — a run
paused on an open approval — needs a live `model.generate` before it can continue.

## `secretStore`

`secretStore(path)` returns `{put, get, delete}` over a single JSON object.

- `readAll` returns `{}` on `ENOENT`; any other read error propagates.
- `writeAll` `mkdir -p`s the parent, writes with `{mode: 0o600}`, then `chmod`s to `0o600` — the
  explicit chmod because an existing file's mode is not changed by `writeFile`'s `mode` option alone.
- Keys are flat strings. The only key the app uses is `model-provider:<providerId>`.

`model.configure` is the only writer. `buildProvider`'s `apiKey` closure is the only reader. Nothing
else calls `get`.

## Why the key never reaches the log

Three independent mechanisms, any one of which would suffice:

1. `model.configure` is a `client.invoke` capability, and `RuntimeService.invoke` is **not** recorded
   as an event.
2. `secret.put` is called from inside that handler as a plain function call, not as a `ctx.invoke`, so
   its value is not a `run.invocation` payload either.
3. The `agent.config` run started afterwards is given only the non-secret fields, and
   `model.configured` is what the `model-config` projection folds.

`J-CFG-model-provider.test.ts` verifies the outcome rather than the reasoning: it opens
`$home/app.sqlite` read-only and asserts a distinctive secret string appears in none of
`payloads.payload`, `events.metadata`, `records.value`, or `projection_state.value`.

The UI side of the contract is `02d-model-settings-redacted-key`: reopening the Edit wizard shows
"Configured — enter a new value to replace", never the stored key.

## State

| Store | Lifetime | Contents |
|---|---|---|
| `secrets.json` | process-independent, never in the log | `{key: value}` at 0600 |
| `model-config` projection | derived from the log | provider id, base URL, protocol, model, timestamp |
| `ProviderRegistry` | process lifetime | the mounted handle and the current config |
| provider-internal | request | base URL, model id, and a key lookup closure |

## Failure modes

| Symptom | Cause | Where |
|---|---|---|
| Every `model.generate` returns 401/403 | wrong key, or a key that was never written | provider transport; classified as `HTTP_401` / `HTTP_403` by status |
| `model.generate: no such capability` mid-turn | a swap disposed the handle before the new one was `ACTIVE`, or a boot re-mount failed | `ProviderRegistry.swap` |
| `swap` hangs 5s then the run fails | the new component never reached `ACTIVE` | `nextHandle.waitFor("ACTIVE", 5000)` |
| A resumed run after restart fails to continue | no `model-config` row, or the re-mount threw before the run resumed | `server.ts:204-213` |
| Streaming text never appears in the UI | the provider does not advertise `features.stream`, or `ctx.progress` is absent | `streamingProviderComponent` |
| `secrets.json` has the wrong mode | it was created outside `writeAll` | `secretStore.writeAll` chmods every write |

## Extension points

- A non-OpenAI-compatible protocol: `openAICompatible` is called in exactly one place,
  `buildProvider`. `ModelConfig.protocol` is typed as the literal `"openai-compatible"`, so a second
  protocol is a type change plus a branch here — and a decision about what the IDM's `ModelProvider`
  entity means.
- A different credential backend: replace `secretStore` in `server.ts`. The only contract is
  `put`/`get`/`delete` and "never read by an agent run".
- A keyless local provider: `buildProvider` already tolerates a missing key (`?? ""`), which is how the
  tests point at the mock without a credential.

## Source trail

- `cognate/src/components/modelProvider.ts:11-36` — `streamingProviderComponent`
- `cognate/src/components/modelProvider.ts:19-20` — the non-streaming fallback
- `cognate/src/components/modelProvider.ts:24-32` — the stream loop and synthesised fallback
- `cognate/src/components/providerRegistry.ts:9-23` — `ModelConfig`, `buildProvider`, the key closure
- `cognate/src/components/providerRegistry.ts:36-49` — `current`, `swap`
- `cognate/src/secrets.ts:13-46` — `secretStore`
- `cognate/src/secrets.ts:24-28` — `writeAll` and the 0600 chmod
- `cognate/src/server.ts:187-213` — registry construction and boot re-mount
- `cognate/src/capabilities/modelConfigure.ts:36-46` — secret-then-swap-then-record ordering
- `cognate/test/J-CFG-model-provider.test.ts:24-60` — hot-swap and the SQLite secret scan
