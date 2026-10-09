# packages/ag-ui

AG-UI is an adapter, never the internal event model (ADR-0008). Import
runtime types/enums from `@ag-ui/core`, every `*Schema` from
`@ag-ui/core/schemas` only. No AG-UI type may leak into `@godspeedai/cognate-client`
or other native packages. Keep the compatibility matrix honest: adding a
projection requires a matching row/note, not a silent behavior change.
