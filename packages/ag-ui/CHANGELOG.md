# Changelog

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.10.0...cognate-ag-ui-v0.3.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **ag-ui:** AG-UI 1.0 projection, inbound actions, reconnect; invocation input recorded ([a0513cb](https://github.com/GodSpeedAI/Cognate/commit/a0513cbbf664db1aa1a2ca5d01ce2896d6382a54))
* **ag-ui:** resolve remote-offer waits via the standard tool-message path ([c6c9d03](https://github.com/GodSpeedAI/Cognate/commit/c6c9d031d23fca6b9f1edc5372f46bb06a05a646))
* **model:** project streamed tool arguments through durable progress ([7d2ec3c](https://github.com/GodSpeedAI/Cognate/commit/7d2ec3cd5cd1e17c6d0b2283596e50ac64be2561))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **realitytrace,providers,profile:** observation delivery + SXR CLI port, model providers, defineProfile ([67f7dcc](https://github.com/GodSpeedAI/Cognate/commit/67f7dcc966b61f4ec79b95793c3ccecc7df83bd7))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** add durable thread-scoped shared state ([f7069b8](https://github.com/GodSpeedAI/Cognate/commit/f7069b87fc15d3bfabb7a50dd2db210c2de82de4))
* **runtime:** add scoped remote capability offers ([18d7916](https://github.com/GodSpeedAI/Cognate/commit/18d79166c4a526292766e833e364251c8f33cd5a))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))


### Bug Fixes

* **ag-ui:** derive the thread → run mapping from the durable event log ([bbaef80](https://github.com/GodSpeedAI/Cognate/commit/bbaef809dc4352e8995130538a2daeaf0e61aae1))
* **ag-ui:** forward immutable agent context ([ea732d0](https://github.com/GodSpeedAI/Cognate/commit/ea732d0999448563d3626b6755f17f602a342e2b))
* **ag-ui:** resync across historical waits ([b364027](https://github.com/GodSpeedAI/Cognate/commit/b364027583c1a9fc1cc91c1531ad2640154a0ec1))
* **ag-ui:** stream committed events live ([9c7dba6](https://github.com/GodSpeedAI/Cognate/commit/9c7dba63431867572639481e9638f2de21795a2b))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))

## [0.10.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.9.2...cognate-ag-ui-v0.10.0) (2026-11-16)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.9.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.9.1...cognate-ag-ui-v0.9.2) (2026-11-14)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.9.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.9.0...cognate-ag-ui-v0.9.1) (2026-11-13)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.9.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.8.0...cognate-ag-ui-v0.9.0) (2026-11-05)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.8.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.7.1...cognate-ag-ui-v0.8.0) (2026-10-26)


### Features

* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([f85c523](https://github.com/GodSpeedAI/Cognate/commit/f85c523a62eb72f1b022d78f842245c52920f8bd))

## [0.7.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.7.0...cognate-ag-ui-v0.7.1) (2026-10-24)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.7.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.6.4...cognate-ag-ui-v0.7.0) (2026-10-23)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.6.4](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.6.3...cognate-ag-ui-v0.6.4) (2026-10-23)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.6.3](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.6.2...cognate-ag-ui-v0.6.3) (2026-10-23)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.6.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.6.1...cognate-ag-ui-v0.6.2) (2026-10-22)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.6.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.6.0...cognate-ag-ui-v0.6.1) (2026-10-17)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.6.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.5.0...cognate-ag-ui-v0.6.0) (2026-10-17)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.5.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.4.0...cognate-ag-ui-v0.5.0) (2026-10-15)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.4.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.3.0...cognate-ag-ui-v0.4.0) (2026-10-14)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.2.0...cognate-ag-ui-v0.3.0) (2026-10-12)


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([0970333](https://github.com/GodSpeedAI/Cognate/commit/0970333053b11bfd3663569162cca400eea5a6c8))

## [0.2.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.1.2...cognate-ag-ui-v0.2.0) (2026-10-11)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.1.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.1.1...cognate-ag-ui-v0.1.2) (2026-10-09)


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([fc56129](https://github.com/GodSpeedAI/Cognate/commit/fc56129f0359568fd84c36002a5ad21cd7bac722))

## [0.1.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.1.1...cognate-ag-ui-v0.1.0) (2026-10-09)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## [0.1.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.1.0...cognate-ag-ui-v0.1.1) (2026-10-09)


### Miscellaneous Chores

* **cognate-ag-ui:** Synchronize cognate SDK packages versions

## 0.1.0 (2026-10-09)


### ⚠ BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([ab4aa79](https://github.com/GodSpeedAI/Cognate/commit/ab4aa79c5d7fd37bcd34a7534053e6f8a0682743))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([91a8ee6](https://github.com/GodSpeedAI/Cognate/commit/91a8ee6c0800885c8ca140fdef5190d4503ba2e7))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([215fbdd](https://github.com/GodSpeedAI/Cognate/commit/215fbdd4a7fe87534957cbfb42b294d69b95e864))

## 0.1.0 (2026-10-08)


### Features

* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([91a8ee6](https://github.com/GodSpeedAI/Cognate/commit/91a8ee6c0800885c8ca140fdef5190d4503ba2e7))
