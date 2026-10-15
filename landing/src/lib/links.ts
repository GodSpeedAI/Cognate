import type { SourceRef } from '../data/types';

/** Permalink to the exact lines at the pinned commit. */
export function githubUrl(source: SourceRef): string {
  return `https://github.com/${source.repo}/blob/${source.sha}/${source.path}#L${source.startLine}-L${source.endLine}`;
}

export function sourceLabel(source: SourceRef): string {
  return `${source.path}, lines ${source.startLine}–${source.endLine} at ${source.sha.slice(0, 7)}`;
}
