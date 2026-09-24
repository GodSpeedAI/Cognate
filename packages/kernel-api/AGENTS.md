# kernel-api — agent guide

Owns: public kernel types and the conformance kit. Depends on nothing (spec §28 forbids cordis, ruvector, react, astryx, ag-ui, domainforge, realitytrace).
Change a type or suite only as a deliberate contract revision: update every engine adapter and the ledger gates CG-KRN-001..006 in the same change.
Invariant to preserve: application code can be written against these types without knowing the engine.
