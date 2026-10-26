import type { SourceRef } from './types';

// Beat E evidence: examples/refund-desk at the local Cognate HEAD (the commit the Phase 2 brief names).
// Links resolve once this commit is pushed to GodSpeedAI/Cognate.
const HEAD = 'c3eaf4dfb23271eb82d9b964a6c2f5ed105af480';
const COR = 'GodSpeedAI/Cognate';

export interface RefundStep {
  readonly n: number;
  readonly title: string;
  readonly body: string;
  /** Verified excerpt, or undefined when the step shows output instead. */
  readonly excerpt?: string;
  readonly excerptCaption?: string;
  readonly source?: SourceRef;
  /** Captured output (not a file), for step 6. */
  readonly output?: string;
}

export const refundHead = HEAD;

// Beat D static outcome: the line where the policy check runs (packages/kernel-cordis/src/lease.ts, lines 56-68).
// lease.ts is unchanged since dd13c84, which is on GitHub main, so this link resolves before the branch is pushed.
export const leaseSource: SourceRef = { repo: COR, sha: 'dd13c8422220ecbac61a92bdd90829218844bc2e', path: 'packages/kernel-cordis/src/lease.ts', startLine: 56, endLine: 68 };

export const refundSteps: readonly RefundStep[] = [
  {
    n: 1,
    title: 'You describe the outcome.',
    body: 'The request, in your words.',
  },
  {
    n: 2,
    title: 'The agent writes down what the app must accomplish.',
    body: 'A small domain model: who acts, what an order and a refund are, and the rule that refunds over $50 need approval. It\'s written in DomainForge, GodSpeed\'s modelling language, so both people and the software can check the rules.',
    excerpt: [
      '// Business rule: a refund over $50 needs an approval relation in the model.',
      'Policy refund_over_50_needs_approval as:',
      '    forall f in flows: (f.quantity <= 50 or exists r in relations: (r.predicate = "approves"))',
    ].join('\n'),
    excerptCaption: 'domain/refund-desk.sea: the refund rule, as a policy.',
    source: { repo: COR, sha: HEAD, path: 'examples/refund-desk/domain/refund-desk.sea', startLine: 36, endLine: 38 },
  },
  {
    n: 3,
    title: 'It reuses what exists.',
    body: 'Runtime, permissions, approvals and history come from Cognate packages on npm.',
    excerpt: [
      '  "dependencies": {',
      '    "@godspeedai/cognate-client": "0.5.0",',
      '    "@godspeedai/cognate-domainforge": "0.5.0",',
      '    "@godspeedai/cognate-kernel-api": "0.5.0",',
      '    "@godspeedai/cognate-runtime-api": "0.5.0",',
      '    "@godspeedai/cognate-runtime-bun": "0.5.0"',
      '  },',
    ].join('\n'),
    excerptCaption: 'package.json: the Cognate packages it depends on.',
    source: { repo: COR, sha: HEAD, path: 'examples/refund-desk/package.json', startLine: 11, endLine: 17 },
  },
  {
    n: 4,
    title: 'It builds and binds what is missing.',
    body: 'Two new capabilities: orders.lookup and refunds.issue.',
    excerpt: [
      '  const [lookup, issue] = bindCapabilities(loaded.projection, [',
      '    { semanticId: "refunds::Order", capability: { id: "orders.lookup", version: "1.0.0" } },',
      '    { semanticId: "refunds::Refund", capability: { id: "refunds.issue", version: "1.0.0" } },',
      '  ]);',
    ].join('\n'),
    excerptCaption: 'src/refund-desk.ts: the two capabilities bound to the model.',
    source: { repo: COR, sha: HEAD, path: 'examples/refund-desk/src/refund-desk.ts', startLine: 61, endLine: 64 },
  },
  {
    n: 5,
    title: 'It wires the behaviour.',
    body: 'Small refunds go through. Large ones wait for a person.',
    excerpt: [
      '    if (amountCents > APPROVAL_THRESHOLD_CENTS) {',
      '      await ctx.emit("refund.awaiting_approval", { orderId, amountCents, thresholdCents: APPROVAL_THRESHOLD_CENTS });',
      '      const decision = (await ctx.waitFor("approve-refund", {',
      '        type: "refund-approval",',
      '        condition: { kind: "human_approval" },',
      '        payload: { orderId, amountCents },',
      '      })) as { readonly approved: boolean; readonly by?: string };',
    ].join('\n'),
    excerptCaption: 'src/refund-desk.ts: over the threshold, the run waits for a person.',
    source: { repo: COR, sha: HEAD, path: 'examples/refund-desk/src/refund-desk.ts', startLine: 126, endLine: 132 },
  },
  {
    n: 6,
    title: 'It tests every journey and shows you.',
    body: 'Read this output. Seven tests should pass.',
    excerpt: '  test("small refund completes", async () => {',
    excerptCaption: 'test/refund-desk.test.ts: one of the journeys it tests.',
    source: { repo: COR, sha: HEAD, path: 'examples/refund-desk/test/refund-desk.test.ts', startLine: 42, endLine: 42 },
    output: ['7 pass', '0 fail', '28 expect() calls', 'Ran 7 tests across 1 file.'].join('\n'),
  },
];
