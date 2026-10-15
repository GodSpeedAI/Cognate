import { useState } from 'react';

// Beat D. A demonstration of examples/mcp (C9, C6, C8, C19). It runs in the browser; it is not a deployed app.
const PROVIDERS = ['Local model', 'Remote model'] as const;
const CALLERS = ['alice', 'mallory'] as const;
const DOORS = ['Button in the app', 'Agent tool (MCP)', 'API call'] as const;

export default function CompositionDemo() {
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>('Local model');
  const [caller, setCaller] = useState<(typeof CALLERS)[number]>('alice');
  const [door, setDoor] = useState<(typeof DOORS)[number]>('Button in the app');
  const allowed = caller === 'alice';

  return (
    <div className="demo" aria-labelledby="demo-d-title">
      <p className="demo-label" id="demo-d-title">
        Interactive demonstration, runs in your browser, not a deployed app.
      </p>
      <fieldset className="demo-controls">
        <legend>Provider</legend>
        {PROVIDERS.map((p) => (
          <label key={p} className="radio">
            <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} /> {p}
          </label>
        ))}
        <p className="demo-note">Same contract, <span className="mono">model.generate@1</span>.</p>
      </fieldset>
      <fieldset className="demo-controls">
        <legend>Caller</legend>
        {CALLERS.map((c) => (
          <label key={c} className="radio">
            <input type="radio" name="caller" checked={caller === c} onChange={() => setCaller(c)} /> {c}
          </label>
        ))}
      </fieldset>
      <fieldset className="demo-controls">
        <legend>Door</legend>
        {DOORS.map((d) => (
          <label key={d} className="radio">
            <input type="radio" name="door" checked={door === d} onChange={() => setDoor(d)} /> {d}
          </label>
        ))}
      </fieldset>
      <div className="demo-result" aria-live="polite">
        {allowed ? (
          <>
            <p>
              <span className="mono">billing.quote@1</span> answered by <em>{provider}</em> through <em>{door}</em> → total 42.
            </p>
            <p className="event-row">
              <span className="mono">Recorded: invocation · allowed.</span>
            </p>
          </>
        ) : (
          <>
            <p className="denied">Denied by policy before anything ran.</p>
            <p className="event-row">
              <span className="mono">Recorded: invocation · denied.</span>
            </p>
          </>
        )}
      </div>
      <p className="demo-takeaway">
        The same job, through three different doors, under one permission check. That's the difference between a capability and a pile of tools.
      </p>
      <p className="demo-source">Mirrors <span className="mono">examples/mcp</span> in the Cognate repo, which runs this exact flow.</p>
    </div>
  );
}
