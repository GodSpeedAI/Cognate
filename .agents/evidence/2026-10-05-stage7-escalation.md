# Stage 7 evidence: escalation and durable continuation

Observed 2026-10-05 on cognate/harness against sea-rs migration/cep-world-ref.

- `just sea-forge-live` (real sea-forge-server, DomainForge CLI, CEP validators): 17 pass, 0 fail, 0 skipped.
- Live scenarios: escalated capability waits (provider not run, one approval opened); pending approval ignored by polling; self-approval refused by SEA-Forge (SoD); different authorized identity approves; poll resumes; revalidation allows; approval shows `used`; a manual resume without approval fails the run closed; a rejection fails the run.
- Replay safety: the scripted test asserts the authority was asked about the escalation exactly once even though the run re-executes from the start on resume.
- `just verify` 78/78 x3; tsc clean.
