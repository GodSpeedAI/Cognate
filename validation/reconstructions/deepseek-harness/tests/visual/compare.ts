/**
 * T5b visual parity comparison.
 *
 * For every checkpoint present in BOTH reference/screenshots/<viewport>/ and
 * cognate/screenshots/<viewport>/, writes a side-by-side (reference | cognate | pixel diff) PNG to
 * diffs/<viewport>/NN-name.png plus a diffs/summary.md table of each checkpoint's differing-pixel
 * percentage. This is evidence, not a gate — Phase 7 of the spec is explicit that there is no
 * pixel-similarity threshold; a human (or agent) still has to look at diffs/summary.md and the
 * images and decide what's a real regression vs. expected content/timestamp/branding drift.
 *
 * Usage: bun run tests/visual/compare.ts
 */
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const ROOT = "/home/sprime01/projects/cognate/validation/reconstructions/deepseek-harness";
const VIEWPORTS = ["desktop", "laptop"] as const;

interface Row {
  viewport: string;
  name: string;
  diffPct: number;
  refDims: string;
  cogDims: string;
  note: string;
}

function loadPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

function padCanvas(img: PNG, width: number, height: number): PNG {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height });
  out.data.fill(255);
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}

function sideBySide(ref: PNG, cog: PNG, diff: PNG): Buffer {
  const gap = 8;
  const width = ref.width + gap + cog.width + gap + diff.width;
  const height = Math.max(ref.height, cog.height, diff.height);
  const out = new PNG({ width, height });
  out.data.fill(240);
  PNG.bitblt(ref, out, 0, 0, ref.width, ref.height, 0, 0);
  PNG.bitblt(cog, out, 0, 0, cog.width, cog.height, ref.width + gap, 0);
  PNG.bitblt(diff, out, 0, 0, diff.width, diff.height, ref.width + gap + cog.width + gap, 0);
  return PNG.sync.write(out);
}

const rows: Row[] = [];

for (const viewport of VIEWPORTS) {
  const refDir = `${ROOT}/reference/screenshots/${viewport}`;
  const cogDir = `${ROOT}/cognate/screenshots/${viewport}`;
  const diffDir = `${ROOT}/diffs/${viewport}`;
  if (!existsSync(refDir) || !existsSync(cogDir)) continue;
  mkdirSync(diffDir, { recursive: true });

  const refFiles = new Set(readdirSync(refDir).filter((f) => f.endsWith(".png")));
  const cogFiles = new Set(readdirSync(cogDir).filter((f) => f.endsWith(".png")));
  const shared = [...refFiles].filter((f) => cogFiles.has(f)).sort();

  for (const file of shared) {
    const name = file.replace(/\.png$/, "");
    const refImg = loadPng(`${refDir}/${file}`);
    const cogImg = loadPng(`${cogDir}/${file}`);
    const width = Math.max(refImg.width, cogImg.width);
    const height = Math.max(refImg.height, cogImg.height);
    const refPadded = padCanvas(refImg, width, height);
    const cogPadded = padCanvas(cogImg, width, height);
    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(refPadded.data, cogPadded.data, diff.data, width, height, { threshold: 0.1 });
    const diffPct = (diffPixels / (width * height)) * 100;
    writeFileSync(`${diffDir}/${file}`, sideBySide(refPadded, cogPadded, diff));
    rows.push({
      viewport,
      name,
      diffPct,
      refDims: `${refImg.width}x${refImg.height}`,
      cogDims: `${cogImg.width}x${cogImg.height}`,
      note: refImg.width !== cogImg.width || refImg.height !== cogImg.height ? "dimensions differ (padded before diff)" : "",
    });
    console.log(`[compare] ${viewport}/${name}: ${diffPct.toFixed(2)}% differing pixels`);
  }

  const refOnly = [...refFiles].filter((f) => !cogFiles.has(f));
  const cogOnly = [...cogFiles].filter((f) => !refFiles.has(f));
  for (const f of refOnly) console.log(`[compare] ${viewport}/${f}: reference-only checkpoint (no Cognate capture yet)`);
  for (const f of cogOnly) console.log(`[compare] ${viewport}/${f}: Cognate-only checkpoint (no reference capture)`);
}

const byViewport = new Map<string, Row[]>();
for (const row of rows) {
  const list = byViewport.get(row.viewport) ?? [];
  list.push(row);
  byViewport.set(row.viewport, list);
}

let md = "# Visual parity summary (Cognate vs. reference)\n\n";
md += "Evidence only — no pixel-similarity threshold (spec Phase 7). Each row's `diffs/<viewport>/<name>.png` is a reference | cognate | pixel-diff triptych; read it before judging a row.\n\n";
for (const [viewport, list] of byViewport) {
  md += `## ${viewport}\n\n`;
  md += "| checkpoint | differing pixels | dimensions (ref / cognate) | note |\n";
  md += "|---|---|---|---|\n";
  for (const row of list.sort((a, b) => a.name.localeCompare(b.name))) {
    md += `| ${row.name} | ${row.diffPct.toFixed(2)}% | ${row.refDims} / ${row.cogDims} | ${row.note} |\n`;
  }
  md += "\n";
}
writeFileSync(`${ROOT}/diffs/summary.md`, md);
console.log(`[compare] wrote ${ROOT}/diffs/summary.md (${rows.length} shared checkpoints)`);
