import { useEffect, useRef, useState } from 'react';
import { refundSteps } from '../data/refund';
import { githubUrl } from '../lib/links';

// Beat E. A scroll-stepped assembly. Each step reveals its real excerpt beside it; no typing animation.
const TOKENS: { step: number; label: string; kind: 'reused' | 'new' | 'proof' }[] = [
  { step: 2, label: 'Domain model', kind: 'new' },
  { step: 3, label: 'Runtime', kind: 'reused' },
  { step: 3, label: 'Permissions', kind: 'reused' },
  { step: 3, label: 'Approvals', kind: 'reused' },
  { step: 3, label: 'History', kind: 'reused' },
  { step: 4, label: 'orders.lookup', kind: 'new' },
  { step: 4, label: 'refunds.issue', kind: 'new' },
  { step: 5, label: 'Approval gate', kind: 'new' },
  { step: 6, label: 'Tests: 7 pass', kind: 'proof' },
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
        <div className="mini-stack">
          <div className="mini-plate">
            {TOKENS.filter((t) => t.step <= active).map((t) => (
              <span key={t.label} className={`mini-token mini-${t.kind} ${t.step === active && t.kind !== 'reused' ? 'mini-fresh' : ''}`}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
        <p className="build-caption">Shown for step {active} of 6. Grey parts are reused; outlined parts are new.</p>
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
              <figure className="excerpt">
                <pre>
                  <code>{s.excerpt}</code>
                </pre>
                <figcaption>
                  {s.excerptCaption}{' '}
                  <a href={githubUrl(s.source)} rel="noopener">
                    View on GitHub
                  </a>
                </figcaption>
              </figure>
            )}
            {s.output && (
              <figure className="excerpt">
                <pre>
                  <code>{s.output}</code>
                </pre>
                <figcaption>Output of bun test in examples/refund-desk, at this commit.</figcaption>
              </figure>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
