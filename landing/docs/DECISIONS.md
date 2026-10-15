# Decisions

- **Stack.** Astro 7.4.0 with static output, React 19.3.1 islands, TypeScript strict, Bun. Landing is not a root workspace member.
- **@bsmnt/scrollytelling 0.3.3 and React 19.** No peer conflict. The package declares `react >=18` and `gsap >=3`, and both are satisfied. It is installed but not imported in Phase 1, because the keyframe is static apart from selection. Runtime use is deferred to Phase 2 and will be verified then.
- **TypeScript 6.0.3, not 7.** `astro check` in Astro 7.4.0 rejects TypeScript 7.0 and asks for TypeScript 6. TypeScript 6.0.3 is pinned.
- **Census anchors re-verified.** Several spec anchors pointed at the wrong lines, and C-11 MEMORY could not be supported. See `actualize/evidence/illustration/census.md`.
- **Fonts.** Fontsource variable packages, self-hosted. The three packages exist at 5.3.0.
- **Captures.** Copied as-is at pinned SHAs. No derivatives created.
- **Dimmed cartridges.** The brief asks for 35% opacity on non-linked parts. That was applied to fill and outline only, so the labels stay legible (see `actualize/evidence/illustration/keyframe-iterations.md`).
