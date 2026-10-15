import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FONT_FAMILIES, RUNTIME_PACKAGES } from '../scripts/notices';

// These check the output of `bun run build` (dist/). Run the build before `bun test`.
const dist = resolve(import.meta.dir, '../dist');
const notices = resolve(dist, 'THIRD_PARTY_NOTICES.txt');

describe('third-party notices', () => {
  test('THIRD_PARTY_NOTICES.txt exists in dist after build', () => {
    expect(existsSync(notices), 'run `bun run build` first').toBe(true);
  });

  test('names every runtime package that ships in dist', () => {
    const text = readFileSync(notices, 'utf8');
    for (const pkg of RUNTIME_PACKAGES) {
      expect(text, `missing ${pkg.name}`).toContain(`${pkg.name} `);
    }
  });

  test('includes the OFL text for each shipped font family', () => {
    const text = readFileSync(notices, 'utf8');
    for (const f of FONT_FAMILIES) {
      expect(existsSync(resolve(dist, 'licenses', `OFL-${f.slug}.txt`)), f.name).toBe(true);
      expect(text, f.name).toContain(f.name);
    }
    expect(text).toContain('SIL Open Font License');
  });

  test('includes the Workbench Apache-2.0 notice with owner and pinned SHAs', () => {
    const text = readFileSync(notices, 'utf8');
    expect(text).toContain('Copyright GodSpeedAI');
    expect(text).toContain('d208cd0491d5d76839ed4dedbababc589383ad09');
    expect(text).toContain('fdc709b9ccff47d52619185f6e9e03fdd9ae8d08');
    expect(text).toContain('Apache License');
  });
});
