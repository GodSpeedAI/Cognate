// Generates derived assets: WebP derivatives of the captures (scaled, never edited; rule R8),
// the 32px favicon PNG, and the 1200x630 OG image from the keyframe. Uses Chromium via Playwright.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { captures } from '../src/data/captures';

const landingDir = resolve(import.meta.dir, '..');
const publicDir = resolve(landingDir, 'public');

export const WEBP_PARAMS = 'canvas.toBlob(type=image/webp, quality=0.9); source = original PNG, drawn at native size (no resampling)';

/** Encodes each capture PNG to WebP inside Chromium (canvas.toBlob). Returns the derivative paths written. */
export async function writeWebpDerivatives(origin: string): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  const written: string[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/keyframe/`, { waitUntil: 'load' });
    for (const c of captures) {
      const pngPath = resolve(publicDir, c.file);
      const dataUrl = `data:image/png;base64,${readFileSync(pngPath).toString('base64')}`;
      const webp: string = await page.evaluate(async (src: string) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/webp', 0.9));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
      }, dataUrl);
      const out = resolve(publicDir, c.file.replace(/\.png$/, '.webp'));
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(webp, 'base64'));
      written.push(out);
    }
  } finally {
    await browser.close();
  }
  return written;
}

/** 1200x630 OG image: the keyframe stage, cropped to the frame (no browser chrome). */
export async function writeOgImage(origin: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
    await page.goto(`${origin}/keyframe/`, { waitUntil: 'networkidle' });
    // The exploded view no longer sets data-measured; wait for its stage to render instead.
    await page.waitForSelector('.stage-wrap svg', { state: 'visible' });
    await page.evaluate(() => {
      document.querySelector('.qa-head')?.remove();
      document.querySelector('.inspector')?.remove();
      document.querySelector('.parts-text')?.remove();
      document.querySelector('figure.exploded figcaption')?.remove();
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    const out = resolve(publicDir, 'og.png');
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    return out;
  } finally {
    await browser.close();
  }
}

/** 32px favicon PNG rendered from favicon.svg. */
export async function writeFavicon32(): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 32, height: 32 }, deviceScaleFactor: 1 });
    const svg = readFileSync(resolve(publicDir, 'favicon.svg'), 'utf8');
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="32" height="32" ')}</body></html>`);
    const out = resolve(publicDir, 'favicon-32.png');
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: 32, height: 32 } });
    return out;
  } finally {
    await browser.close();
  }
}
