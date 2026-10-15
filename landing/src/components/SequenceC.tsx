import { useEffect, useRef, useState, type RefObject } from 'react';
import { Animation, Root, Waypoint } from '@bsmnt/scrollytelling';
import ExplodedView, { SCRUB_EVENT, SELECT_EVENT } from './ExplodedView';

// Sequence C ("Take it apart"), from actualize/artifacts/motion-editorial/scroll-choreography.md.
// Units: 0-8 flat capture; 8-24 tilt; 24-48 layers separate; 48-68 cartridges rise; 68-84 C-05 selected;
// 84-100 hold, interactive. Motion is a pure function of scroll (scrubbed), so it reverses exactly.
const CAPTIONS = [
  'This is the real app.',
  'Four layers: interface, agents, capabilities, durable record.',
  'Each part does one job.',
  'Parts connect by contract. Select one.',
] as const;

const mobileQuery = '(max-width: 767px)';
const reducedQuery = '(prefers-reduced-motion: reduce)';

export default function SequenceC() {
  const pinRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState(0);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const sync = () => setDisabled(window.matchMedia(reducedQuery).matches || window.matchMedia(mobileQuery).matches);
    sync();
    const onScroll = () => window.dispatchEvent(new Event(SCRUB_EVENT));
    const mqs = [window.matchMedia(reducedQuery), window.matchMedia(mobileQuery)];
    mqs.forEach((mq) => mq.addEventListener('change', sync));
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      mqs.forEach((mq) => mq.removeEventListener('change', sync));
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const target = pinRef as RefObject<HTMLElement>;
  const reduced = typeof window !== 'undefined' && window.matchMedia(reducedQuery).matches;

  return (
    <Root
      start="top top"
      end="bottom bottom"
      disabled={disabled}
      callbacks={{ onUpdate: () => window.dispatchEvent(new Event(SCRUB_EVENT)) }}
    >
      <div className="seq-track seq-c" data-sequence="C">
        <div className="seq-pin" ref={pinRef}>
          <Animation tween={{ start: 8, end: 24, target, fromTo: [{ '--tilt': 0 }, { '--tilt': 1 }] } as never} />
          <Animation tween={{ start: 24, end: 48, target, fromTo: [{ '--sep': 0 }, { '--sep': 1 }] } as never} />
          <Animation tween={{ start: 48, end: 68, target, fromTo: [{ '--rise': 0 }, { '--rise': 1 }] } as never} />
          <Waypoint at={0} onCall={() => setCaption(0)} onReverseCall={() => setCaption(0)} />
          <Waypoint at={24} onCall={() => setCaption(1)} onReverseCall={() => setCaption(0)} />
          <Waypoint at={48} onCall={() => setCaption(2)} onReverseCall={() => setCaption(1)} />
          <Waypoint
            at={68}
            onCall={() => {
              setCaption(3);
              window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: 'C-05' }));
            }}
            onReverseCall={() => {
              setCaption(2);
              window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: null }));
            }}
          />

          <div className="seq-stage">
            <p className="seq-caption" aria-live="polite">
              {reduced ? CAPTIONS[3] : CAPTIONS[caption]}
            </p>
            <ExplodedView defaultSelection={reduced ? 'C-05' : null} />
            <p className="seq-skip">
              <a href="#fit">Skip the animation</a>
            </p>
          </div>
        </div>
      </div>
    </Root>
  );
}
