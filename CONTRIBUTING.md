# Contributing to Cognate

**Build useful things. Preserve meaning. Make your work reusable.**

Cognate is GodSpeed AI's open-source semantic application SDK for building agent-native software, and this guide applies GodSpeed's contribution principles to this repository.

GodSpeed AI develops infrastructure for building, operating, and governing AI-native systems.

Our projects address different parts of that problem: representing domain knowledge, composing applications, orchestrating agents, enforcing authority, and verifying outcomes.

We welcome contributions from software engineers, AI practitioners, domain experts, researchers, and people solving real problems with these tools.

You don't have to understand the entire architecture to contribute. Start with the part you know.

## 1. How We Think About Contributions

Good contributions solve real problems. Great contributions make those problems easier to solve again.

A connector that works for one application is useful. A connector that works across applications is more useful. A documented interface that lets others create compatible connectors multiplies that value.

We aim to make each accepted contribution one or more of the following:

- **Reusable:** Useful beyond the original contributor's application.
- **Composable:** Works with existing capabilities without unnecessary coupling.
- **Verifiable:** Has observable behavior and evidence that it works.
- **Maintainable:** Introduces reasonable long-term support obligations.
- **Interoperable:** Preserves established interfaces and shared meaning.
- **Adoptable:** Makes it easier for others to build, integrate, or deploy something useful.

Not every contribution needs to satisfy all six. A typo fix doesn't need an architectural proposal. A new protocol does.

We prefer the smallest change that delivers the intended capability without creating unnecessary constraints on future work.

## 2. Choose Your Contribution Path

There are four main ways to participate.

### Path A — Improve What Exists

**For:** Bug fixes, documentation, performance improvements, tests, accessibility, and developer experience.

These are generally suitable for direct pull requests.

A good submission includes:

- What was wrong or unnecessarily difficult.
- What changed.
- How the change was verified.
- Any compatibility considerations.

Small, focused changes are welcome. You do not need to write a design document to fix a clear problem.

### Path B — Extend the Ecosystem

**For:** Adapters, integrations, domain models, reusable workflows, agent skills, projections, and reference implementations.

These contributions are particularly valuable because they increase what other people can build without requiring changes to shared infrastructure.

Examples in Cognate include:

- A capability component, following [docs/how-to/add-a-capability.md](docs/how-to/add-a-capability.md).
- A model provider package, such as one of the `packages/provider-*` packages.
- A protocol adapter that gives an existing `RuntimeService` a new wire surface, following [docs/how-to/add-a-protocol-adapter.md](docs/how-to/add-a-protocol-adapter.md).
- A projection from an existing semantic model into a useful output format, following [docs/how-to/add-a-projection.md](docs/how-to/add-a-projection.md).
- A profile that composes existing capabilities for a kind of application, like the ones under [profiles/](profiles/).
- A reference application demonstrating a complete business workflow, like [examples/refund-desk](examples/refund-desk/).
- An improvement to the [building-with-cognate](.agents/skills/building-with-cognate/SKILL.md) agent skill, backed by deterministic acceptance checks.

Before implementing a substantial extension, open an issue describing:

1. **Use case:** What does this enable someone to accomplish?
2. **Existing limitation:** Why can't they accomplish it adequately today?
3. **Proposed capability:** What reusable functionality will you provide?
4. **Integration boundary:** Which existing interfaces will it use?
5. **Proof:** How can someone independently verify that it works?

Prefer adding capabilities through existing extension points.

If an extension requires changing the core, explain why the existing interfaces are insufficient before proposing the change.

### Path C — Evolve the Foundations

**For:** Semantic primitives, shared contracts, public APIs, execution protocols, authorization boundaries, and architectural changes.

These changes require discussion before implementation.

Foundational surfaces in Cognate include:

- Kernel contracts, in [packages/kernel-api](packages/kernel-api/).
- The `RuntimeService` contract, in [packages/runtime-api](packages/runtime-api/), whose packaging is recorded in [ADR-0011](docs/decisions/ADR-0011-runtime-service-contract-package.md).
- The event envelope and the `DurableStore` port, in [packages/events](packages/events/).
- Authorization semantics: when authority is evaluated and how outcomes are recorded.

The decisions behind these surfaces are recorded in [docs/decisions/](docs/decisions/README.md), and the normative requirements are in the design spec at [.agents/specs/software-design-spec-cognate.-frameworkmd](.agents/specs/software-design-spec-cognate.-frameworkmd). Read the relevant records and spec sections first. Cognate's contracts are not frozen yet, and the requirement ledger in [requirements/ledger.yaml](requirements/ledger.yaml) is still a candidate. A change to a contract still needs a proposal, an explicit compatibility analysis, and updated proofs.

Start with a design proposal that identifies:

- The problem and a concrete motivating example.
- The current behavior and why it is insufficient.
- Alternatives considered, including doing nothing.
- The proposed change and affected components.
- Compatibility, migration, and security implications.
- Acceptance criteria and a validation strategy.

**Foundational changes must not make existing meaning ambiguous or weaken established guarantees.**

For example, adding a new semantic primitive to DomainForge is different from contributing a domain model that uses existing primitives. Likewise, adding a new integration with SEA-Forge is different from changing when authority is evaluated or how execution outcomes are settled.

We favor additive evolution whenever it can meet the requirement without introducing avoidable complexity.

### Path D — Contribute Domain Knowledge and Use Cases

**For:** Business process expertise, operational workflows, regulatory scenarios, failure cases, and problems discovered in real deployments.

You don't have to write code to make a valuable contribution.

Suppose you know that a particular healthcare authorization workflow requires separation between the person requesting an action and the person approving it.

That knowledge could become:

- A documented business rule.
- A reusable semantic model.
- An authorization test case.
- A reference workflow.
- A regression test guarding against an unsafe implementation.

Begin by describing the scenario, expected outcome, and relevant constraints.

Use fictional or sanitized examples. Never submit customer data, confidential procedures, credentials, protected health information, or material that you lack permission to disclose.

## 3. Where Contributions Belong

GodSpeed projects have distinct responsibilities. Place new functionality at the narrowest boundary that can support it without unnecessary duplication.

This repository is **Cognate**. The other rows are the surrounding GodSpeed projects Cognate integrates with.

| Project | Primary contribution domain |
|---|---|
| **DomainForge** | Semantic models, validation, projections, compiler behavior, and language tooling |
| **Cognate** | Agent-native application composition, adapters, components, and application experiences |
| **Gauntlet** | Long-running agent execution, task verification, orchestration, and recovery |
| **SWE_SEED** | Agent work routing, context, skills, traces, and proof workflows |
| **SEA-Forge** | Authority enforcement, governed execution, evidence, and settlement |
| **RealityTrace** | Execution observations, verification, and traceable evidence |

Some projects are not yet publicly available for contributions. Use the public repository's current instructions to determine which interfaces are supported.

### Architecture Principles

**Meaning before implementation.** When behavior depends on domain concepts, preserve their established definitions and identities. Do not introduce parallel, inconsistent representations without a compelling reason.

**Authority before action.** Changes involving consequential side effects must preserve applicable authorization boundaries. A successful command is not necessarily an accepted outcome.

**Evidence before claims.** Tests, traces, and demonstrations should support claims about functionality. Do not describe planned behavior as implemented behavior.

**Extensions before forks.** Prefer supported interfaces and replaceable components to modifications that unnecessarily couple an implementation to the core.

**Compatibility is a contract.** Changes to shared semantics, public interfaces, or persisted representations require explicit compatibility analysis.

These principles guide review. They are not a requirement to adopt unrelated GodSpeed components in every contribution.

## 4. Getting Started

1. Choose a publicly accessible repository.
2. Read its `README.md`, `CONTRIBUTING.md`, and relevant architectural documentation.
3. Check existing issues and pull requests for overlapping work.
4. For substantial features, open a proposal before investing heavily in implementation.
5. Fork the repository and create a focused branch.
6. Make your change, add the necessary tests, and run the documented checks.
7. Submit a pull request describing the capability and its evidence.

For Cognate, step 2 means reading the root [AGENTS.md](AGENTS.md), then the `README.md` and `AGENTS.md` of each package you change, its dependency contract, the relevant records in [docs/decisions/](docs/decisions/README.md), and the invariants its tests exercise. [README.md](README.md#contributing) lists the same order.

### Development and Verification

Each repository owns its development environment and verification commands.

Cognate requires **Bun 1.4 or later** (the root `package.json` pins `bun@1.4.0`) and `just`. Run `just --list` to see every recipe. The commands you will use most are:

| Command | What it does |
|---|---|
| `bun install` | Installs the workspace dependencies. |
| `just verify` | The regression baseline: substrate check, typecheck, gate-runner tests, the README gate, and every gate claimed `implemented`. |
| `just gates` | Reports every ledger gate as PASS or FAIL, plus status drift. Exits non-zero while any gate is unmet. |
| `just gate <id>` | Runs one requirement's proof gate, for example `just gate CG-KRN-001`. |
| `just docs` | Runs the published-package README gate ([docs/package-readme-standard.md](docs/package-readme-standard.md)). |
| `bun run typecheck` | Type-checks every package, profile, test, and script. |
| `bun run test` | Runs every workspace test. Some contract suites are intentionally RED for requirements that are not implemented yet, so a failure there is not automatically a regression. Compare against the gate reports. |

Use the `justfile` as the canonical command interface rather than reconstructing the build by hand. Other GodSpeed repositories have their own commands, and their guides apply there.

A passing `just verify` proves the substrate checked in so far, on your machine, under Bun 1.4.0. It does not mean the application builds for deployment, and it does not close the open debt in [.agents/DEBT.md](.agents/DEBT.md). [How to verify a change](docs/how-to/verify-a-change.md) explains what each gate proves and what it does not.

Passing a narrow test does not necessarily satisfy all merge requirements.

## 5. What a Good Pull Request Contains

Every PR should make its purpose and outcome understandable to someone who did not implement it.

### Contribution Summary

**Problem:** What limitation or failure does this address?

**Change:** What did you add or modify?

**Scope:** Which components and interfaces are affected?

**Compatibility:** Does this change established behavior, serialized data, semantics, or authority boundaries?

**Evidence:** Which tests, fixtures, demonstrations, or verification commands support the change?

**Limitations:** What remains unsupported, unverified, or deliberately outside scope?

### Example

**Problem:** Developers implementing procurement workflows repeatedly define incompatible approval models.

**Change:** Added a reusable procurement approval `.sea` example with configurable roles and approval thresholds.

**Scope:** DomainForge examples and tests; no compiler or grammar changes.

**Compatibility:** Existing semantics and public interfaces remain unchanged.

**Evidence:** Model validation and tests covering authorized approvals, rejected self-approvals, and threshold behavior.

**Limitations:** This example does not integrate with a production purchasing system or independently establish regulatory compliance.

We value accurate descriptions of limitations as much as demonstrations of successful behavior.

## 6. AI-Assisted Contributions

AI-assisted development is welcome.

We encourage contributors to use coding agents, automated review, and AI tools wherever they improve productivity and correctness. Coding agents can use the [building-with-cognate](.agents/skills/building-with-cognate/SKILL.md) skill, and should follow the root [AGENTS.md](AGENTS.md).

However, **the contributor remains responsible for the submitted work**.

Before opening a PR:

- Inspect AI-generated changes for correctness and unintended modifications.
- Verify that generated code, dependencies, and assets have appropriate licenses.
- Run the applicable validation commands yourself.
- Review security-sensitive and authority-sensitive behavior.
- Disclose material limitations and tests that could not be performed.
- Do not present fabricated test output, citations, benchmarks, or implementation evidence.

An agent's statement that tests pass, a gate is green, or the work is complete is not evidence. Include the commands you ran and their actual output in the PR, for example the final lines of `just verify` or `bun run test`, and say which checks you did not run. Where useful, link to sanitized execution traces or reproducible test artifacts.

We do not require disclosure of every tool used. We care about provenance where it affects trust, licensing, reproducibility, or review.

Large, unreviewed AI-generated PRs that substantially increase maintainer workload may be declined or requested as smaller submissions.

## 7. Acceptance and Review

Automated checks establish whether documented conditions have been satisfied. Maintainers also consider whether a contribution is appropriate for the project.

Review considers five questions:

1. **Utility:** Does this solve a demonstrated problem?
2. **Fit:** Does it belong in this project and respect its architectural boundaries?
3. **Evidence:** Is the intended behavior reproducible and adequately tested?
4. **Compatibility:** Does it preserve existing contracts, or include an acceptable migration?
5. **Maintenance:** Can the project reasonably support it over time?

A passing CI run is necessary for applicable required checks, but does not guarantee acceptance.

A contribution may be declined if it duplicates existing functionality, introduces inappropriate coupling, expands scope without sufficient value, creates unreasonable maintenance obligations, or conflicts with the project's licensing and security requirements.

When declining a contribution, we aim to explain the governing reason and, where practical, identify a narrower alternative.

## 8. Licensing, Ownership, and Commercial Use

GodSpeed maintains projects under different licenses.

Cognate is licensed under the **Apache License, Version 2.0** (see [LICENSE](LICENSE)). Some other components, including DomainForge, are available under permissive open-source licenses. Others, including SEA-Forge, have source-available or separately licensed portions.

**The license in each repository governs that repository.** Do not assume permission or restrictions are identical across GodSpeed projects.

Before contributing:

- Read the repository's `LICENSE` and applicable licensing notices.
- Confirm that you have the right to contribute the material.
- Preserve third-party attribution and license notices.
- Do not submit proprietary customer code or confidential information without express authorization.
- Understand any contributor agreement or rights confirmation required by that repository.

Projects with separate commercial or enterprise licensing may require additional contribution-rights review.

We will identify any required contribution agreement before accepting material governed by it.

### Open-Source and Commercial Activities

GodSpeed AI also provides commercial engineering, integration, deployment, governance, and support services.

These activities complement community development. A contribution does not obligate anyone to purchase services, and contributing does not grant special commercial access or create an obligation to provide consulting work.

Community contributions are evaluated on their usefulness and compatibility—not on whether they generate commercial opportunities.

The goal is a healthy ecosystem in which people can independently use and extend the available software while organizations that need specialized implementation can obtain professional assistance.

## 9. Security and Responsible Disclosure

Do not report exploitable vulnerabilities through public issues or pull requests when disclosure could put users at risk.

Cognate does not currently publish a `SECURITY.md` or other security reporting policy. Contact a maintainer privately through GitHub under the [GodSpeedAI](https://github.com/GodSpeedAI) organization before disclosing details, and do not open a public issue for the report.

Contributions affecting authorization, isolation, execution, secrets, or audit evidence may require additional security review and tests. Follow the security and privacy rules in the root [AGENTS.md](AGENTS.md) and spec §32 of the design spec: default to no authority, authorize at invocation and before external commitments, and keep credentials and personal payloads out of events, logs, cognitive indexes, and committed configuration.

Never include production secrets or sensitive client information in issues, PRs, logs, fixtures, or agent traces.

## 10. What Happens After a Contribution Is Accepted?

An accepted contribution becomes part of the relevant repository according to its license and maintenance policies.

Depending on its nature, maintainers may:

- Include it in a release.
- Document it as a supported extension or reference implementation.
- Add its tests to the compatibility or regression suite.
- Identify follow-on improvements for other contributors.
- Incorporate generalized lessons into future architectural decisions.

Not every contribution becomes a permanent public API or a maintained integration. Experimental examples and stable contracts have different maintenance expectations.

Where practical, we identify that distinction explicitly.

## 11. A Final Note

GodSpeed is built around the idea that AI systems become more useful when meaning, capabilities, authority, and evidence are represented clearly enough to work together.

The same principle guides this community.

Contributions should make useful work easier for the next person—not require them to rediscover the same assumptions, integrations, or failure modes.

Bring a bug, an integration, a domain problem, a test case, or a well-reasoned alternative.

**Build something useful. Prove that it works. Make it easier to build upon.**
