# T0 Validation Record

Executed from repository root with DomainForge CLI `0.16.0`:

1. `domainforge validate --format human validation/reconstructions/copilot/.sea/interaction/interaction-model.sea`
   → `Validation succeeded: 0 violations total`.
2. `domainforge parse validation/reconstructions/copilot/.sea/interaction/interaction-model.sea --format human`
   → graph parsed successfully; 5 entities, 4 resources, 4 flows, 1 role.
3. `domainforge parse --ast --format json validation/reconstructions/copilot/.sea/interaction/interaction-model.sea`
   → AST contains `j_a_chat_turn`, the structural policy, and the metric.

`domainforge fmt --check` reports a reformat. Applying this CLI's formatter rewrites the valid
`forall f in flows:` policy into `ForAll(f in flows:)`, which the same `0.16.0` parser rejects.
The model therefore retains parser-valid policy syntax. This is the same formatter/parser defect
already documented for the repository's DeepSeek Harness interaction model; it is not a Cognate
or CopilotKit semantic limitation.

The human parse summary reports `Instances: 0` and `Policies: 0` despite AST inspection showing
one entity instance and one policy. AST JSON is the evidence used for those declarations on this
CLI version.
