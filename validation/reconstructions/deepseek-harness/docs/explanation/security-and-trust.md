# Security and trust boundaries

This is a local, single-operator tool. The boundaries below are the ones the code actually enforces.
Read the "not enforced" section as carefully as the enforced one — knowing where a guarantee stops is
part of knowing the system.

## The trust model in one line

The operator is trusted; the model is **partially** constrained; nothing here is a multi-tenant or
network-exposed system.

## Enforced boundaries

### 1. Workspace containment

Every file-touching capability resolves its path against the workspace root and rejects escapes:

```ts
const resolved = resolve(root, relativeOrAbsolute);
if (resolved !== root && !resolved.startsWith(root + sep)) throw new PathEscapeError(…);
```

`tool.read`, `tool.edit`, and the `edit`-guard's existence check all go through it. `tool.bash` and
`tool.run_code` set `cwd` to the resolved root. `J-C-tool-execution`'s second test invokes
`tool.read` with `"../../../etc/passwd"` and asserts it throws and matches `/escapes workspace root/`.

**What this is:** a resolution check. **What it is not:** a syscall sandbox. A `bash` command may
still reference absolute paths. See "Not enforced" below.

### 2. Privilege escalation requires a human

`approvalGate` requires approval exactly when `run_code` requests a `sandbox_permissions` value
ranked above the session's access mode. Unrecognised permissions and modes rank `+Infinity`, so the
gate **fails closed** on anything it does not understand. The denial text fed back to the model is
explicit that the denial is permanent and must not be worked around.

### 3. Read-before-edit

An existing file must be read in the same turn before it is edited; otherwise the edit fails with
`fs_not_observed: read <path> before editing it`. New files need no prior read. This is the
`j_c_tool_execution` journey's stated settlement condition — "the read-before-mutation observation
policy was satisfied for every write/edit".

### 4. Credentials never enter the durable log

Three independent mechanisms, verified end to end by opening the SQLite file and scanning
`payloads`, `events.metadata`, `records`, and `projection_state`:

- `model.configure` is invoked through `client.invoke`, which the runtime does not record as an event.
- `secret.put` is called from inside that handler as a plain function, not as a `ctx.invoke`, so its
  value is not a `run.invocation` payload.
- The `agent.config` run that durably records the configuration receives only non-secret fields.

Storage: `$COGNATE_HARNESS_HOME/secrets.json`, written with `{mode: 0o600}` and then explicitly
`chmod`ed (because `writeFile`'s `mode` does not change an existing file's mode). The only reader is
the closure `buildProvider` hands to the provider, which fetches the key at request time.

The UI never shows the key back: reopening Edit shows "Configured — enter a new value to replace".

### 5. Process auth

Connect calls require `Authorization: Bearer <tenant>:<actor>`, checked by `devTokenAuthenticator`.
`server.ts` prints the dev token at startup and labels it explicitly: **"dev auth … it is not
production auth."** It is the same dev-token handoff `cognate dev` uses.

### 6. Capability authorization

`rulePolicy` allows exactly the 14 capability ids in `GRANTED_CAPABILITIES` to `user` and `system`
actors, and denies everything else. A capability that exists but is not listed is unreachable — the
enforcement is a hand-maintained allowlist, so a new capability must be added to be usable.

### 7. Subprocess bounds

30-second default timeout with a kill on expiry (`timedOut: true` in the result); 20,000-character
output cap with an explicit truncation marker; `Bun.spawn` with piped streams and no shell
interpretation of the *arguments* (though `bash` is invoked as `bash -lc <command>`, which is
deliberate: it is what the tool is for).

### 8. Loopback binding

`hostname: "127.0.0.1"`. The server is not reachable from another host without an explicit change.

## Not enforced — do not assume these

| Not enforced | Reality |
|---|---|
| Action-level authorization | `buildActionPolicy` allows **every** action: `authorize: () => ({allow: true, reason: "local single-operator app: default deny is enforced at the capability layer"})`. Authority is enforced at the capability layer and nowhere else. |
| Multi-tenancy | One tenant, `local`, one operator id. The tenant prefix on projection keys is the shape a multi-tenant system would have, not an isolation boundary. |
| Command-level sandboxing | `bash -lc <command>` runs with the operator's own privileges. Containment is the working directory, not a jail. `run_code`'s harness is original and small; it is not the reference's sandbox and provides no isolation beyond that working directory. |
| Path-level sandboxing inside a command | Nothing prevents `bash` from reading or writing an absolute path outside the workspace. |
| A denied escalation, structurally | A denial is a *textual* instruction to the model. Nothing prevents a subsequent `bash` call from attempting the same effect, because `bash` never reaches the gate. This is a real gap; see [gates-and-continuations.md](gates-and-continuations.md#the-known-weakness). |
| The composer's access-mode dropdown | Present and inert. `mode` is not user-controlled, so the gate compares against a fixed `read-only` default. |
| Production-grade auth | The dev token is printed to stdout and is not a credential designed to leave the machine. |
| Secrets at rest beyond the file mode | The key is plaintext in a 0600 JSON file. Acceptable for a local tool; not encrypted. |
| Markdown sanitisation | `renderMarkdown` escapes `&`, `<`, `>` before building HTML and adds `rel="noopener"` to links. It is a small hand-rolled subset, and it is not an audit of a full renderer. |

## The inert-control surface

Because of the reconstruction's parity method, a number of controls render but do nothing: the
Settings nav's "Built-in plugins" and "Agent presets", the sidebar "Plugins" panel, per-session header
actions, the "Trajectory" tab, Good/Bad response, Branch, Usage, the composer's permission-mode and
model dropdowns, the composer's stats footer, and several Review-panel toolbar buttons. Each is
`disabled` with a `title` naming the reason, and each is catalogued in
[../reference/deviations.md](../reference/deviations.md). See
[parity-method.md](parity-method.md#why-deviation-is-a-first-class-concept) for why they exist and
`cognate/PRODUCT.md` Principle 3 for why they are now a product problem rather than a preserved
decision.

## If you are hardening this

The changes with the best ratio of effect to effort, in order:

1. Narrow `buildActionPolicy` so it is not a blanket allow.
2. Constrain `tool.bash` / `tool.run_code` — a real sandbox, or an allowlist of commands.
3. Wire the access mode through from the UI, removing the `read-only` default.
4. Enforce a structural (not textual) consequence for a denied escalation — for example, refuse any
   later tool call whose `sandbox_permissions` re-requests the denied level in the same turn.
5. Replace the dev token with a real session mechanism before binding to anything but loopback.

## Related

- [../architecture.md](../architecture.md) §7 — the boundary table
- [../subsystems/capabilities.md](../subsystems/capabilities.md) — containment and subprocess bounds
- [../subsystems/model-provider-and-secrets.md](../subsystems/model-provider-and-secrets.md) — the credential path
- [../subsystems/server-runtime.md](../subsystems/server-runtime.md) — policy and auth
- [gates-and-continuations.md](gates-and-continuations.md) — the approval gate's limits
- [../reference/deviations.md](../reference/deviations.md) — `run_code`'s sandbox entry
