# Changelog

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.6.1...cognate-runtime-bun-v0.3.0) (2026-10-17)


### ⚠ BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* add first-class observation ingestion (RuntimeService.observe) ([0be1dd4](https://github.com/GodSpeedAI/Cognate/commit/0be1dd468aa1ce80b367d4659eb14038d47c63e3))
* **execution:** add opt-in Linux namespace execution world ([920c4c9](https://github.com/GodSpeedAI/Cognate/commit/920c4c9c4649c6a321dfc7389bd7075ec0602efe))
* fence native dispatch and admit bounded independent runs ([ab4dd2a](https://github.com/GodSpeedAI/Cognate/commit/ab4dd2ae5e3ecc6c4a415c43ae66ffcbf631da22))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([ab4aa79](https://github.com/GodSpeedAI/Cognate/commit/ab4aa79c5d7fd37bcd34a7534053e6f8a0682743))
* native fenced dispatch, bounded runs and Linux execution world ([c6e3207](https://github.com/GodSpeedAI/Cognate/commit/c6e32079844dd36dd6c20d3516f8c6ac2f2c67f0))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([91a8ee6](https://github.com/GodSpeedAI/Cognate/commit/91a8ee6c0800885c8ca140fdef5190d4503ba2e7))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([215fbdd](https://github.com/GodSpeedAI/Cognate/commit/215fbdd4a7fe87534957cbfb42b294d69b95e864))
* **runtime:** await authoritative admission and preserve shutdown recovery ([e90f511](https://github.com/GodSpeedAI/Cognate/commit/e90f511731cbe01cf204f7ec7675e1b03532c5c7))
* **runtime:** await authoritative resource eligibility with cancellation ([7af8bf3](https://github.com/GodSpeedAI/Cognate/commit/7af8bf3a1ecee9a8a0c5d698c33ffb9d6aa356db))
* **runtime:** executor run-ownership lifecycle with fenced writes and ambiguous-effect reconciliation ([222456e](https://github.com/GodSpeedAI/Cognate/commit/222456e989cd33c79499a0c919b7fae5e41af283))
* **runtime:** run-write ownership with fenced appends and ambiguous-effect reconciliation ([b15d7b8](https://github.com/GodSpeedAI/Cognate/commit/b15d7b84d490ef66e1b1adf1270d46b52c38a5fe))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([0970333](https://github.com/GodSpeedAI/Cognate/commit/0970333053b11bfd3663569162cca400eea5a6c8))
* **runtime:** persist recovery retries and protect trusted executables ([5c85e4c](https://github.com/GodSpeedAI/Cognate/commit/5c85e4ccdc1d715bd010f031eb5e05845f3d7472))
* **runtime:** preserve cancellation across admission and bound recovery scans ([6963620](https://github.com/GodSpeedAI/Cognate/commit/696362090fb5bae0627dad0a37d7b508eaa63f8a))
* **runtime:** re-arm a lease-held run for recovery instead of stranding it ([6b7d662](https://github.com/GodSpeedAI/Cognate/commit/6b7d6629245c1ffa396a0c6175e7ef809059d195))
* **runtime:** re-arm a lease-held run for recovery instead of stranding it ([3bd44ea](https://github.com/GodSpeedAI/Cognate/commit/3bd44eae6b7548c2b874e8fbc6af2be8fd636de8))
* **runtime:** reject unfenced parallel stores before startup ([a59a7da](https://github.com/GodSpeedAI/Cognate/commit/a59a7dadfef28c296ce526bd703f12921b429a90))
* **runtime:** retain admission capacity and recover interrupted shutdown work ([d0e4911](https://github.com/GodSpeedAI/Cognate/commit/d0e491105d7f76ecebed04302701c3f911b69926))
* **runtime:** share admission across run and continuation dispatch ([52a8eaf](https://github.com/GodSpeedAI/Cognate/commit/52a8eaf369959f12023dd7b96fb76552f10557e2))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([fc56129](https://github.com/GodSpeedAI/Cognate/commit/fc56129f0359568fd84c36002a5ad21cd7bac722))

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
