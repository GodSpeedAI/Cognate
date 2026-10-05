#!/usr/bin/env node
/**
 * Visual parity comparison (plan R4, settlement gates 20-21).
 *
 * For every checkpoint present in BOTH reference/screenshots/ and cognate/screenshots/, writes a
 * reference | cognate | pixel-diff triptych to diffs/<name>.png and a diffs/summary.md table
 * (checkpoint, differing-pixel %, dimensions, note). Technique follows the deepseek-harness
 * precedent; run with node (pngjs/pixelmatch come from repo-root node_modules).
 *
 * The pixel percentage is EVIDENCE, not a gate: there is no threshold (reconstruction prompt
 * Phase 11). Structural parity is judged by reading the triptychs; divergences are dispositioned
 * in diffs/DISPOSITIONS.md — fixed or named, never masked.
 *
 * Usage: node capture/compare.mjs
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COPILOT = path.resolve(HERE, "..");
const REF = path.join(COPILOT, "reference", "screenshots");
const COG = path.join(COPILOT, "cognate", "screenshots");
const DIFFS = path.join(COPILOT, "diffs");
const require = createRequire(import.meta.url);
const { PNG } = require(path.join(COPILOT, "..", "..", "..", "node_modules", "pngjs"));
const pixelmatch = require(path.join(COPILOT, "..", "..", "..", "node_modules", "pixelmatch"));

const JOURNEY_OF = (name) => name.slice(0, name.indexOf("-", 3) === -1 ? name.length : name.indexOf("-", 3));
const VIEWPORT_OF = (name) => (name.includes("mobile") ? "mobile" : "desktop");

function loadPng(file) {
  return PNG.sync.read(readFileSync(file));
}

function padCanvas(img, width, height) {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height });
  out.data.fill(255);
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}

function triptych(ref, cog, diff) {
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

mkdirSync(DIFFS, { recursive: true });

const refFiles = new Set(existsSync(REF) ? readdirSync(REF).filter((f) => f.endsWith(".png")) : []);
const cogFiles = new Set(existsSync(COG) ? readdirSync(COG).filter((f) => f.endsWith(".png")) : []);
const shared = [...refFiles].filter((f) => cogFiles.has(f)).sort();
const refOnly = [...refFiles].filter((f) => !cogFiles.has(f)).sort();
const cogOnly = [...cogFiles].filter((f) => !refFiles.has(f)).sort();

const rows = [];
for (const file of shared) {
  const name = file.replace(/\.png$/, "");
  const refImg = loadPng(path.join(REF, file));
  const cogImg = loadPng(path.join(COG, file));
  const width = Math.max(refImg.width, cogImg.width);
  const height = Math.max(refImg.height, cogImg.height);
  const refPadded = padCanvas(refImg, width, height);
  const cogPadded = padCanvas(cogImg, width, height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(refPadded.data, cogPadded.data, diff.data, width, height, { threshold: 0.1 });
  const diffPct = (diffPixels / (width * height)) * 100;
  writeFileSync(path.join(DIFFS, file), triptych(refPadded, cogPadded, diff));
  const dimsDiffer = refImg.width !== cogImg.width || refImg.height !== cogImg.height;
  rows.push({
    journey: JOURNEY_OF(name),
    viewport: VIEWPORT_OF(name),
    name,
    diffPct,
    refDims: `${refImg.width}x${refImg.height}`,
    cogDims: `${cogImg.width}x${cogImg.height}`,
    note: dimsDiffer ? "dimensions differ (padded before diff)" : "",
  });
  console.log(`[compare] ${name}: ${diffPct.toFixed(2)}% differing pixels`);
}
for (const f of refOnly) console.log(`[compare] ${f}: reference-only checkpoint (no Cognate capture — dispositioned in DISPOSITIONS.md)`);
for (const f of cogOnly) console.log(`[compare] ${f}: Cognate-only checkpoint (no reference capture)`);

let md = "# Visual parity summary (Cognate vs. reference)\n\n";
md += "Evidence only — there is no pixel-similarity threshold (reconstruction prompt Phase 11). Each row links the `diffs/<name>.png` triptych (reference | Cognate | pixel diff); structural parity is judged by reading the triptychs, and every visible structural divergence is dispositioned in [DISPOSITIONS.md](DISPOSITIONS.md) as fixed or as a named deviation — never masked.\n\n";
md += `Reference checkpoints: ${refFiles.size} · Cognate captures: ${cogFiles.size} · shared triptychs: ${shared.length} · reference-only: ${refOnly.length} · Cognate-only: ${cogOnly.length}.\n\n`;

md += "## Checkpoints (both sides)\n\n";
md += "| checkpoint | viewport | differing pixels | dimensions (ref / cognate) | note |\n";
md += "|---|---|---|---|---|\n";
for (const row of rows) {
  md += `| ${row.name} | ${row.viewport} | ${row.diffPct.toFixed(2)}% | ${row.refDims} / ${row.cogDims} | ${row.note} |\n`;
}

md += "\n## Reference-only checkpoints (no Cognate capture)\n\n";
md += "| checkpoint | viewport | reason |\n";
md += "|---|---|---|\n";
for (const f of refOnly) {
  const name = f.replace(/\.png$/, "");
  md += `| ${name} | ${VIEWPORT_OF(name)} | pending state not photographable on the Cognate surface (see DISPOSITIONS.md) |\n`;
}

if (cogOnly.length > 0) {
  md += "\n## Cognate-only checkpoints (no reference capture)\n\n";
  md += "| checkpoint | viewport |\n|---|---|\n";
  for (const f of cogOnly) {
    const name = f.replace(/\.png$/, "");
    md += `| ${name} | ${VIEWPORT_OF(name)} |\n`;
  }
}

md += "\n## Responsive equivalence (gate 21: every journey has a desktop AND a mobile row)\n\n";
md += "| journey | desktop rows | mobile rows | reference-only (desktop/mobile) |\n";
md += "|---|---|---|---|\n";
const journeys = [...new Set([...rows.map((r) => r.journey), ...refOnly.map((f) => JOURNEY_OF(f.replace(/\.png$/, "")))])].sort();
for (const journey of journeys) {
  const desk = rows.filter((r) => r.journey === journey && r.viewport === "desktop").length;
  const mob = rows.filter((r) => r.journey === journey && r.viewport === "mobile").length;
  const refDesk = refOnly.filter((f) => JOURNEY_OF(f.replace(/\.png$/, "")) === journey && VIEWPORT_OF(f) === "desktop").length;
  const refMob = refOnly.filter((f) => JOURNEY_OF(f.replace(/\.png$/, "")) === journey && VIEWPORT_OF(f) === "mobile").length;
  md += `| ${journey} | ${desk} | ${mob} | ${refDesk}/${refMob} |\n`;
}

writeFileSync(path.join(DIFFS, "summary.md"), md);
console.log(`[compare] wrote ${path.join(DIFFS, "summary.md")} (${shared.length} triptychs, ${refOnly.length} reference-only, ${cogOnly.length} cognate-only)`);
