import { describe, expect, test } from 'bun:test';
import { captures } from '../src/data/captures';
import { edges, layers, parts } from '../src/data/parts';

describe('census data', () => {
  test('has fourteen unique parts with the expected ids', () => {
    const ids = parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(Array.from({ length: 14 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`));
  });

  test('every edge joins known parts and carries evidence', () => {
    const ids = new Set(parts.map((p) => p.id));
    for (const e of edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
      expect(e.evidence.line).toBeGreaterThan(0);
    }
    expect(edges.length).toBeGreaterThanOrEqual(12);
  });

  test('excerpts stay within the 14-line limit and sources are well-formed', () => {
    for (const p of parts) {
      expect(p.excerpt.split('\n').length).toBeLessThanOrEqual(14);
      for (const s of p.sources) {
        expect(s.sha).toMatch(/^[0-9a-f]{40}$/);
        expect(s.endLine).toBeGreaterThanOrEqual(s.startLine);
      }
      expect(p.job.split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(p.why.split(/\s+/).length).toBeLessThanOrEqual(20);
    }
  });

  test('branch-only parts are exactly C-13 and C-14', () => {
    expect(parts.filter((p) => p.branchOnly).map((p) => p.id)).toEqual(['C-13', 'C-14']);
  });

  test('four layers and real captures are declared', () => {
    expect(layers.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(captures.length).toBe(6);
    for (const c of captures) {
      expect(c.caption.length).toBeGreaterThan(0);
      expect(c.alt.length).toBeGreaterThan(20);
    }
  });
});
