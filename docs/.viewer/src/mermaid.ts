/**
 * Mermaid is a first-class artifact: the fenced block in the Markdown remains canonical and
 * this module projects it into a real diagram. The same entry point serves a diagram inside a
 * working-tree document and inside an old Git revision, because by the time content gets here
 * both are just Markdown that has already been through the one renderer.
 *
 * Rendering is defensive: mermaid runs with `securityLevel: "strict"` (its own sanitisation of
 * generated SVG), a failed diagram keeps its canonical source on screen with the parse error
 * beside it, and nothing here rewrites the document.
 */
import mermaid from "mermaid";

let counter = 0;
let initialized = false;

let colorProbe: CanvasRenderingContext2D | null = null;
/**
 * Mermaid's theme parser only understands hex/rgb/hsl, but the design tokens are oklch — and the
 * canvas serializer hands oklch right back. So rasterize one pixel and read the sRGB result: the
 * browser's own CSS parser decides, and an unparseable value silently keeps the hex fallback.
 */
function themedColor(value: string, fallback: string): string {
  const raw = value.trim() || fallback;
  if (!/oklch|lab\(|lch\(|color\(/i.test(raw)) return raw;
  try {
    colorProbe ??= document.createElement("canvas").getContext("2d");
    if (!colorProbe) return fallback;
    colorProbe.fillStyle = fallback;
    colorProbe.fillStyle = raw;
    colorProbe.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = colorProbe.getImageData(0, 0, 1, 1).data;
    if (!alpha) return fallback; // fully transparent means the parse failed open
    return `rgb(${red} ${green} ${blue})`;
  } catch {
    return fallback;
  }
}

function initialize(): void {
  if (initialized) return;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;
  const color = (name: string, fallback: string): string => themedColor(token(name, fallback), fallback);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: token("--font-body", "sans-serif"),
    themeVariables: {
      background: color("--color-paper", "#ffffff"),
      primaryColor: color("--color-paper-2", "#f2f2f2"),
      primaryBorderColor: color("--color-ink-2", "#555555"),
      primaryTextColor: color("--color-ink", "#111111"),
      secondaryColor: color("--color-paper-3", "#e7e7e7"),
      tertiaryColor: color("--color-paper", "#ffffff"),
      lineColor: color("--color-ink-2", "#555555"),
      edgeLabelBackground: color("--color-paper", "#ffffff"),
      clusterBkg: color("--color-paper-2", "#f2f2f2"),
      clusterBorder: color("--color-rule-2", "#cccccc"),
      titleColor: color("--color-ink", "#111111"),
      actorBorder: color("--color-ink-2", "#555555"),
      actorBkg: color("--color-paper", "#ffffff"),
      actorTextColor: color("--color-ink", "#111111"),
      signalColor: color("--color-ink-2", "#555555"),
      labelBoxBkgColor: color("--color-paper-2", "#f2f2f2"),
      labelBoxBorderColor: color("--color-rule-2", "#cccccc"),
      labelTextColor: color("--color-ink", "#111111"),
      loopTextColor: color("--color-ink", "#111111"),
      noteBkgColor: color("--color-paper-3", "#e7e7e7"),
      noteTextColor: color("--color-ink", "#111111"),
      activationBkgColor: color("--color-paper-3", "#e7e7e7"),
      sequenceNumberColor: color("--color-ink", "#111111"),
    },

    flowchart: { htmlLabels: true, useMaxWidth: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });
  initialized = true;
}

export interface DiagramResult {
  ok: boolean;
  svg?: string;
  error?: string;
}

/** Render one diagram source to SVG. Never throws; failures come back as data. */
export async function renderDiagram(source: string): Promise<DiagramResult> {
  initialize();
  counter += 1;
  const id = `cognate-diagram-${counter}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return { ok: true, svg };
  } catch (error) {
    // Mermaid leaves stray containers behind when a render throws.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    document.getElementById(`d${id}`)?.remove();
  }
}

// Kept local rather than importing dom.ts, so this module stays loadable beside mermaid alone.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { class?: string; text?: string; attrs?: Record<string, string>; children?: Node[]; on?: Record<string, (event: Event) => void> } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
  for (const [event, handler] of Object.entries(options.on ?? {})) node.addEventListener(event, handler);
  for (const child of options.children ?? []) node.appendChild(child);
  return node;
}


/**
 * Turn a diagram frame (as produced by the Markdown renderer) into a live diagram.
 * `onFocus` opens the framed view; when absent the focus tool is not shown, because a control
 * that does nothing is worse than no control.
 */
export async function mountDiagram(frame: HTMLElement, source: string, onFocus?: (source: string, svg: string) => void): Promise<DiagramResult> {
  const canvas = frame.querySelector<HTMLElement>("[data-diagram-canvas]");
  const tools = frame.querySelector<HTMLElement>(".diagram__head .diagram__tools");
  if (!canvas) return { ok: false, error: "Diagram frame has no canvas." };

  const result = await renderDiagram(source);

  if (!result.ok) {
    frame.dataset.state = "error";
    const message = el("p", { class: "diagram__error", text: `This diagram failed to render: ${result.error ?? "unknown error"}` });
    const pre = el("pre", { class: "diagram__source", children: [el("code", { text: source })] });
    canvas.replaceChildren(el("div", { class: "diagram__failure", children: [message, pre] }));
    tools?.appendChild(
      el("button", {
        class: "icon-button",
        text: "Retry",
        attrs: { type: "button" },
        on: {
          click: () => {
            frame.dataset.state = "pending";
            tools?.querySelectorAll("button").forEach((button) => button.remove());
            void mountDiagram(frame, source, onFocus);
          },
        },
      }),
    );
    return result;
  }

  const holder = el("div", { class: "diagram__svg", attrs: { role: "img", "aria-label": "Mermaid diagram" } });
  holder.innerHTML = result.svg ?? "";
  // The strict security level already sanitises; this is a second pass over mermaid's own output.
  holder.querySelectorAll("script").forEach((node) => node.remove());
  canvas.replaceChildren(holder);
  frame.dataset.state = "ready";

  tools?.appendChild(
    el("button", {
      class: "icon-button diagram__source-toggle",
      text: "Source",
      attrs: { type: "button", "aria-expanded": "false" },
      on: {
        click: (event) => {
          const button = event.currentTarget as HTMLButtonElement;
          const expanded = button.getAttribute("aria-expanded") === "true";
          button.setAttribute("aria-expanded", expanded ? "false" : "true");
          const existing = canvas.querySelector("pre.diagram__source");
          if (expanded || existing) existing?.remove();
          else canvas.appendChild(el("pre", { class: "diagram__source", children: [el("code", { text: source })] }));
        },
      },
    }),
  );

  if (onFocus) {
    tools?.appendChild(
      el("button", {
        class: "icon-button",
        text: "Focus",
        attrs: { type: "button", "aria-label": "View diagram in focus" },
        on: { click: () => onFocus(source, result.svg ?? "") },
      }),
    );
  }
  return result;
}
