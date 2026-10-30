# capabilities — the mounted capability components

## Overview

This directory holds every capability the app publishes, each as one `Component` whose handlers do the
real work: tool execution through framework execution-world leases, workspace selection, model
hot-swap, secret writes, settings changes, plan reads, subagent starts, remote-world connections, the
cognitive-navigation set, and the Workbench set. The convention is uniform — validate input, perform
the effect, then start a deterministic agent run that records the durable fact
`[validation/reconstructions/deepseek-harness/cognate/src/capabilities/settingsChange.ts:settingsChangeComponent]`.

## Interface

- `toolCapabilitiesComponent`, `ToolReadInput`, `ToolEditInput`, `ToolBashInput`, `ToolRunCodeInput` — `tool.read`/`edit`/`bash`/`run_code` over `filesystem.*` and `process.exec` `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/tools.ts:toolCapabilitiesComponent]`
- `PathEscapeError` — re-exported containment error `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/tools.ts:PathEscapeError]`
- `workspaceSelectComponent`, `workspaceIdFor` — `workspace.select`; identity is a hash of world id and root `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/workspaceSelect.ts:workspaceIdFor]`
- `workspacePathComponent`, `workspaceManageComponent`, `sessionHistoryComponent`, `planStateComponent`, `subagentStartComponent`, `onboardingDismissComponent` — the read/manage side capabilities `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/workspacePath.ts:workspacePathComponent]`
- `executionWorldsManageComponent`, `restoreExecutionWorlds`, `parseConnect`, `parseWslList`, `CredentialsMissingError` — SSH/WSL world lifecycle `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/executionWorlds.ts:executionWorldsManageComponent]`
- `cognitiveComponent`, `CASE_OPERATIONS`, `forkWorld`, `ForkIsolation` — the cognitive-navigation capability set `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/cognitive.ts:cognitiveComponent]`
- `workbenchComponent`, `WORKBENCH_CAPABILITY_IDS`, `WorkbenchCapabilityId` — the 23 workbench capabilities `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/workbench.ts:WORKBENCH_CAPABILITY_IDS]`

## Invariants

- `tool.read`/`edit`/`bash`/`run_code` never touch `node:fs` or `Bun.spawn`; they resolve a path and delegate to the lease for the workspace's `executionWorldId`, so local and SSH workspaces share one code path `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/tools.ts:toolCapabilitiesComponent]`
- `tool.edit` throws when `old_string` is absent, and when it is ambiguous without `replace_all` `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/tools.ts:toolCapabilitiesComponent]`
- `tool.run_code` caps stdout/stderr at 20 000 characters with a truncation marker `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/tools.ts:toolCapabilitiesComponent]`
- `workspace.select` rejects a path that is not a directory in its world and never falls back to local `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/workspaceSelect.ts:workspaceSelectComponent]`
- `secret.put` rejects a missing key or non-string value and returns only `{ ok, key }`, never the value `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/secretPut.ts:secretPutComponent]`
- `model.configure` validates the wire protocol against the four accepted values before any write `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/modelConfigure.ts:modelConfigureComponent]`
- Each `settings.change*` validates its own field and records only that field, which the settings projection then merges `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/settingsChange.ts:settingsChangeComponent]`
- Connect input is validated with anchored patterns for fingerprint, host, and WSL names before any secret is stored `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/executionWorlds.ts:parseConnect]`

## Side Effects

- Reads and writes workspace files and spawns processes in the target execution world `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/tools.ts:toolCapabilitiesComponent]`
- Writes `secrets.json` through the secret store with mode 0600 `[validation/reconstructions/deepseek-harness/cognate/src/secrets.ts:secretStore]`
- Mounts and disposes `model.generate` providers at runtime on configure `[validation/reconstructions/deepseek-harness/cognate/src/components/providerRegistry.ts:ProviderRegistry]`
- Opens SSH/SFTP and WSL connections and deletes their stored secrets on disconnect `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/executionWorlds.ts:executionWorldsManageComponent]`
- Creates and removes disposable fork directories under `forkRoot` (default `tmpdir()`) `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/cognitive.ts:forkWorld]`
- Starts `agent.config` / `agent.cognitive` runs to record facts `[validation/reconstructions/deepseek-harness/cognate/src/capabilities/cognitive.ts:cognitiveComponent]`

## Verification

- Run: `cd validation/reconstructions/deepseek-harness/cognate && bun test ./test/workbench-authority.test.ts ./test/J-WS-select.test.ts ./test/J-RW-ssh-workspaces.test.ts`
