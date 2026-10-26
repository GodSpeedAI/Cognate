import type { LayerId } from '../data/types';

// Oblique "shelf" projection. World: x across, y into depth (toward the back), z up.
//   u = s * (x + SH * y) + cu
//   v = cv - s * (K * y + z)
// Flat (tilt 0): SH = 0, K = 1, a plate is seen straight on. Exploded (tilt 1): SH = 0.32, K = 0.42, the plates
// read as shelves. Text is never sheared: cartridge faces lie in the x-z plane, so they project as plain rectangles.
// The scale and origin come from the exploded (t = 1) extents only, so the drawing never rescales mid-sequence.

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Vec2 {
  readonly u: number;
  readonly v: number;
}

/** Scroll-derived pose, each 0..1: tilt (SH and K), sep (layer separation), rise (cartridge face height). */
export interface Pose {
  readonly tilt: number;
  readonly sep: number;
  readonly rise: number;
}

/** Stage-pixel view. Fixed for a stage size. */
export interface View {
  readonly s: number;
  readonly cu: number;
  readonly cv: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** CSS matrix(a, b, c, d, e, f). */
export type Matrix = readonly [number, number, number, number, number, number];

export const SH_EXPLODED = 0.32;
export const K_EXPLODED = 0.42;
/** World z between plate tops at full separation. */
export const SEP_WORLD = 165;
/** Extra world z between L3 and L2, so the agent tokens clear the back row of cartridges. */
export const LAYER_GAP = 80;
/** Stage px reserved at the left for the layer labels. */
export const FIT_PAD = 24;

export const PLATE = {
  L1: { w: 900, h: 562 },
  L2: { w: 900, h: 200 },
  L3: { w: 900, h: 530 },
  L4: { w: 900, h: 200 },
} as const;

/** Plate tops in units of SEP_WORLD: L1 is highest, L4 sits on the floor. */
export const LAYER_UNITS: Record<LayerId, number> = { L1: 3, L2: 2, L3: 1, L4: 0 };

/** Standing cartridge: front face in the x-z plane, a top face of this depth. */
export const FACE = { w: 128, h: 72, depth: 26 } as const;
/**
 * Board: three rows of five. Row 1 (back) C-01..C-05, row 2 C-06..C-10, row 3 (front) C-11, C-12, the C-13 and C-14
 * extension sockets, and one spare empty socket at the far right. Columns pitch 144 world.
 */
export const COLS = 5;
export const SLOT_X0 = (PLATE.L3.w - (4 * 144 + 128)) / 2;
export const SLOT_PITCH = 144;
/** Front-face y (world) of each row, back to front. 0.42 * 200 = 84 >= the 72 face height, so rows never overlap. */
export const ROW_Y = [480, 280, 80] as const;
export const SPARE_INDEX = 14;
export const EDGE_DROP = 10;

/** Agent tokens stand near the far edge of L2, so they sit above the back row of cartridges. */
export const TOKEN = { w: 240, h: 48, y: 140, x: [45, 330, 615] as const } as const;

export function shelfAt(pose: Pose): { sh: number; k: number } {
  return { sh: SH_EXPLODED * pose.tilt, k: 1 - (1 - K_EXPLODED) * pose.tilt };
}

export function layerZ(layer: LayerId, pose: Pose): number {
  const gap = layer === 'L1' || layer === 'L2' ? LAYER_GAP : 0;
  return (LAYER_UNITS[layer] * SEP_WORLD + gap) * pose.sep;
}

/** Cartridges and agent tokens stand on L3 and L2. */
export function standZ(layer: LayerId, pose: Pose): number {
  return layerZ(layer, pose);
}

export function project(p: Vec3, pose: Pose, view: View): Vec2 {
  const { sh, k } = shelfAt(pose);
  return { u: view.cu + view.s * (p.x + sh * p.y), v: view.cv - view.s * (k * p.y + p.z) };
}

/** Fixed view for a stage size: the exploded (t = 1, sep = 1) bounds fit the stage. */
export function makeView(stageW: number, stageH: number): View {
  const uSpan = PLATE.L1.w + SH_EXPLODED * PLATE.L1.h;
  const vSpan = K_EXPLODED * PLATE.L1.h + LAYER_UNITS.L1 * SEP_WORLD + LAYER_GAP;
  const s = Math.max(0.05, Math.min((stageW - 2 * FIT_PAD) / uSpan, (stageH - 2 * FIT_PAD) / vSpan));
  return { s, cu: FIT_PAD, cv: stageH / 2 + (vSpan * s) / 2 };
}

/** Standing face height for a cartridge at this rise, staggered in census order. */
export function faceRise(index: number, rise: number): number {
  return Math.min(1, Math.max(0, rise * 1.44 - index * 0.04));
}

export interface SlotPlacement {
  readonly index: number;
  readonly x0: number;
  readonly yFront: number;
  readonly row: 'back' | 'mid' | 'front';
}

/** Census order C-01..C-12 across the two rows. */
export function slotOf(index: number): SlotPlacement {
  const row = Math.min(2, Math.floor(index / COLS));
  const col = index % COLS;
  return { index, x0: SLOT_X0 + col * SLOT_PITCH, yFront: ROW_Y[row], row: (['back', 'mid', 'front'] as const)[row] };
}

/** Front face corners at a given height: plain rectangle in stage px (no shear). */
export function faceRect(slot: SlotPlacement, pose: Pose, view: View): Rect {
  const h = FACE.h * faceRise(slot.index, pose.rise);
  const zBase = standZ('L3', pose);
  const topLeft = project({ x: slot.x0, y: slot.yFront, z: zBase + h }, pose, view);
  const bottomLeft = project({ x: slot.x0, y: slot.yFront, z: zBase }, pose, view);
  const right = project({ x: slot.x0 + FACE.w, y: slot.yFront, z: zBase }, pose, view);
  return { x: topLeft.u, y: topLeft.v, w: right.u - bottomLeft.u, h: bottomLeft.v - topLeft.v };
}

/** Screen rectangle of an agent token: a standing face on L2 (x-z plane), no shear. */
export function tokenRect(index: number, pose: Pose, view: View): Rect {
  const zBase = standZ('L2', pose);
  const x0 = TOKEN.x[index];
  const yFront = TOKEN.y;
  const tl = project({ x: x0, y: yFront, z: zBase + TOKEN.h }, pose, view);
  const br = project({ x: x0 + TOKEN.w, y: yFront, z: zBase }, pose, view);
  return { x: tl.u, y: tl.v, w: br.u - tl.u, h: br.v - tl.v };
}

/** World rectangle of a face, for the non-intersection test. */
export function faceWorld(slot: SlotPlacement, pose: Pose): { x0: number; x1: number; z0: number; z1: number; y: number } {
  const zBase = standZ('L3', pose);
  return { x0: slot.x0, x1: slot.x0 + FACE.w, z0: zBase, z1: zBase + FACE.h, y: slot.yFront };
}

/** Base point of a cartridge (bottom centre of its front face) on the L3 board. */
export function baseOf(slot: SlotPlacement, pose: Pose): Vec3 {
  return { x: slot.x0 + FACE.w / 2, y: slot.yFront, z: standZ('L3', pose) };
}

/**
 * Orthogonal trace between two bases: drop toward the viewer, run across, rise to the other base.
 * Runs on the board surface, so it never crosses a face in front of its own start.
 */
export function traceBetween(a: Vec3, b: Vec3): readonly Vec3[] {
  const drop = a.y - EDGE_DROP;
  return [a, { x: a.x, y: drop, z: a.z }, { x: b.x, y: drop, z: a.z }, b];
}

/**
 * Single 2D affine for a rectangle of size w x h whose top-left, top-right and bottom-left corners project to
 * origin, xAxisEnd and yAxisEnd. Apply with transform-origin 0 0 on an element of size w x h.
 */
export function planeMatrix(origin: Vec2, xAxisEnd: Vec2, yAxisEnd: Vec2, w: number, h: number): Matrix {
  return [
    (xAxisEnd.u - origin.u) / w,
    (xAxisEnd.v - origin.v) / w,
    (yAxisEnd.u - origin.u) / h,
    (yAxisEnd.v - origin.v) / h,
    origin.u,
    origin.v,
  ];
}

export function matrixCss(m: Matrix): string {
  return `matrix(${m.map((n) => n.toFixed(4)).join(',')})`;
}
