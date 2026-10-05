/**
 * Small DOM helpers. The viewer builds nodes rather than HTML strings everywhere except the
 * one place a projection is inserted (sanitized Markdown), so text from a document never
 * becomes markup by accident.
 */

type Attrs = Record<string, string | number | boolean | null | undefined>;

export interface ElementOptions {
  class?: string;
  text?: string;
  attrs?: Attrs;
  children?: readonly (Node | null | undefined)[];
  on?: Partial<Record<"click" | "input" | "change" | "keydown" | "submit", (event: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const [event, handler] of Object.entries(options.on ?? {})) {
    if (handler) node.addEventListener(event, handler);
  }
  for (const child of options.children ?? []) if (child) node.appendChild(child);
  return node;
}

/** One inline SVG reference to a symbol defined in index.html. */
export function icon(name: string, size = 15): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon-button__glyph");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${name}`);
  svg.appendChild(use);
  return svg;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function replace(container: Element, children: readonly (Node | null | undefined)[]): void {
  clear(container);
  for (const child of children) if (child) container.appendChild(child);
}

export function must<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as unknown as T;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Commit timestamps are shown as dates: provenance, not document semantics. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE.format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** A hairline-labelled key/value row, used by every context panel. */
export function recordRow(key: string, value: string, mono = false): HTMLElement {
  return el("div", {
    class: "record__row",
    children: [el("dt", { class: "record__key", text: key }), el("dd", { class: mono ? "record__value record__value--mono" : "record__value", text: value })],
  });
}
