# M10 profiles — observed gates

| Date | Command | Result | Scope |
| --- | --- | --- | --- |
| 2026-09-24 | review of `profiles/harness` | 2 defects | Product code hardcoded the test identity (`alice`/`tenant-a`) for send/session; `storage.kv` was not tenant-partitioned and `subagent.start` smuggled the tenant through input. Fixed: `HarnessOptions.caller` (default `LOCAL_OPERATOR`), `storage.kv` keys partitioned by `HandlerContext.tenant`, subagent tenant from handler context. |
| 2026-09-24 | `bun test ./profiles/harness` ×3 after fixes | 9 pass, 0 fail each run | CG-PRF-003: pure composition (no kernel/runtime edits); agent loop over provider + discovered tools; sessions; live provider swap; dynamic skills with reversible registration; §35 activate → deactivate on storage removal → reactivate on restore; durable `storage.kv` partitioned by tenant; sandbox with scrubbed env and timeout; durable scheduler; subagent composition. |
