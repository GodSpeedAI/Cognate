# @godspeedai/cognate-profile

Declarative composition for Cognate applications: `defineProfile` names an ordered selection of registered components plus their configuration, and `resolveProfile` turns that selection into contributions. Profiles add no kernel concepts — they only select and configure what packages already register.

**When to use this package:** you are defining a reusable application composition (a "profile") or building the registry a profile resolves against. Ready-made profiles include
[`@godspeedai/cognate-profile-harness`](https://www.npmjs.com/package/@godspeedai/cognate-profile-harness)
and [`@godspeedai/cognate-profile-copilot`](https://www.npmjs.com/package/@godspeedai/cognate-profile-copilot).

## Installation

```sh
bun add @godspeedai/cognate-profile
```

Requires [Bun](https://bun.sh) >= 1.4.0.

## Quick start

```ts
import { defineProfile, resolveProfile } from "@godspeedai/cognate-profile";
import type { ComponentEntry } from "@godspeedai/cognate-profile";

// A registry: entries a package provides, each producing one contribution.
const registry: ComponentEntry<string[]>[] = [
  {
    name: "sessions",
    package: "@godspeedai/cognate-runtime-bun",
    supported: true,
    contribute: () => ["sessions"],
  },
  {
    name: "agents",
    package: "@godspeedai/cognate-runtime-bun",
    supported: true,
    contribute: (options) => [`agents:${JSON.stringify(options ?? null)}`],
  },
];

// Validate and freeze the profile. Names must be unique and non-empty.
const profile = defineProfile({
  name: "research-workbench",
  description: "Sessions plus a bounded agent pool",
  components: ["sessions", "agents"],
  options: { agents: { max: 2 } },
});

const resolved = resolveProfile(profile, registry);
resolved.contributions; // [{ name: "sessions", ... }, { name: "agents", contribution: 'agents:{"max":2}' }]
resolved.unresolved; // every requested name that could not be included, with a reason
```

`resolveProfile` walks the profile's components in order, calling `contribute(profile.options[name])` only for supported entries. An unknown name is reported with reason `"unknown component"`; an entry marked `supported: false` is reported with its own reason. Nothing is ever silently dropped.

## What the types guarantee

- `defineProfile` returns a deep-frozen `ProfileDefinition`: the component list and options cannot be mutated after definition, and validation errors throw `ProfileError` at definition time, not resolution time.
- `ResolvedProfile` separates `contributions` (in profile order, each tagged with its source package) from `unresolved` (requested but absent, each with a reason), so a composition can show exactly what it is running and why anything is missing.
- `ComponentEntry.supported: false` records an unavailable component explicitly, with a human-readable `reason`.

## Limitations

- Pure data: this package validates and resolves — it mounts nothing, starts nothing, and knows no registry by itself. The caller owns what `contribute` returns and what happens with the resolved contributions.
- Options are opaque to this package; they are passed through to each entry's `contribute` untouched.

## Related packages

- [`@godspeedai/cognate-kernel-api`](https://www.npmjs.com/package/@godspeedai/cognate-kernel-api) — the kernel contract profiles select against, without extending it.
- [`@godspeedai/cognate-runtime-bun`](https://www.npmjs.com/package/@godspeedai/cognate-runtime-bun) — the runtime compositions are typically resolved into.
- [`@godspeedai/cognate`](https://www.npmjs.com/package/@godspeedai/cognate) — the SDK umbrella.

## License

Apache-2.0
