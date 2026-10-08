# Why adapters, and what an adapter may not do

**What is confirmed vs. inferred.** The adapter boundaries and their enforcement are confirmed by
the dependency tests. The reasoning about *why each boundary is drawn where it is* is
reconstructed from the ADRs and the spec; treat it as strong inference unless cited.

## The rule

> An adapter binds a framework-owned contract to one external engine or service, and keeps that
> engine's types out of every public interface.

The rule has a mechanical half and a rhetorical half, and the mechanical half is the one that
matters:

```ts
// tests/architecture/dependencies.test.ts
const OWNERS = {
  cordis: ["@godspeedai/kernel-cordis"],
  "@ruvector/core": ["@godspeedai/ruvector-core"],           // cognitive-ruvector
  "@ruvector/rvf": ["@godspeedai/cognitive-rvf"],
  "@godspeedai/domainforge": ["@godspeedai/domainforge"],
  "@ag-ui/core": ["@godspeedai/ag-ui"],
  "@astryxdesign/core": ["@godspeedai/ui-astryx"],
  "@connectrpc/connect": ["@godspeedai/protocol-connect", "@godspeedai/protocol-connect-bun", "@godspeedai/proto"],
  "@modelcontextprotocol/sdk": ["@godspeedai/mcp"],
};
```

Each third-party engine is imported by exactly one package. That is not a style preference; it is
what makes "Cordis can be removed conceptually" and "RuVector can be deleted operationally"
mechanically checkable rather than aspirational.

## The boundary list

| Contract (framework-owned) | Adapter | Engine |
|---|---|---|
| `KernelFactory` (`kernel-api`) | `kernel-cordis` | Cordis 4.0.0-rc.10 |
| `SemanticRef` production (`kernel-api`) | `domainforge` | `@godspeedai/domainforge` 0.18.2 |
| `CognitiveIndex` (`cognitive-api`) | `cognitive-ruvector` | `@ruvector/core` 0.1.32 |
| portable snapshot | `cognitive-rvf` | `@ruvector/rvf` 0.3.4 |
| `ObservationPort` | `realitytrace` | the RealityTrace CLI |
| `RuntimeService` (`runtime-api`) | `protocol-connect`, `protocol-connect-bun` | Connect 2.2.0 over `Bun.serve` |
| UI surfaces | `ui-astryx` | Astryx 0.6.3 |
| protocol shapes | `ag-ui`, `mcp`, `a2a` | `@ag-ui/core`, `@modelcontextprotocol/sdk`, `@a2a-js/sdk` |
| `ModelProvider` | `provider-local`, `provider-openai-compatible` | none / `fetch` |

## The three properties an adapter must preserve

### 1. It may not leak the engine's types

`packages/kernel-cordis/src/kernel.ts:1-2` says it in a comment and the code honours it: the file
imports Cordis, but nothing in an exported signature does. `runtime-bun` uses `kernel-api` types
throughout; Cordis types never cross. The same for `client` (no React), `react` (no Astryx), and
`cognitive-api` (no RuVector).

This is why `@godspeedai/runtime-api` exists at all
([ADR-0011](../decisions/ADR-0011-runtime-service-contract-package.md)). The spec (§22) requires the
service interface to be isolated from the RPC adapter. Had the interface lived in `runtime-bun`,
every protocol adapter would depend on Bun; had it lived in `proto`, the wire schema would define
the semantics, violating §3.7.

### 2. It must pass the framework's conformance kit unchanged

`kernelConformance` (six suites), `storeConformance`, `cognitiveIndexConformance`,
`runtimeServiceConformance`. The kit — not a bespoke test — is what proves interchangeability. A
new engine, store, index, or service is "supported" when it passes the same kit the reference
implementation passes.

### 3. It may not change the upstream project

`.sea` is unchanged (§3.1). DomainForge is consumed as a pinned release, never forked
(`tests/architecture/acceptance.test.ts`, criterion D — it asserts the version is an exact
`x.y.z`, not a path or range). RealityTrace is unchanged: the adapter submits through RealityTrace's
own CLI and CEP workflow rather than proposing a new ingestion API (§3.3).

The discipline this produces in practice: when an upstream gap blocks you, you mitigate *in the
adapter* and record the gap as debt, rather than changing the upstream or the contract. The RVF
adapter is the clearest example — four upstream gaps in `@ruvector/rvf` 0.3.4, four Cognate-side
compensations, one debt entry ([ADR-0006](../decisions/ADR-0006-portable-cognition-rvf.md), DEBT-006).

## What "adapters all the way down" costs

The cost is real and shows up in the debt register:

- **Mitigation code becomes the maintained surface.** The RVF integrity manifest, the RuVector
  over-fetch, and the Cordis lifecycle shims are Cognate's problem for as long as the upstream
  gap stands. If the upstream fixes the gap, the mitigation is dead code that must be removed
  deliberately.
- **Conformance kits are a public contract.** Changing one obliges every implementation to change
  at once. That is the point — but it is why the kits are versioned and reviewed carefully.
- **Some accepted architectures are partial.** ADR-0006 is marked blocked/unsupported upstream;
  ADR-0002, 0003, 0007–0010 record Phase 0 characterization decisions, several written before the
  adapter code existed. Their *decisions* still hold; their *status lines* are historical. See
  [the note at the end](../decisions/).

## The rule for adding a feature

The repository states it as a design rule and the ADRs apply it consistently:

> Does this require a genuinely new semantic or runtime primitive, or is it another projection or
> composition of primitives we already have?

| If the feature is… | Do this |
|---|---|
| another representation of an operation | write an adapter |
| another bundle of capabilities | write a profile |
| another implementation of a contract | write a provider or an engine adapter |
| a genuinely new primitive the model cannot express | *then* enlarge the kernel — deliberately, with its proof updated |

SONA is the worked example of the second row: it looked like a new capability, and characterization
showed it was not a ranker at all. The answer was a small UCB1 ranker over existing primitives, not
a kernel change (ADR-0005).

## Source trail

- `tests/architecture/dependencies.test.ts` — `FORBIDDEN`, `OWNERS`, acyclicity.
- `tests/architecture/engine-boundary.test.ts` — engine types do not cross contracts.
- `tests/architecture/acceptance.test.ts` — criteria A–M, each bound to implemented requirements.
- `tests/architecture/invariants.test.ts` — no `.sea` grammar, pinned upstream releases,
  framework-only wire schema, no RxJS (`CG-ARC-003`).
- `packages/runtime-api/package.json` — `dependencies` proving ADR-0011's "no runtime deps".
- `packages/extensions.md` → [../extensions.md](../extensions.md) — the extension surface.
- spec §3.1–3.4, §3.7, §21–24, §27–28, §39–40.
- [ADR-0001](../decisions/ADR-0001-kernel-engine-cordis.md),
  [ADR-0002](../decisions/ADR-0002-semantic-binding-domainforge.md),
  [ADR-0003](../decisions/ADR-0003-wire-connect-protobuf.md),
  [ADR-0004](../decisions/ADR-0004-cognition-ruvector.md),
  [ADR-0005](../decisions/ADR-0005-adaptive-ranking-sona.md),
  [ADR-0006](../decisions/ADR-0006-portable-cognition-rvf.md),
  [ADR-0007](../decisions/ADR-0007-observations-realitytrace.md),
  [ADR-0008](../decisions/ADR-0008-ag-ui.md),
  [ADR-0009](../decisions/ADR-0009-ui-react-astryx.md),
  [ADR-0010](../decisions/ADR-0010-mcp.md),
  [ADR-0011](../decisions/ADR-0011-runtime-service-contract-package.md).

## Related

- [../architecture.md](../architecture.md) — the plane and dependency model.
- [../subsystems/capabilities-and-cognition.md](../subsystems/capabilities-and-cognition.md) — the
  adapter implementations.
- [../reference/architecture-tests.md](../reference/capability-and-architecture-contracts.md) — what each
  architecture test pins.
