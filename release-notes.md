:robot: I have created a release *beep* *boop*
---


<details><summary>cognate-a2a: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-a2a-v0.10.0...cognate-a2a-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **a2a:** A2A v1.0 adapter; continuations map to input-required tasks ([2c9d1bd](https://github.com/GodSpeedAI/Cognate/commit/2c9d1bd056df09ce072518a8ba7dcf78e80ff69f))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-ag-ui: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ag-ui-v0.10.0...cognate-ag-ui-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

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

* **ag-ui:** derive the thread ’ run mapping from the durable event log ([bbaef80](https://github.com/GodSpeedAI/Cognate/commit/bbaef809dc4352e8995130538a2daeaf0e61aae1))
* **ag-ui:** forward immutable agent context ([ea732d0](https://github.com/GodSpeedAI/Cognate/commit/ea732d0999448563d3626b6755f17f602a342e2b))
* **ag-ui:** resync across historical waits ([b364027](https://github.com/GodSpeedAI/Cognate/commit/b364027583c1a9fc1cc91c1531ad2640154a0ec1))
* **ag-ui:** stream committed events live ([9c7dba6](https://github.com/GodSpeedAI/Cognate/commit/9c7dba63431867572639481e9638f2de21795a2b))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-agent-discovery: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-agent-discovery-v0.10.0...cognate-agent-discovery-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-artifacts: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-artifacts-v0.10.0...cognate-artifacts-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **capabilities,artifacts:** contained two-phase selection, outcome ranker, durable artifacts ([1d82195](https://github.com/GodSpeedAI/Cognate/commit/1d821951c1f2f4a80a867359c05a09d3cc3d8ec0))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-capabilities: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-capabilities-v0.10.0...cognate-capabilities-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **capabilities,artifacts:** contained two-phase selection, outcome ranker, durable artifacts ([1d82195](https://github.com/GodSpeedAI/Cognate/commit/1d821951c1f2f4a80a867359c05a09d3cc3d8ec0))
* close AK-006 and AK-008  RealityTrace correlation round-trip, UCB1 ranker ([6902159](https://github.com/GodSpeedAI/Cognate/commit/69021597c464f1b3ffc578aa99df7efef2c03b29))
* **domainforge:** DomainForge adapter; RED contracts for RealityTrace, providers, profiles ([6ef49f1](https://github.com/GodSpeedAI/Cognate/commit/6ef49f14b1d1f5f2887e182cbae8d72678a39ee5))
* **model:** project streamed tool arguments through durable progress ([7d2ec3c](https://github.com/GodSpeedAI/Cognate/commit/7d2ec3cd5cd1e17c6d0b2283596e50ac64be2561))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-cli: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-cli-v0.10.0...cognate-cli-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **cli:** cognate create/dev with starter templates for both profiles ([bb4f709](https://github.com/GodSpeedAI/Cognate/commit/bb4f709f8c56c7719e41d0b934a65e2cd6ad0e35))
* **cli:** create without --source; templates ship in the CLI package ([b6523bc](https://github.com/GodSpeedAI/Cognate/commit/b6523bc909bf35dd9369bf2f1a86a66a37eed342))
* close AK-006 and AK-008  RealityTrace correlation round-trip, UCB1 ranker ([6902159](https://github.com/GodSpeedAI/Cognate/commit/69021597c464f1b3ffc578aa99df7efef2c03b29))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **cli:** resolve configured organizational worlds as one canonical source-map closure ([37b9511](https://github.com/GodSpeedAI/Cognate/commit/37b9511ec521af0f53b3f0c0ea81bf1c4922be60))
* document the ambient type packages SDK consumers need ([#18](https://github.com/GodSpeedAI/Cognate/issues/18)) ([6292dcb](https://github.com/GodSpeedAI/Cognate/commit/6292dcbd76cfda3c9ec487382ab9f0c3ee35b287))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-client: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-client-v0.10.0...cognate-client-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **copilot-reconstruction:** settle R3-R7 with independent verification ([def1a41](https://github.com/GodSpeedAI/Cognate/commit/def1a41252398f7bc7f63077696649ca1def1a26))
* **model:** project streamed tool arguments through durable progress ([7d2ec3c](https://github.com/GodSpeedAI/Cognate/commit/7d2ec3cd5cd1e17c6d0b2283596e50ac64be2561))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** add durable thread-scoped shared state ([f7069b8](https://github.com/GodSpeedAI/Cognate/commit/f7069b87fc15d3bfabb7a50dd2db210c2de82de4))
* **runtime:** add scoped remote capability offers ([18d7916](https://github.com/GodSpeedAI/Cognate/commit/18d79166c4a526292766e833e364251c8f33cd5a))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **wire,client,react,mcp:** Connect wire plane, headless client, React bindings, MCP adapter ([4563833](https://github.com/GodSpeedAI/Cognate/commit/4563833e6b0b99eb775c887664423844d45885cb))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-v0.10.0...cognate-v0.3.0) (2026-11-16)


### Miscellaneous Chores

* **cognate:** Synchronize cognate SDK packages versions
</details>

<details><summary>cognate-cognitive-api: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-cognitive-api-v0.10.0...cognate-cognitive-api-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **cognition:** CognitiveIndex contract, memory index, recall pipeline, indexing projection ([4a164eb](https://github.com/GodSpeedAI/Cognate/commit/4a164eb95224fd02285cc784c41802c4f98157d9))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-cognitive-memory: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-cognitive-memory-v0.10.0...cognate-cognitive-memory-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **cognition:** CognitiveIndex contract, memory index, recall pipeline, indexing projection ([4a164eb](https://github.com/GodSpeedAI/Cognate/commit/4a164eb95224fd02285cc784c41802c4f98157d9))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-cognitive-ruvector: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-cognitive-ruvector-v0.10.0...cognate-cognitive-ruvector-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **cognitive-ruvector:** RuVector-backed CognitiveIndex passing the cognitive kit ([dcc1285](https://github.com/GodSpeedAI/Cognate/commit/dcc128543670332ed394a6d77ed8727930f369e9))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-cognitive-rvf: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-cognitive-rvf-v0.10.0...cognate-cognitive-rvf-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **cognitive-rvf,runtime:** RVF snapshots with verified imports; semantic-to-observation chain ([e6f2921](https://github.com/GodSpeedAI/Cognate/commit/e6f2921b326ed0b9d16c30adaff56d3ad6c2bd4a))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-continuations: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-continuations-v0.10.0...cognate-continuations-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **continuations:** durable continuations, external commitments, outbox dispatcher; UI/AG-UI/MCP Phase 0 ([81b3e1e](https://github.com/GodSpeedAI/Cognate/commit/81b3e1eae9304c0a5ef5ce77b9e88dcacfebdba7))
* fence native dispatch and admit bounded independent runs ([9f2590f](https://github.com/GodSpeedAI/Cognate/commit/9f2590f70bca50abf292f3bb88564dce5506c160))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* native fenced dispatch, bounded runs and Linux execution world ([36b05fb](https://github.com/GodSpeedAI/Cognate/commit/36b05fb4194eecda4edbc59ae3e48e6b607a8f48))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** share admission across run and continuation dispatch ([b86cd63](https://github.com/GodSpeedAI/Cognate/commit/b86cd636e0415dbcf5eb6d3964fdf869b0ef50c4))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-domainforge: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-domainforge-v0.10.0...cognate-domainforge-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* add support for additional semantic kinds and graph accessors in domainforge ([aea980c](https://github.com/GodSpeedAI/Cognate/commit/aea980ce74cadc3e637a07f6da1a7288b54a92ab))
* **domainforge:** DomainForge adapter; RED contracts for RealityTrace, providers, profiles ([6ef49f1](https://github.com/GodSpeedAI/Cognate/commit/6ef49f14b1d1f5f2887e182cbae8d72678a39ee5))
* **domainforge:** project complete canonical source-map worlds through native resolver ([059078b](https://github.com/GodSpeedAI/Cognate/commit/059078b6630deb7492e3ad40e74f6e5d15edab67))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **proto,domainforge:** canonical proto sources and RED contracts for wire and semantic adapters ([71dd90b](https://github.com/GodSpeedAI/Cognate/commit/71dd90bb3fdc4f5186d2b42618e4cf777a2f8018))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **domainforge:** complete canonical composed-world integration ([d6b142d](https://github.com/GodSpeedAI/Cognate/commit/d6b142d23f9a67d275f1fabc869514e77e0bc491))
* **domainforge:** move the binding to 0.21.2 (stack lockstep) ([7356512](https://github.com/GodSpeedAI/Cognate/commit/7356512d2abf2a4095375c847de2d2a7ee98b33f))
* **realitytrace:** pin the RealityTrace CLI to 0.4.0 (DomainForge 0.21.2 lockstep) ([#80](https://github.com/GodSpeedAI/Cognate/issues/80)) ([8c87a1c](https://github.com/GodSpeedAI/Cognate/commit/8c87a1c7a35579b8905b66db5aa0559bf114a438))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-events: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-events-v0.10.0...cognate-events-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* fence native dispatch and admit bounded independent runs ([9f2590f](https://github.com/GodSpeedAI/Cognate/commit/9f2590f70bca50abf292f3bb88564dce5506c160))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* native fenced dispatch, bounded runs and Linux execution world ([36b05fb](https://github.com/GodSpeedAI/Cognate/commit/36b05fb4194eecda4edbc59ae3e48e6b607a8f48))
* Phase 0 characterization fixtures and durable-store contract ([fa86c1d](https://github.com/GodSpeedAI/Cognate/commit/fa86c1dcc5374612e4156e26094a853e4037a9de))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** run-write ownership with fenced appends and ambiguous-effect reconciliation ([7622b66](https://github.com/GodSpeedAI/Cognate/commit/7622b663c1fdb7ac88d5913b548c91fca4c23cb2))
* **store-memory:** in-memory DurableStore passing the store conformance kit ([37e017a](https://github.com/GodSpeedAI/Cognate/commit/37e017aeabd74fe089ca59092a15be84b4eb5d6d))
* **store-sqlite,projections:** authoritative SQLite store, projection runner, rebuild and replay proofs ([d061213](https://github.com/GodSpeedAI/Cognate/commit/d061213fe2a14c1164f824f29c9790ea2a293c04))
* **store:** authoritative run-write ownership with fenced run-scoped appends ([f37e7ff](https://github.com/GodSpeedAI/Cognate/commit/f37e7ff793ae43f18ca8136a072c77ef5bd0f3c5))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** share admission across run and continuation dispatch ([b86cd63](https://github.com/GodSpeedAI/Cognate/commit/b86cd636e0415dbcf5eb6d3964fdf869b0ef50c4))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-execution: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-v0.10.0...cognate-execution-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

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
</details>

<details><summary>cognate-execution-ssh: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-ssh-v0.10.0...cognate-execution-ssh-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **execution:** SSH and WSL execution worlds; runtime world management and Add-workspace UX ([60ddab5](https://github.com/GodSpeedAI/Cognate/commit/60ddab5d044ae00017ada36804fa4f62b9a65223))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-execution-wsl: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-execution-wsl-v0.10.0...cognate-execution-wsl-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **execution:** SSH and WSL execution worlds; runtime world management and Add-workspace UX ([60ddab5](https://github.com/GodSpeedAI/Cognate/commit/60ddab5d044ae00017ada36804fa4f62b9a65223))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-hook-interoperability: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-hook-interoperability-v0.10.0...cognate-hook-interoperability-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-kernel-api: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-kernel-api-v0.10.0...cognate-kernel-api-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **kernel-api:** framework-owned kernel contract and conformance kit (RED) ([533c63f](https://github.com/GodSpeedAI/Cognate/commit/533c63fb9053b58d5672470642c9fcb7f96637c9))
* **kernel-cordis:** Cordis-backed kernel passing the full kernel conformance kit ([2682f1f](https://github.com/GodSpeedAI/Cognate/commit/2682f1f239a45f4a5ec25741241596a44db4a346))
* **kernel,harness:** caller tenant reaches policy and handlers; Harness reference profile ([6b2fc9b](https://github.com/GodSpeedAI/Cognate/commit/6b2fc9be69e9d1d51e49c3afe6af538d3654190d))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** replay-safe emits inside steps; invocation progress channel; provider stream abort mapping ([fda6dcf](https://github.com/GodSpeedAI/Cognate/commit/fda6dcf58328aa29926e1bd071f0e66c7a264021))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-kernel-cordis: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-kernel-cordis-v0.10.0...cognate-kernel-cordis-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **kernel-api:** framework-owned kernel contract and conformance kit (RED) ([533c63f](https://github.com/GodSpeedAI/Cognate/commit/533c63fb9053b58d5672470642c9fcb7f96637c9))
* **kernel-cordis:** Cordis-backed kernel passing the full kernel conformance kit ([2682f1f](https://github.com/GodSpeedAI/Cognate/commit/2682f1f239a45f4a5ec25741241596a44db4a346))
* **kernel,harness:** caller tenant reaches policy and handlers; Harness reference profile ([6b2fc9b](https://github.com/GodSpeedAI/Cognate/commit/6b2fc9be69e9d1d51e49c3afe6af538d3654190d))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** replay-safe emits inside steps; invocation progress channel; provider stream abort mapping ([fda6dcf](https://github.com/GodSpeedAI/Cognate/commit/fda6dcf58328aa29926e1bd071f0e66c7a264021))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-mcp: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-mcp-v0.10.0...cognate-mcp-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **wire,client,react,mcp:** Connect wire plane, headless client, React bindings, MCP adapter ([4563833](https://github.com/GodSpeedAI/Cognate/commit/4563833e6b0b99eb775c887664423844d45885cb))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-profile: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-profile-v0.10.0...cognate-profile-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **domainforge:** DomainForge adapter; RED contracts for RealityTrace, providers, profiles ([6ef49f1](https://github.com/GodSpeedAI/Cognate/commit/6ef49f14b1d1f5f2887e182cbae8d72678a39ee5))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **realitytrace,providers,profile:** observation delivery + SXR CLI port, model providers, defineProfile ([67f7dcc](https://github.com/GodSpeedAI/Cognate/commit/67f7dcc966b61f4ec79b95793c3ccecc7df83bd7))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-projections: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-projections-v0.10.0...cognate-projections-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **store-sqlite,projections:** authoritative SQLite store, projection runner, rebuild and replay proofs ([d061213](https://github.com/GodSpeedAI/Cognate/commit/d061213fe2a14c1164f824f29c9790ea2a293c04))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-proto: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-proto-v0.10.0...cognate-proto-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **proto,domainforge:** canonical proto sources and RED contracts for wire and semantic adapters ([71dd90b](https://github.com/GodSpeedAI/Cognate/commit/71dd90bb3fdc4f5186d2b42618e4cf777a2f8018))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** add durable thread-scoped shared state ([f7069b8](https://github.com/GodSpeedAI/Cognate/commit/f7069b87fc15d3bfabb7a50dd2db210c2de82de4))
* **runtime:** add scoped remote capability offers ([18d7916](https://github.com/GodSpeedAI/Cognate/commit/18d79166c4a526292766e833e364251c8f33cd5a))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **wire,client,react,mcp:** Connect wire plane, headless client, React bindings, MCP adapter ([4563833](https://github.com/GodSpeedAI/Cognate/commit/4563833e6b0b99eb775c887664423844d45885cb))


### Bug Fixes

* **egm:** move contracts off the gates they broke ([92161ba](https://github.com/GodSpeedAI/Cognate/commit/92161ba44061b977464615efbda59d2d7ac0617d))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-protocol-connect: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-protocol-connect-v0.10.0...cognate-protocol-connect-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* add first-class observation ingestion (RuntimeService.observe) ([c184c71](https://github.com/GodSpeedAI/Cognate/commit/c184c7176e6b4b20655f654b00ef76f9d7ded80e))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **proto,domainforge:** canonical proto sources and RED contracts for wire and semantic adapters ([71dd90b](https://github.com/GodSpeedAI/Cognate/commit/71dd90bb3fdc4f5186d2b42618e4cf777a2f8018))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** add durable thread-scoped shared state ([f7069b8](https://github.com/GodSpeedAI/Cognate/commit/f7069b87fc15d3bfabb7a50dd2db210c2de82de4))
* **runtime:** add scoped remote capability offers ([18d7916](https://github.com/GodSpeedAI/Cognate/commit/18d79166c4a526292766e833e364251c8f33cd5a))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))
* **wire,client,react,mcp:** Connect wire plane, headless client, React bindings, MCP adapter ([4563833](https://github.com/GodSpeedAI/Cognate/commit/4563833e6b0b99eb775c887664423844d45885cb))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-protocol-connect-bun: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-protocol-connect-bun-v0.10.0...cognate-protocol-connect-bun-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **proto,domainforge:** canonical proto sources and RED contracts for wire and semantic adapters ([71dd90b](https://github.com/GodSpeedAI/Cognate/commit/71dd90bb3fdc4f5186d2b42618e4cf777a2f8018))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **wire,client,react,mcp:** Connect wire plane, headless client, React bindings, MCP adapter ([4563833](https://github.com/GodSpeedAI/Cognate/commit/4563833e6b0b99eb775c887664423844d45885cb))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-provider-anthropic-compatible: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-anthropic-compatible-v0.10.0...cognate-provider-anthropic-compatible-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-provider-auth: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-auth-v0.10.0...cognate-provider-auth-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-provider-local: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-local-v0.10.0...cognate-provider-local-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **domainforge:** DomainForge adapter; RED contracts for RealityTrace, providers, profiles ([6ef49f1](https://github.com/GodSpeedAI/Cognate/commit/6ef49f14b1d1f5f2887e182cbae8d72678a39ee5))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **realitytrace,providers,profile:** observation delivery + SXR CLI port, model providers, defineProfile ([67f7dcc](https://github.com/GodSpeedAI/Cognate/commit/67f7dcc966b61f4ec79b95793c3ccecc7df83bd7))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-provider-openai-compatible: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-openai-compatible-v0.10.0...cognate-provider-openai-compatible-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **domainforge:** DomainForge adapter; RED contracts for RealityTrace, providers, profiles ([6ef49f1](https://github.com/GodSpeedAI/Cognate/commit/6ef49f14b1d1f5f2887e182cbae8d72678a39ee5))
* **model:** project streamed tool arguments through durable progress ([7d2ec3c](https://github.com/GodSpeedAI/Cognate/commit/7d2ec3cd5cd1e17c6d0b2283596e50ac64be2561))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **realitytrace,providers,profile:** observation delivery + SXR CLI port, model providers, defineProfile ([67f7dcc](https://github.com/GodSpeedAI/Cognate/commit/67f7dcc966b61f4ec79b95793c3ccecc7df83bd7))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** replay-safe emits inside steps; invocation progress channel; provider stream abort mapping ([fda6dcf](https://github.com/GodSpeedAI/Cognate/commit/fda6dcf58328aa29926e1bd071f0e66c7a264021))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-provider-openai-oauth: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-openai-oauth-v0.10.0...cognate-provider-openai-oauth-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-provider-openai-responses: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-openai-responses-v0.10.0...cognate-provider-openai-responses-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-provider-typesafe: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-typesafe-v0.10.0...cognate-provider-typesafe-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-provider-wire: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-provider-wire-v0.10.0...cognate-provider-wire-v0.3.0) (2026-11-16)


### Features

* provider protocols, typed judgment, and governed agent hook interoperability ([#32](https://github.com/GodSpeedAI/Cognate/issues/32)) ([391905c](https://github.com/GodSpeedAI/Cognate/commit/391905c6edaec8335cc259f9b72ad220bfe2ade0))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))


### Bug Fixes

* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
</details>

<details><summary>cognate-react: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-react-v0.10.0...cognate-react-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime-bun:** durable replay-based runtime behind RuntimeService ([3ac11e3](https://github.com/GodSpeedAI/Cognate/commit/3ac11e36c070c2cc0cf8546f984960146adf0a4c))
* **runtime:** add durable thread-scoped shared state ([f7069b8](https://github.com/GodSpeedAI/Cognate/commit/f7069b87fc15d3bfabb7a50dd2db210c2de82de4))
* **runtime:** add scoped remote capability offers ([18d7916](https://github.com/GodSpeedAI/Cognate/commit/18d79166c4a526292766e833e364251c8f33cd5a))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **wire,client,react,mcp:** Connect wire plane, headless client, React bindings, MCP adapter ([4563833](https://github.com/GodSpeedAI/Cognate/commit/4563833e6b0b99eb775c887664423844d45885cb))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-realitytrace: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-realitytrace-v0.10.0...cognate-realitytrace-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* close AK-006 and AK-008  RealityTrace correlation round-trip, UCB1 ranker ([6902159](https://github.com/GodSpeedAI/Cognate/commit/69021597c464f1b3ffc578aa99df7efef2c03b29))
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
</details>

<details><summary>cognate-runtime-api: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-api-v0.10.0...cognate-runtime-api-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* add first-class observation ingestion (RuntimeService.observe) ([c184c71](https://github.com/GodSpeedAI/Cognate/commit/c184c7176e6b4b20655f654b00ef76f9d7ded80e))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime-api:** service contract, durable agent authoring surface, conformance kit (RED runtime) ([245cb2c](https://github.com/GodSpeedAI/Cognate/commit/245cb2c07e52945bc4a7f3fd7c7b90dff767d758))
* **runtime:** add durable thread-scoped shared state ([f7069b8](https://github.com/GodSpeedAI/Cognate/commit/f7069b87fc15d3bfabb7a50dd2db210c2de82de4))
* **runtime:** add scoped remote capability offers ([18d7916](https://github.com/GodSpeedAI/Cognate/commit/18d79166c4a526292766e833e364251c8f33cd5a))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **runtime:** bind runs to assignments (WP-23) ([509e199](https://github.com/GodSpeedAI/Cognate/commit/509e199faa4f407a8122b8761475fbbb11f64bf8))
* **runtime:** carry a governed call's authority claims to the authority ([#65](https://github.com/GodSpeedAI/Cognate/issues/65)) ([bd520ce](https://github.com/GodSpeedAI/Cognate/commit/bd520ce6710ffee0cbd982d8cfffff16eda43cc6))
* **runtime:** Field Case interaction events, program.run and assignment binding ([f5a6954](https://github.com/GodSpeedAI/Cognate/commit/f5a6954fff334ee5dc53b091e97b04885b372006))
* **runtime:** interaction-event extension on the CEP outbox and a program.run executor ([ec9b28f](https://github.com/GodSpeedAI/Cognate/commit/ec9b28fba67b9ed9cf78459346bfed383e22557c))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **runtime:** address PR [#83](https://github.com/GodSpeedAI/Cognate/issues/83) review (program.run, identity, assignment) ([210fa97](https://github.com/GodSpeedAI/Cognate/commit/210fa9794909119bdfce0f41e6272d63134c371d))
* **runtime:** replay-safe emits inside steps; invocation progress channel; provider stream abort mapping ([fda6dcf](https://github.com/GodSpeedAI/Cognate/commit/fda6dcf58328aa29926e1bd071f0e66c7a264021))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-runtime-bun: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-runtime-bun-v0.10.0...cognate-runtime-bun-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

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
</details>

<details><summary>cognate-store-memory: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-store-memory-v0.10.0...cognate-store-memory-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* fence native dispatch and admit bounded independent runs ([9f2590f](https://github.com/GodSpeedAI/Cognate/commit/9f2590f70bca50abf292f3bb88564dce5506c160))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* native fenced dispatch, bounded runs and Linux execution world ([36b05fb](https://github.com/GodSpeedAI/Cognate/commit/36b05fb4194eecda4edbc59ae3e48e6b607a8f48))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **store-memory:** in-memory DurableStore passing the store conformance kit ([37e017a](https://github.com/GodSpeedAI/Cognate/commit/37e017aeabd74fe089ca59092a15be84b4eb5d6d))
* **store-sqlite,projections:** authoritative SQLite store, projection runner, rebuild and replay proofs ([d061213](https://github.com/GodSpeedAI/Cognate/commit/d061213fe2a14c1164f824f29c9790ea2a293c04))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-store-postgres: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-store-postgres-v0.10.0...cognate-store-postgres-v0.3.0) (2026-11-16)


### Features

* fence native dispatch and admit bounded independent runs ([9f2590f](https://github.com/GodSpeedAI/Cognate/commit/9f2590f70bca50abf292f3bb88564dce5506c160))
* native fenced dispatch, bounded runs and Linux execution world ([36b05fb](https://github.com/GodSpeedAI/Cognate/commit/36b05fb4194eecda4edbc59ae3e48e6b607a8f48))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* **runtime:** executor run-ownership lifecycle with fenced writes and ambiguous-effect reconciliation ([997ac03](https://github.com/GodSpeedAI/Cognate/commit/997ac03385512df2aa2cfe6d363e64b5de3a2b23))
* **runtime:** run-write ownership with fenced appends and ambiguous-effect reconciliation ([7622b66](https://github.com/GodSpeedAI/Cognate/commit/7622b663c1fdb7ac88d5913b548c91fca4c23cb2))
* **store:** authoritative run-write ownership with fenced run-scoped appends ([f37e7ff](https://github.com/GodSpeedAI/Cognate/commit/f37e7ff793ae43f18ca8136a072c77ef5bd0f3c5))


### Bug Fixes

* **postgres:** release uncommitted duplicate position reservations ([f7694cc](https://github.com/GodSpeedAI/Cognate/commit/f7694cca786536bdcdffe8383cf60fac0464bd93))
* **release:** publish missing SDK modules and use one vX.Y.Z GitHub release ([#34](https://github.com/GodSpeedAI/Cognate/issues/34)) ([eeb0bee](https://github.com/GodSpeedAI/Cognate/commit/eeb0bee993452337092bf21f4fcfdabc081a46de))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **store:** refuse a store whose schema version is newer than this build ([#67](https://github.com/GodSpeedAI/Cognate/issues/67)) ([b3e666a](https://github.com/GodSpeedAI/Cognate/commit/b3e666a7903e8b0e8678f938d546d068a8255fa2))
</details>

<details><summary>cognate-store-sqlite: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-store-sqlite-v0.10.0...cognate-store-sqlite-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **cli:** create without --source; templates ship in the CLI package ([b6523bc](https://github.com/GodSpeedAI/Cognate/commit/b6523bc909bf35dd9369bf2f1a86a66a37eed342))
* fence native dispatch and admit bounded independent runs ([9f2590f](https://github.com/GodSpeedAI/Cognate/commit/9f2590f70bca50abf292f3bb88564dce5506c160))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* native fenced dispatch, bounded runs and Linux execution world ([36b05fb](https://github.com/GodSpeedAI/Cognate/commit/36b05fb4194eecda4edbc59ae3e48e6b607a8f48))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **store-sqlite,projections:** authoritative SQLite store, projection runner, rebuild and replay proofs ([d061213](https://github.com/GodSpeedAI/Cognate/commit/d061213fe2a14c1164f824f29c9790ea2a293c04))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))
* **store:** refuse a store whose schema version is newer than this build ([#67](https://github.com/GodSpeedAI/Cognate/issues/67)) ([b3e666a](https://github.com/GodSpeedAI/Cognate/commit/b3e666a7903e8b0e8678f938d546d068a8255fa2))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-ui-astryx: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-ui-astryx-v0.10.0...cognate-ui-astryx-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **ui-astryx:** Astryx reference surfaces over the React bindings ([741ff2c](https://github.com/GodSpeedAI/Cognate/commit/741ff2c9057899106fed5900ca87277242b61496))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-profile-copilot: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-profile-copilot-v0.10.0...cognate-profile-copilot-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **profile-copilot:** Copilot reference profile as a pure composition ([ccae5ec](https://github.com/GodSpeedAI/Cognate/commit/ccae5ec236bb37db1dd84955ecb98b29ee8f085f))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** enforce governed timeouts, wire governance into the harness, fix CG-PRF-002 flake ([3f4af6f](https://github.com/GodSpeedAI/Cognate/commit/3f4af6fe9873b72eded503af72dff013e38a3266))


### Bug Fixes

* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

<details><summary>cognate-profile-harness: 0.3.0</summary>

## [0.3.0](https://github.com/GodSpeedAI/Cognate/compare/cognate-profile-harness-v0.10.0...cognate-profile-harness-v0.3.0) (2026-11-16)


###   BREAKING CHANGES

* rename every SDK package to @godspeedai/cognate-<module> ([#14](https://github.com/GodSpeedAI/Cognate/issues/14))

### Features

* **kernel,harness:** caller tenant reaches policy and handlers; Harness reference profile ([6b2fc9b](https://github.com/GodSpeedAI/Cognate/commit/6b2fc9be69e9d1d51e49c3afe6af538d3654190d))
* move the SDK to the [@godspeedai](https://github.com/godspeedai) npm scope ([#12](https://github.com/GodSpeedAI/Cognate/issues/12)) ([f83943a](https://github.com/GodSpeedAI/Cognate/commit/f83943a9d91cbcce2c3ace8ef225b4c1eb46a8c3))
* prepare [@cognate](https://github.com/cognate) SDK for npm publication + Release Please automation ([#5](https://github.com/GodSpeedAI/Cognate/issues/5)) ([eebec4d](https://github.com/GodSpeedAI/Cognate/commit/eebec4d6d030af92b58e86acc3cd1d2c89619053))
* **release:** 0.8.0 - registry create, README reframe, explainers, landing page ([ab326ec](https://github.com/GodSpeedAI/Cognate/commit/ab326ec5f95e6e9c6c3a39e04e7e5a5812c9ae11))
* rename every SDK package to @godspeedai/cognate-&lt;module&gt; ([#14](https://github.com/GodSpeedAI/Cognate/issues/14)) ([3b9ec18](https://github.com/GodSpeedAI/Cognate/commit/3b9ec18f8b382875fb04e46033be4fbe12f41d29))
* **runtime:** bidirectional shared state and indexed listRuns (CG-STA-001, DEBT-019) ([28ea301](https://github.com/GodSpeedAI/Cognate/commit/28ea30132256dea759517f03ec96ade83351a077))
* **runtime:** enforce governed timeouts, wire governance into the harness, fix CG-PRF-002 flake ([3f4af6f](https://github.com/GodSpeedAI/Cognate/commit/3f4af6fe9873b72eded503af72dff013e38a3266))


### Bug Fixes

* burn down debt register for production readiness ([f290780](https://github.com/GodSpeedAI/Cognate/commit/f290780911005349e2d82e02827fcbfef39ddb47))
* **release:** re-include the umbrella SDK in linked version bumps and rewind the unpublished 0.3.0 ([#36](https://github.com/GodSpeedAI/Cognate/issues/36)) ([36f7b93](https://github.com/GodSpeedAI/Cognate/commit/36f7b93d8e6896ffb3d590ef97d2639265003c55))


### Documentation

* consumer READMEs for all 36 packages + 0.1.2 documentation release prep ([#29](https://github.com/GodSpeedAI/Cognate/issues/29)) ([a4d3378](https://github.com/GodSpeedAI/Cognate/commit/a4d3378c860f8bc9c7f4c99763ee4270b589d345))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).