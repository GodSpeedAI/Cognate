# @godspeedai/cognate

The Cognate SDK's convenience entrypoint: one dependency for the reference runtime and the headless client.

```ts
import { createRuntime, createClient } from "@godspeedai/cognate";
```

## Exports

| Entry | Contents |
|---|---|
| `@godspeedai/cognate` | Curated start-here surface: `createRuntime`, `createClient`, and their core option/state types (`RuntimeOptions`, `CognitionOptions`, `ClientOptions`, `RunState`, `AgentDefinition`, `Caller`, `RuntimeService`, …). |
| `@godspeedai/cognate/runtime` | The full reference runtime — everything from `@godspeedai/cognate-runtime-bun`. |
| `@godspeedai/cognate/client` | The full headless client — everything from `@godspeedai/cognate-client`. |

This package owns no implementation. Every export is a re-export of an owning
`@godspeedai/cognate-*` package, so behavior and versioning stay with the owner.
Heavier integrations (cognitive backends, RealityTrace, DomainForge, protocol
transports, React bindings) are deliberate opt-ins via their own packages and
are intentionally not bundled here.

This package is Bun-native like the rest of the SDK (`engines: bun >= 1.4.0`).

## Consumer type setup

The SDK ships Bun-native TypeScript source, so typechecking a consumer
project needs the ambient type packages alongside the SDK:

```sh
bun add -d @types/bun @types/node
```
