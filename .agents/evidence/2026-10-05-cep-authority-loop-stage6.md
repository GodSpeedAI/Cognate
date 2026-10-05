# Stage 6 evidence: Cognate <-> SEA-Forge CEP authority loop

Observed 2026-10-04/05 on branch cognate/harness, against sea-rs migration/cep-world-ref.

- Live run: `SEA_FORGE_SERVER_BIN=<sea-rs>/target/debug/sea-forge-server CEP_REPO=~/projects/cep bun test packages/runtime-bun` -> 86 pass, 0 fail.
- Finding: the first live run failed with "unknown world". DomainForge's CLI derives logical URIs relative to the entry's directory (`demo.sea`); SEA-Forge's world config had used `worlds/demo.sea`. Logical paths are part of world identity, so the worlds differed. SEA-Forge's world config now takes `base` + entry-relative `files` (commit in sea-rs). After that both arrive at the same world_ref independently.
- Fail-closed paths exercised live: unregistered world, server unreachable. Escalated capability: provider did not run.
- `just verify` 78/78; tsc clean; full-suite 77 pre-existing failures unchanged.
