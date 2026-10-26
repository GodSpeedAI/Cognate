// Scroll-scrubbed stills of the exploded view (Sequence C and G), forward and backward, with a pixel diff of
// each forward/backward pair. Run against a preview server: BASE_URL (default http://localhost:4321).
// Output: actualize/evidence/fidelity-qa/exploded/ (PNGs and diff-summary.json).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321/';
const OUT = join(import.meta.dir, '../../actualize/evidence/fidelity-qa/exploded');
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1024, h: 768 },
];
const C_UNITS = [0, 24, 48, 68, 84];
const G_UNITS = [15, 55, 100];

interface Shot {
  sequence: 'C' | 'G';
  unit: number;
  direction: 'fwd' | 'bwd';
  viewport: string;
  file: string;
}

async function scrollToUnit(page: Page, selector: string, unit: number): Promise<void> {
  await page.evaluate(
    ({ selector, unit }) => {
      const track = document.querySelector<HTMLElement>(selector);
      if (!track) throw new Error(`missing ${selector}`);
      const top = track.getBoundingClientRect().top + window.scrollY;
      const range = track.offsetHeight - window.innerHeight;
      window.scrollTo(0, top + (unit / 100) * range);
    },
    { selector, unit },
  );
  // GSAP scrub follows the scroll position; let it settle before the still.
  await page.waitForTimeout(900);
}

async function diffPng(page: Page, a: Buffer, b: Buffer): Promise<{ maxDelta: number; differingPixels: number }> {
  const toUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
  return page.evaluate(
    async ({ a, b }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.naturalWidth;
      const h = ia.naturalHeight;
      const read = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const da = read(ia);
      const db = read(ib);
      let maxDelta = 0;
      let differingPixels = 0;
      for (let i = 0; i < da.length; i += 4) {
        let pixelMax = 0;
        for (let k = 0; k < 4; k += 1) pixelMax = Math.max(pixelMax, Math.abs(da[i + k] - db[i + k]));
        if (pixelMax > 0) differingPixels += 1;
        if (pixelMax > maxDelta) maxDelta = pixelMax;
      }
      return { maxDelta, differingPixels };
    },
    { a: toUrl(a), b: toUrl(b) },
  );
}

async function run(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const summary: Array<{ viewport: string; sequence: string; unit: number; maxDelta: number; differingPixels: number }> = [];
  const measures: Array<Record<string, number | string | undefined>> = [];
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'networkidle' });
      const label = `${vp.w}x${vp.h}`;

      const sequences: Array<{ sequence: 'C' | 'G'; selector: string; fwd: number[]; bwd: number[] }> = [
        { sequence: 'C', selector: '.seq-track.seq-c', fwd: C_UNITS, bwd: [...C_UNITS].reverse() },
        { sequence: 'G', selector: '.seq-track.seq-g', fwd: G_UNITS, bwd: [...G_UNITS].reverse() },
      ];

      for (const seq of sequences) {
        const shots = new Map<string, Buffer>();
        const record: Shot[] = [];
        for (const direction of ['fwd', 'bwd'] as const) {
          const units = direction === 'fwd' ? seq.fwd : seq.bwd;
          for (const unit of units) {
            await scrollToUnit(page, seq.selector, unit);
            const file = `${seq.sequence.toLowerCase()}-u${String(unit).padStart(3, '0')}-${direction}-${label}.png`;
            const buf = await page.screenshot({ path: join(OUT, file) });
            if (seq.sequence === 'C' && unit === 84 && direction === 'fwd') {
              measures.push({
                viewport: label,
                ...(await page.evaluate(() => {
                  const face = document.querySelector<HTMLElement>('[data-part-id="C-01"]')?.getBoundingClientRect();
                  const stage = document.querySelector<HTMLElement>('.stage-wrap')?.getBoundingClientRect();
                  return {
                    faceWidthPx: face ? Math.round(face.width) : undefined,
                    faceHeightPx: face ? Math.round(face.height) : undefined,
                    stageWidthPx: stage ? Math.round(stage.width) : undefined,
                    stageHeightPx: stage ? Math.round(stage.height) : undefined,
                  };
                })),
              });
            }
            shots.set(`${direction}-${unit}`, buf);
            record.push({ sequence: seq.sequence, unit, direction, viewport: label, file });
          }
        }
        for (const unit of seq.fwd) {
          const a = shots.get(`fwd-${unit}`);
          const b = shots.get(`bwd-${unit}`);
          if (!a || !b) continue;
          const d = await diffPng(page, a, b);
          summary.push({ viewport: label, sequence: seq.sequence, unit, ...d });
        }
      }
      await context.close();
    }
    // Keyframe QA route at phone, tablet and desktop widths (single state, no scroll).
    for (const vp of [
      { w: 1440, h: 900 },
      { w: 1024, h: 768 },
      { w: 375, h: 812 },
    ]) {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await context.newPage();
      await page.goto(`${BASE}keyframe/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `keyframe-${vp.w}x${vp.h}.png`) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUT, 'diff-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(OUT, 'measure.json'), `${JSON.stringify(measures, null, 2)}\n`);
  const worst = summary.reduce((m, r) => Math.max(m, r.maxDelta), 0);
  console.log(JSON.stringify({ pairs: summary.length, worstMaxChannelDelta: worst, summary }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
