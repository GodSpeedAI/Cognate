import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { captures } from '../data/captures';
import { edges as allEdges } from '../data/parts';
import type { Edge, Part } from '../data/types';
import { categoryOf, dependsOn, edgeWord, keyframeParts, lowerFirst, partById, titleCase, usedBy } from '../lib/graph';
import Inspector from './Inspector';

// Rule R4 (stable designations), R7 (mobile redraws), R5 (mechanical motion). Phase 2 billboards the labels.
const capture = captures[0];
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const SCRUB_EVENT = 'exploded:measure';
export const SELECT_EVENT = 'exploded:select';

interface Props {
  parts?: readonly Part[];
  defaultSelection?: string | null;
  /** Sequence G: 0 = no slot, 1 = modelled (dashed), 2 = built, 3 = bound, 4 = tested, 5 = accepted by a person. */
  extensionStage?: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Segment {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cls: string;
  dot?: true;
}
interface Tag {
  id: string;
  x: number;
  y: number;
}
interface Plate {
  id: string;
  x: number;
  y: number;
}

const boxOf = (frame: DOMRect, el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left - frame.left, top: r.top - frame.top, right: r.right - frame.left, bottom: r.bottom - frame.top };
};
const centreOf = (b: Box) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });

/** Point on the box edge where the ray from its centre toward `target` leaves. */
function clipToBox(b: Box, target: { x: number; y: number }): { x: number; y: number } {
  const c = centreOf(b);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const tx = dx === 0 ? Infinity : (b.right - b.left) / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (b.bottom - b.top) / 2 / Math.abs(dy);
  const t = Math.min(tx, ty, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

const titleFor = (p: Part) => `${p.id} ${titleCase(p.label)}: ${lowerFirst(p.job)}`;

export default function ExplodedView({ parts = keyframeParts, defaultSelection = null, extensionStage = 0 }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelection);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [plates, setPlates] = useState<Plate[]>([]);
  const frameRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const ids = new Set(parts.map((p) => p.id));
  const selected = selectedId ? partById(selectedId) : undefined;
  const shownEdges: Edge[] = allEdges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const selectedEdges = selectedId ? shownEdges.filter((e) => e.from === selectedId || e.to === selectedId) : [];
  const linked = new Set(selectedEdges.flatMap((e) => [e.from, e.to]));

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fr = frame.getBoundingClientRect();
    if (fr.width === 0) return; // mobile: the 3D stage is hidden
    const cartridgeBox = (id: string) => {
      const el = frame.querySelector<HTMLElement>(`[data-cart="${id}"]`);
      return el ? boxOf(fr, el) : undefined;
    };
    const plateBoxes = ['L1', 'L2', 'L3', 'L4'].map((id) => {
      const el = frame.querySelector<HTMLElement>(`[data-plate="${id}"]`);
      return { id, box: el ? boxOf(fr, el) : undefined };
    });
    const nextPlates: Plate[] = plateBoxes.flatMap((p) => (p.box ? [{ id: p.id, x: p.box.right + 12, y: p.box.top + 8 }] : []));

    const nextTags: Tag[] = [];
    const nextSegments: Segment[] = [];
    for (const part of parts) {
      const b = cartridgeBox(part.id);
      if (!b) continue;
      const c = centreOf(b);
      // Billboard: the label sits upright above the projected centre, with a short leader.
      const labelBottom = b.top - 6;
      nextTags.push({ id: part.id, x: c.x, y: labelBottom });
      nextSegments.push({ key: `leader-${part.id}`, x1: c.x, y1: b.top, x2: c.x, y2: labelBottom, cls: part.id === selectedId ? 'leader leader-active' : 'leader', dot: true });
    }

    // Dashed mating lines between plate corners (bounding-box corners of the projected plates).
    for (let i = 0; i < plateBoxes.length - 1; i += 1) {
      const upper = plateBoxes[i].box;
      const lower = plateBoxes[i + 1].box;
      if (!upper || !lower) continue;
      nextSegments.push({ key: `mate-l-${i}`, x1: upper.left, y1: upper.bottom, x2: lower.left, y2: lower.top, cls: 'mating' });
      nextSegments.push({ key: `mate-r-${i}`, x1: upper.right, y1: upper.bottom, x2: lower.right, y2: lower.top, cls: 'mating' });
    }

    for (const e of selectedEdges) {
      const a = cartridgeBox(e.from);
      const b = cartridgeBox(e.to);
      if (!a || !b) continue;
      const start = clipToBox(a, centreOf(b));
      const end = clipToBox(b, centreOf(a));
      nextSegments.push({ key: `${e.from}>${e.to}`, x1: start.x, y1: start.y, x2: end.x, y2: end.y, cls: e.from === selectedId ? 'edge edge-provider' : 'edge edge-consumer' });
    }

    setTags(nextTags);
    setPlates(nextPlates);
    setSegments(nextSegments);
  }, [parts, selectedId, selectedEdges.length]);

  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(frame);
    const onScrub = () => measure();
    const onSelect = (event: Event) => setSelectedId((event as CustomEvent<string>).detail);
    window.addEventListener(SCRUB_EVENT, onScrub);
    window.addEventListener(SELECT_EVENT, onSelect);
    return () => {
      observer.disconnect();
      window.removeEventListener(SCRUB_EVENT, onScrub);
      window.removeEventListener(SELECT_EVENT, onSelect);
    };
  }, [measure]);

  const move = (event: KeyboardEvent<HTMLElement>) => {
    const id = (event.target as HTMLElement).dataset.part;
    const index = parts.findIndex((p) => p.id === id);
    if (index < 0) return;
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = parts[(index + step + parts.length) % parts.length];
    setSelectedId(next.id);
    buttonRefs.current.get(next.id)?.focus();
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && selectedId) setSelectedId(null);
  };

  const stateOf = (id: string) => (id === selectedId ? 'selected' : linked.has(id) ? 'linked' : 'dim');
  const tagFor = new Map(tags.map((t) => [t.id, t]));
  const extState = (id: string) => (id === 'C-13' ? `ext-${extensionStage}` : undefined);

  return (
    <div className="exploded-island" onKeyDown={closeOnEscape} data-ext={extensionStage}>
      <figure className="exploded" aria-labelledby="exploded-title">
        <h3 id="exploded-title" className="visually-hidden">
          Cognate's parts, drawn apart
        </h3>

        {/* Desktop and tablet: the 3D stage with billboarded labels. */}
        <div className="frame" ref={frameRef} data-measured={tags.length > 0 ? 'true' : 'false'}>
          <div className="stage-wrap">
            <div className="stage">
              <div className="assembly">
                <div className="plate plate-l1" data-plate="L1">
                  <img src={`/${capture.file}`} width={capture.width} height={capture.height} alt={capture.alt} decoding="async" />
                </div>
                <div className="plate plate-l2" data-plate="L2">
                  <div className="agents" aria-hidden="true">
                    <span className="agent-token" />
                    <span className="agent-token" />
                    <span className="agent-token" />
                  </div>
                </div>
                <div className="plate plate-l3" data-plate="L3">
                  {parts.map((p) => (
                    <span
                      key={p.id}
                      data-cart={p.id}
                      data-cat={categoryOf(p.id)}
                      data-state={stateOf(p.id)}
                      className={`cartridge ${p.branchOnly ? 'cartridge-branch' : ''} ${extState(p.id) ?? ''}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="plate plate-l4" data-plate="L4">
                  <span className="ledger-rule" />
                  <span className="ledger-rule" />
                  <span className="ledger-rule" />
                  <span className="ledger-rule" />
                </div>
              </div>
            </div>
            {/* Billboard layer for labels (2D, faces the reader). */}
            <div className="billboards" onKeyDown={move}>
              {plates.map((pl) => (
                <span key={pl.id} className="layer-tag" style={{ left: pl.x, top: pl.y }} data-layer={pl.id}>
                  {layerName(pl.id).split('|').map((line) => (
                    <span key={line} className="layer-line">
                      {line}
                    </span>
                  ))}
                </span>
              ))}
              {parts.map((p) => {
                const t = tagFor.get(p.id);
                if (!t) return null;
                return (
                  <button
                    key={p.id}
                    ref={(el) => {
                      if (el) buttonRefs.current.set(p.id, el);
                      else buttonRefs.current.delete(p.id);
                    }}
                    type="button"
                    className="tag"
                    data-part={p.id}
                    data-state={stateOf(p.id)}
                    aria-pressed={p.id === selectedId}
                    aria-label={titleFor(p)}
                    style={{ left: t.x, top: t.y }}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="mono tag-num">{p.id}</span>
                    <span className="tag-label">{titleCase(p.label)}</span>
                  </button>
                );
              })}
            </div>
            <svg className="overlay" aria-hidden="true" focusable="false">
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--signal)' }} />
                </marker>
              </defs>
              {segments.map((s) => (
                <g key={s.key} className={s.cls}>
                  <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} markerEnd={s.cls.startsWith('edge-provider') ? 'url(#arrow)' : undefined} />
                  {s.dot && <circle cx={s.x2} cy={s.y2} r={2.5} />}
                </g>
              ))}
            </svg>
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
              <span className="agent-chip">Config agent</span>
              <span className="agent-chip">Coding agent</span>
              <span className="agent-chip">Cognitive agent</span>
            </div>
          </div>
          <div className="m-plate m-plate-l3">
            <p className="m-layer">L3 Capabilities</p>
            <div className="m-grid">
              {parts.map((p) => {
                const deps = dependsOn(p.id);
                const users = usedBy(p.id);
                const isSel = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="m-cart"
                    data-part={p.id}
                    data-cat={categoryOf(p.id)}
                    data-state={stateOf(p.id)}
                    aria-pressed={isSel}
                    aria-label={titleFor(p)}
                    onClick={() => setSelectedId(p.id)}
                    ref={(el) => {
                      if (el) buttonRefs.current.set(p.id, el);
                    }}
                  >
                    <span className="mono tag-num">{p.id}</span>
                    <span className="tag-label">{titleCase(p.label)}</span>
                    {isSel && (deps.length > 0 || users.length > 0) && (
                      <span className="chips">
                        {deps.map((e) => (
                          <span key={`n-${e.to}`} className="chip">
                            needs {e.to} ({edgeWord(e.kind)})
                          </span>
                        ))}
                        {users.map((e) => (
                          <span key={`u-${e.from}`} className="chip">
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

      <Inspector part={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function layerName(id: string): string {
  if (id === 'L1') return 'L1 Interface';
  if (id === 'L2') return 'L2 Agents';
  if (id === 'L3') return 'L3 Capabilities';
  return 'L4 Durable record|Event log · PostgreSQL';
}
