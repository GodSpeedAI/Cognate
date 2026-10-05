/**
 * The documentation corpus: what the viewer discovers, once, when it starts.
 *
 * Discovery is derived from the documentation tree as it exists. Nothing here imposes a
 * hierarchy of its own, and nothing is cached on disk — the corpus is an in-memory index
 * over the files that are already the canonical source.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { countTables, documentTitle, extractHeadings, extractLinks, fenceInfo, plainText, splitFrontmatter } from "../../docs/.viewer/src/document-parse.ts";
import type { IndexEntry, IndexResponse } from "../../docs/.viewer/src/wire.ts";

export interface Corpus {
  /** Absolute documentation root. */
  root: string;
  /** Absolute repository root, assumed to be the documentation root's parent. */
  repositoryRoot: string;
  /** Repository-relative path prefix for everything under the root, e.g. `docs`. */
  prefix: string;
  docs: IndexEntry[];
  backlinks: Record<string, string[]>;
  byPath: Map<string, IndexEntry>;
  generatedAt: string;
}

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(path);
  }
  return files;
}

async function indexDocument(absolute: string, prefix: string, root: string): Promise<IndexEntry> {
  const source = await readFile(absolute, "utf8");
  const repoPath = `${prefix}/${relative(root, absolute).split(/[\\/]/).join("/")}`;
  const frontmatter = splitFrontmatter(source);
  const headings = extractHeadings(source);
  const fences = fenceInfo(source);
  const links = extractLinks(source, repoPath);
  const info = await stat(absolute);
  return {
    path: repoPath,
    title: documentTitle(frontmatter.data, headings, repoPath),
    headings: headings.map((heading) => heading.text),
    frontmatter: frontmatter.data,
    ...(frontmatter.error ? { frontmatterError: frontmatter.error } : {}),
    text: plainText(source),
    languages: [...new Set(fences.languages)],
    links: links.internal,
    externalTargets: links.external,
    diagramCount: fences.mermaid,
    tableCount: countTables(source),
    bytes: info.size,
    mtimeMs: Math.round(info.mtimeMs),
  };
}

export async function buildCorpus(root: string): Promise<Corpus> {
  const prefix = basename(root);
  const files = await walk(root);
  const docs = await Promise.all(files.sort().map((file) => indexDocument(file, prefix, root)));
  docs.sort((left, right) => left.path.localeCompare(right.path));
  const backlinks: Record<string, string[]> = {};
  for (const doc of docs) {
    for (const target of doc.links) {
      const entry = backlinks[target] ?? [];
      if (!entry.includes(doc.path)) entry.push(doc.path);
      backlinks[target] = entry;
    }
  }
  return {
    root,
    repositoryRoot: dirname(root),
    prefix,
    docs,
    backlinks,
    byPath: new Map(docs.map((doc) => [doc.path, doc])),
    generatedAt: new Date().toISOString(),
  };
}

/** The wire form of the index. Nothing else about the corpus travels to the browser. */
export function indexResponse(corpus: Corpus): IndexResponse {
  return { root: `${corpus.prefix}/`, generatedAt: corpus.generatedAt, docs: corpus.docs, backlinks: corpus.backlinks };
}
