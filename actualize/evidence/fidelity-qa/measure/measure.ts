// Fidelity QA measurement for the Cognate landing site (read-only against landing/).
// Run: bun /home/sprime01/projects/cognate/actualize/evidence/fidelity-qa/measure/measure.ts
// Requires the static server on 127.0.0.1:4455 serving landing/dist.
import { chromium } from '/home/sprime01/projects/cognate/landing/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4455';
const OUT = '/home/sprime01/projects/cognate/actualize/evidence/fidelity-qa/measure';
const DIST = '/home/sprime01/projects/cognate/landing/dist';
mkdirSync(OUT, { recursive: true });

// Token values from actualize/artifacts/direction/creative-direction.md, with the accepted light
// --signal (54%) and --human (46%) changes.
const SPEC: Record<string, Record<string, string>> = {
  light: {
    '--paper': 'oklch(97.2% 0.008 85)', '--paper-2': 'oklch(94% 0.010 85)', '--ink': 'oklch(22% 0.015 255)',
    '--ink-2': 'oklch(42% 0.015 255)', '--rule': 'oklch(82% 0.012 85)', '--signal': 'oklch(54% 0.17 45)',
    '--human': 'oklch(46% 0.11 165)',
  },
  dark: {
    '--paper': 'oklch(19% 0.012 250)', '--paper-2': 'oklch(23% 0.014 250)', '--ink': 'oklch(93% 0.010 85)',
    '--ink-2': 'oklch(76% 0.012 85)', '--rule': 'oklch(36% 0.014 250)', '--signal': 'oklch(72% 0.15 50)',
    '--human': 'oklch(74% 0.10 165)',
  },
};

// Runs in the page. Everything is measured in-page; only summarized arrays come back.
const audit = async (opts: { spec: Record<string, string>; scheme: string; dpr: number }) => {
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const rgba = (s: string): number[] | null => {
    cx.fillStyle = '#010203';
    cx.fillStyle = s;
    cx.clearRect(0, 0, 1, 1);
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    if (d[0] === 1 && d[1] === 2 && d[2] === 3 && d[3] === 255) return null; // unparsed
    return [d[0], d[1], d[2], Math.round((d[3] / 255) * 1000) / 1000];
  };
  const hex = (c: number[]) =>
    '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') +
    (c[3] < 1 ? ` a=${c[3]}` : '');
  const tokenNames = ['--paper', '--paper-2', '--ink', '--ink-2', '--rule', '--signal', '--human',
    '--part-model', '--part-act', '--part-control', '--part-work', '--part-history'];
  const root = getComputedStyle(document.documentElement);
  const tokens: Record<string, { raw: string; rgba: number[] | null }> = {};
  for (const n of tokenNames) {
    const raw = root.getPropertyValue(n).trim();
    tokens[n] = { raw, rgba: rgba(raw) };
  }
  const palette = tokenNames.filter((n) => tokens[n].rgba).map((n) => ({ name: n, c: tokens[n].rgba as number[] }));
  const nearest = (c: number[]) => {
    let best = '', bd = 1e9;
    for (const p of palette) {
      const d = Math.hypot(p.c[0] - c[0], p.c[1] - c[1], p.c[2] - c[2]) + Math.abs(p.c[3] - c[3]) * 255;
      if (d < bd) { bd = d; best = p.name; }
    }
    return `${best} (dist ${Math.round(bd)})`;
  };
  const isToken = (c: number[]) =>
    palette.some((p) => Math.max(Math.abs(p.c[0] - c[0]), Math.abs(p.c[1] - c[1]), Math.abs(p.c[2] - c[2])) <= 2 &&
      Math.abs(p.c[3] - c[3]) <= 0.01);
  const effOpacity = (el: Element) => {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
    return o;
  };
  const isVisible = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (effOpacity(el) === 0) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  const sel = (el: Element) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const pid = (el as HTMLElement).dataset?.partId;
    if (pid) s += `[data-part-id=${pid}]`;
    return s;
  };
  const lum = (c: number[]) => {
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const contrast = (a: number[], b: number[]) => {
    const L1 = lum(a), L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  const bump = (m: Map<string, any>, key: string, init: any) => {
    const e = m.get(key);
    if (e) e.count++; else m.set(key, { ...init, count: 1 });
  };
  const dedup = (m: Map<string, any>) => [...m.values()].sort((a, b) => b.count - a.count);

  const de = document.documentElement;
  const colorM = new Map<string, any>(), famM = new Map<string, any>(), sizeM = new Map<string, any>();
  const lhM = new Map<string, any>(), radM = new Map<string, any>(), contrastM = new Map<string, any>();
  const smallM = new Map<string, any>();
  const clipped: any[] = [], rightEdge: any[] = [];
  let visibleCount = 0, textNodes = 0, contrastChecked = 0, unmeasuredBg = 0;

  for (const el of [...document.querySelectorAll('body *')]) {
    if (!isVisible(el)) continue;
    visibleCount++;
    const cs = getComputedStyle(el);
    const svg = el instanceof SVGElement;
    const s = sel(el);
    const checkColor = (prop: string, value: string) => {
      const c = rgba(value);
      if (!c || c[3] === 0) return;
      if (!isToken(c)) bump(colorM, prop + '|' + hex(c) + '|' + s, { prop, value: hex(c), selector: s, nearest: nearest(c) });
    };
    if (!svg) checkColor('color', cs.color);
    checkColor('background-color', cs.backgroundColor);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat((cs as any)['border' + side + 'Width']) > 0 && (cs as any)['border' + side + 'Style'] !== 'none') {
        checkColor('border-' + side.toLowerCase() + '-color', (cs as any)['border' + side + 'Color']);
      }
    }
    if (svg && ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan'].includes(el.tagName.toLowerCase())) {
      if (cs.fill !== 'none' && !cs.fill.startsWith('url')) checkColor('fill', cs.fill);
      if (cs.stroke !== 'none' && !cs.stroke.startsWith('url') && parseFloat(cs.strokeWidth) > 0) checkColor('stroke', cs.stroke);
    }
    const hasBox = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0;
    if (!svg && hasBox) {
      const r = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' ');
      bump(radM, r, { value: r, selector: s });
    }
    const fam = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    bump(famM, fam, { family: fam, selector: s });

    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
    if (ownText.length) {
      textNodes++;
      const text = ownText.map((n) => n.textContent!.trim()).join(' ').slice(0, 50);
      const fs = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10);
      bump(sizeM, cs.fontSize, { size: cs.fontSize, selector: s });
      bump(lhM, `${cs.fontSize}/${cs.lineHeight}`, { size: cs.fontSize, lineHeight: cs.lineHeight, selector: s });
      if (fs < 12) bump(smallM, s + '|' + cs.fontSize, { selector: s, size: cs.fontSize, text });
      const fg = rgba(svg ? cs.fill : cs.color);
      if (fg) {
        const eff = fg[3] * effOpacity(el);
        const layers: number[][] = [];
        let bgImage = false;
        for (let e: Element | null = el; e && e.nodeType === 1; e = e.parentElement) {
          const ecs = getComputedStyle(e);
          if (ecs.backgroundImage !== 'none') bgImage = true;
          const b = rgba(ecs.backgroundColor);
          if (b && b[3] > 0) { layers.push(b); if (b[3] >= 1) break; }
          if (bgImage && !(b && b[3] >= 1)) continue;
          if (bgImage) break;
        }
        if (bgImage) {
          unmeasuredBg++;
        } else {
          let bg = [255, 255, 255];
          for (let i = layers.length - 1; i >= 0; i--) {
            const l = layers[i];
            bg = [0, 1, 2].map((k) => bg[k] * (1 - l[3]) + l[k] * l[3]);
          }
          const fgc = [0, 1, 2].map((k) => fg[k] * eff + bg[k] * (1 - eff));
          contrastChecked++;
          const large = fs >= 24 || (fs >= 18.66 && wt >= 700);
          const need = large ? 3 : 4.5;
          const ratio = contrast(fgc, bg);
          if (ratio < need) {
            bump(contrastM, s + '|' + ratio.toFixed(2), {
              selector: s, text, fg: hex(fgc), bg: hex(bg), ratio: +ratio.toFixed(2), need, size: cs.fontSize, weight: cs.fontWeight,
            });
          }
        }
      }
    }

    const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    const clipY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    const txt = el.textContent!.trim();
    if (txt && ((clipX && el.scrollWidth > el.clientWidth + 1) || (clipY && el.scrollHeight > el.clientHeight + 1))) {
      clipped.push({
        selector: s, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight, textOverflow: cs.textOverflow, text: txt.slice(0, 50),
      });
    }
    const r = el.getBoundingClientRect();
    if (r.right > de.clientWidth + 1) {
      let inClip = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (['hidden', 'clip', 'auto', 'scroll'].includes(o)) { inClip = true; break; }
      }
      if (!inClip) rightEdge.push({ selector: s, right: Math.round(r.right), viewport: de.clientWidth, text: txt.slice(0, 40) });
    }
  }

  await Promise.all(['Newsreader Variable', 'Hanken Grotesk Variable', 'Martian Mono Variable'].map((f) =>
    document.fonts.load(`16px "${f}"`).catch(() => null)));
  const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/"/g, ''), status: f.status, weight: f.weight }));

  const parts: Record<string, any> = {};
  for (const n of ['--part-model', '--part-act', '--part-control', '--part-work', '--part-history']) {
    const m = tokens[n].raw.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)/);
    const L = m ? +m[1] : NaN, C = m ? +m[2] : NaN;
    const ok = opts.scheme === 'light' ? L >= 90 && L <= 93 && C >= 0.03 && C <= 0.04 : L >= 32 && L <= 36;
    parts[n] = { raw: tokens[n].raw, L, C, ok };
  }
  const specRes: Record<string, any> = {};
  for (const [n, want] of Object.entries(opts.spec)) {
    const got = tokens[n].rgba as number[], w = rgba(want) as number[];
    const dmax = Math.max(...[0, 1, 2].map((k) => Math.abs(got[k] - w[k])));
    specRes[n] = { raw: tokens[n].raw, spec: want, maxChannelDelta: dmax, match: dmax <= 1 };
  }
  const images = [...document.images].filter(isVisible).map((img) => {
    const r = img.getBoundingClientRect();
    const need = r.width * opts.dpr;
    return {
      src: (img.currentSrc || img.src).split('/').pop()!.slice(0, 60), natural: img.naturalWidth,
      displayed: Math.round(r.width * 10) / 10, need: Math.round(need), pass: img.complete && img.naturalWidth >= need,
    };
  });
  const docOverflow = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflow: de.scrollWidth > de.clientWidth };

  return {
    scheme: opts.scheme, visibleCount, textNodes, contrastChecked, unmeasuredBg, docOverflow,
    tokens: Object.fromEntries(tokenNames.map((n) => [n, tokens[n].raw])),
    specRes, parts, faces,
    colorDefects: dedup(colorM), fontFamilies: dedup(famM), fontSizes: dedup(sizeM), lineHeights: dedup(lhM),
    radii: dedup(radM), contrastFails: dedup(contrastM), smallText: dedup(smallM),
    clipped, rightEdge, images,
  };
};

// Scroll-driven hold: find the scroll band where --hold >= 0.5 on the exploded island's ancestors, then rest mid-band.
// The hold is a pure function of the pinned track's unit (SequenceC: hold = unit >= 68). Unit 84 is the mid-hold
// rest point; position follows tests/e2e/sequence.spec.ts: scrollY = trackTop + (u/100) * (trackHeight - viewport).
const holdScan = async () => {
  const track = document.querySelector('.seq-track.seq-c') as HTMLElement | null;
  const island = document.querySelector('.exploded-island') as HTMLElement | null;
  if (!track || !island) return { error: 'no seq-track.seq-c or .exploded-island' };
  const top = track.getBoundingClientRect().top + window.scrollY;
  const y = Math.round(top + (84 / 100) * (track.offsetHeight - window.innerHeight));
  window.scrollTo(0, y);
  await new Promise((r) => setTimeout(r, 1500));
  const insp = document.querySelector('[data-testid="inspector"]') as HTMLElement | null;
  const ir = insp?.getBoundingClientRect();
  return {
    unit: 84, scrollY: window.scrollY, split: island.dataset.split,
    inspectorVisible: !!ir && ir.width > 0 && ir.height > 0, inspectorText: insp?.textContent?.trim().slice(0, 80),
  };
};

const sweep = async () => {
  const h = document.documentElement.scrollHeight;
  for (let y = 0; y <= h; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
};

type Plan = { name: string; w: number; scheme: 'light' | 'dark'; path: string; dpr: number; sweep?: boolean; hold?: boolean };
const plan: Plan[] = [];
for (const w of [320, 375, 768, 1024, 1440]) for (const path of ['/', '/keyframe/'])
  plan.push({ name: `w${w}-light-${path === '/' ? 'home' : 'keyframe'}`, w, scheme: 'light', path, dpr: 1, sweep: true } as any);
for (const path of ['/', '/keyframe/'])
  plan.push({ name: `w1440-dark-${path === '/' ? 'home' : 'keyframe'}`, w: 1440, scheme: 'dark', path, dpr: 1, sweep: true } as any);
plan.push({ name: 'w1440-hold-home', w: 1440, scheme: 'light', path: '/', dpr: 1, hold: true } as any);
for (const w of [1440, 375]) plan.push({ name: `w${w}-dpr2-home`, w, scheme: 'light', path: '/', dpr: 2, sweep: true } as any);

const browser = await chromium.launch();
const results: Record<string, any> = {};
for (const p of plan as any[]) {
  const ctx = await browser.newContext({
    viewport: { width: p.w, height: 900 }, deviceScaleFactor: p.dpr, colorScheme: p.scheme,
  });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(BASE + p.path, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  let extra: any = {};
  if (p.sweep) await page.evaluate(sweep);
  if (p.hold) {
    extra.hold = await page.evaluate(holdScan);
    await page.screenshot({ path: `${OUT}/hold-1440.png` });
  }
  await page.waitForLoadState('load');
  const a = await page.evaluate(audit, { spec: SPEC[p.scheme], scheme: p.scheme, dpr: p.dpr });
  results[p.name] = { ...a, ...extra, pageErrors, path: p.path, width: p.w, dpr: p.dpr };
  await ctx.close();
  console.log('done', p.name);
}
await browser.close();

// Placeholder scan of built HTML.
const stripped = (f: string) => readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
const pats: [string, RegExp][] = [['lorem', /lorem/i], ['TODO', /\bTODO\b/], ['TBD', /\bTBD\b/], ['example.com', /example\.com/i], ['xxx', /\bxxx\b/i], ['[placeholder]', /\[placeholder\]/i], ['FIXME', /\bFIXME\b/]];
const placeholders: Record<string, any> = {};
for (const f of ['index.html', 'keyframe/index.html']) {
  const txt = stripped(`${DIST}/${f}`);
  placeholders[f] = pats.map(([name, re]) => {
    const m = txt.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    return { pattern: name, hits: m ? m.length : 0 };
  });
}
results._placeholders = placeholders;
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));

// Condensed console summary.
const ALLOWED_FAM = ['Newsreader Variable', 'Hanken Grotesk Variable', 'Martian Mono Variable'];
const ALLOWED_RAD = ['0px', '4px', '6px', '10px'];
const isAllowedSize = (s: string) => {
  const v = parseFloat(s);
  return [12, 13, 13.5, 17, 18, 24, 32, 42.67, 56.89, 75.85].some((x) => Math.abs(x - v) < 0.05) || (v >= 40 && v <= 76);
};
for (const [k, r] of Object.entries(results) as [string, any][]) {
  if (k.startsWith('_')) continue;
  const specBad = Object.entries(r.specRes).filter(([, v]: any) => !v.match).map(([n]) => n);
  const partBad = Object.entries(r.parts).filter(([, v]: any) => !v.ok).map(([n]) => n);
  const famBad = r.fontFamilies.filter((f: any) => !ALLOWED_FAM.includes(f.family));
  const sizeBad = r.fontSizes.filter((f: any) => !isAllowedSize(f.size));
  const radBad = r.radii.filter((x: any) => x.value.split(' ').some((c: string) => !ALLOWED_RAD.includes(c)));
  const imgBad = r.images.filter((i: any) => !i.pass);
  const loaded = Object.fromEntries(ALLOWED_FAM.map((f) => [f, r.faces.filter((x: any) => x.family === f).map((x: any) => x.status).join('/') || 'none']));
  console.log(`\n== ${k} (visible ${r.visibleCount}, text ${r.textNodes}, contrastChecked ${r.contrastChecked}, unmeasuredBg ${r.unmeasuredBg})`);
  console.log(` spec-mismatch ${specBad.join(',') || 0} | parts-off ${partBad.join(',') || 0} | pageErrors ${r.pageErrors.length}`);
  console.log(` offToken colors: ${r.colorDefects.length} unique (${r.colorDefects.reduce((s: number, x: any) => s + x.count, 0)} occurrences)`);
  for (const c of r.colorDefects.slice(0, 6)) console.log(`   ${c.count}x ${c.prop} ${c.value} ${c.selector} -> nearest ${c.nearest}`);
  console.log(` fonts: ${JSON.stringify(loaded)} | fallback families: ${famBad.map((f: any) => f.family + '@' + f.selector).join(', ') || 0}`);
  console.log(` font sizes off-scale: ${sizeBad.map((f: any) => f.size + '@' + f.selector + 'x' + f.count).join(', ') || 0}`);
  console.log(` radii off-token: ${radBad.map((x: any) => x.value + '@' + x.selector).join(', ') || 0}`);
  console.log(` contrast fails: ${r.contrastFails.length}`);
  for (const c of r.contrastFails.slice(0, 8)) console.log(`   ${c.ratio}:1 need ${c.need} ${c.selector} "${c.text}" fg ${c.fg} bg ${c.bg} ${c.size}/${c.weight}`);
  console.log(` small text <12px: ${r.smallText.length} ${r.smallText.slice(0, 5).map((s: any) => s.size + '@' + s.selector + ' "' + s.text + '"').join('; ')}`);
  console.log(` doc overflow: ${JSON.stringify(r.docOverflow)} | clipped text: ${r.clipped.length} ${r.clipped.slice(0, 4).map((c: any) => c.selector).join(', ')} | right-edge escapes: ${r.rightEdge.length} ${r.rightEdge.slice(0, 4).map((c: any) => c.selector + '@' + c.right).join(', ')}`);
  console.log(` images: ${r.images.length} visible, failing density ${imgBad.length}: ${imgBad.slice(0, 5).map((i: any) => `${i.src} nat ${i.natural} need ${i.need}`).join('; ')}`);
  if (r.hold) console.log(` hold: ${JSON.stringify(r.hold)}`);
}
console.log('\nplaceholders', JSON.stringify(placeholders));
