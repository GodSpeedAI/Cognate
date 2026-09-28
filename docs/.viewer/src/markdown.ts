/**
 * The Read projection: Markdown in, DOM out.
 *
 * This is the only renderer. A document read from the working tree and a document read from an
 * old commit both arrive here as Markdown and leave through this same pipeline; nothing in this
 * file can tell the difference, and nothing here changes the canonical source.
 *
 * Order of work: parse (marked) → sanitize (DOMPurify) → transform the DOM (anchors, links,
 * images, code, tables, Mermaid frames). Sanitizing before transforming means document-supplied
 * markup never survives as markup, and the transformations add only what the viewer itself owns.
 */
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import protobuf from "highlight.js/lib/languages/protobuf";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import { marked } from "marked";
import { documentTitle, resolveRelative, slugFor, splitFrontmatter, type Heading } from "./document-parse.ts";
import { el } from "./dom.ts";
import { api } from "./sources.ts";

for (const [name, language] of Object.entries({ bash, diff, javascript, json, markdown, plaintext, protobuf, python, rust, sql, typescript, yaml })) {
  hljs.registerLanguage(name, language as never);
}
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["js", "jsx"], { languageName: "javascript" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["text", "txt", "log"], { languageName: "plaintext" });
hljs.registerAliases(["proto"], { languageName: "protobuf" });
hljs.registerAliases(["md"], { languageName: "markdown" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["rs"], { languageName: "rust" });

marked.use({ gfm: true, breaks: false });

/** What the viewer keeps out of a document: anything that could execute or phone home. */
const SANITIZE = {
  ADD_ATTR: ["id", "class", "colspan", "rowspan", "align", "start", "checked", "disabled"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "base", "form", "input", "button", "select", "textarea"],
  FORBID_ATTR: ["style", "srcset", "onerror", "onload", "onclick"],
  ALLOW_DATA_ATTR: false,
};

export interface ChildArtifact {
  type: "mermaid" | "code" | "table" | "image";
  /** For Mermaid: the canonical diagram source, exactly as it appears in the Markdown. */
  source: string;
  language: string;
  lines: number;
  element: HTMLElement;
  label: string;
}

export interface DocumentLink {
  text: string;
  path?: string;
  anchor?: string;
  href: string;
  outside?: string;
}

export interface RenderedDocument {
  /** The container holding the sanitized projection; insert this, never raw HTML strings. */
  fragment: HTMLElement;
  title: string;
  frontmatter: Record<string, unknown> | null;
  frontmatterError?: string;
  headings: Heading[];
  artifacts: ChildArtifact[];
  internalLinks: DocumentLink[];
  externalLinks: DocumentLink[];
  element: HTMLElement;
}

function highlight(code: string, language: string): string | null {
  if (!language || !hljs.getLanguage(language)) return null;
  try {
    return DOMPurify.sanitize(hljs.highlight(code, { language, ignoreIllegals: true }).value, SANITIZE);
  } catch {
    return null;
  }
}

/** A fenced block becomes a framed code artifact with its language as the only chrome. */
function codeBlock(source: string, language: string): HTMLElement {
  const label = language || "text";
  const value = el("code", { attrs: { class: `language-${label}` } });
  const highlighted = highlight(source, language);
  if (highlighted === null) value.textContent = source;
  else value.innerHTML = highlighted;

  const copy = el("button", { class: "icon-button", text: "Copy", attrs: { type: "button", "aria-label": `Copy ${label} code block` } });
  copy.addEventListener("click", () => {
    navigator.clipboard.writeText(source).then(
      () => {
        copy.textContent = "Copied";
        window.setTimeout(() => { copy.textContent = "Copy"; }, 1200);
      },
      () => {
        copy.textContent = "Copy failed";
        window.setTimeout(() => { copy.textContent = "Copy"; }, 1600);
      },
    );
  });

  const pre = el("pre", { children: [value] });
  const frame = el("div", {
    class: "code-block",
    children: [el("div", { class: "code-block__head", children: [el("span", { text: label }), copy] }), pre],
  });
  frame.dataset.artifact = "code";
  frame.tabIndex = 0;
  return frame;
}

export interface RenderOptions {
  /** Repository-relative path of the document, used to resolve its own relative links. */
  path: string;
  /** Repository-relative prefix owned by the documentation root, e.g. `docs`. */
  rootPrefix: string;
}

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/** The shareable URL for a document inside the viewer, including its anchor. */
export function appHref(repoPath: string, anchor?: string): string {
  return `#/doc/${repoPath}${anchor ? `?anchor=${encodeURIComponent(anchor)}` : ""}`;
}

function classifyAnchor(anchor: HTMLAnchorElement, options: RenderOptions, internal: DocumentLink[], external: DocumentLink[]): void {
  const raw = anchor.getAttribute("href") ?? "";
  const text = (anchor.textContent ?? "").trim();
  if (raw === "") return;
  if (raw.startsWith("#")) {
    anchor.dataset.anchor = raw.slice(1);
    internal.push({ text, anchor: raw.slice(1), href: raw });
    return;
  }
  if (EXTERNAL.test(raw) || raw.startsWith("//")) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.dataset.external = "true";
    external.push({ text, href: raw });
    return;
  }
  const [target = "", fragment = ""] = raw.split("#");
  const resolved = resolveRelative(options.path, target);
  const isDocument = /\.md$/i.test(resolved);
  if (isDocument && resolved.startsWith(`${options.rootPrefix}/`)) {
    anchor.dataset.docPath = resolved;
    if (fragment) anchor.dataset.anchor = fragment;
    anchor.setAttribute("href", appHref(resolved, fragment));
    internal.push({ text, path: resolved, ...(fragment ? { anchor: fragment } : {}), href: raw });
    return;
  }
  // A relative target outside the documentation root stays readable, and is never silently rewritten.
  anchor.dataset.outside = resolved;
  internal.push({ text, path: resolved, href: raw, outside: resolved });
}

function resolveImage(image: HTMLImageElement, options: RenderOptions): boolean {
  const src = image.getAttribute("src") ?? "";
  if (src === "") return false;
  if (EXTERNAL.test(src) || src.startsWith("//")) {
    image.dataset.external = "true";
    return true;
  }
  const resolved = resolveRelative(options.path, src.split("?")[0] ?? src);
  if (!resolved.startsWith(`${options.rootPrefix}/`)) {
    image.removeAttribute("src");
    image.dataset.missing = resolved;
    image.alt = `${image.alt || "Image"} — outside the documentation root: ${resolved}`;
    return false;
  }
  image.src = api.assetUrl(resolved);
  image.loading = "lazy";
  image.decoding = "async";
  if (!image.hasAttribute("alt")) image.setAttribute("alt", "");
  return true;
}

function tableLabel(table: HTMLTableElement): string {
  const caption = table.querySelector("caption")?.textContent?.trim();
  if (caption) return caption;
  const previous = table.previousElementSibling;
  const heading = previous && /^H[1-6]$/.test(previous.tagName) ? (previous.textContent ?? "").trim() : "";
  return heading ? `Table: ${heading}` : "Table";
}

/** A fenced Mermaid block becomes a diagram frame; the diagram is rendered after insertion. */
export function diagramFrame(index: number): { frame: HTMLElement; canvas: HTMLElement } {
  const canvas = el("div", { class: "diagram__canvas", attrs: { "data-diagram-canvas": "" } });
  const tools = el("span", { class: "diagram__tools" });
  const frame = el("figure", {
    class: "diagram",
    attrs: { "data-artifact": "mermaid", "data-state": "pending" },
    children: [el("div", { class: "diagram__head", children: [el("span", { text: `Mermaid${index > 0 ? ` ${index + 1}` : ""}` }), tools] }), canvas],
  });
  return { frame, canvas };
}

/**
 * Project Markdown into DOM. The returned fragment is sanitized and transformed, and every
 * source travels through this one call.
 */
export function renderMarkdown(source: string, options: RenderOptions): RenderedDocument {
  const frontmatter = splitFrontmatter(source);
  const html = marked.parse(frontmatter.body, { async: false });
  const template = document.createElement("template");
  template.innerHTML = DOMPurify.sanitize(html, SANITIZE) as unknown as string;
  const fragment = template.content;

  const headings: Heading[] = [];
  const artifacts: ChildArtifact[] = [];
  const internalLinks: DocumentLink[] = [];
  const externalLinks: DocumentLink[] = [];

  const seen = new Map<string, number>();
  for (const heading of Array.from(fragment.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))) {
    const text = (heading.textContent ?? "").trim();
    const slug = slugFor(text, seen);
    heading.id = slug;
    headings.push({ depth: Number(heading.tagName.slice(1)), text, slug });
  }

  let diagramIndex = 0;
  for (const code of Array.from(fragment.querySelectorAll("pre > code"))) {
    const pre = code.parentElement;
    if (!pre) continue;
    const languageClass = Array.from(code.classList).find((name) => name.startsWith("language-"));
    const language = (languageClass?.slice("language-".length) ?? "").toLowerCase();
    const text = code.textContent ?? "";
    if (language === "mermaid") {
      const { frame } = diagramFrame(diagramIndex);
      diagramIndex += 1;
      pre.replaceWith(frame);
      artifacts.push({ type: "mermaid", source: text, language: "mermaid", lines: text.split("\n").length, element: frame, label: `Mermaid diagram${diagramIndex > 1 ? ` ${diagramIndex}` : ""}` });
      continue;
    }
    const block = codeBlock(text, language);
    pre.replaceWith(block);
    artifacts.push({ type: "code", source: text, language: language || "text", lines: text.split("\n").length, element: block, label: `${language || "text"} · ${text.split("\n").length} lines` });
  }
  for (const pre of Array.from(fragment.querySelectorAll("pre"))) {
    if (pre.querySelector("code")) continue;
    const text = pre.textContent ?? "";
    const block = codeBlock(text, "");
    pre.replaceWith(block);
    artifacts.push({ type: "code", source: text, language: "text", lines: text.split("\n").length, element: block, label: `text · ${text.split("\n").length} lines` });
  }

  for (const anchor of Array.from(fragment.querySelectorAll<HTMLAnchorElement>("a[href]"))) classifyAnchor(anchor, options, internalLinks, externalLinks);

  for (const image of Array.from(fragment.querySelectorAll("img"))) {
    const available = resolveImage(image, options);
    const figure = el("figure", { class: "image-artifact" });
    image.replaceWith(figure);
    figure.appendChild(image);
    figure.appendChild(el("figcaption", { class: "empty-note", text: available ? (image.getAttribute("alt") ?? "") : (image.getAttribute("alt") ?? "Image unavailable") }));
    if (!available) figure.dataset.state = "missing";
    artifacts.push({ type: "image", source: image.getAttribute("src") ?? "", language: "", lines: 1, element: figure, label: image.getAttribute("alt") || "image" });
  }

  let tableIndex = 0;
  for (const table of Array.from(fragment.querySelectorAll("table"))) {
    tableIndex += 1;
    const label = tableLabel(table) || `Table ${tableIndex}`;
    const scroll = el("div", { class: "table-scroll", attrs: { tabindex: "0", role: "region", "aria-label": label } });
    table.replaceWith(scroll);
    scroll.appendChild(table);
    artifacts.push({ type: "table", source: table.outerHTML, language: "", lines: table.querySelectorAll("tr").length, element: scroll, label });
  }

  artifacts.forEach((artifact, index) => {
    artifact.element.id = `viewer-artifact-${index + 1}`;
  });

  const element = el("div");
  element.appendChild(fragment);

  return {
    fragment: element,
    title: documentTitle(frontmatter.data, headings, options.path),
    frontmatter: frontmatter.data,
    ...(frontmatter.error ? { frontmatterError: frontmatter.error } : {}),
    headings,
    artifacts,
    internalLinks,
    externalLinks,
    element,
  };
}
