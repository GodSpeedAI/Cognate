# profiles/harness

Pure composition (spec §29.2, §40.K): no kernel/runtime primitives added here. Every new behaviour
must be expressed as a `Component`, an `AgentDefinition`, or plain `DurableStore`/`RuntimeService`
calls — see README.md for the component-to-primitive map. Keep `src/index.ts`'s exported names and
signatures stable; `test/harness.test.ts` is the contract.
