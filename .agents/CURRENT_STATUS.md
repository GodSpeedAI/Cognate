# Current status

**Status revision:** 28

**Stage:** DeepSeek Harness console: the RealityTrace plugin toggle is real (durable per-plugin state gating the SXR drain) and the trajectory view matches the reference developer-tools structure (Duration/Turns/Calls toolbar, three-lane timeline, step heading, timing source)

**Summary:** Usage pass U7 makes the plugin toggle real and completes the developer-tools trace structure, per the operator's direction and the pinned reference observations. The RealityTrace switch in the sidebar Plugins panel and Settings -> Built-in plugins is no longer inert: it writes durable per-plugin state via the new settings.changePlugin capability (a 10th SETTING_FIELDS entry anchored on UserPreferences), whose settings.changed event the settings projection folds into a per-key-merged plugins map (default disabled, restart-surviving). The RealityTrace observation drain gate reads that same fold every cycle: off skips the cycle so observations stay queued (at-least-once, nothing lost), on delivers the backlog to the pinned SXR CLI; a failed projection read is fail-closed. The trajectory view now carries the reference's toolbar (Use actual duration rendering event-derived row durations, Collapse/Expand turns, Collapse/Expand calls folding tool rows, Search trajectory) and the Trajectory timeline region as three labeled lanes (Input/Model/Tools) with segments positioned from the events' own timestamps in the app's own palette; the Event details header gained the reference's '· Step N' and the Timing tab 'Timing source: Session timestamps'; the RealityTrace tab states plainly when the plugin is off. J-PLG-toggle proves validation fails closed, fold durability across a full restart, and the off-queues/on-delivers gate end-to-end against the real binary; J-RT enables the plugin first (it exercises delivery); DEVIATIONS.md records exactly what became real and what stays approximated. Observed: deepseek suite 39 pass / 0 fail (37 + 2 new), J-RT 2/0, typecheck clean, just verify 78/78 (one transient whole-ledger flake, CG-PRF-002, standalone-green on immediate re-run — the documented F-06 class, second occurrence, different gate than the first), copilot journeys 12/0.

**Verified:** - New suite J-PLG-toggle (2 tests): validation rejects unknown plugin ids/non-boolean/empty patches with zero settings.changed events; toggle on→off→on folds per key; full runtime restart re-folds the enabled state and the toggle keeps working; the drain-gate journey (real binary): with the plugin off, every observation stays state=queued with no targetRef across multiple drain intervals, and after settings.changePlugin on, the entire backlog delivers (state accepted/duplicate, obs- ids, SXR targetRef) within the at-least-once window
- J-RT-realitytrace seeded via settings.changePlugin and still green (2/0) — the delivery journey now exercises the gated path; full deepseek suite: bun test cognate/test → 39 pass / 0 fail / 285 expect() across 18 files
- UI: sidebar Plugins panel and Built-in plugins pane render the RealityTrace switch from the durable fold (aria-checked, real onClick invoking settings.changePlugin); the trajectory toolbar carries aria-labelled Use actual duration / Collapse turns / Collapse calls toggles + Search; the timeline renders only when the trace has timestamped events; details header TOOL Turn N · Step M; Timing source row; plugin-off banner in the RealityTrace tab
- Policy allowlist extended with settings.changePlugin (the first run failed permission_denied — caught by the test, fixed, re-verified)
- just verify 78/78 (serial re-run; one transient CG-PRF-002 whole-ledger flake, standalone-green); copilot journey suite 12/0 — no cross-reconstruction regression
- DEVIATIONS.md updated: the plugins section now describes the one real toggle and its durable gate; the trajectory section records the realized timeline/toolbar and the remaining approximations (proportional timeline geometry, JSON pre-rendering instead of tree widgets, no Usage tab, no-op Hierarchy button)

**Limits:** - Default plugin state is disabled: a fresh home queues observations until the RealityTrace plugin is enabled — an intentional behavior change from the pre-U7 always-drain wiring (journeys that prove delivery enable the plugin first)
- The tolerant read in the drain gate addresses the settings projection per cycle; a failed read is fail-closed (queues) — deliberate, at-least-once semantics recover it
- Remaining trajectory approximations unchanged: no SYSTEM/CONTEXT rows (no system prompt/context snapshots sent), proportional timeline geometry, formatted-JSON Payload/Schema (not expandable trees), no token Usage tab, no-op Hierarchy button; all other plugin switches stay inert (always-on compositions, no install backend)
- The transient whole-ledger gate flake (F-06) has now occurred twice with different gates (AK-006, CG-PRF-002), both standalone-green and green on serial re-run; the deterministic install-skew leg remains fixed, the transient leg remains operational (serialize heavy runs)
- Work committed on cognate/harness; the deepseek-harness tree was touched under explicit operator direction this turn

**Next:** Operator review; remaining known candidates are the pre-existing trajectory approximations (expandable JSON trees, Usage tokens, Hierarchy jump) if a future pass wants them, and FU-2 (reference-side MCP leg) upstream.

**Evidence:** - .agents/evidence/2026-10-01-copilot-r6-critic.md
- .agents/evidence/2026-10-01-copilot-mcp-open-ended.md
- validation/reconstructions/deepseek-harness/cognate/DEVIATIONS.md

**Spec:** .agents/specs/software-design-spec-cognate.-frameworkmd

**Ledger:** requirements/ledger.yaml
