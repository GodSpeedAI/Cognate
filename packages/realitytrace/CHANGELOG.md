# Changelog

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.10.0...cognate-realitytrace-v0.3.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* close AK-006 and AK-008 — RealityTrace correlation round-trip, UCB1 ranker ([6902159](https://github.com/GodSpeedAI/Cognate/commit/69021597c464f1b3ffc578aa99df7efef2c03b29))
* **domainforge:** DomainForge adapter; RED contracts for RealityTrace, providers, profiles ([6ef49f1](https://github.com/GodSpeedAI/Cognate/commit/6ef49f14b1d1f5f2887e182cbae8d72678a39ee5))
* **governance:** Stage 8 execution trace, evidence and settlement through SEA-Forge ([0895e63](https://github.com/GodSpeedAI/Cognate/commit/0895e63e60e162350018ec339640961010e8a4bb))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **realitytrace,providers,profile:** observation delivery + SXR CLI port, model providers, defineProfile ([67f7dcc](https://github.com/GodSpeedAI/Cognate/commit/67f7dcc966b61f4ec79b95793c3ccecc7df83bd7))
* **realitytrace:** begin runs on a created snapshot, with genesis fallback ([ead573a](https://github.com/GodSpeedAI/Cognate/commit/ead573a749cee057542141243eec226123e3dd18))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** bind runs to assignments (WP-23) ([509e199](https://github.com/GodSpeedAI/Cognate/commit/509e199faa4f407a8122b8761475fbbb11f64bf8))
* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))
* **runtime:** interaction-event extension on the CEP outbox and a program.run executor ([ec9b28f](https://github.com/GodSpeedAI/Cognate/commit/ec9b28fba67b9ed9cf78459346bfed383e22557c))


### Bug Fixes

* **realitytrace:** an execution trace is a pure function of its event ([#61](https://github.com/GodSpeedAI/Cognate/issues/61)) ([65a8df1](https://github.com/GodSpeedAI/Cognate/commit/65a8df1de9f3613db0acd88162b9ba2039931440))
* **realitytrace:** pin the RealityTrace CLI to 0.4.0 (DomainForge 0.21.2 lockstep) ([#80](https://github.com/GodSpeedAI/Cognate/issues/80)) ([8c87a1c](https://github.com/GodSpeedAI/Cognate/commit/8c87a1c7a35579b8905b66db5aa0559bf114a438))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))
* **runtime:** confine program.run against symlinks, restore on write failure, extend run.started/run.cancelled ([db788d1](https://github.com/GodSpeedAI/Cognate/commit/db788d108dad9667b2523f32de4ad9c530df51b0))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))

## [0.10.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.9.2...cognate-realitytrace-v0.10.0) (2026-11-16)


### Features

* **runtime:** bind runs to assignments (WP-23) ([509e199](https://github.com/GodSpeedAI/Cognate/commit/509e199faa4f407a8122b8761475fbbb11f64bf8))
* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))


### Bug Fixes

* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))

## [0.9.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.9.1...cognate-realitytrace-v0.9.2) (2026-11-14)


### Bug Fixes

* **realitytrace:** pin the RealityTrace CLI to 0.4.0 (DomainForge 0.21.2 lockstep) ([#80](https://github.com/GodSpeedAI/Cognate/issues/80)) ([8c87a1c](https://github.com/GodSpeedAI/Cognate/commit/8c87a1c7a35579b8905b66db5aa0559bf114a438))

## [0.9.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.9.0...cognate-realitytrace-v0.9.1) (2026-11-13)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.9.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.8.0...cognate-realitytrace-v0.9.0) (2026-11-05)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.8.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.7.1...cognate-realitytrace-v0.8.0) (2026-10-26)


### Features

* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([f85c523](https://github.com/GodSpeedAI/Cognate/commit/f85c523a62eb72f1b022d78f842245c52920f8bd))

## [0.7.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.7.0...cognate-realitytrace-v0.7.1) (2026-10-24)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.7.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.6.4...cognate-realitytrace-v0.7.0) (2026-10-23)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.6.4](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.6.3...cognate-realitytrace-v0.6.4) (2026-10-23)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.6.3](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.6.2...cognate-realitytrace-v0.6.3) (2026-10-23)


### Bug Fixes

* **realitytrace:** an execution trace is a pure function of its event ([#61](https://github.com/GodSpeedAI/Cognate/issues/61)) ([f160d8b](https://github.com/GodSpeedAI/Cognate/commit/f160d8b069959233be97ae2dbf786da76cfa7f1d))

## [0.6.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.6.1...cognate-realitytrace-v0.6.2) (2026-10-22)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.6.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.6.0...cognate-realitytrace-v0.6.1) (2026-10-17)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.6.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.5.0...cognate-realitytrace-v0.6.0) (2026-10-17)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.5.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.4.0...cognate-realitytrace-v0.5.0) (2026-10-15)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.4.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.3.0...cognate-realitytrace-v0.4.0) (2026-10-14)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.2.0...cognate-realitytrace-v0.3.0) (2026-10-12)


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([0970333](https://github.com/GodSpeedAI/Cognate/commit/0970333053b11bfd3663569162cca400eea5a6c8))

## [0.2.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.1.2...cognate-realitytrace-v0.2.0) (2026-10-11)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.1.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.1.1...cognate-realitytrace-v0.1.2) (2026-10-09)


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([fc56129](https://github.com/GodSpeedAI/Cognate/commit/fc56129f0359568fd84c36002a5ad21cd7bac722))

## [0.1.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.1.1...cognate-realitytrace-v0.1.0) (2026-10-09)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

## [0.1.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.1.0...cognate-realitytrace-v0.1.1) (2026-10-09)


### Miscellaneous Chores

* **cognate-realitytrace:** Synchronize cognate SDK packages versions

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
