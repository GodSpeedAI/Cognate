import { useEffect, useRef, useState } from 'react';
import { refundSteps } from '../data/refund';
import { githubUrl } from '../lib/links';

// Beat E. A scroll-stepped assembly. Each step reveals its real excerpt beside it; no typing animation.
// Parts the small app gains, by step. "reused" parts come from Cognate packages; "new" parts are built and bound.
const PARTS: { label: string; kind: 'reused' | 'new'; from: number; filled: number }[] = [
  { label: 'Runtime', kind: 'reused', from: 3, filled: 3 },
  { label: 'Permissions', kind: 'reused', from: 3, filled: 3 },
  { label: 'Approvals', kind: 'reused', from: 3, filled: 3 },
  { label: 'History', kind: 'reused', from: 3, filled: 3 },
  { label: 'orders.lookup', kind: 'new', from: 4, filled: 5 },
  { label: 'refunds.issue', kind: 'new', from: 4, filled: 5 },
  { label: 'Approval gate', kind: 'new', from: 5, filled: 6 },
];

export default function BuildSteps() {
  const [active, setActive] = useState(1);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: '-40% 0px -40% 0px' },
    );
    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="build">
      <div className="build-drawing" aria-hidden="true">
        <div className="mini-3d">
          <div className="mini-plate mini-plate-top">
            <span className="mini-label">Domain</span>
            {active >= 2 && <span className="mini-domain">orders · refunds · $50 rule</span>}
          </div>
          <div className="mini-plate mini-plate-mid">
            <span className="mini-label">Capabilities</span>
            <div className="mini-grid">
              {PARTS.filter((p) => active >= p.from).map((p) => {
                const state = p.kind === 'reused' ? 'reused' : active >= p.filled ? 'filled' : 'outlined';
                return (
                  <span key={p.label} className={`mini-cart mini-${state}`}>
                    {p.label}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="mini-plate mini-plate-base">
            <span className="mini-label">Durable record</span>
          </div>
        </div>
        {active >= 6 && <p className="mini-stamp">7 tests pass</p>}
        <p className="build-caption">Step {active} of 6. Grey parts are reused from Cognate. Outlined parts are new, then filled once bound.</p>
      </div>
      <ol className="build-steps">
        {refundSteps.map((s, i) => (
          <li key={s.n} data-step={s.n} ref={(el) => {
              stepRefs.current[i] = el;
            }} className={s.n === active ? 'step is-active' : 'step'}>
            <h3>
              <span className="step-n">{s.n}.</span> {s.title}
            </h3>
            <p>{s.body}</p>
            {s.excerpt && s.source && (
              <details className="show-file">
                <summary>Show the file</summary>
                <figure className="excerpt">
                  <pre tabIndex={0}>
                    <code>{s.excerpt}</code>
                  </pre>
                  <figcaption>
                    {s.excerptCaption}{' '}
                    <a href={githubUrl(s.source)} rel="noopener">
                      View on GitHub
                    </a>
                  </figcaption>
                </figure>
              </details>
            )}
            {s.output && (
              <figure className="excerpt">
                <pre tabIndex={0}>
                  <code>{s.output}</code>
                </pre>
                <figcaption>Seven tests pass: the five journeys you asked for, plus checks that the domain model loads and that refunds survive a restart.</figcaption>
              </figure>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
