import { useEffect, useRef, useState, type RefObject } from 'react';
import { Animation, Root, Waypoint } from '@bsmnt/scrollytelling';
import { captures } from '../data/captures';
import { extensionParts } from '../lib/graph';
import ExplodedView, { SCRUB_EVENT, SELECT_EVENT } from './ExplodedView';

// Sequence G ("It can grow"), from scroll-choreography.md. Units: 0-15 exploded; 15 C-13 slot (dashed);
// 35 built and bound (edges to verified providers only); 55 tested; 65 accepted by a person; 65-92 reassemble;
// 92-100 hold on the expert-teams branch capture.
const STAMPS = ['Modelled', 'Built', 'Bound', 'Tested', 'Accepted by a person'] as const;
const branchCapture = captures.find((c) => c.file.includes('default-team-desktop'));
const mobileQuery = '(max-width: 767px)';
const reducedQuery = '(prefers-reduced-motion: reduce)';

export default function SequenceG() {
  const pinRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(0);
  const [showBranch, setShowBranch] = useState(false);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const sync = () => setDisabled(window.matchMedia(reducedQuery).matches || window.matchMedia(mobileQuery).matches);
    sync();
    const mqs = [window.matchMedia(reducedQuery), window.matchMedia(mobileQuery)];
    mqs.forEach((mq) => mq.addEventListener('change', sync));
    return () => mqs.forEach((mq) => mq.removeEventListener('change', sync));
  }, []);

  const target = pinRef as RefObject<HTMLElement>;
  const finalStage = disabled ? 5 : stage;

  return (
    <Root start="top top" end="bottom bottom" disabled={disabled} callbacks={{ onUpdate: () => window.dispatchEvent(new Event(SCRUB_EVENT)) }}>
      <div className="seq-track seq-g" data-sequence="G">
        <div className="seq-pin" ref={pinRef}>
          <Animation tween={{ start: 65, end: 92, target, fromTo: [{ '--sep': 1 }, { '--sep': 0 }] } as never} />
          <Animation tween={{ start: 65, end: 92, target, fromTo: [{ '--tilt': 1 }, { '--tilt': 0 }] } as never} />
          <Waypoint at={15} onCall={() => setStage(1)} onReverseCall={() => setStage(0)} />
          <Waypoint
            at={35}
            onCall={() => {
              setStage(3);
              window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: 'C-13' }));
            }}
            onReverseCall={() => {
              setStage(1);
              window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: null }));
            }}
          />
          <Waypoint at={55} onCall={() => setStage(4)} onReverseCall={() => setStage(3)} />
          <Waypoint at={65} onCall={() => setStage(5)} onReverseCall={() => setStage(4)} />
          <Waypoint at={92} onCall={() => setShowBranch(true)} onReverseCall={() => setShowBranch(false)} />

          <div className="seq-stage">
            {showBranch && branchCapture && !disabled ? (
              <figure className="branch-capture">
                <img src={`/${branchCapture.file}`} width={branchCapture.width} height={branchCapture.height} alt={branchCapture.alt} loading="lazy" decoding="async" />
                <figcaption>{branchCapture.caption}</figcaption>
              </figure>
            ) : (
              <ExplodedView parts={extensionParts} defaultSelection={null} extensionStage={finalStage} />
            )}
            <ol className="stamps" aria-label="Extension status">
              {STAMPS.map((s, i) => (
                <li key={s} data-done={finalStage >= i + 1 ? 'true' : 'false'}>
                  {s}
                  {finalStage >= i + 1 ? ' ✓' : ''}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Root>
  );
}
