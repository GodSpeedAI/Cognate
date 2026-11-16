# Changelog

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.10.0...cognate-runtime-bun-v0.3.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* add first-class observation ingestion (RuntimeService.observe) ([c184c71](https://github.com/GodSpeedAI/Cognate/commit/c184c7176e6b4b20655f654b00ef76f9d7ded80e))
* **ag-ui:** AG-UI 1.0 projection, inbound actions, reconnect; invocation input recorded ([a0513cb](https://github.com/GodSpeedAI/Cognate/commit/a0513cbbf664db1aa1a2ca5d01ce2896d6382a54))
* **cognitive-rvf,runtime:** RVF snapshots with verified imports; semantic-to-observation chain ([e6f2921](https://github.com/GodSpeedAI/Cognate/commit/e6f2921b326ed0b9d16c30adaff56d3ad6c2bd4a))
* **execution:** add opt-in Linux namespace execution world ([80b05f1](https://github.com/GodSpeedAI/Cognate/commit/80b05f12930189f42885baa2b83b910e5ede2580))
* fence native dispatch and admit bounded independent runs ([9f2590f](https://github.com/GodSpeedAI/Cognate/commit/9f2590f70bca50abf292f3bb88564dce5506c160))
* **governance:** Stage 8 execution trace, evidence and settlement through SEA-Forge ([0895e63](https://github.com/GodSpeedAI/Cognate/commit/0895e63e60e162350018ec339640961010e8a4bb))
* **kernel,harness:** caller tenant reaches policy and handlers; Harness reference profile ([6b2fc9b](https://github.com/GodSpeedAI/Cognate/commit/6b2fc9be69e9d1d51e49c3afe6af538d3654190d))
* **model:** project streamed tool arguments through durable progress ([7d2ec3c](https://github.com/GodSpeedAI/Cognate/commit/7d2ec3cd5cd1e17c6d0b2283596e50ac64be2561))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* native fenced dispatch, bounded runs and Linux execution world ([36b05fb](https://github.com/GodSpeedAI/Cognate/commit/36b05fb4194eecda4edbc59ae3e48e6b607a8f48))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime-api:** service contract, durable agent authoring surface, conformance kit (RED runtime) ([245cb2c](https://github.com/GodSpeedAI/Cognate/commit/245cb2c07e52945bc4a7f3fd7c7b90dff767d758))
* **runtime-bun:** durable replay-based runtime behind RuntimeService ([3ac11e3](https://github.com/GodSpeedAI/Cognate/commit/3ac11e36c070c2cc0cf8546f984960146adf0a4c))
* **runtime-bun:** request world transitions from SEA-Forge and read recorded moves ([#2](https://github.com/GodSpeedAI/Cognate/issues/2)) ([45a4ec7](https://github.com/GodSpeedAI/Cognate/commit/45a4ec7ad197f575d465b2d8fdcc793700149aec))
* **runtime-bun:** typed SEA-Forge approval, closure and delegated-decide calls ([#75](https://github.com/GodSpeedAI/Cognate/issues/75)) ([bb692b3](https://github.com/GodSpeedAI/Cognate/commit/bb692b3b54b68f2c057f48b063cd9f3971df3b3b))
* **runtime:** add durable thread-scoped shared state ([f7069b8](https://github.com/GodSpeedAI/Cognate/commit/f7069b87fc15d3bfabb7a50dd2db210c2de82de4))
* **runtime:** add scoped remote capability offers ([18d7916](https://github.com/GodSpeedAI/Cognate/commit/18d79166c4a526292766e833e364251c8f33cd5a))
* **runtime:** await authoritative admission and preserve shutdown recovery ([de18a14](https://github.com/GodSpeedAI/Cognate/commit/de18a14d1364397d28ff4072fdce30db03928843))
* **runtime:** await authoritative resource eligibility with cancellation ([e61a735](https://github.com/GodSpeedAI/Cognate/commit/e61a735ebdd3c8bec8ce2b9ec6a31f620e96d082))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **runtime:** bind runs to assignments (WP-23) ([509e199](https://github.com/GodSpeedAI/Cognate/commit/509e199faa4f407a8122b8761475fbbb11f64bf8))
* **runtime:** carry a governed call's authority claims to the authority ([#65](https://github.com/GodSpeedAI/Cognate/issues/65)) ([bd520ce](https://github.com/GodSpeedAI/Cognate/commit/bd520ce6710ffee0cbd982d8cfffff16eda43cc6))
* **runtime:** durable wait and revalidated resume for governance escalations ([f8c431f](https://github.com/GodSpeedAI/Cognate/commit/f8c431f4b32beff51ba62e1489db415a85ff1be2))
* **runtime:** enforce governed timeouts, wire governance into the harness, fix CG-PRF-002 flake ([3f4af6f](https://github.com/GodSpeedAI/Cognate/commit/3f4af6fe9873b72eded503af72dff013e38a3266))
* **runtime:** executor run-ownership lifecycle with fenced writes and ambiguous-effect reconciliation ([997ac03](https://github.com/GodSpeedAI/Cognate/commit/997ac03385512df2aa2cfe6d363e64b5de3a2b23))
* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))
* **runtime:** interaction-event extension on the CEP outbox and a program.run executor ([ec9b28f](https://github.com/GodSpeedAI/Cognate/commit/ec9b28fba67b9ed9cf78459346bfed383e22557c))
* **runtime:** route every consequential decision through one GovernedOperation choke point ([8512a2d](https://github.com/GodSpeedAI/Cognate/commit/8512a2df4bdc001ebf712a5f3e3d7bf59ae889fa))
* **runtime:** run-write ownership with fenced appends and ambiguous-effect reconciliation ([7622b66](https://github.com/GodSpeedAI/Cognate/commit/7622b663c1fdb7ac88d5913b548c91fca4c23cb2))
* **runtime:** SEA-Forge CEP authority client and enforced constraint handling ([59651cc](https://github.com/GodSpeedAI/Cognate/commit/59651cc95b3865f01f5a813700802ea9d804329c))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **domainforge:** complete canonical composed-world integration ([d6b142d](https://github.com/GodSpeedAI/Cognate/commit/d6b142d23f9a67d275f1fabc869514e77e0bc491))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime-bun:** an approval governs only the operation it was granted for ([#60](https://github.com/GodSpeedAI/Cognate/issues/60)) ([5d4f201](https://github.com/GodSpeedAI/Cognate/commit/5d4f20173f4f4400a97e046c709f393e98e36247))
* **runtime-bun:** SEA-Forge client under load: retry server_busy, decide system reads locally ([#63](https://github.com/GodSpeedAI/Cognate/issues/63)) ([83f23ed](https://github.com/GodSpeedAI/Cognate/commit/83f23ed9912f6e6fe19cee9e4285fde2fde33fee))
* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))
* **runtime:** confine program.run against symlinks, restore on write failure, extend run.started/run.cancelled ([db788d1](https://github.com/GodSpeedAI/Cognate/commit/db788d108dad9667b2523f32de4ad9c530df51b0))
* **runtime:** persist recovery retries and protect trusted executables ([19f6817](https://github.com/GodSpeedAI/Cognate/commit/19f6817a8a56c4108eed7aaa0168b14e5367c014))
* **runtime:** preserve cancellation across admission and bound recovery scans ([6d88090](https://github.com/GodSpeedAI/Cognate/commit/6d8809038cae903a7fa60a5ed816dff9b4ea64c3))
* **runtime:** preserve error name and JSON-safe details on recorded invocation failures ([c292980](https://github.com/GodSpeedAI/Cognate/commit/c29298000cd9f3074be07f544212cd60456bfec5))
* **runtime:** re-arm a lease-held run for recovery instead of stranding it ([7011df4](https://github.com/GodSpeedAI/Cognate/commit/7011df428857b00f121e17624bb799d8f776882d))
* **runtime:** re-arm a lease-held run for recovery instead of stranding it ([18417ee](https://github.com/GodSpeedAI/Cognate/commit/18417ee7cbfce60abafde4cfc8876d3ad63b640a))
* **runtime:** reject unfenced parallel stores before startup ([b52f8ae](https://github.com/GodSpeedAI/Cognate/commit/b52f8ae77a72ea68a39993d5b53316e31fd13c99))
* **runtime:** replay-safe emits inside steps; invocation progress channel; provider stream abort mapping ([fda6dcf](https://github.com/GodSpeedAI/Cognate/commit/fda6dcf58328aa29926e1bd071f0e66c7a264021))
* **runtime:** retain admission capacity and recover interrupted shutdown work ([e3f7ed6](https://github.com/GodSpeedAI/Cognate/commit/e3f7ed684ed4f7346ca75d76a47c09ba3244d115))
* **runtime:** share admission across run and continuation dispatch ([b86cd63](https://github.com/GodSpeedAI/Cognate/commit/b86cd636e0415dbcf5eb6d3964fdf869b0ef50c4))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))

## [0.10.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.9.2...cognate-runtime-bun-v0.10.0) (2026-11-16)


### Features

* **runtime:** bind runs to assignments (WP-23) ([509e199](https://github.com/GodSpeedAI/Cognate/commit/509e199faa4f407a8122b8761475fbbb11f64bf8))
* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))


### Bug Fixes

* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))

## [0.9.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.9.1...cognate-runtime-bun-v0.9.2) (2026-11-14)


### Miscellaneous Chores

* **cognate-runtime-bun:** Synchronize cognate SDK packages versions

## [0.9.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.9.0...cognate-runtime-bun-v0.9.1) (2026-11-13)


### Miscellaneous Chores

* **cognate-runtime-bun:** Synchronize cognate SDK packages versions

## [0.9.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.8.0...cognate-runtime-bun-v0.9.0) (2026-11-05)


### Features

* **runtime-bun:** typed SEA-Forge approval, closure and delegated-decide calls ([#75](https://github.com/GodSpeedAI/Cognate/issues/75)) ([bb692b3](https://github.com/GodSpeedAI/Cognate/commit/bb692b3b54b68f2c057f48b063cd9f3971df3b3b))

## [0.8.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.7.1...cognate-runtime-bun-v0.8.0) (2026-10-26)


### Features

* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([f85c523](https://github.com/GodSpeedAI/Cognate/commit/f85c523a62eb72f1b022d78f842245c52920f8bd))

## [0.7.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.7.0...cognate-runtime-bun-v0.7.1) (2026-10-24)


### Miscellaneous Chores

* **cognate-runtime-bun:** Synchronize cognate SDK packages versions

## [0.7.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.6.4...cognate-runtime-bun-v0.7.0) (2026-10-23)


### Features

* **runtime:** carry a governed call's authority claims to the authority ([#65](https://github.com/GodSpeedAI/Cognate/issues/65)) ([c254d2b](https://github.com/GodSpeedAI/Cognate/commit/c254d2b7f961f3808237f9fe4ddd40c32cdf62ee))

## [0.6.4](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.6.3...cognate-runtime-bun-v0.6.4) (2026-10-23)


### Bug Fixes

* **runtime-bun:** SEA-Forge client under load: retry server_busy, decide system reads locally ([#63](https://github.com/GodSpeedAI/Cognate/issues/63)) ([6b60f47](https://github.com/GodSpeedAI/Cognate/commit/6b60f470beb473f1334d4d88e6c1e69f0ae834b2))

## [0.6.3](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.6.2...cognate-runtime-bun-v0.6.3) (2026-10-23)


### Miscellaneous Chores

* **cognate-runtime-bun:** Synchronize cognate SDK packages versions

## [0.6.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.6.1...cognate-runtime-bun-v0.6.2) (2026-10-22)


### Bug Fixes

* **domainforge:** complete canonical composed-world integration ([a477933](https://github.com/GodSpeedAI/Cognate/commit/a477933a1ddf1a8bcd64b4e762ccbb56e5fbd7d5))
* **runtime-bun:** an approval governs only the operation it was granted for ([#60](https://github.com/GodSpeedAI/Cognate/issues/60)) ([84ddb6e](https://github.com/GodSpeedAI/Cognate/commit/84ddb6ef21aca67f9a99f669584bb40dd221162c))

## [0.6.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.6.0...cognate-runtime-bun-v0.6.1) (2026-10-17)


### Bug Fixes

* **runtime:** re-arm a lease-held run for recovery instead of stranding it ([6b7d662](https://github.com/GodSpeedAI/Cognate/commit/6b7d6629245c1ffa396a0c6175e7ef809059d195))
* **runtime:** re-arm a lease-held run for recovery instead of stranding it ([3bd44ea](https://github.com/GodSpeedAI/Cognate/commit/3bd44eae6b7548c2b874e8fbc6af2be8fd636de8))

## [0.6.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.5.0...cognate-runtime-bun-v0.6.0) (2026-10-17)


### Features

* **runtime:** executor run-ownership lifecycle with fenced writes and ambiguous-effect reconciliation ([222456e](https://github.com/GodSpeedAI/Cognate/commit/222456e989cd33c79499a0c919b7fae5e41af283))
* **runtime:** run-write ownership with fenced appends and ambiguous-effect reconciliation ([b15d7b8](https://github.com/GodSpeedAI/Cognate/commit/b15d7b84d490ef66e1b1adf1270d46b52c38a5fe))

## [0.5.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.4.0...cognate-runtime-bun-v0.5.0) (2026-10-15)


### Features

* **runtime:** await authoritative admission and preserve shutdown recovery ([e90f511](https://github.com/GodSpeedAI/Cognate/commit/e90f511731cbe01cf204f7ec7675e1b03532c5c7))
* **runtime:** await authoritative resource eligibility with cancellation ([7af8bf3](https://github.com/GodSpeedAI/Cognate/commit/7af8bf3a1ecee9a8a0c5d698c33ffb9d6aa356db))


### Bug Fixes

* **runtime:** persist recovery retries and protect trusted executables ([5c85e4c](https://github.com/GodSpeedAI/Cognate/commit/5c85e4ccdc1d715bd010f031eb5e05845f3d7472))
* **runtime:** preserve cancellation across admission and bound recovery scans ([6963620](https://github.com/GodSpeedAI/Cognate/commit/696362090fb5bae0627dad0a37d7b508eaa63f8a))
* **runtime:** retain admission capacity and recover interrupted shutdown work ([d0e4911](https://github.com/GodSpeedAI/Cognate/commit/d0e491105d7f76ecebed04302701c3f911b69926))

## [0.4.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.3.0...cognate-runtime-bun-v0.4.0) (2026-10-14)


### Features

* **execution:** add opt-in Linux namespace execution world ([920c4c9](https://github.com/GodSpeedAI/Cognate/commit/920c4c9c4649c6a321dfc7389bd7075ec0602efe))
* fence native dispatch and admit bounded independent runs ([ab4dd2a](https://github.com/GodSpeedAI/Cognate/commit/ab4dd2ae5e3ecc6c4a415c43ae66ffcbf631da22))
* native fenced dispatch, bounded runs and Linux execution world ([c6e3207](https://github.com/GodSpeedAI/Cognate/commit/c6e32079844dd36dd6c20d3516f8c6ac2f2c67f0))


### Bug Fixes

* **runtime:** reject unfenced parallel stores before startup ([a59a7da](https://github.com/GodSpeedAI/Cognate/commit/a59a7dadfef28c296ce526bd703f12921b429a90))
* **runtime:** share admission across run and continuation dispatch ([52a8eaf](https://github.com/GodSpeedAI/Cognate/commit/52a8eaf369959f12023dd7b96fb76552f10557e2))

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.2.0...cognate-runtime-bun-v0.3.0) (2026-10-12)


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([0970333](https://github.com/GodSpeedAI/Cognate/commit/0970333053b11bfd3663569162cca400eea5a6c8))

## [0.2.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.1.2...cognate-runtime-bun-v0.2.0) (2026-10-11)


### Miscellaneous Chores

* **cognate-runtime-bun:** Synchronize cognate SDK packages versions

## [0.1.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.1.1...cognate-runtime-bun-v0.1.2) (2026-10-09)


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([fc56129](https://github.com/GodSpeedAI/Cognate/commit/fc56129f0359568fd84c36002a5ad21cd7bac722))

## [0.1.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.1.1...cognate-runtime-bun-v0.1.0) (2026-10-09)


### Miscellaneous Chores

* **cognate-runtime-bun:** Synchronize cognate SDK packages versions

## [0.1.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.1.0...cognate-runtime-bun-v0.1.1) (2026-10-09)


### Miscellaneous Chores

* **cognate-runtime-bun:** Synchronize cognate SDK packages versions

## 0.1.0 (2026-10-09)


### ⚠ BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* add first-class observation ingestion (RuntimeService.observe) ([0be1dd4](https://github.com/GodSpeedAI/Cognate/commit/0be1dd468aa1ce80b367d4659eb14038d47c63e3))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([ab4aa79](https://github.com/GodSpeedAI/Cognate/commit/ab4aa79c5d7fd37bcd34a7534053e6f8a0682743))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([91a8ee6](https://github.com/GodSpeedAI/Cognate/commit/91a8ee6c0800885c8ca140fdef5190d4503ba2e7))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([215fbdd](https://github.com/GodSpeedAI/Cognate/commit/215fbdd4a7fe87534957cbfb42b294d69b95e864))

## 0.1.0 (2026-10-08)


### Features

* add first-class observation ingestion (RuntimeService.observe) ([0be1dd4](https://github.com/GodSpeedAI/Cognate/commit/0be1dd468aa1ce80b367d4659eb14038d47c63e3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([91a8ee6](https://github.com/GodSpeedAI/Cognate/commit/91a8ee6c0800885c8ca140fdef5190d4503ba2e7))
