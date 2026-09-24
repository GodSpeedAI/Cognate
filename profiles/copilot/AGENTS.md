# profiles/copilot

Pure composition (spec §29.1, §40.J): `src/index.tsx` may only import existing package public APIs — never
add kernel/runtime primitives. Backend tools mount as ordinary kernel components at their own contract id;
never invent a shared "tool" capability shape. Keep `README.md`'s component→primitive table in sync with
`copilotProfile`/`copilotRegistry`. Run `bun test ./profiles/copilot` (3x) and `tsc` before calling this done.
