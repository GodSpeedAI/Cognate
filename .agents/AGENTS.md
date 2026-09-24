# Workbench maintenance

The acting agent updates this workbench when repository reality changes. `CURRENT_STATUS.yaml` is the agent-facing, append-only status history. Read only its last line (`just status` or `tail -n 1 .agents/CURRENT_STATUS.yaml`) for the latest complete snapshot; read earlier records only when history matters. Each update appends exactly two lines: `---` and one JSON-compatible YAML object with a higher `revision`, `recorded_at`, `stage`, `summary`, `verified`, `limits`, `next`, `evidence`, `spec`, and `ledger`. Carry forward facts that remain true; an entry is a complete snapshot, not a delta. Never edit previous entries.

`CURRENT_STATUS.md` is the human-facing view of only the latest snapshot. Update it in place in the same change, with matching status revision and summary; do not append history there. `OPEN_QUESTIONS.md` holds material unresolved decisions; `plans/` contains execution routes; `evidence/` holds observed proof when first produced. The canonical design remains in `specs/software-design-spec-cognate.-frameworkmd`; never copy it here.

Record a command, outcome, and scope before calling a gate passed. Close a question only with a cited decision or observation. Record evidence-backed debt when found. Create no empty directories. A candidate ledger is not a frozen contract.
