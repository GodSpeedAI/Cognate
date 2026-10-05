# T0–T4 Validation Record

Executed from repository root with DomainForge CLI `0.18.1` (upgraded from `0.16.0`):

1. `domainforge validate --format human validation/reconstructions/copilot/.sea/interaction/interaction-model.sea`
   → `Validation succeeded: 0 violations total`.
2. `domainforge parse validation/reconstructions/copilot/.sea/interaction/interaction-model.sea --format human`
   → graph parsed successfully: 12 entities, 12 resources, 12 flows, 3 roles, 0 relations, 0
   resource instances, 10 entity instances, 1 policy, 0 patterns.
3. `domainforge parse --ast --format json validation/reconstructions/copilot/.sea/interaction/interaction-model.sea`
   → AST contains 51 declarations: 12 `Entity`, 12 `Resource`, 3 `Role`, 12 `Flow`, 10 `Instance`
   (the ten canonical journey records, `j_a_chat_turn` through `j_k_live_recovery`), 1 `Policy`,
   and 1 `Metric`.

`domainforge fmt --check` reports a reformat. Applying this CLI's formatter rewrites the valid
`forall f in flows:` policy into `ForAll(f in flows: (f.quantity > 0.0))`, which the same `0.18.1`
parser rejects, and it also drops the file's `//` comments. The model therefore retains
parser-valid policy syntax and is never passed through `fmt --out`. This is the same
upstream formatter/parser defect already documented for the repository's DeepSeek Harness
interaction model (see that model's `validation/limitations.md`), still present on `0.18.1`; it
is not a Cognate or CopilotKit semantic limitation.

FIXED in 0.18.1: on the previously installed `0.16.0` build, the human parse summary reported
`Instances: 0` and `Policies: 0` despite AST inspection showing ten entity instances and one
policy, and AST JSON was used as the evidence source for those declarations. On `0.18.1`,
`parse --format human` now reports `Entity instances: 10` and `Policies: 1` directly, matching
the AST inspection; the AST-JSON check is retained above as additional cross-checking evidence,
not as a required workaround.
