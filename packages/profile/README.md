# @godspeedai/cognate-profile

Profiles are pure composition (spec §29, §40.J/K): a named, ordered
selection of registered component names plus per-component options. They
add no kernel concepts. `defineProfile` validates (non-empty name, unique
non-empty component names) and returns a deep-frozen `ProfileDefinition`
with `description` defaulting to `""`.

`resolveProfile(profile, registry)` looks up each requested component name
in a caller-supplied `ComponentEntry[]` registry, in profile order. An
unknown name resolves with reason `"unknown component"`; an entry with
`supported: false` resolves with its own `reason`; only supported entries
have `contribute(profile.options[name])` called. Every requested-but-missing
component is reported in `unresolved` — nothing is silently dropped.
