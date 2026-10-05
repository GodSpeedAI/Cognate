# packages/execution

Framework-owned execution-world contracts (spec §8.2, §28). An **Execution World** is where a
workspace's filesystem and processes live; SSH, WSL, containers and the local machine are all just
*providers* of the same `FileSystemPort` / `ProcessPort` ports.

Rules:

- Never import a transport or library type here (no `ssh2`, no `node:child_process` re-export, no
  DeepSeek/Cordis types). A provider owns its library; only these interfaces cross the boundary.
- `resolve(root, path)` is the **containment boundary**. A provider must reject any path that
  escapes its root with `PathEscapeError`. Nothing above the provider may substitute a fallback.
- Fail closed. An unknown or unreachable world raises `WorldUnavailableError`; it never silently
  executes somewhere else.
- `metadata` is safe for durable state, projections and logs — connection facts, never secrets.