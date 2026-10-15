import { useCallback, useEffect, useRef, useState } from 'react';
import { Root } from '@bsmnt/scrollytelling';
import { captures } from '../data/captures';
import { keyframeParts, partById } from '../lib/graph';
import type { Pose } from '../lib/projection';
import ExplodedView, { SCRUB_EVENT } from './ExplodedView';

// Sequence G ("It can grow"), from scroll-choreography.md. Everything is a pure function of the scroll unit:
// stamps at 15, 35, 45, 55 and 65; reassembly 65..92; the branch capture from 92.
const STAMPS = [
  { label: 'Modelled', at: 15 },
  { label: 'Built', at: 35 },
  { label: 'Bound', at: 45 },
  { label: 'Tested', at: 55 },
  { label: 'Accepted by a person', at: 65 },
] as const;
const branchCapture = captures.find((c) => c.file.includes('default-team-desktop'));
// The twelve keyframe parts plus the two extension parts that fill the sockets in column seven.
const gParts = [...keyframeParts, ...['C-13', 'C-14'].flatMap((id) => partById(id) ?? [])];
const mobileQuery = '(max-width: 767px)';
const reducedQuery = '(prefers-reduced-motion: reduce)';
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export default function SequenceG() {
  const pinRef = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(0);
  const [disabled, setDisabled] = useState(false);

  const readUnit = useCallback(() => {
    const track = pinRef.current?.parentElement;
    if (!track) return;
    const range = track.offsetHeight - window.innerHeight;
    const next = range > 0 ? ((window.scrollY - (track.getBoundingClientRect().top + window.scrollY)) / range) * 100 : 0;
    setUnit(Math.min(100, Math.max(0, next)));
  }, []);

  useEffect(() => {
    const mqs = [window.matchMedia(reducedQuery), window.matchMedia(mobileQuery)];
    const sync = () => setDisabled(mqs.some((mq) => mq.matches));
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

  // Without motion the final state is drawn statically: all stamps done, board assembled, no branch capture.
  const effective = disabled ? 65 : unit;
  const done = STAMPS.map((s) => effective >= s.at);
  const extension = done.filter(Boolean).length;
  const showBranch = !disabled && effective >= 92;
  const reassembly = clamp01((effective - 65) / 27);
  const pose: Pose = { tilt: 1 - reassembly, sep: 1 - reassembly, rise: 1 };

  return (
    <Root start="top top" end="bottom bottom" disabled>
      <div className="seq-track seq-g" data-sequence="G">
        <div className="seq-pin" ref={pinRef}>
          <div className="seq-stage">
            {showBranch && branchCapture ? (
              <figure className="branch-capture">
                <img src={`/${branchCapture.file}`} width={branchCapture.width} height={branchCapture.height} alt={branchCapture.alt} decoding="async" />
                <figcaption>{branchCapture.caption}</figcaption>
              </figure>
            ) : (
              <ExplodedView parts={gParts} defaultSelection={null} extension={extension} pose={pose} hold={false} />
            )}
            <ol className="stamps" aria-label="Extension status">
              {STAMPS.map((s, i) => (
                <li key={s.label} data-done={done[i] ? 'true' : 'false'}>
                  {s.label}
                  {done[i] ? ' ✓' : ''}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Root>
  );
}
