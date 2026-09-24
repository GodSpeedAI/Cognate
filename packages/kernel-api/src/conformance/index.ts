// Executable kernel contract. Engine adapters call every suite from their own tests.
export { contractSuite, lifecycleSuite, effectsSuite, dependenciesSuite, scopesSuite, authoritySuite } from "./suites.ts";
export * as fixtures from "./harness.ts";
