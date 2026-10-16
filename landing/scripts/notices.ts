// Writes dist/THIRD_PARTY_NOTICES.txt and dist/licenses/OFL-*.txt after `astro build`.
// Every runtime package that ends up in dist/ gets its license text here. The build fails if a license file is missing,
// so the notice cannot silently fall out of date.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const landingDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = resolve(landingDir, 'node_modules');
const distDir = resolve(landingDir, 'dist');
const licensesDir = resolve(landingDir, 'licenses');

type Runtime = {
  name: string;
  /** Where the license text comes from: a file in node_modules, or a vendored file in landing/licenses/. */
  text: { from: 'node_modules' | 'vendored'; file: string };
  /** The license as declared, used when the text is not the verbatim package LICENSE. */
  license: string;
  /** Copyright line, when the LICENSE file does not carry one in its first lines. */
  copyright?: string;
  /** Where the package code ends up, for the reader. */
  shipped: string;
};

// Runtime packages whose code is in dist/_astro/*.js. Transitive packages are listed because they are bundled.
export const RUNTIME_PACKAGES: Runtime[] = [
  { name: 'astro', text: { from: 'node_modules', file: 'astro/LICENSE' }, license: 'MIT', shipped: 'client runtime (dist/_astro/client.*.js)' },
  { name: '@astrojs/react', text: { from: 'node_modules', file: '@astrojs/react/LICENSE' }, license: 'MIT', shipped: 'React island hydration' },
  { name: 'react', text: { from: 'node_modules', file: 'react/LICENSE' }, license: 'MIT', shipped: 'dist/_astro/react.*.js' },
  { name: 'react-dom', text: { from: 'node_modules', file: 'react-dom/LICENSE' }, license: 'MIT', shipped: 'dist/_astro/react-dom.*.js' },
  { name: 'scheduler', text: { from: 'node_modules', file: 'scheduler/LICENSE' }, license: 'MIT', shipped: 'inlined in the react-dom chunk' },
  {
    name: '@bsmnt/scrollytelling',
    text: { from: 'vendored', file: 'scrollytelling-MIT.txt' },
    license: 'MIT',
    copyright: 'Copyright (c) 2023 basement.studio',
    shipped: 'scroll pinning for Sequence C and G (dist/_astro/*.js)',
  },
  { name: '@radix-ui/react-slot', text: { from: 'node_modules', file: '@radix-ui/react-slot/LICENSE' }, license: 'MIT', shipped: 'inlined via scrollytelling' },
  { name: '@radix-ui/react-portal', text: { from: 'node_modules', file: '@radix-ui/react-portal/LICENSE' }, license: 'MIT', shipped: 'inlined via scrollytelling' },
  { name: '@radix-ui/react-primitive', text: { from: 'node_modules', file: '@radix-ui/react-primitive/LICENSE' }, license: 'MIT', shipped: 'inlined via scrollytelling' },
  { name: '@radix-ui/react-compose-refs', text: { from: 'node_modules', file: '@radix-ui/react-compose-refs/LICENSE' }, license: 'MIT', shipped: 'inlined via scrollytelling' },
  { name: '@radix-ui/react-use-layout-effect', text: { from: 'node_modules', file: '@radix-ui/react-use-layout-effect/LICENSE' }, license: 'MIT', shipped: 'inlined via scrollytelling' },
  {
    name: 'gsap',
    text: { from: 'vendored', file: 'GSAP-standard-no-charge.txt' },
    license: "Standard 'No Charge' GSAP License (https://gsap.com/standard-license); not an OSI license",
    copyright: 'Copyright Webflow, Inc. (GreenSock)',
    shipped: 'scroll choreography (dist/_astro/*.js, 3.15.0)',
  },
];

// Fonts shipped in dist/ (imported in src/layouts/Base.astro). Each one is SIL OFL 1.1; tests/notices.test.ts checks this list against the imports.
export const FONT_FAMILIES = [
  { name: 'Josefin Sans', pkg: '@fontsource-variable/josefin-sans', slug: 'josefin-sans', use: 'display headings and signal lines' },
  { name: 'IBM Plex Sans', pkg: '@fontsource/ibm-plex-sans', slug: 'ibm-plex-sans', use: 'body and functional headings' },
  { name: 'IBM Plex Mono', pkg: '@fontsource/ibm-plex-mono', slug: 'ibm-plex-mono', use: 'evidence, code and diagram labels' },
  { name: 'Josefin Slab', pkg: '@fontsource/josefin-slab', slug: 'josefin-slab', use: 'editorial accent' },
] as const;

// Workbench captures: Apache-2.0, copied with `git show <sha>:<path>` (see PROVENANCE.md).
export const WORKBENCH = {
  owner: 'GodSpeedAI',
  repo: 'https://github.com/GodSpeedAI/Cognate-Workbench',
  licenseSha: 'd208cd0491d5d76839ed4dedbababc589383ad09',
  expertTeamsSha: 'fdc709b9ccff47d52619185f6e9e03fdd9ae8d08',
  files: [
    'captures/workbench/e2e-03-contract-complete.png',
    'captures/workbench/e2e-05-authority-and-blocked.png',
    'captures/workbench/e2e-07-review-gate.png',
    'captures/workbench/e2e-08-accepted.png',
    'captures/workbench-expert-teams/default-team-desktop.png',
    'captures/workbench-expert-teams/team-conversation-handoff-desktop.png',
  ],
};

function readText(path: string): string {
  if (!existsSync(path)) throw new Error(`notices: missing license file ${path}`);
  return readFileSync(path, 'utf8').replace(/\s+$/u, '');
}

function pkgVersion(name: string): string {
  const pj = resolve(nodeModules, name, 'package.json');
  return existsSync(pj) ? (JSON.parse(readFileSync(pj, 'utf8')).version as string) : 'unknown';
}

function licenseBody(r: Runtime): string {
  if (r.text.from === 'node_modules') return readText(resolve(nodeModules, r.text.file));
  return readText(resolve(licensesDir, r.text.file));
}

export function buildNotices(): string {
  const out: string[] = [];
  out.push('THIRD-PARTY NOTICES');
  out.push('Cognate landing site (dist/). Generated by scripts/notices.ts at build time.');
  out.push('');
  out.push('Contents');
  out.push('  1. Runtime JavaScript packages bundled into dist/_astro/*.js');
  out.push('  2. Fonts (SIL Open Font License 1.1), self-hosted as woff2 under dist/_astro/');
  out.push('  3. Workbench screenshots (Apache License 2.0)');
  out.push('');
  out.push('Packages that appear in the shipped JavaScript, each with its license text.');
  out.push('');

  for (const r of RUNTIME_PACKAGES) {
    const version = pkgVersion(r.name);
    out.push('================================================================');
    out.push(`${r.name} ${version}`);
    out.push(`License: ${r.license}`);
    if (r.copyright) out.push(r.copyright);
    out.push(`Where it ships: ${r.shipped}`);
    out.push('----------------------------------------------------------------');
    out.push(licenseBody(r));
    out.push('');
  }

  out.push('================================================================');
  out.push('FONTS (SIL Open Font License 1.1)');
  out.push('Each family is self-hosted from its @fontsource-variable package. Full OFL text per family is in');
  out.push('dist/licenses/OFL-<family>.txt next to this file.');
  out.push('');
  for (const f of FONT_FAMILIES) {
    const version = pkgVersion(f.pkg);
    out.push('----------------------------------------------------------------');
    out.push(`${f.name} ${version} (${f.use}) - ${f.pkg}`);
    out.push('----------------------------------------------------------------');
    out.push(readText(resolve(nodeModules, f.pkg, 'LICENSE')));
    out.push('');
  }

  out.push('================================================================');
  out.push('WORKBENCH SCREENSHOTS (Apache License 2.0)');
  out.push(`Copyright ${WORKBENCH.owner}. Source: ${WORKBENCH.repo}`);
  out.push(`Files, copied byte-for-byte from the repository at the commits below:`);
  out.push(`  - commit ${WORKBENCH.licenseSha} (main): ${WORKBENCH.files.slice(0, 4).join(', ')}`);
  out.push(`  - commit ${WORKBENCH.expertTeamsSha} (unmerged branch): ${WORKBENCH.files.slice(4).join(', ')}`);
  out.push('Modified files: the WebP files under captures/ are lossy re-encodings (WebP, quality 0.9) of the PNG');
  out.push('files above. The PNG pixels were not edited.');
  out.push('');
  out.push('The Apache License 2.0 text follows. Cognate is Apache-2.0 as well; this is the same text');
  out.push('(verified identical to the Workbench LICENSE at the commit above).');
  out.push('----------------------------------------------------------------');
  out.push(readText(resolve(licensesDir, 'Apache-2.0.txt')));
  out.push('');
  return out.join('\n');
}

export function writeNotices(outDir = distDir): void {
  mkdirSync(resolve(outDir, 'licenses'), { recursive: true });
  writeFileSync(resolve(outDir, 'THIRD_PARTY_NOTICES.txt'), buildNotices());
  for (const f of FONT_FAMILIES) {
    copyFileSync(resolve(nodeModules, f.pkg, 'LICENSE'), resolve(outDir, 'licenses', `OFL-${f.slug}.txt`));
  }
  copyFileSync(resolve(licensesDir, 'Apache-2.0.txt'), resolve(outDir, 'licenses', 'Apache-2.0.txt'));
}

if (import.meta.main) {
  writeNotices();
  console.log(`notices: wrote ${resolve(distDir, 'THIRD_PARTY_NOTICES.txt')} and ${FONT_FAMILIES.length} OFL files`);
}
