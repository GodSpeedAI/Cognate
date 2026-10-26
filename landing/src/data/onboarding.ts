// Beat H commands and the first request. tests/readme.test.ts asserts these match README.md
// byte-for-byte (after joining backslash line continuations), so the site and README cannot drift.

export const mkdirCommand = 'mkdir refund-desk && cd refund-desk && git init';

export const skillCommand =
  'npx skills add GodSpeedAI/Cognate --skill building-with-cognate --skill deriving-interaction-domain-models --skill domainforge-sea -a claude-code -y';

export const checkCommand = 'bun --version';

export const testCommand = 'bun test';

export const firstRequest = [
  'Use the building-with-cognate skill to build a small Cognate app called Refund Desk.',
  'A support agent looks up an order and proposes a refund. Refunds of $50 or less go',
  'through on their own; anything over $50 must pause until a person approves or denies it.',
  'Keep a durable history of every step. Use the published @godspeedai/cognate-* packages',
  'from npm (no Cognate source checkout) and no AI API key.',
  "When you're done, run `bun test` and show me passing tests for:",
  'small refund completes, large refund waits for approval, approval completes it,',
  'denial refunds nothing, and the history records each step.',
].join('\n');
