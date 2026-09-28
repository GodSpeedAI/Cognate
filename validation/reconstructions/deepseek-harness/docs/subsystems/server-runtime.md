# Subsystem: server runtime

`cognate/src/server.ts` (297 lines) is the composition root: the only place that knows the store
path, the policy, the agent list, which components are mounted, which projections are public, and
which HTTP routes exist.

## Purpose

Turn a directory (the "home") and a port into a running Cognate runtime, a Connect RPC endpoint, and
a browser UI — and own the lifecycle of all three.

## Responsibilities

- Create the data directory and derive the SQLite store path and the secrets path.
- Load and validate the Interaction Domain Model, then derive the 12 bound capability contracts.
- Compose `createRuntime` with the policy, action policy, agents, static components, and public
  projections.
- Mount the two components that cannot be built before the runtime exists (`workspace.select`,
  `model.configure`), and the model provider when one is already configured.
- Re-mount the last-configured provider on boot so a run resumed after a restart has a live
  `model.generate`.
- Seed the in-memory "known workspace ids" set from the persisted projection, then keep it current
  from the live event stream.
- Generate the browser entry file, bundle the UI, and serve UI, CSS, `/health`, and Connect from one
  `Bun.serve`.
- Print the dev auth token on start; abort the event follower and close the runtime on stop.

## Non-responsibilities

- It does not implement any capability logic. Every handler lives in `src/capabilities/`.
- It does not decide authorization policy beyond the two policy builders; the real gate is the
  capability layer and the approval gate.
- It does not render anything. It serves bytes.
- It does not persist application state directly. Only the runtime writes the store.

## Position in the system

Called by:

- `cognate/test/helpers.ts` `bootApp` — port 0, temp home
- `cognate/src/server.ts` `import.meta.main` — `bun run dev`
- journey tests that restart the app against the same home (`startServer` directly)

Calls into: `createRuntime`, `loadDomain` + the `bindTranche*` functions, every component factory,
every projection, `ProviderRegistry`, `secretStore`, and the Connect router registration.

## Core abstractions

**`ServerOptions`** — `{port, home}`. The entire configuration surface of the process.

**`AppServer`** — `{url, runtime, stop()}`. What tests hold.

**`LOCAL_OPERATOR` / `SYSTEM_CALLER`** — the two callers. `LOCAL_OPERATOR` is
`{tenant:"local", actor:{id:"operator", kind:"user"}}` and is both the browser's identity and the
identity the app reads projections with. `SYSTEM_CALLER` is `{id:"system", kind:"system"}` and
starts `agent.config` and child runs.

**`GRANTED_CAPABILITIES`** — the 14 capability ids the policy allows for `user`/`system` actors. It
is a hand-maintained allowlist; a new capability that is not added here will be denied.

**`getService` late-binding closure** — capabilities that need to start runs or read projections
receive `() => RuntimeService` rather than the service, because the service does not exist until
after `createRuntime` resolves. `serviceRef.current` is assigned immediately after.

## Internal operation

### Boot sequence

```mermaid
sequenceDiagram
  participant S as startServer
  participant FS as filesystem
  participant D as domain/index.ts
  participant RT as createRuntime
  participant K as Kernel
  participant P as ProviderRegistry

  S->>FS: mkdir(home); derive app.sqlite + secrets.json
  S->>D: loadDomain()
  D-->>S: 51 objects + digest (logged)
  S->>D: bindTranche5/7/9/10(domain)
  D-->>S: 12 CapabilityContracts
  S->>RT: createRuntime({store, policy, actions, agents, components, projections, system})
  RT-->>S: runtime (projections caught up from position 0)
  S->>RT: serviceRef.current = runtime.service
  S->>RT: readProjection(workspaces) → seed knownWorkspaceIds
  S->>P: new ProviderRegistry(runtime.kernel, semanticRef)
  S->>K: mount(workspaceSelectComponent)
  S->>K: mount(modelConfigureComponent)
  S->>RT: readProjection(model-config)
  opt a provider is configured
    S->>P: swap(config, secrets)
  end
  S->>S: start live event follower (workspace.added → knownWorkspaceIds)
  S->>S: write .generated/entry.tsx; Bun.build → bundleJs
  S->>S: Bun.serve({...})
```

Order matters in two places. The projections must be registered before the first read, because
`createRuntime`'s startup catch-up is what makes a restarted app's rows appear. The provider re-mount
must happen after the components are mounted and after the projection read, because a run resumed
after a restart needs a live provider before it can call `model.generate` at all.

### HTTP surface

| Route | Behaviour |
|---|---|
| `GET /health` | `{ok: true, semantic: {objects, digest}}` — object count and digest of the parsed IDM |
| `/cognate.v1.RuntimeService/*` | Connect handler, looked up by exact path in a prebuilt map |
| `GET /app.js` | the browser bundle |
| `GET /app.css` | `src/ui/app.css`, read from disk at boot |
| `GET /astryx.css`, `GET /theme.css` | `stylesheetPaths()` from `@cognate/ui-astryx/styles` |
| `GET /` | inline HTML shell |
| anything else | `404 not found` |

The Connect router's `handlers` are converted once at boot into a `Map<path, fetchHandler>` rather
than matched per request.

### Policy

```ts
rulePolicy("deepseek-harness-app", [
  (request) =>
    (request.actor.kind === "user" || request.actor.kind === "system") &&
    GRANTED_CAPABILITIES.includes(request.capability.id)
      ? { allow: true, policyId: "deepseek-harness-app", reason: … }
      : undefined,
])
```

The action policy allows every action with the reason
`"local single-operator app: default deny is enforced at the capability layer"`. That comment is the
honest description: authority is not enforced at the action layer here.

### The live event follower

A detached async IIFE iterates `runtime.service.events(LOCAL_OPERATOR, {follow: true, signal})` and
adds `workspaceId` to `knownWorkspaceIds` on every `workspace.added`. `workspace.select` consults
that set to decide between `workspace.added` + `workspace.selected` and `workspace.selected` alone —
i.e. "new directory" versus "switching back to a known one". The set is seeded from the persisted
projection first so a restart does not re-add everything. `stop()` aborts the controller, and the
`catch` around the loop absorbs the abort.

## State

Reads: `workspaces` and `model-config` projections. Owns: the SQLite file handle (via the runtime),
the mounted provider fiber, the event follower, the HTTP server. Writes: no events of its own; it
only starts runs on behalf of capabilities.

## Lifecycle

`startServer` → bind to port → serve. `stop()` aborts the follower, calls `server.stop(true)` to
force-close connections, then `runtime.close()`. There is no partial shutdown path; a stop during an
in-flight run leaves that run recorded as non-terminal, and the runtime resumes it on the next boot.

## Failure modes

| Symptom | Cause | Where |
|---|---|---|
| Process exits during boot with a JSON error naming a `.sea` path | IDM parse failure; the app fails fast rather than starting unbound | `loadDomain`, throws when `!result.ok` |
| Boot throws `expected N bound contracts` | a `tranche*Bindings` list and its `bindTranche*` destructuring disagree — the list and the tuple must be edited together | `domain/index.ts` |
| Boot throws `failed to bundle the UI` | `Bun.build` failure; the message concatenates `build.logs` | `server.ts:252` |
| `runtime not ready` | a capability invoked before `serviceRef.current` was assigned | `getService` |
| Provider errors right after restart | the `model-config` projection had a row but `registry.swap` was skipped or failed | `server.ts:204-213` |
| 404 on a Connect path | path did not match a registered handler exactly | `server.ts:267-270` |
| `PathEscapeError` surfacing to the model as text | expected: it is caught in `invokeTool` and fed back as a tool result | `agentCoding.ts:242-246` |

## Extension points

- A new static component: add it to the `components` array (or mount it after, if it needs
  `getService` / the registry).
- A new public projection: add `{projection, public: true}` and the UI can read it by name.
- A new agent: add to `agents`.
- A new route: extend the `fetch` switch. Keep it additive; the Connect path prefix is reserved.
- A new capability: it must be added to `GRANTED_CAPABILITIES` or the policy denies it, and a
  `client.invoke` from the browser will fail with a permission error.

## Source trail

- `cognate/src/server.ts:41-42` — `LOCAL_OPERATOR`, `SYSTEM_CALLER`
- `cognate/src/server.ts:44-53` — `ServerOptions`, `AppServer`
- `cognate/src/server.ts:55-70` — `GRANTED_CAPABILITIES`
- `cognate/src/server.ts:72-91` — `buildPolicy`, `buildActionPolicy`
- `cognate/src/server.ts:93-132` — `BROWSER_ENTRY_TEMPLATE`, `indexHtml`
- `cognate/src/server.ts:134-289` — `startServer`
- `cognate/src/server.ts:154-179` — `createRuntime` composition
- `cognate/src/server.ts:219-231` — live event follower
- `cognate/src/server.ts:239-244` — in-process Connect handler map
- `cognate/src/server.ts:258-278` — `Bun.serve` route table
- `cognate/src/server.ts:291-297` — CLI entry, dev token print
- `cognate/.generated/entry.tsx` — regenerated browser entry (not a source file)
- `cognate/test/helpers.ts:19-25` — `bootApp`
- `cognate/test/J-D-approval.test.ts:147` — `startServer` after a full restart
