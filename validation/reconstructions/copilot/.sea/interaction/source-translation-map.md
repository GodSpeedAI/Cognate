# Source Translation Map

All R identifiers cite [`../../reference-behavior-matrix.md`](../../reference-behavior-matrix.md)
and retain its `DOCUMENTED_REFERENCE` status.

| Evidence | Disposition | Destination | Notes |
| --- | --- | --- | --- |
| R-A01 | Variant | `J-C-shared-state` | Chat/application mode is presentation state, not a new journey. |
| R-A02 | Canonical | `J-C-shared-state` | Agent and user update todo/application state. |
| R-A03 | Canonical / repair | `J-A-chat-turn`, `J-K-live-recovery` | Progress before completion needs general delivery proof. |
| R-A04–R-A06 | Canonical / C1 open | `J-B-front-capability` | Current availability and historical renderability differ. |
| R-A07 | Canonical | `J-D-agent-context` | Per-agent mount-scoped context captured for next run. |
| R-A08 | Canonical | `J-E-controlled-rendering` | Backend renderers do not execute browser handlers. |
| R-A09 | Canonical | `J-F-tool-human-decision` | A tool result, distinct from a runtime interrupt. |
| R-A10 | Canonical | `J-G-runtime-interrupt` | Interrupt payload then resume/cancel. |
| R-A11 | Canonical | `J-H-declarative-ui` | Catalog-constrained A2UI operation and interaction return. |
| R-A12 | Canonical | `J-J-rich-thread` | Per-thread agent and replayed rich history. |
| R-A13 | Pending specialization | `J-J-rich-thread` | Intelligence-managed list lifecycle is unexecuted. |
| R-A14 | Projection | `J-A`, `J-C`, `J-J` | Layout widgets project existing journeys. |
| Prompt: MCP Apps/Open-JSON-UI | Unsupported pending evidence | None | Do not create a journey before characterization. |
