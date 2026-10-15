import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { captures } from '../data/captures';
import { edges as allEdges } from '../data/parts';
import type { Edge, LayerId, Part } from '../data/types';
import { categoryOf, dependsOn, edgeWord, keyframeParts, lowerFirst, partById, titleCase, usedBy } from '../lib/graph';
import {
  FACE,
  PLATE,
  SPARE_INDEX,
  baseOf,
  faceRect,
  faceRise,
  layerZ,
  makeView,
  matrixCss,
  planeMatrix,
  project,
  slotOf,
  tokenRect,
  standZ,
  traceBetween,
  type Matrix,
  type Pose,
  type Rect,
  type Vec2,
  type View,
} from '../lib/projection';
import Inspector from './Inspector';

// One oblique projection (lib/projection.ts) places plates, standing cartridges, agent tokens and edge traces
// from (pose, stage size). Scroll drives --tilt, --sep, --rise and --hold on the pinned ancestor. This component
// reads them back on every scroll and resize, so the picture is a pure function of scroll: no CSS transitions,
// and no state set by waypoint callbacks. With no pin the vars are unset: the full exploded state is drawn.
const capture = captures[0];
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const SCRUB_EVENT = 'exploded:measure';
export const SELECT_EVENT = 'exploded:select';

/**
 * Re-read the scroll-driven variables after GSAP's ticks have written them: two frames, then a little later in case
 * the timeline lags a scrub. The drawn state is always the state of the current scroll position.
 */
export function settle(read: () => void): void {
  requestAnimationFrame(() => {
    read();
    requestAnimationFrame(read);
  });
  for (const delay of [60, 150, 300, 600, 1000, 1500]) window.setTimeout(read, delay);
}

interface Props {
  parts?: readonly Part[];
  /** Selection when nothing has been picked and the inspector is not held open. */
  defaultSelection?: string | null;
  /** Part selected while the hold is active (derived from scroll), until the reader picks another. */
  holdSelection?: string | null;
  /** Force the inspector column on or off. Default: derived from the scroll hold. */
  split?: boolean;
  /** Pose computed by the sequence from the scroll position. When given, the CSS variables are not read. */
  pose?: Pose;
  /** Hold computed by the sequence from the scroll position (desktop inspector column). */
  hold?: boolean;
  /** Sequence G: how many extension stamps are done (0 = sockets empty, 1..5). Branch parts show when > 0. */
  extension?: number;
}

const DESKTOP_QUERY = '(min-width: 768px)';
const AGENTS = ['Config agent', 'Coding agent', 'Cognitive agent'] as const;
const LAYER_ORDER: readonly LayerId[] = ['L4', 'L3', 'L2', 'L1'];
const LAYER_TITLE: Record<LayerId, string> = {
  L1: 'L1 Interface',
  L2: 'L2 Agents',
  L3: 'L3 Capabilities',
  L4: 'L4 Durable record',
};
const Z_INDEX: Record<LayerId, number> = { L4: 1, L3: 2, L2: 5, L1: 6 };
const FACE_Z = 4;

const titleFor = (p: Part) => `${p.id} ${titleCase(p.label)} — ${lowerFirst(p.job)}`;

interface PlateScene {
  id: LayerId;
  matrix: Matrix;
  z: number;
}

interface FaceScene {
  part: Part;
  index: number;
  rect: Rect;
  top: Matrix | null;
  state: 'selected' | 'linked' | 'dim' | 'idle';
}

interface TokenScene {
  name: string;
  rect: Rect;
}

interface Scene {
  view: View;
  plates: PlateScene[];
  layerLabels: { id: LayerId; text: string; left: number; top: number }[];
  mating: { key: string; x1: number; y1: number; x2: number; y2: number }[];
  faces: FaceScene[];
  tokens: TokenScene[];
  edges: { key: string; points: string; consumer: boolean }[];
  sockets: (Rect & { opacity: number })[];
}

/** Screen rectangle of a vertical face in the x-z plane (no shear). */
/** Pure: the whole drawing for one pose, stage size, part set and selection. */
function buildScene(pose: Pose, size: { w: number; h: number }, parts: readonly Part[], selectedId: string | null, extension: number): Scene {
  const view = makeView(size.w, size.h);
  const at = (x: number, y: number, z: number): Vec2 => project({ x, y, z }, pose, view);

  const plates: PlateScene[] = LAYER_ORDER.map((id) => {
    const dims = PLATE[id];
    const z = layerZ(id, pose);
    // Element local (0, 0) is the back-left corner; local y grows toward the front.
    return {
      id,
      z,
      matrix: planeMatrix(at(0, dims.h, z), at(dims.w, dims.h, z), at(0, 0, z), dims.w, dims.h),
    };
  });

  const layerLabels = (['L1', 'L2', 'L3', 'L4'] as LayerId[]).map((id) => {
    const corner = at(0, 0, layerZ(id, pose));
    // Sits just above the plate's front edge, on empty paper; a face never sits in that strip.
    return { id, text: LAYER_TITLE[id], left: corner.u + 4, top: corner.v - 16 };
  });

  const mating: Scene['mating'] = [];
  if (pose.sep > 0.05) {
    const pairs: [LayerId, LayerId][] = [
      ['L1', 'L2'],
      ['L2', 'L3'],
      ['L3', 'L4'],
    ];
    for (const [upper, lower] of pairs) {
      const zu = layerZ(upper, pose);
      const zl = layerZ(lower, pose);
      const l1 = at(0, 0, zu);
      const l2 = at(0, 0, zl);
      const r1 = at(PLATE.L1.w, 0, zu);
      const r2 = at(PLATE.L1.w, 0, zl);
      mating.push(
        { key: `mate-l-${upper}`, x1: l1.u, y1: l1.v, x2: l2.u, y2: l2.v },
        { key: `mate-r-${upper}`, x1: r1.u, y1: r1.v, x2: r2.u, y2: r2.v },
      );
    }
  }

  const shown = parts.filter((p) => !p.branchOnly || extension > 0);
  const shownIds = new Set(shown.map((p) => p.id));
  const shownEdges: Edge[] = allEdges.filter((e) => shownIds.has(e.from) && shownIds.has(e.to));
  const isBranch = (id: string) => partById(id)?.branchOnly === true;
  // Verified extension edges stay drawn once the part is bound (stamp 3 and later); otherwise only the selection's.
  const drawn = shownEdges.filter(
    (e) => (selectedId && (e.from === selectedId || e.to === selectedId)) || (extension >= 3 && (isBranch(e.from) || isBranch(e.to))),
  );
  const selectedEdges = drawn;
  const linked = new Set(selectedEdges.flatMap((e) => [e.from, e.to]));
  const slotById = new Map(shown.map((p) => [p.id, slotOf(Number(p.id.slice(2)) - 1)] as const));

  const faces: FaceScene[] = shown.map((part) => {
    const slot = slotById.get(part.id) ?? slotOf(0);
    const rect = faceRect(slot, pose, view);
    const zTop = standZ('L3', pose) + FACE.h * faceRise(slot.index, pose.rise);
    const top =
      rect.h > 0.5
        ? planeMatrix(
            at(slot.x0, slot.yFront + FACE.depth, zTop),
            at(slot.x0 + FACE.w, slot.yFront + FACE.depth, zTop),
            at(slot.x0, slot.yFront, zTop),
            FACE.w,
            FACE.depth,
          )
        : null;
    const state: FaceScene['state'] = !selectedId
      ? 'idle'
      : part.id === selectedId
        ? 'selected'
        : linked.has(part.id)
          ? 'linked'
          : 'dim';
    return { part, index: slot.index, rect, top, state };
  });

  // Empty sockets for the extension slots (Sequence C shows them; Sequence G fills them).
  // Index 14 is the spare socket: always empty, decorative, never labelled.
  const sockets: Rect[] = [12, 13, SPARE_INDEX]
    .filter((i) => !shown.some((p) => Number(p.id.slice(2)) - 1 === i))
    .map((i) => faceRect(slotOf(i), { tilt: pose.tilt, sep: pose.sep, rise: 1 }, view));

  const tokens: TokenScene[] = AGENTS.map((name, i) => ({
    name,
    rect: tokenRect(i, pose, view),
  }));

  const edges: Scene['edges'] = [];
  for (const e of selectedEdges) {
    const a = slotById.get(e.from);
    const b = slotById.get(e.to);
    if (!a || !b) continue;
    const route = traceBetween(baseOf(a, pose), baseOf(b, pose));
    edges.push({
      key: `${e.from}>${e.to}:${e.kind}`,
      points: route.map((p) => {
        const q = at(p.x, p.y, p.z);
        return `${q.u.toFixed(1)},${q.v.toFixed(1)}`;
      }).join(' '),
      consumer: e.to === selectedId,
    });
  }

  return { view, plates, layerLabels, mating, faces, tokens, edges, sockets: sockets.map((r) => ({ ...r, opacity: pose.rise })) };
}

export default function ExplodedView({ parts = keyframeParts, defaultSelection = null, holdSelection = null, split: splitProp, extension = 0, pose: poseProp, hold: holdProp }: Props) {
  const [pose, setPose] = useState<Pose>({ tilt: 1, sep: 1, rise: 1 });
  const [hold, setHold] = useState(0);
  const [size, setSize] = useState({ w: 720, h: 640 });
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [desktop, setDesktop] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLElement>());

  const activeHold = holdProp ?? hold >= 0.5;
  const activePose = poseProp ?? pose;
  const split = splitProp ?? activeHold;
  // Automatic selection is for desktop and tablet only; on phones the inspector sheet starts closed.
  const autoSelection = desktop ? (split ? holdSelection ?? defaultSelection : defaultSelection) : null;
  const selectedId = picked !== undefined ? picked : autoSelection;
  const selected = selectedId ? partById(selectedId) : undefined;
  const shownParts = useMemo(() => parts.filter((p) => !p.branchOnly || extension > 0), [parts, extension]);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const cs = getComputedStyle(frame);
    const read = (name: string, fallback: number) => {
      const n = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
    };
    const next: Pose = { tilt: read('--tilt', 1), sep: read('--sep', 1), rise: read('--rise', 1) };
    setPose((prev) => (prev.tilt === next.tilt && prev.sep === next.sep && prev.rise === next.rise ? prev : next));
    setHold((prev) => {
      const h = read('--hold', 0);
      return prev === h ? prev : h;
    });
    const r = frame.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(frame);
    const onSelect = (event: Event) => setPicked((event as CustomEvent<string | null>).detail ?? null);
    const onScrub = () => settle(measure);
    window.addEventListener(SCRUB_EVENT, onScrub);
    window.addEventListener('scroll', onScrub, { passive: true });
    window.addEventListener(SELECT_EVENT, onSelect);
    return () => {
      observer.disconnect();
      window.removeEventListener(SCRUB_EVENT, onScrub);
      window.removeEventListener('scroll', onScrub);
      window.removeEventListener(SELECT_EVENT, onSelect);
    };
  }, [measure]);

  const scene = useMemo(() => buildScene(activePose, size, parts, selectedId, extension), [activePose, size, parts, selectedId, extension]);

  const move = (event: KeyboardEvent<HTMLElement>) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-part-id]')?.dataset.partId;
    const index = shownParts.findIndex((p) => p.id === id);
    if (index < 0) return;
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = shownParts[(index + step + shownParts.length) % shownParts.length];
    setPicked(next.id);
    buttonRefs.current.get(next.id)?.focus();
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && selectedId) setPicked(null);
  };

  const stateOf = (id: string) => (id === selectedId ? 'selected' : scene.faces.find((f) => f.part.id === id)?.state ?? 'idle');

  return (
    <div className="exploded-island" onKeyDown={closeOnEscape} data-split={split ? 'true' : 'false'}>
      <figure className="exploded" aria-labelledby="exploded-title">
        <h2 id="exploded-title" className="visually-hidden">
          Cognate's parts, drawn apart
        </h2>

        {/* Desktop and tablet: one oblique projection for plates, standing cartridges, tokens and edge traces. */}
        <div className="frame">
          <div className="stage-wrap" ref={frameRef} onKeyDown={move}>
            {scene.plates.map((pl) => (
              <div
                key={pl.id}
                className={`plate plate-${pl.id.toLowerCase()}`}
                data-plate={pl.id}
                style={{ width: PLATE[pl.id].w, height: PLATE[pl.id].h, transform: matrixCss(pl.matrix), zIndex: Z_INDEX[pl.id] }}
              >
                {pl.id === 'L1' && <img src={`/${capture.file}`} width={PLATE.L1.w} height={PLATE.L1.h} alt={capture.alt} decoding="async" />}
                {pl.id === 'L4' && (
                  <>
                    {[40, 80, 120, 160, 190].map((y) => (
                      <span key={y} className="ledger-rule" style={{ top: PLATE.L4.h - y }} />
                    ))}
                    <span className="ledger-text" style={{ top: PLATE.L4.h - 175 }}>
                      Event log · PostgreSQL
                    </span>
                  </>
                )}
              </div>
            ))}

            <svg className="overlay" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true" focusable="false">
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--signal)' }} />
                </marker>
              </defs>
              {scene.mating.map((s) => (
                <line key={s.key} className="mating" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
              ))}
              {scene.edges.map((e) => (
                <polyline
                  key={e.key}
                  className={e.consumer ? 'edge edge-consumer' : 'edge edge-provider'}
                  points={e.points}
                  markerEnd="url(#arrow)"
                />
              ))}
            </svg>

            {scene.faces.map((f) => (
              <span
                key={`top-${f.part.id}`}
                className="face-top"
                style={{ transform: f.top ? matrixCss(f.top) : undefined, width: FACE.w, height: FACE.depth, opacity: f.top ? 1 : 0, zIndex: FACE_Z }}
              />
            ))}

            {scene.faces.map((f) => {
              const p = f.part;
              return (
                <button
                  key={p.id}
                  ref={(el) => {
                    if (el) buttonRefs.current.set(p.id, el);
                    else buttonRefs.current.delete(p.id);
                  }}
                  type="button"
                  className={`face ${p.branchOnly ? (extension >= 2 ? 'face-branch-solid' : 'face-branch-dashed') : ''}`}
                  data-part-id={p.id}
                  data-cat={categoryOf(p.id)}
                  data-state={f.state}
                  aria-pressed={p.id === selectedId}
                  aria-label={titleFor(p)}
                  onClick={() => setPicked(p.id)}
                  style={{ left: f.rect.x, top: f.rect.y, width: f.rect.w, height: f.rect.h, zIndex: FACE_Z }}
                >
                  <span className="face-num mono">{p.id}</span>{' '}
                  <span className="face-name">{titleCase(p.label)}</span>
                </button>
              );
            })}

            {scene.sockets.map((r) => (
              <span key={`socket-${r.x}-${r.y}`} className="socket" aria-hidden="true" style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: r.opacity, zIndex: FACE_Z }} />
            ))}

            {scene.tokens.map((t) => (
              <span
                key={t.name}
                className="token"
                style={{ left: t.rect.x, top: t.rect.y, width: t.rect.w, height: t.rect.h, zIndex: 3 }}
              >
                {t.name}
              </span>
            ))}

            {scene.layerLabels.map((l) => (
              <span key={l.id} className="layer-tag" data-layer={l.id} style={{ left: l.left, top: l.top }}>
                {l.text}
              </span>
            ))}
          </div>
        </div>

        {/* Mobile: the same parts redrawn as a 2D parts-list drawing (R7). */}
        <div className="mobile-plates" role="group" aria-label="Parts, layer by layer" onKeyDown={move}>
          <div className="m-plate m-plate-l1">
            <img src={`/${capture.file}`} width={capture.width} height={capture.height} alt="" loading="lazy" decoding="async" />
          </div>
          <div className="m-plate m-plate-l2">
            <p className="m-layer">L2 Agents</p>
            <div className="agents-row">
              {AGENTS.map((name) => (
                <span key={name} className="agent-chip">
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="m-plate m-plate-l3">
            <p className="m-layer">L3 Capabilities</p>
            <div className="m-grid">
              {shownParts.map((p) => {
                const deps = dependsOn(p.id);
                const users = usedBy(p.id);
                const isSel = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="m-cart"
                    data-part-id={p.id}
                    data-cat={categoryOf(p.id)}
                    data-state={stateOf(p.id)}
                    aria-pressed={isSel}
                    aria-label={titleFor(p)}
                    onClick={() => setPicked(p.id)}
                    ref={(el) => {
                      if (el) buttonRefs.current.set(p.id, el);
                    }}
                  >
                    <span className="mono tag-num">{p.id}</span>{' '}
                    <span className="tag-label">{titleCase(p.label)}</span>
                    {isSel && (deps.length > 0 || users.length > 0) && (
                      <span className="chips">
                        {deps.map((e, i) => (
                          <span key={`needs-${e.to}-${e.kind}-${i}`} className="chip">
                            needs {e.to} ({edgeWord(e.kind)})
                          </span>
                        ))}
                        {users.map((e, i) => (
                          <span key={`used-${e.from}-${e.kind}-${i}`} className="chip">
                            used by {e.from}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="m-plate m-plate-l4">
            <p className="m-layer">L4 Durable record</p>
            <p className="m-ledger">Event log · PostgreSQL</p>
          </div>
        </div>

        <figcaption>
          <p>Illustration of how the app is organized. It is not a memory map or a deployment diagram.</p>
          <p className="capture-caption">{capture.caption}</p>
        </figcaption>
      </figure>

      <Inspector part={selected} onClose={() => setPicked(null)} />
    </div>
  );
}
