# execution-ssh — SSH host as an execution world

## Overview

`package.json` declares `@godspeedai/cognate-execution-ssh`, an SSH host presented as an `ExecutionWorldProvider`: files over SFTP, commands over `exec`, with mandatory host-key verification, ProxyJump, and clean disposal. The `exports` map exposes two entries, `.` for the provider and `./fixture` for the test server. The source lives entirely in `src/`; this directory holds the manifest and the package-level metadata files.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — the provider, host-key policy, and ssh2 test fixture

## Global Invariants

- The package depends on `@godspeedai/cognate-execution` for the port contract and on `ssh2` for the transport, keeping transport types out of the framework contract `[packages/execution-ssh/package.json:dependencies]`
- `./fixture` is a separate export path so the fake SSH server is opt-in at pack time while still shipped in `files` `[packages/execution-ssh/package.json:exports]`

## Global Side Effects

- None at package load; effects belong to the provider in `src/` `[packages/execution-ssh/package.json:exports]`

## Verification

- Run: `cd packages/execution-ssh && bun test`
