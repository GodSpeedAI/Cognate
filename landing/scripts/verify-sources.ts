// Verifies every census excerpt and dependency edge against the pinned git SHAs.
// Reads files with `git show <sha>:<path>`; never checks out or modifies a repo.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { edges, parts } from '../src/data/parts';
import { refundSteps } from '../src/data/refund';
import type { Repo, SourceRef } from '../src/data/types';

const landingDir = resolve(import.meta.dir, '..');
const repoDirs: Record<Repo, string> = {
  'GodSpeedAI/Cognate': resolve(landingDir, '..'),
  'GodSpeedAI/Cognate-Workbench': resolve(landingDir, process.env.COGNATE_WORKBENCH_DIR ?? '../../cognate-workbench'),
};

const fileCache = new Map<string, string | null>();

function readAt(repo: Repo, sha: string, path: string): string | null {
  const key = `${repo}@${sha}:${path}`;
  if (!fileCache.has(key)) {
    try {
      const text = execFileSync('git', ['-C', repoDirs[repo], 'show', `${sha}:${path}`], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      fileCache.set(key, text);
    } catch {
      fileCache.set(key, null);
    }
  }
  return fileCache.get(key) ?? null;
}

const failures: string[] = [];
let checkedExcerpts = 0;
let checkedEdges = 0;

for (const part of parts) {
  part.sources.forEach((source: SourceRef, index) => {
    const text = readAt(source.repo, source.sha, source.path);
    const where = `${part.id} source[${index}] ${source.repo}@${source.sha.slice(0, 7)} ${source.path}:${source.startLine}-${source.endLine}`;
    if (text === null) {
      failures.push(`${where}: file not found at pinned sha`);
      return;
    }
    const lines = text.split('\n');
    if (source.endLine > lines.length) {
      failures.push(`${where}: range beyond end of file (${lines.length} lines)`);
      return;
    }
    if (index === 0) {
      const actual = lines.slice(source.startLine - 1, source.endLine).join('\n');
      checkedExcerpts += 1;
      if (actual !== part.excerpt) {
        failures.push(`${where}: excerpt mismatch\n--- expected\n${part.excerpt}\n--- actual\n${actual}`);
      }
      if (part.excerpt.split('\n').length > 14) {
        failures.push(`${part.id}: excerpt exceeds 14 lines`);
      }
    }
  });
}

// Beat E excerpts (examples/refund-desk) are verified the same way.
for (const step of refundSteps) {
  if (!step.source || step.excerpt === undefined) continue;
  const { source } = step;
  const where = `refund step ${step.n} ${source.path}:${source.startLine}-${source.endLine}`;
  const text = readAt(source.repo, source.sha, source.path);
  if (text === null) {
    failures.push(`${where}: file not found at pinned sha`);
    continue;
  }
  const actual = text.split('\n').slice(source.startLine - 1, source.endLine).join('\n');
  checkedExcerpts += 1;
  if (actual !== step.excerpt) {
    failures.push(`${where}: excerpt mismatch\n--- expected\n${step.excerpt}\n--- actual\n${actual}`);
  }
}

const partIds = new Set(parts.map((p) => p.id));
for (const edge of edges) {
  checkedEdges += 1;
  const where = `edge ${edge.from} -> ${edge.to} (${edge.kind})`;
  if (!partIds.has(edge.from) || !partIds.has(edge.to)) {
    failures.push(`${where}: unknown part id`);
  }
  const { repo, sha, path, line } = edge.evidence;
  const text = readAt(repo, sha, path);
  if (text === null) {
    failures.push(`${where}: evidence file not found at ${sha.slice(0, 7)} ${path}`);
    continue;
  }
  const lines = text.split('\n');
  if (line < 1 || line > lines.length || lines[line - 1].trim() === '') {
    failures.push(`${where}: evidence line ${path}:${line} is missing or blank`);
  }
}

console.log(`excerpts checked: ${checkedExcerpts}, edges checked: ${checkedEdges}`);
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} problem(s)\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log('verify-sources: PASS');
