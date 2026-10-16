import { useCallback, useEffect, useRef, useState } from 'react';
import { Root } from '@bsmnt/scrollytelling';
import type { Pose } from '../lib/projection';
import ExplodedView, { SCRUB_EVENT } from './ExplodedView';

// Sequence C ("Take it apart"), from actualize/artifacts/motion-editorial/scroll-choreography.md.
// Units: 0-8 flat; 8-24 tilt; 24-48 layers separate; 48-68 cartridges rise; 68 the inspector hold begins.
// Everything is a pure function of the scroll position (unit), read on each scroll: the pose, the hold and the
// caption. Nothing waits on GSAP's ticks, so a jump, a step or a reverse all draw the same frame.
const CAPTIONS = [
  'This is the real app.',
  'Four layers: interface, agents, capabilities, durable record.',
  'Each part does one job.',
  'Parts connect by contract. Select one.',
] as const;

const mobileQuery = '(max-width: 767px)';
const reducedQuery = '(prefers-reduced-motion: reduce)';
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Pose at a timeline unit: tilt 8..24, separation 24..48, rise 48..68. */
export function poseAt(unit: number): Pose {
  return { tilt: clamp01((unit - 8) / 16), sep: clamp01((unit - 24) / 24), rise: clamp01((unit - 48) / 20) };
}

export default function SequenceC() {
  const pinRef = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [reduced, setReduced] = useState(false);

  // The unit of the scroll position within the pinned track (0 at the track's top, 100 at its end).
  const readUnit = useCallback(() => {
    const track = pinRef.current?.parentElement;
    if (!track) return;
    const range = track.offsetHeight - window.innerHeight;
    const next = range > 0 ? ((window.scrollY - (track.getBoundingClientRect().top + window.scrollY)) / range) * 100 : 0;
    setUnit(Math.min(100, Math.max(0, next)));
  }, []);

  useEffect(() => {
    const mqs = [window.matchMedia(reducedQuery), window.matchMedia(mobileQuery)];
    const sync = () => {
      setReduced(window.matchMedia(reducedQuery).matches);
      setDisabled(mqs.some((mq) => mq.matches));
    };
    sync();
    const onScroll = () => {
      window.dispatchEvent(new Event(SCRUB_EVENT));
      readUnit();
    };
    mqs.forEach((mq) => mq.addEventListener('change', sync));
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    readUnit();
    return () => {
      mqs.forEach((mq) => mq.removeEventListener('change', sync));
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [readUnit]);

  // Reduced motion and phones: no scrub. Reduced motion shows the final keyframe (unit 84) statically.
  const effective = reduced ? 84 : disabled ? 84 : unit;
  const caption = effective >= 68 ? 3 : effective >= 48 ? 2 : effective >= 24 ? 1 : 0;
  const pose = poseAt(effective);

  return (
    <Root start="top top" end="bottom bottom" disabled>
      <div className="seq-track seq-c" data-sequence="C">
        <div className="seq-pin" ref={pinRef}>
          <div className="seq-stage theme-dark">
            <p className="seq-caption" aria-live="polite">
              {CAPTIONS[caption]}
            </p>
            <ExplodedView
              defaultSelection={null}
              holdSelection="C-05"
              pose={pose}
              hold={effective >= 68}
              split={reduced ? true : undefined}
            />
            <p className="seq-skip">
              <a href="#fit">Skip the animation</a>
            </p>
          </div>
        </div>
      </div>
    </Root>
  );
}
