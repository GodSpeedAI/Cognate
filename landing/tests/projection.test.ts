import { describe, expect, test } from 'bun:test';
import { faceRect, makeView, slotOf, tokenRect, type Pose, type Rect } from '../src/lib/projection';

const EXPLODED: Pose = { tilt: 1, sep: 1, rise: 1 };
const SIZES: readonly (readonly [number, number])[] = [
  [720, 700],
  [1100, 800],
  [620, 520],
];

const overlaps = (a: Rect, b: Rect, eps = 0.5) =>
  a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;

describe('standing cartridge faces (oblique shelf projection)', () => {
  for (const [w, h] of SIZES) {
    test(`no two cartridge faces overlap at stage ${w}x${h}`, () => {
      const view = makeView(w, h);
      const rects = Array.from({ length: 14 }, (_, i) => faceRect(slotOf(i), EXPLODED, view));
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(overlaps(rects[i], rects[j])).toBe(false);
        }
      }
    });

    test(`every cartridge face sits inside the stage at ${w}x${h}`, () => {
      const view = makeView(w, h);
      for (let i = 0; i < 14; i += 1) {
        const r = faceRect(slotOf(i), EXPLODED, view);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(w);
        expect(r.y + r.h).toBeLessThanOrEqual(h);
      }
    });
  }

  test('each row sits wholly above the row in front of it, in every column (no face covers another)', () => {
    for (const [w, h] of SIZES) {
      const view = makeView(w, h);
      for (let col = 0; col < 5; col += 1) {
        const back = faceRect(slotOf(col), EXPLODED, view);
        const mid = faceRect(slotOf(5 + col), EXPLODED, view);
        const front = faceRect(slotOf(10 + col), EXPLODED, view);
        expect(back.y + back.h).toBeLessThanOrEqual(mid.y);
        expect(mid.y + mid.h).toBeLessThanOrEqual(front.y);
      }
    }
  });

  test('a face is a plain rectangle: width and height are exactly scaled world sizes', () => {
    const view = makeView(900, 760);
    const r = faceRect(slotOf(0), EXPLODED, view);
    expect(r.w).toBeCloseTo(128 * view.s, 6);
    expect(r.h).toBeCloseTo(72 * view.s, 6);
  });

  test('faces are hidden at rise 0', () => {
    const view = makeView(900, 760);
    const r = faceRect(slotOf(5), { tilt: 1, sep: 1, rise: 0 }, view);
    expect(r.h).toBe(0);
  });

  test('agent tokens never intersect a cartridge face at t = 1', () => {
    for (const [w, h] of SIZES) {
      const view = makeView(w, h);
      const faces = Array.from({ length: 15 }, (_, i) => faceRect(slotOf(i), EXPLODED, view));
      for (let i = 0; i < 3; i += 1) {
        const token = tokenRect(i, EXPLODED, view);
        for (const face of faces) {
          expect(overlaps(token, face)).toBe(false);
        }
      }
    }
  });
});
