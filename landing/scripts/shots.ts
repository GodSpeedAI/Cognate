// Builds the site, generates derived assets (WebP, OG image, favicon), rebuilds so they ship, then
// captures / and /keyframe/ at the widths in the brief into actualize/evidence/fidelity-qa/.
// Reports horizontal overflow per page and width. Exits non-zero on overflow, page error or a bad cartridge count.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { writeFavicon32, writeOgImage, writeWebpDerivatives } from './assets';

const landingDir = resolve(import.meta.dir, '..');
const outDir = resolve(landingDir, '..', 'actualize', 'evidence', 'fidelity-qa');
const port = 4321;
const origin = `http://127.0.0.1:${port}`;

interface Shot {
  page: '/' | '/keyframe/';
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  colorScheme: 'light' | 'dark';
}

const widths = [
  { w: 320, h: 640, dpr: 1 },
  { w: 375, h: 812, dpr: 2 },
  { w: 768, h: 1024, dpr: 1 },
  { w: 1024, h: 768, dpr: 1 },
  { w: 1440, h: 900, dpr: 2 },
];

const shots: Shot[] = [
  ...widths.flatMap(({ w, h, dpr }) => [
    { page: '/' as const, name: `home-${w}`, width: w, height: h, deviceScaleFactor: dpr, colorScheme: 'light' as const },
    { page: '/keyframe/' as const, name: `keyframe-${w}`, width: w, height: h, deviceScaleFactor: dpr, colorScheme: 'light' as const },
  ]),
  { page: '/', name: 'home-1440-dark', width: 1440, height: 900, deviceScaleFactor: 2, colorScheme: 'dark' },
  { page: '/keyframe/', name: 'keyframe-1440-dark', width: 1440, height: 900, deviceScaleFactor: 2, colorScheme: 'dark' },
  // 200% zoom: a 1440 layout at 200% reads as a 720 CSS-pixel viewport.
  { page: '/', name: 'home-zoom200-720', width: 720, height: 900, deviceScaleFactor: 1, colorScheme: 'light' },
];

async function run(command: string[]): Promise<void> {
  const proc = Bun.spawn(command, { cwd: landingDir, stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${command.join(' ')} exited with ${code}`);
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`preview server did not start at ${url}`);
}

function startPreview() {
  return Bun.spawn(['node_modules/.bin/astro', 'preview', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: landingDir,
    stdout: 'ignore',
    stderr: 'ignore',
  });
}

// 1. Build, serve, generate derived assets, rebuild so they ship in dist/.
await run(['bun', 'run', 'build']);
let preview = startPreview();
try {
  await waitForServer(`${origin}/keyframe/`);
  const webp = await writeWebpDerivatives(origin);
  const og = await writeOgImage(origin);
  const favicon = await writeFavicon32();
  console.log(`assets: ${webp.length} webp derivatives, ${og}, ${favicon}`);
} finally {
  preview.kill();
}
await run(['bun', 'run', 'build']);

// 2. Serve the final build and capture.
mkdirSync(outDir, { recursive: true });
preview = startPreview();
try {
  await waitForServer(`${origin}/keyframe/`);
  const browser = await chromium.launch({ headless: true });
  const report: string[] = [];
  let failures = 0;
  try {
    for (const shot of shots) {
      const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: shot.deviceScaleFactor,
        colorScheme: shot.colorScheme,
      });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      await page.goto(`${origin}${shot.page}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        cartridges: document.querySelectorAll('[data-cart], .m-cart').length,
      }));
      const overflow = metrics.scrollWidth > metrics.innerWidth;
      const cartOk = metrics.cartridges >= 12;
      if (overflow || pageErrors.length > 0 || !cartOk) failures += 1;
      report.push(
        `${shot.name}: scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth} overflow=${overflow} parts=${metrics.cartridges} pageErrors=${pageErrors.length}`,
      );
      // Lazy images only load when scrolled near; walk the page once so full-page captures are not empty frames.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
        await Promise.all(
          [...document.images].map((img) =>
            img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 3000); }),
          ),
        );
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(outDir, `${shot.name}.png`), fullPage: true });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(report.join('\n'));
  if (failures > 0) {
    console.error(`shots: ${failures} capture(s) failed the overflow, error or part-count check`);
    process.exitCode = 1;
  } else {
    console.log('shots: PASS');
  }
} finally {
  preview.kill();
}
