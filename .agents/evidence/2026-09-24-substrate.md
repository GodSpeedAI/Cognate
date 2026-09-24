# Phase 0 substrate observations — 2026-09-24

Environment observed: Bun 1.4.0, `just` 1.58.0, Python 3 with PyYAML 6.0.3. The commands below were run from the repository root.

| Command | Observed result | Scope |
| --- | --- | --- |
| `just verify` | Exit 0; substrate check reported 7 candidate requirements; Bun reported 2 passing tests, 0 failures. | Routing and local tests only. |
| `python3 ../project-topology-architect/skills/project-topology-architect/scripts/scaffold-check.py .` | Exit 0; 0 errors, 0 warnings. | Structural workbench and command surface. Requires the sibling Project Topology Architect checkout used for this run. |
| `python3 ../project-topology-architect/skills/project-topology-architect/scripts/validate-requirement-ledger.py requirements/ledger.yaml --project-root .` | Exit 0; 7 requirements and 7 acceptance contracts. | Ledger shape and source digest; not semantic fidelity. Requires that sibling checkout. |
| `just gate-ak-001` | Exit 0; the SQLite fixture passed. | The narrow SQLite proof. |
| `just gate-ak-002` | Exit 1 with the expected unmet-gate diagnostic. | Cordis remains unverified; the gate does not silently pass. |

The SQLite test used a real temporary file, inserted one event in a transaction, rejected an append against a stale revision, rolled back an exception after an insert, reopened the database, and observed only the committed event. It did not simulate a process crash or prove multi-process concurrency.

No Cordis, DomainForge, Connect, RuVector, RVF, or RealityTrace fixture ran. No product structural E2E ran. The ledger remains a candidate Phase 0 slice; nothing is frozen or settled.
