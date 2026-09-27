# Journey suite results - reference vs Cognate

Generated 2026-09-27T18:55:00.723Z.

| Journey | Test | Reference | Duration | Cognate | Duration |
|---|---|---|---|---|---|
| A-first-use | launch shows initial UI with no workspace yet, then model config + workspace selection enable the composer | PASS | 11.1s | PASS | 5.3s |
| B-basic-session | send a deterministic prompt, see it stream to completion, then find it in history and switch back to it | PASS | 15.4s | PASS | 7.0s |
| C-tool-execution | a multi-step coding task shows tool activity, produces a final answer, and actually mutates the workspace file on disk | PASS | 15.5s | PASS | 14.1s |
| D-approval | allow branch: approving a pending approval lets the run resume and complete | PASS | 18.1s | PASS | 9.9s |
| D-approval | deny branch: denying a pending approval leaves the action un-executed and the workspace unchanged | FLAKY (2 attempts) | 19.0s | PASS | 6.4s |
| E-plan | a plan-mode task shows a plan review card and, once approved, a persisted to-dos state | PASS | 16.6s | PASS | 6.3s |
| F-delegation | delegating a task shows the subagent as active, then completed, with the parent completing too | FLAKY (2 attempts) | 18.0s | PASS | 5.0s |
| G-persistence | a completed multi-step session survives a real process kill + restart | PASS | 22.2s | PASS | 7.7s |
| G-persistence | documented difference: pending-approval survival across a full process restart | PASS | 20.0s | PASS | 7.0s |
| H-cancellation | a deterministic provider error triggers retries then a terminal failure, with a documented failure-code difference | PASS | 71.4s | PASS | 4.5s |
| H-cancellation | cancelling an in-flight run shows Stopped, keeps the partial reply, and a follow-up turn still works | PASS | 13.6s | PASS | 4.3s |

## Failures and flakes

- **reference / D-approval / deny branch: denying a pending approval leaves the action un-executed and the workspace unchanged** (flaky): (no message)
- **reference / F-delegation / delegating a task shows the subagent as active, then completed, with the parent completing too** (flaky): (no message)
