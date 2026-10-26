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

/** 1200x630 OG image: the reversed lockup and headline beside the keyframe stage, on the dark field (no browser chrome). */
export async function writeOgImage(origin: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    await page.goto(`${origin}/keyframe/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.stage-wrap svg', { state: 'visible' });
    await page.evaluate(() => {
      document.querySelector('.qa-head')?.remove();
      document.querySelector('.inspector')?.remove();
    });
    await page.waitForTimeout(300);
    const stageBox = (await page.locator('.stage-wrap').boundingBox())!;
    const stagePng = await page.screenshot({ clip: stageBox });
    const mark = readFileSync(resolve(landingDir, '..', 'brand', 'cognate-lockup-reversed.svg'), 'utf8');
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.evaluate(
      ({ mark, img }) => {
        document.body.innerHTML = `<div class="og"><div class="og-copy">${mark}<p class="og-line">You steer the software.<br>AI agents build it, and work within it.</p><p class="og-url">The agentic application framework<br>cognate.gspeedai.com</p></div><img class="og-stage" src="${img}" alt=""></div>`;
        const css = document.createElement('style');
        css.textContent = `html,body{margin:0;background:#05070a}.og{width:1200px;height:630px;box-sizing:border-box;display:grid;grid-template-columns:470px 1fr;align-items:center;gap:8px;padding:56px 40px 56px 64px;overflow:hidden;background:#05070a;color:#f7f3ea}.og-copy svg{height:60px;width:auto;display:block}.og-line{font-family:'Josefin Sans Variable','Josefin Sans',system-ui,sans-serif;font-weight:500;font-size:44px;line-height:1.08;color:#f7f3ea;margin:36px 0 28px;letter-spacing:0}.og-url{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:15px;color:#a7b4bf;margin:0;line-height:1.5}.og-stage{width:100%;max-height:540px;object-fit:contain}`;
        document.head.append(css);
        window.scrollTo(0, 0);
      },
      { mark, img: `data:image/png;base64,${stagePng.toString('base64')}` },
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await (document.querySelector('.og-stage') as HTMLImageElement).decode();
    });
    const out = resolve(publicDir, 'og.png');
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 }, scale: 'css' });
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
