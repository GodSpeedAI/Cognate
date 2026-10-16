import { FACE, ROW_Y, SLOT_PITCH, SLOT_X0, TOKEN, faceRise, layerZ, project, type Pose, type Vec2, type Vec3, type View } from './projection';

// Authority route (Beat C). The selected part's verified stores-in edge to C-10 History is drawn as an orthogonal
// trace on the board, in world space: runs along x, y or z only. It never crosses a cartridge face, a top face or an
// agent token on screen. Routes are a table keyed by the writer's part id, so the drawing stays a pure function of
// the selected part. solveRoute() is the router that produced the table; tests/route.test.ts checks every entry
// against the same obstacle set, so an edit to the geometry that breaks a route fails the build.

const FULL: Pose = { tilt: 1, sep: 1, rise: 1 };
const UNIT_VIEW: View = { s: 1, cu: 0, cv: 0 };

/** World z of the board (the cartridge bases) and of the durable record plate. */
export const Z_BOARD = layerZ('L3', FULL);
export const Z_RECORD = layerZ('L4', FULL);
/** Lift height for the trace lane: above every cartridge face (their top is Z_BOARD + FACE.h). */
export const Z_LIFT = 260;
/** The ledger row's right end, and its centre line on the record plate. The trace ends there. */
export const LEDGER_X0 = 40;
export const LEDGER_X1 = 870;
export const LEDGER_Y = 100;
/** The front lane on the record plate, in front of the ledger row. */
const LANE_Y = 40;

export type World = Vec3;
export type Route = readonly (readonly [number, number, number])[];

const screen = (p: readonly [number, number, number]): Vec2 => project({ x: p[0], y: p[1], z: p[2] }, FULL, UNIT_VIEW);
const pair = (p: readonly [number, number, number]): readonly [number, number] => {
  const q = screen(p);
  return [q.u, q.v];
};

interface Obstacle {
  id: string;
  poly: readonly (readonly [number, number])[];
}

/** Every standing face (front and top) and agent token, in unit screen coordinates. */
export function obstacles(): readonly Obstacle[] {
  const out: Obstacle[] = [];
  for (let i = 0; i < 14; i += 1) {
    const row = Math.floor(i / 5);
    const x0 = SLOT_X0 + (i % 5) * SLOT_PITCH;
    const y = ROW_Y[row];
    const h = FACE.h * faceRise(i, 1);
    const zt = Z_BOARD + h;
    const front = [[x0, y, Z_BOARD], [x0 + FACE.w, y, Z_BOARD], [x0 + FACE.w, y, zt], [x0, y, zt]] as const;
    const top = [[x0, y, zt], [x0 + FACE.w, y, zt], [x0 + FACE.w, y + FACE.depth, zt], [x0, y + FACE.depth, zt]] as const;
    out.push({ id: `C-${String(i + 1).padStart(2, '0')} face`, poly: front.map(pair) });
    out.push({ id: `C-${String(i + 1).padStart(2, '0')} top`, poly: top.map(pair) });
  }
  // Layer labels sit above each plate's front-left corner (see ExplodedView); a trace must not run through them.
  for (const [id, z] of [['L1', layerZ('L1', FULL)], ['L2', layerZ('L2', FULL)], ['L3', layerZ('L3', FULL)], ['L4', layerZ('L4', FULL)]] as const) {
    const corner = screen([0, 0, z]);
    const box = [[corner.u + 4, corner.v - 30], [corner.u + 154, corner.v - 30], [corner.u + 154, corner.v], [corner.u + 4, corner.v]] as const;
    out.push({ id: `label ${id}`, poly: box.map((q) => [q[0], q[1]] as const) });
  }
  const zTok = layerZ('L2', FULL);
  for (let k = 0; k < TOKEN.x.length; k += 1) {
    const x = TOKEN.x[k];
    const y = TOKEN.y;
    const quad = [[x, y, zTok], [x + TOKEN.w, y, zTok], [x + TOKEN.w, y, zTok + TOKEN.h], [x, y, zTok + TOKEN.h]] as const;
    out.push({ id: `token ${k}`, poly: quad.map(pair) });
  }
  return out;
}

/** Point inside a convex polygon, the polygon grown 1% about its centre so touching counts as inside. */
function inside(p: Vec2, poly: readonly (readonly [number, number])[]): boolean {
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length;
  const cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [ax, ay] = [cx + (poly[i][0] - cx) * 1.01, cy + (poly[i][1] - cy) * 1.01];
    const [bx, by] = [cx + (poly[(i + 1) % poly.length][0] - cx) * 1.01, cy + (poly[(i + 1) % poly.length][1] - cy) * 1.01];
    const cross = (bx - ax) * (p.v - ay) - (by - ay) * (p.u - ax);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

const BASE_LINES: readonly number[] = ROW_Y;

/** A cartridge base line: the trace may run along it (it touches the bottom edge of the row, it does not cross). */
const isBaseLine = (p: readonly [number, number, number]) => p[2] === Z_BOARD && BASE_LINES.includes(p[1]);

/** First obstacle the segment a to b passes through on screen, or null. Samples every 2 world units. */
export function blockedBy(a: readonly [number, number, number], b: readonly [number, number, number], obs = obstacles()): string | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / 2));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const w = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as const;
    if (isBaseLine(w)) continue;
    const p = screen(w);
    for (const o of obs) if (inside(p, o.poly)) return o.id;
  }
  return null;
}

/** The router's lattice: lanes and gutters only. Columns are the cartridge columns, gaps sit between them. */
function lattice() {
  const xs = new Set<number>([60, 126, LEDGER_X1]);
  for (let col = 0; col < 5; col += 1) {
    const x0 = SLOT_X0 + col * SLOT_PITCH;
    xs.add(x0 + FACE.w / 2).add(x0 + 138).add(x0 - 8);
  }
  const ys = new Set<number>([LANE_Y, 60, LEDGER_Y, 306]);
  for (const y of ROW_Y) ys.add(y).add(y - 20);
  return { xs: [...xs].sort((a, b) => a - b), ys: [...ys].sort((a, b) => a - b), zs: [Z_RECORD, Z_BOARD, Z_LIFT] };
}

/** Writer base: bottom centre of its front face on the board. */
export function writerBase(index: number): readonly [number, number, number] {
  const row = Math.floor(index / 5);
  return [SLOT_X0 + (index % 5) * SLOT_PITCH + FACE.w / 2, ROW_Y[row], Z_BOARD];
}

/**
 * Orthogonal router (Dijkstra over the lattice). Axis-aligned moves only; a bend costs 40, a run along a base line is
 * six times its length (so it is used only when it saves a lift), and the record plate is entered only through the
 * front lane and the ledger row's right end.
 */
export function solveRoute(start: readonly [number, number, number], obs = obstacles()): Route | null {
  const { xs, ys, zs } = lattice();
  const key = (p: readonly number[]) => p.join(',');
  const target: [number, number, number] = [LEDGER_X1, LEDGER_Y, Z_RECORD];
  const dist = new Map<string, number>([[key(start), 0]]);
  const prev = new Map<string, readonly [number, number, number]>();
  const dir = new Map<string, number>();
  const done = new Set<string>();
  const open: { p: readonly [number, number, number]; d: number }[] = [{ p: start, d: 0 }];
  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const { p: cur } = open.shift()!;
    const ck = key(cur);
    if (done.has(ck)) continue;
    done.add(ck);
    if (ck === key(target)) break;
    const moves: [number, number, number, number][] = [];
    for (const x of xs) moves.push([x, cur[1], cur[2], 0]);
    for (const y of ys) moves.push([cur[0], y, cur[2], 1]);
    for (const z of zs) moves.push([cur[0], cur[1], z, 2]);
    for (const [x, y, z, axis] of moves) {
      const nn: [number, number, number] = [x, y, z];
      const nk = key(nn);
      if (nk === ck || done.has(nk)) continue;
      if (z === Z_RECORD && y === LEDGER_Y && x !== LEDGER_X1) continue; // the row's own centreline is not a lane
      if (cur[2] === Z_RECORD && cur[1] === LEDGER_Y && cur[0] !== LEDGER_X1) continue;
      if (blockedBy(cur, nn, obs)) continue;
      const len = Math.hypot(x - cur[0], y - cur[1], z - cur[2]);
      const base = cur[2] === Z_BOARD && z === Z_BOARD && cur[1] === y && BASE_LINES.includes(y);
      const bend = dir.has(ck) && dir.get(ck) !== axis ? 40 : 0;
      const nd = (dist.get(ck) ?? 0) + len * (base ? 6 : 1) + bend;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, cur);
        dir.set(nk, axis);
        open.push({ p: nn, d: nd });
      }
    }
  }
  if (!dist.has(key(target))) return null;
  const path: [number, number, number][] = [target];
  let p: readonly [number, number, number] = target;
  while (prev.has(key(p))) {
    p = prev.get(key(p))!;
    path.unshift([p[0], p[1], p[2]]);
  }
  return path;
}

/** The route for each writer of the record (its verified stores-in edge to C-10): solveRoute() output, checked by tests/route.test.ts. */
export const AUTHORITY_ROUTES: Readonly<Record<string, Route>> = {
  'C-04': [[594, 480, 165], [666, 480, 165], [666, 480, 260], [870, 480, 260], [870, 480, 0], [870, 100, 0]],
  'C-05': [[738, 480, 165], [812, 480, 165], [812, 480, 0], [870, 480, 0], [870, 100, 0]],
  'C-06': [[162, 280, 165], [90, 280, 165], [90, 280, 260], [90, 460, 260], [870, 460, 260], [870, 460, 0], [870, 100, 0]],
  'C-07': [[306, 280, 165], [666, 280, 165], [666, 280, 0], [870, 280, 0], [870, 100, 0]],
  'C-08': [[450, 280, 165], [666, 280, 165], [666, 280, 0], [870, 280, 0], [870, 100, 0]],
  'C-09': [[594, 280, 165], [666, 280, 165], [666, 280, 0], [870, 280, 0], [870, 100, 0]],
  'C-11': [[162, 80, 165], [162, 80, 0], [870, 80, 0], [870, 100, 0]],
  'C-13': [[450, 80, 165], [450, 80, 0], [870, 80, 0], [870, 100, 0]],
};

/** A route as drawn: the world polyline projected to the stage's screen coordinates by the caller's view. */
export function routeFor(partId: string): Route | undefined {
  return AUTHORITY_ROUTES[partId];
}

/** Ledger row rectangle on the record plate, in world units: the row runs from LEDGER_X0 to LEDGER_X1 at LEDGER_Y. */
export const LEDGER_ROW = { x0: LEDGER_X0, x1: LEDGER_X1, y: LEDGER_Y, z: Z_RECORD } as const;
