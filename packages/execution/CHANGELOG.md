# Changelog

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.10.0...cognate-execution-v0.3.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **execution:** add opt-in Linux namespace execution world ([80b05f1](https://github.com/GodSpeedAI/Cognate/commit/80b05f12930189f42885baa2b83b910e5ede2580))
* **execution:** execution worlds as providers; route harness tools through filesystem.*/process.exec ([7e6704d](https://github.com/GodSpeedAI/Cognate/commit/7e6704d741adb4731306db35bf0deb569fab54cb))
* **execution:** SSH and WSL execution worlds; runtime world management and Add-workspace UX ([60ddab5](https://github.com/GodSpeedAI/Cognate/commit/60ddab5d044ae00017ada36804fa4f62b9a65223))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* native fenced dispatch, bounded runs and Linux execution world ([36b05fb](https://github.com/GodSpeedAI/Cognate/commit/36b05fb4194eecda4edbc59ae3e48e6b607a8f48))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** await authoritative admission and preserve shutdown recovery ([de18a14](https://github.com/GodSpeedAI/Cognate/commit/de18a14d1364397d28ff4072fdce30db03928843))
* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))
* **runtime:** interaction-event extension on the CEP outbox and a program.run executor ([ec9b28f](https://github.com/GodSpeedAI/Cognate/commit/ec9b28fba67b9ed9cf78459346bfed383e22557c))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **execution:** require reviewed patched binary evidence in OS tests ([f248695](https://github.com/GodSpeedAI/Cognate/commit/f248695016a5cbdcc93b6ee2464219fccba79a75))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))
* **runtime:** confine program.run against symlinks, restore on write failure, extend run.started/run.cancelled ([db788d1](https://github.com/GodSpeedAI/Cognate/commit/db788d108dad9667b2523f32de4ad9c530df51b0))
* **runtime:** persist recovery retries and protect trusted executables ([19f6817](https://github.com/GodSpeedAI/Cognate/commit/19f6817a8a56c4108eed7aaa0168b14e5367c014))
* **runtime:** preserve cancellation across admission and bound recovery scans ([6d88090](https://github.com/GodSpeedAI/Cognate/commit/6d8809038cae903a7fa60a5ed816dff9b4ea64c3))
* **runtime:** share admission across run and continuation dispatch ([b86cd63](https://github.com/GodSpeedAI/Cognate/commit/b86cd636e0415dbcf5eb6d3964fdf869b0ef50c4))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))

## [0.10.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.9.2...cognate-execution-v0.10.0) (2026-11-16)


### Features

* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))


### Bug Fixes

* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))

## [0.9.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.9.1...cognate-execution-v0.9.2) (2026-11-14)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.9.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.9.0...cognate-execution-v0.9.1) (2026-11-13)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.9.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.8.0...cognate-execution-v0.9.0) (2026-11-05)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.8.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.7.1...cognate-execution-v0.8.0) (2026-10-26)


### Features

* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([f85c523](https://github.com/GodSpeedAI/Cognate/commit/f85c523a62eb72f1b022d78f842245c52920f8bd))

## [0.7.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.7.0...cognate-execution-v0.7.1) (2026-10-24)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.7.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.6.4...cognate-execution-v0.7.0) (2026-10-23)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.6.4](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.6.3...cognate-execution-v0.6.4) (2026-10-23)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.6.3](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.6.2...cognate-execution-v0.6.3) (2026-10-23)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.6.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.6.1...cognate-execution-v0.6.2) (2026-10-22)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.6.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.6.0...cognate-execution-v0.6.1) (2026-10-17)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.6.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.5.0...cognate-execution-v0.6.0) (2026-10-17)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.5.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.4.0...cognate-execution-v0.5.0) (2026-10-15)


### Features

* **runtime:** await authoritative admission and preserve shutdown recovery ([e90f511](https://github.com/GodSpeedAI/Cognate/commit/e90f511731cbe01cf204f7ec7675e1b03532c5c7))


### Bug Fixes

* **execution:** require reviewed patched binary evidence in OS tests ([0c80693](https://github.com/GodSpeedAI/Cognate/commit/0c806932b341bde38f527895bb137a0599f7afae))
* **runtime:** persist recovery retries and protect trusted executables ([5c85e4c](https://github.com/GodSpeedAI/Cognate/commit/5c85e4ccdc1d715bd010f031eb5e05845f3d7472))
* **runtime:** preserve cancellation across admission and bound recovery scans ([6963620](https://github.com/GodSpeedAI/Cognate/commit/696362090fb5bae0627dad0a37d7b508eaa63f8a))

## [0.4.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.3.0...cognate-execution-v0.4.0) (2026-10-14)


### Features

* **execution:** add opt-in Linux namespace execution world ([920c4c9](https://github.com/GodSpeedAI/Cognate/commit/920c4c9c4649c6a321dfc7389bd7075ec0602efe))
* native fenced dispatch, bounded runs and Linux execution world ([c6e3207](https://github.com/GodSpeedAI/Cognate/commit/c6e32079844dd36dd6c20d3516f8c6ac2f2c67f0))


### Bug Fixes

* **runtime:** share admission across run and continuation dispatch ([52a8eaf](https://github.com/GodSpeedAI/Cognate/commit/52a8eaf369959f12023dd7b96fb76552f10557e2))

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.2.0...cognate-execution-v0.3.0) (2026-10-12)


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([0970333](https://github.com/GodSpeedAI/Cognate/commit/0970333053b11bfd3663569162cca400eea5a6c8))

## [0.2.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.1.2...cognate-execution-v0.2.0) (2026-10-11)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.1.2](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.1.1...cognate-execution-v0.1.2) (2026-10-09)


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([fc56129](https://github.com/GodSpeedAI/Cognate/commit/fc56129f0359568fd84c36002a5ad21cd7bac722))

## [0.1.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.1.1...cognate-execution-v0.1.0) (2026-10-09)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

## [0.1.1](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.1.0...cognate-execution-v0.1.1) (2026-10-09)


### Miscellaneous Chores

* **cognate-execution:** Synchronize cognate SDK packages versions

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
