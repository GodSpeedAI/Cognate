import { useEffect, useState } from 'react';

// Beat F demonstration of examples/refund-desk (Cognate source, src/refund-desk.ts). A $75 refund is over the $50
// approval threshold, so the policy check escalates it: refund.proposed, then refund.awaiting_approval (lines 124-127),
// then the run waits for a person. Approve emits refund.approved and refund.issued (lines 137, 144). Deny emits
// refund.denied (line 134) and no refund is issued. The decision node only moves through those states.
type Phase = 'pending' | 'escalate' | 'allow' | 'deny';

const POLICY = 'Policy: refunds over $50 need approval';
const DECISION_DELAY_MS = 480; // how long the policy check reads as pending before it escalates
const reducedQuery = '(prefers-reduced-motion: reduce)';
const NODE_LABEL: Record<Phase, string> = {
  pending: 'Pending',
  escalate: 'Escalate: waiting for a person',
  allow: 'Allow',
  deny: 'Deny',
};

export default function RunDemo() {
  const [phase, setPhase] = useState<Phase>('pending');

  // pending -> escalate on its own. Only the pending phase schedules this; a decision or a reset never does.
  useEffect(() => {
    if (phase !== 'pending') return;
    const reduced = window.matchMedia(reducedQuery).matches;
    const timer = window.setTimeout(() => setPhase('escalate'), reduced ? 0 : DECISION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const escalated = phase !== 'pending';
  const events: { text: string; show: boolean; gate?: true }[] = [
    { text: 'refund.proposed $75', show: true },
    { text: 'refund.awaiting_approval', show: escalated, gate: phase === 'escalate' ? true : undefined },
    { text: 'refund.approved', show: phase === 'allow' },
    { text: 'refund.issued', show: phase === 'allow' },
    { text: 'run.completed', show: phase === 'allow' },
    { text: 'refund.denied', show: phase === 'deny' },
    { text: 'run.completed (no refund)', show: phase === 'deny' },
  ];
  const awaiting = phase === 'escalate';

  return (
    <div className="demo" aria-labelledby="demo-f-title">
      <p className="demo-label" id="demo-f-title">
        Demonstration
      </p>
      <p className="decision-node" data-phase={phase}>
        <span className="decision-policy">{POLICY}</span>
        <span className="decision-state mono">{NODE_LABEL[phase]}</span>
      </p>
      <ol className="run-strip" aria-label="Run events">
        {events
          .filter((e) => e.show)
          .map((e) => (
            <li key={e.text} className={e.gate ? 'gate' : undefined}>
              <span className="mono">{e.text}</span>
              {e.gate ? <span className="gate-mark" aria-hidden="true"> ■ gate</span> : null}
            </li>
          ))}
      </ol>
      <div className="demo-actions">
        <button type="button" className="btn btn-human" onClick={() => setPhase('allow')} disabled={!awaiting}>
          Approve
        </button>
        <button type="button" className="btn" onClick={() => setPhase('deny')} disabled={!awaiting}>
          Deny
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setPhase('pending')}>
          Reset
        </button>
      </div>
      <p className="demo-status" aria-live="polite">
        {phase === 'pending' && 'Checking the policy.'}
        {awaiting && 'Paused at the approval gate. The run waits for a person.'}
        {phase === 'allow' && 'Approved. The refund was issued and the run completed.'}
        {phase === 'deny' && 'Denied. No refund was issued.'}
      </p>
    </div>
  );
}
