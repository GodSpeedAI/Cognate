import { edges, parts } from '../data/parts';
import type { Edge, Part } from '../data/types';

export type Category = 'model' | 'act' | 'control' | 'work' | 'history';

/** Colour family for each cartridge (direction tokens --part-*). Presentation only; not evidence. */
const categories: Record<string, Category> = {
  'C-01': 'model',
  'C-02': 'act',
  'C-03': 'act',
  'C-04': 'control',
  'C-05': 'control',
  'C-06': 'work',
  'C-07': 'work',
  'C-08': 'work',
  'C-09': 'work',
  'C-10': 'history',
  'C-11': 'act',
  'C-12': 'work',
  'C-13': 'work',
  'C-14': 'work',
};

/** The keyframe shows the twelve core cartridges; C-13 and C-14 join in Sequence G. */
const KEYFRAME_IDS = new Set(Array.from({ length: 12 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`));

export const keyframeParts: readonly Part[] = parts.filter((p) => KEYFRAME_IDS.has(p.id));

export function partById(id: string): Part | undefined {
  return parts.find((p) => p.id === id);
}

export function categoryOf(id: string): Category {
  return categories[id] ?? 'work';
}

/** Edges where `id` depends on another part. */
export function dependsOn(id: string): readonly Edge[] {
  return edges.filter((e) => e.from === id);
}

/** Edges where another part depends on `id`. */
export function usedBy(id: string): readonly Edge[] {
  return edges.filter((e) => e.to === id);
}

/** Edges with both ends in the keyframe. */
export function keyframeEdges(): readonly Edge[] {
  return edges.filter((e) => KEYFRAME_IDS.has(e.from) && KEYFRAME_IDS.has(e.to));
}

export function titleCase(text: string): string {
  return text.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function lowerFirst(text: string): string {
  return text.replace(/^\w/, (c) => c.toLowerCase());
}

export function kindLabel(kind: Part['kind']): string {
  if (kind === 'cognate') return 'From Cognate';
  if (kind === 'workbench') return 'Built in Workbench';
  return 'From Cognate, built in Workbench';
}

export function edgeWord(kind: Edge['kind']): string {
  return kind === 'stores-in' ? 'stores in' : kind;
}

/** Sequence G shows the core twelve plus C-13 (added by extension). C-14 is in the text list only. */
export const extensionParts: readonly Part[] = parts.filter((p) => KEYFRAME_IDS.has(p.id) || p.id === 'C-13');
