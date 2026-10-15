import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { firstRequest, mkdirCommand, skillCommand, testCommand } from '../src/data/onboarding';

const readme = readFileSync(resolve(import.meta.dir, '..', '..', 'README.md'), 'utf8');

/** Fenced code blocks with their language tag. */
function fences(text: string): { lang: string; body: string }[] {
  const out: { lang: string; body: string }[] = [];
  const pattern = /```(\w*)\n([\s\S]*?)```/g;
  for (const m of text.matchAll(pattern)) out.push({ lang: m[1], body: m[2] });
  return out;
}

/** Joins backslash line continuations (with the whitespace around them) into one space; otherwise the text is unchanged. */
const joinContinuations = (s: string) => s.replace(/[ \t]*\\\n[ \t]*/g, ' ');

describe('README quick start matches the landing commands', () => {
  const bash = fences(readme).filter((f) => f.lang === 'bash').map((f) => joinContinuations(f.body));

  test('mkdir and git init line is identical', () => {
    expect(bash.some((block) => block.split('\n').includes(mkdirCommand))).toBe(true);
  });

  test('skills install command is identical after joining continuations', () => {
    expect(bash.some((block) => block.split('\n').includes(skillCommand))).toBe(true);
  });

  test('bun test is identical', () => {
    expect(bash.some((block) => block.split('\n').includes(testCommand))).toBe(true);
  });

  test('the first request is identical to the README text block', () => {
    const text = fences(readme).filter((f) => f.lang === 'text').map((f) => f.body.replace(/\n$/, ''));
    expect(text).toContain(firstRequest);
  });
});
