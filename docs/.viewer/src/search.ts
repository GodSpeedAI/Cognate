/**
 * In-memory search over the startup index. Built once when the viewer loads, from the same
 * index the server assembled from the real files; nothing is persisted and nothing re-reads
 * the corpus. At this repository's scale, a linear scan with small per-field weights is both
 * fast enough and honest about what matched — there is no ranking magic to debug.
 */
import type { IndexEntry, IndexResponse } from "./wire.ts";

interface Field {
  /** Lower-cased text to match against. */
  haystack: string;
  /** Raw text to display a snippet from (original case). */
  display: string;
  weight: number;
  /** Which annotation a match here earns. */
  why: string;
}

interface Record_ {
  entry: IndexEntry;
  fields: Field[];
}

export interface SearchResult {
  path: string;
  title: string;
  /** The heading whose text matched, if any; app.ts resolves it to the rendered slug. */
  headingText?: string;
  snippet?: string;
  /** What made this result match — shown as the result's quiet annotation. */
  why: string;
  score: number;
}

export class SearchIndex {
  private readonly records = new Map<string, Record_>();
  private readonly byPath = new Map<string, IndexEntry>();

  constructor(index: IndexResponse) {
    for (const entry of index.docs) {
      this.byPath.set(entry.path, entry);
      const fields: Field[] = [
        { haystack: entry.title.toLowerCase(), display: entry.title, weight: 8, why: "title" },
        { haystack: entry.path.toLowerCase(), display: entry.path, weight: 5, why: "path" },
        { haystack: entry.headings.join("\n").toLowerCase(), display: entry.headings.join(" · "), weight: 4, why: "heading" },
        { haystack: textOf(entry.frontmatter).toLowerCase(), display: textOf(entry.frontmatter), weight: 2, why: "metadata" },
        { haystack: entry.text.toLowerCase(), display: entry.text, weight: 1, why: "text" },
      ];
      this.records.set(entry.path, { entry, fields });
    }
  }

  get size(): number {
    return this.records.size;
  }

  entry(path: string): IndexEntry | undefined {
    return this.byPath.get(path);
  }

  /** Documents whose path contains the term — used by the tree filter, unscored. */
  pathsMatching(term: string): Set<string> {
    const needle = term.trim().toLowerCase();
    if (needle === "") return new Set(this.records.keys());
    return new Set([...this.records.keys()].filter((path) => path.toLowerCase().includes(needle)));
  }

  search(query: string, limit = 12): SearchResult[] {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token !== "");
    if (tokens.length === 0) return [];

    const results: SearchResult[] = [];
    for (const record of this.records.values()) {
      let total = 0;
      let why = "";
      let headingText: string | undefined;
      let snippet: string | undefined;
      let allMatch = true;
      for (const token of tokens) {
        let best = 0;
        for (const field of record.fields) {
          const position = field.haystack.indexOf(token);
          if (position === -1) continue;
          let value = field.weight;
          if (position === 0) value += 2; // a field that *starts* with the term deserves more
          if (value > best) {
            best = value;
            if (!why || field.weight > whyWeight(why)) why = field.why;
            if (field.why === "heading" && !headingText) {
              headingText = record.entry.headings.find((text) => text.toLowerCase().includes(token));
            }
            if (field.why === "text" && !snippet) snippet = excerpt(field.display, position, token.length);
          }
        }
        if (best === 0) {
          allMatch = false;
          break;
        }
        total += best;
      }
      if (!allMatch) continue;
      // An exact full-query title match is the strongest signal a human would confirm.
      if (record.entry.title.toLowerCase() === tokens.join(" ")) total += 20;
      results.push({
        path: record.entry.path,
        title: record.entry.title,
        ...(headingText ? { headingText } : {}),
        ...(snippet ? { snippet } : {}),
        why: headingText ? "heading" : snippet ? "text" : why || "match",
        score: total,
      });
    }

    return results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path)).slice(0, limit);
  }
}

function whyWeight(why: string): number {
  switch (why) {
    case "title":
      return 8;
    case "path":
      return 5;
    case "heading":
      return 4;
    case "metadata":
      return 2;
    default:
      return 0;
  }
}

function excerpt(text: string, position: number, length: number): string {
  const start = Math.max(0, position - 40);
  const end = Math.min(text.length, position + length + 80);
  const window = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${window}${end < text.length ? "…" : ""}`;
}

function textOf(frontmatter: Record<string, unknown> | null): string {
  if (!frontmatter) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") parts.push(`${key} ${value}`);
    else if (Array.isArray(value)) parts.push(`${key} ${value.join(" ")}`);
  }
  return parts.join("\n");
}
