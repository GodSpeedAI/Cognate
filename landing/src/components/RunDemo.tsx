import { useState } from 'react';

// Beat F demonstration: a $75 refund pauses at the approval gate until a person decides (C10, C11).
type Decision = 'pending' | 'approved' | 'denied';

export default function RunDemo() {
  const [decision, setDecision] = useState<Decision>('pending');
  const events: { text: string; gate?: true; show: boolean }[] = [
    { text: 'refund.proposed $75', show: true },
    { text: 'refund.awaiting_approval', gate: true, show: true },
    { text: 'refund.approved', show: decision === 'approved' },
    { text: 'refund.issued', show: decision === 'approved' },
    { text: 'run.completed', show: decision === 'approved' },
    { text: 'refund.denied', show: decision === 'denied' },
    { text: 'run.completed (no refund)', show: decision === 'denied' },
  ];
  const decided = decision !== 'pending';

  return (
    <div className="demo" aria-labelledby="demo-f-title">
      <p className="demo-label" id="demo-f-title">
        Demonstration
      </p>
      <ol className="run-strip" aria-label="Run events">
        {events
          .filter((e) => e.show)
          .map((e) => (
            <li key={e.text} className={e.gate && !decided ? 'gate' : undefined}>
              <span className="mono">{e.text}</span>
              {e.gate && !decided ? <span className="gate-mark" aria-hidden="true"> ■ gate</span> : null}
            </li>
          ))}
      </ol>
      <div className="demo-actions">
        <button type="button" className="btn btn-human" onClick={() => setDecision('approved')} disabled={decided}>
          Approve
        </button>
        <button type="button" className="btn" onClick={() => setDecision('denied')} disabled={decided}>
          Deny
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setDecision('pending')}>
          Reset
        </button>
      </div>
      <p className="demo-status" aria-live="polite">
        {decision === 'pending' && 'Paused at the approval gate. The run waits for a person.'}
        {decision === 'approved' && 'Approved. The refund was issued and the run completed.'}
        {decision === 'denied' && 'Denied. No refund was issued.'}
      </p>
    </div>
  );
}
