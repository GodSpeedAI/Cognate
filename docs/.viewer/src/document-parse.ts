/**
 * Parsing that both ends of the viewer share — pure string work, no DOM, no bundler tricks.
 *
 * The server builds its startup index from these functions and the browser renderer uses the
 * same ones, so a heading's anchor, a document's title, and a document's plain text cannot
 * disagree depending on which end computed them.
 */
import { parse as parseYaml } from "yaml";

export interface Frontmatter {
  /** Parsed YAML object, or null when the document has no frontmatter. */
  data: Record<string, unknown> | null;
  /** The raw frontmatter block without the fences, or null. */
  raw: string | null;
  /** The document body with the frontmatter block removed. */
  body: string;
  /** Reported instead of silently dropping a block that does not parse. */
  error?: string;
}

export interface Heading {
  depth: number;
  text: string;
  /** Anchor id, unique within the document, matching the ids the renderer assigns. */
  slug: string;
}

/** Split leading YAML frontmatter from a Markdown document. Documents without it pass through. */
export function splitFrontmatter(source: string): Frontmatter {
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { data: null, raw: null, body: source };
  const raw = match[1] ?? "";
  const body = source.slice(match[0].length);
  try {
    const parsed: unknown = parseYaml(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { data: null, raw, body, error: "Frontmatter is not a YAML mapping." };
    }
    return { data: parsed as Record<string, unknown>, raw, body };
  } catch (error) {
    return { data: null, raw, body, error: error instanceof Error ? error.message : String(error) };
  }
}

/** GitHub-compatible heading anchor: lowercase, punctuation removed, spaces to dashes. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~$]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** Unique anchor id for a heading, using one shared counter per document. */
export function slugFor(text: string, seen: Map<string, number>): string {
  const base = slugify(text) || "section";
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/** Lines considered headings are those outside frontmatter and outside fenced code. */
export function extractHeadings(source: string): Heading[] {
  const seen = new Map<string, number>();
  const headings: Heading[] = [];
  for (const line of scanLines(splitFrontmatter(source).body)) {
    if (line.fenced) continue;
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line.text);
    if (!match) continue;
    const text = inlineText(match[2] ?? "");
    headings.push({ depth: (match[1] ?? "#").length, text, slug: slugFor(text, seen) });
  }
  return headings;
}

export interface ScannedLine {
  text: string;
  /** True inside a fenced block or on a fence marker itself. */
  fenced: boolean;
}

/** Line scan that knows about fenced code so `#` inside a shell example is never a heading. */
export function scanLines(body: string): ScannedLine[] {
  const lines: ScannedLine[] = [];
  let fence: string | null = null;
  for (const text of body.split("\n")) {
    const marker = /^\s{0,3}((`{3,})|(~{3,}))/.exec(text);
    if (fence === null) {
      if (marker) {
        fence = (marker[2] ?? marker[3] ?? "").slice(0, 3);
        lines.push({ text, fenced: true });
        continue;
      }
      lines.push({ text, fenced: false });
      continue;
    }
    const closing = marker && (marker[2] ?? marker[3] ?? "").startsWith(fence);
    lines.push({ text, fenced: true });
    if (closing) fence = null;
  }
  return lines;
}

/** Strip the Markdown that would otherwise pollute a heading, a title, or a search hit. */
/** Strip the Markdown that would otherwise pollute a heading, a title, or a search hit. */
export function inlineText(input: string): string {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fenced languages in document order, plus the count of Mermaid blocks (a first-class artifact). */
export function fenceInfo(source: string): { languages: string[]; mermaid: number; codeBlocks: number } {
  const languages: string[] = [];
  let mermaid = 0;
  let open = false;
  for (const line of scanLines(splitFrontmatter(source).body)) {
    if (!line.fenced) continue;
    const marker = /^\s{0,3}((`{3,})|(~{3,}))\s*([^\s`~]*)/.exec(line.text);
    if (open) {
      if (marker?.length && /^\s{0,3}(`{3,}|~{3,})\s*$/.test(line.text)) open = false;
      continue;
    }
    if (!marker) continue;
    open = true;
    const language = (marker[4] ?? "").trim().toLowerCase();
    languages.push(language || "text");
    if (language === "mermaid") mermaid += 1;
  }
  return { languages, mermaid, codeBlocks: languages.length };
}

/** GFM tables, counted by their delimiter row. */
export function countTables(source: string): number {
  const lines = scanLines(splitFrontmatter(source).body);
  let tables = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const current = lines[index];
    const previous = lines[index - 1];
    if (!current || !previous || current.fenced || previous.fenced) continue;
    if (!current.text.includes("|")) continue;
    if (/^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(current.text) && previous.text.includes("|")) tables += 1;
  }
  return tables;
}

/** Searchable prose: Markdown syntax removed, code text kept, whitespace collapsed. */
export function plainText(source: string): string {
  const out: string[] = [];
  for (const line of scanLines(splitFrontmatter(source).body)) {
    const text = line.fenced ? line.text.replace(/^\s{0,3}(`{3,}|~{3,})\s*[^\s`~]*/, "") : line.text.replace(/^\s{0,3}#{1,6}\s+/, "");
    out.push(inlineText(text.replace(/^\s*\|/, "").replace(/\|\s*$/, "").replace(/\|/g, " ")));
  }
  return out.filter((line) => line !== "").join("\n").replace(/\n{3,}/g, "\n\n").slice(0, 60_000);
}

/** Resolve a relative Markdown target against the document that contains it (POSIX, no Node path). */
export function resolveRelative(fromRepoPath: string, target: string): string {
  const base = fromRepoPath.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") base.pop();
    else base.push(segment);
  }
  return base.join("/");
}

export interface DocumentLinks {
  /** Targets inside the documentation root, repository-relative, deduplicated. */
  internal: string[];
  /** Targets outside the documentation root or on the web: kept, never silently dropped. */
  external: string[];
  /** Image sources, resolved the same way as links. */
  images: string[];
}

export function extractLinks(source: string, repoPath: string): DocumentLinks {
  const internal = new Set<string>();
  const external = new Set<string>();
  const images = new Set<string>();
  for (const line of scanLines(splitFrontmatter(source).body)) {
    for (const match of line.text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const raw = match[1];
      if (!raw || raw.startsWith("#")) continue;
      const isImage = line.text.slice(Math.max(0, match.index - 1), match.index) === "!";
      const target = raw.split("#")[0] ?? "";
      if (target === "") continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
        external.add(target);
        continue;
      }
      const resolved = resolveRelative(repoPath, target);
      if (isImage) images.add(resolved);
      if (resolved.startsWith("docs/")) internal.add(resolved);
      else external.add(resolved);
    }
  }
  return { internal: [...internal], external: [...external], images: [...images] };
}

/** Document title: explicit frontmatter `title`, else the first heading, else the file name. */
export function documentTitle(frontmatter: Record<string, unknown> | null, headings: readonly Heading[], repoPath: string): string {
  const declared = frontmatter?.title;
  if (typeof declared === "string" && declared.trim() !== "") return inlineText(declared);
  const first = headings.find((heading) => heading.depth === 1) ?? headings[0];
  if (first) return first.text;
  return (repoPath.split("/").pop() ?? repoPath).replace(/\.md$/i, "");
}
