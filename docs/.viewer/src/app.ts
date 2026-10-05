/**
 * Artifact Viewer — Documentation Mode: the browser application.
 *
 * One invariant drives this file:
 *
 *   ArtifactSource -> Artifact + Provenance -> Artifact Type -> Projection / Renderer
 *
 * A Markdown file from an old commit is still Markdown and travels through the exact same
 * `renderMarkdown` pipeline as the working-tree version; time/version facts are provenance
 * displayed *around* the artifact, never baked into it. The diff is its own artifact projected
 * beside the document, not a mutation of the Markdown renderer.
 *
 * There is no framework here: hash-based routing, one state object, and small render functions
 * over the fixed DOM in `index.html`. The server (`scripts/show-documents.ts`) is a bounded
 * local projection server; every claim it makes about Git is verified against Git directly.
 */
import { structuredPatch } from "diff";
import { clear, el, formatDate, formatDateTime, icon, must, plural, recordRow, replace } from "./dom.ts";
import { appHref, renderMarkdown, type RenderedDocument } from "./markdown.ts";
import { mountDiagram } from "./mermaid.ts";
import { plainText } from "./document-parse.ts";
import { SearchIndex, type SearchResult } from "./search.ts";
import { api, sourceFor, sourceLabel, ViewerError, workingTreeStateLabel } from "./sources.ts";
import { PROJECTIONS, type DocumentResponse, type HistoryResponse, type IndexEntry, type IndexResponse, type Projection, type RevisionRef } from "./wire.ts";

/* ── Route: URL is the state; refresh/back/forward must always be correct ── */

export interface Route {
  path: string | null;
  rev: string | null;
  mode: Projection;
  anchor: string | null;
  from: string | null;
  to: string | null;
}

function emptyRoute(): Route {
  return { path: null, rev: null, mode: "read", anchor: null, from: null, to: null };
}

function parseHash(): Route {
  const raw = location.hash.replace(/^#/, "");
  if (!raw.startsWith("/doc/")) return emptyRoute();
  const cut = raw.slice("/doc/".length);
  const question = cut.indexOf("?");
  const rawPath = question === -1 ? cut : cut.slice(0, question);
  const params = new URLSearchParams(question === -1 ? "" : cut.slice(question + 1));
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    /* a malformed escape still deserves an honest attempt at lookup */
  }
  const mode = params.get("mode");
  return {
    path: path || null,
    rev: params.get("rev"),
    mode: mode !== null && (PROJECTIONS as readonly string[]).includes(mode) ? (mode as Projection) : "read",
    anchor: params.get("anchor"),
    from: params.get("from"),
    to: params.get("to"),
  };
}

function serializeRoute(route: Route): string {
  if (!route.path) return "#/";
  const params = new URLSearchParams();
  if (route.rev) params.set("rev", route.rev);
  if (route.mode !== "read") params.set("mode", route.mode);
  if (route.anchor) params.set("anchor", route.anchor);
  if (route.mode === "compare") {
    if (route.from) params.set("from", route.from);
    if (route.to) params.set("to", route.to);
  }
  const query = params.toString();
  return `#/doc/${route.path}${query ? `?${query}` : ""}`;
}

/* ── State: exactly one document is open at a time; buffers survive mode flips ── */

const state = {
  index: null as IndexResponse | null,
  search: null as SearchIndex | null,
  git: { available: true, reason: undefined as string | undefined },
  rootPrefix: "docs",
  route: emptyRoute(),
  doc: null as DocumentResponse | null,
  /** `${path}@${rev}` of the last successful load; guards redundant fetches. */
  loadedKey: "",
  rendered: null as RenderedDocument | null,
  diagramsMounted: false,
  historyCache: new Map<string, HistoryResponse>(),
  /** Editor buffer for the *current* document only; switching modes never destroys it. */
  editorText: null as string | null,
  dirty: false,
  /** Heading text handed over by a search result, consumed by the next Read render. */
  pendingHeading: null as string | null,
  loadToken: 0,
  progress: 0,
  scrollMemory: new Map<string, number>(),
  expanded: new Set<string>(),
  expansionSeeded: false,
  anchorTimer: undefined as number | undefined,
  previewTimer: undefined as number | undefined,
  scrollFrame: 0,
};

const ui = {
  shell: must<HTMLElement>("shell"),
  backdrop: must<HTMLElement>("rail-backdrop"),
  navToggle: must<HTMLButtonElement>("nav-toggle"),
  contextToggle: must<HTMLButtonElement>("context-toggle"),
  keysButton: must<HTMLButtonElement>("keys-button"),
  progress: must<HTMLElement>("progress"),
  navRail: must<HTMLElement>("nav-rail"),
  contextRail: must<HTMLElement>("context-rail"),
  tree: must<HTMLElement>("tree"),
  treeCount: must<HTMLElement>("tree-count"),
  treeFilter: must<HTMLInputElement>("tree-filter"),
  treeNote: must<HTMLElement>("tree-note"),
  reading: must<HTMLElement>("reading"),
  provstrip: must<HTMLElement>("provstrip"),
  docBody: must<HTMLElement>("doc-body"),
  docSource: must<HTMLElement>("doc-source"),
  docEditor: must<HTMLElement>("doc-editor"),
  docHistory: must<HTMLElement>("doc-history"),
  docCompare: must<HTMLElement>("doc-compare"),
  docState: must<HTMLElement>("doc-state"),
  outline: must<HTMLElement>("outline-body"),
  metadata: must<HTMLElement>("metadata-body"),
  artifacts: must<HTMLElement>("artifacts-body"),
  relationships: must<HTMLElement>("relationships-body"),
  provenance: must<HTMLElement>("provenance-body"),
  revisions: must<HTMLElement>("revisions-body"),
  modebarPath: must<HTMLElement>("modebar-path"),
  modebarState: must<HTMLElement>("modebar-state"),
  modes: Array.from(document.querySelectorAll<HTMLButtonElement>(".mode[data-mode]")),
  palette: must<HTMLDialogElement>("palette"),
  paletteInput: must<HTMLInputElement>("palette-input"),
  paletteResults: must<HTMLElement>("palette-results"),
  keys: must<HTMLDialogElement>("keys"),
  keymap: must<HTMLElement>("keymap"),
  diagram: must<HTMLDialogElement>("diagram"),
  diagramTitle: must<HTMLElement>("diagram-title"),
  diagramStage: must<HTMLElement>("diagram-stage"),
  diagramInner: must<HTMLElement>("diagram-stage-inner"),
  diagramSource: must<HTMLElement>("diagram-source"),
  diagramSourceToggle: must<HTMLButtonElement>("diagram-source-toggle"),
  confirm: must<HTMLDialogElement>("confirm"),
  confirmMessage: must<HTMLElement>("confirm-message"),
  confirmCancel: must<HTMLButtonElement>("confirm-cancel"),
  confirmDiscard: must<HTMLButtonElement>("confirm-discard"),
  confirmSave: must<HTMLButtonElement>("confirm-save"),
  searchTrigger: must<HTMLButtonElement>("search-trigger"),
  searchHint: must<HTMLElement>("search-trigger-hint"),
  toast: must<HTMLElement>("toast"),
};

const SECTIONS = [ui.docBody, ui.docSource, ui.docEditor, ui.docHistory, ui.docCompare, ui.docState];
const narrowViewport = window.matchMedia("(max-width: 71.99rem)");

/* ── Utilities ── */

let toastTimer: number | undefined;
function toast(message: string, tone?: "error"): void {
  ui.toast.textContent = message;
  if (tone) ui.toast.dataset.tone = tone;
  else delete ui.toast.dataset.tone;
  ui.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast.hidden = true;
  }, 3600);
}

function withProgress(show: boolean): void {
  state.progress = Math.max(0, state.progress + (show ? 1 : -1));
  ui.progress.hidden = state.progress === 0;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: number | undefined;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}

/** Mark the element a link or search result asked for, quietly, then unmark. */
function flashTarget(element: HTMLElement | null): void {
  if (!element) return;
  element.setAttribute("data-target", "");
  window.clearTimeout(state.anchorTimer);
  state.anchorTimer = window.setTimeout(() => element.removeAttribute("data-target"), 2400);
}

function scrollKey(): string {
  return `${state.route.path ?? ""}@${state.route.rev ?? "working"}`;
}

/** Save reading position continuously so back/forward feels physical, not lossy. */
function rememberScroll(): void {
  if (state.scrollFrame) return;
  state.scrollFrame = window.requestAnimationFrame(() => {
    state.scrollFrame = 0;
    if (state.route.path && !ui.docBody.hidden) state.scrollMemory.set(scrollKey(), ui.reading.scrollTop);
  });
}

/* ── Unsaved-changes guard: leaving a dirty document is always deliberate ── */

function confirmLeave(): Promise<"cancel" | "discard" | "save"> {
  return new Promise((resolve) => {
    ui.confirmMessage.textContent = `Changes to ${state.route.path} have not been saved to the Markdown file.`;
    let settled = false;
    const finish = (choice: "cancel" | "discard" | "save") => {
      if (settled) return;
      settled = true;
      ui.confirm.close();
      resolve(choice);
    };
    const onCancel = () => finish("cancel");
    ui.confirmCancel.onclick = () => finish("cancel");
    ui.confirmDiscard.onclick = () => finish("discard");
    ui.confirmSave.onclick = () => finish("save");
    ui.confirm.addEventListener("cancel", onCancel, { once: true });
    ui.confirmSave.focus();
    ui.confirm.showModal();
  });
}

/* ── Navigation: every route change flows through the hash so history works ── */

function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const target = serializeRoute(route);
  if (options.replace || target === location.hash || (target === "#/" && (location.hash === "" || location.hash === "#"))) {
    if (options.replace && target !== location.hash) history.replaceState(null, "", target);
    void applyRoute(route);
    return;
  }
  location.hash = target;
}

window.addEventListener("hashchange", () => {
  void onHashChange();
});

async function onHashChange(): Promise<void> {
  const next = parseHash();
  const leavesDocument = next.path !== state.route.path || (next.rev ?? null) !== state.route.rev;
  if (state.dirty && leavesDocument) {
    const choice = await confirmLeave();
    if (choice === "cancel") {
      history.replaceState(null, "", serializeRoute(state.route));
      return;
    }
    if (choice === "save") {
      const saved = await saveDocument();
      if (!saved) {
        history.replaceState(null, "", serializeRoute(state.route));
        return;
      }
    }
    state.dirty = false;
    state.editorText = null;
  }
  await applyRoute(next);
}

/** The single entry point from URL to screen. */
async function applyRoute(route: Route): Promise<void> {
  const previous = state.route;
  if (previous.path && previous.path !== route.path) state.scrollMemory.set(`${previous.path}@${previous.rev ?? "working"}`, ui.reading.scrollTop);
  state.route = route;

  if (!route.path) {
    state.doc = null;
    state.rendered = null;
    state.loadedKey = "";
    state.editorText = null;
    state.dirty = false;
    showLanding();
    syncShell();
    return;
  }

  const key = `${route.path}@${route.rev ?? "working"}`;
  if (key !== state.loadedKey) {
    const token = ++state.loadToken;
    withProgress(true);
    try {
      const response = await sourceFor(route.rev).load(route.path);
      if (token !== state.loadToken) return;
      state.doc = response;
      state.rendered = null;
      state.diagramsMounted = false;
      state.loadedKey = key;
      if (previous.path !== route.path || (previous.rev ?? null) !== (route.rev ?? null)) {
        state.editorText = null;
        state.dirty = false;
      }
    } catch (error) {
      if (token !== state.loadToken) return;
      state.doc = null;
      state.rendered = null;
      state.loadedKey = "";
      showErrorState(error);
      syncShell();
      return;
    } finally {
      withProgress(false);
    }
  }

  // Project first, then sync the shell: the context rail describes the freshly projected artifact.
  await renderProjection();
  syncShell();
}

/* ── State views: empty, error, and loading are designed, not accidental ── */

function showState(view: { title: string; body: string; detail?: string; actions?: { label: string; run: () => void; primary?: boolean }[] }): void {
  hideSections();
  ui.docState.hidden = false;
  const children: (Node | null | undefined)[] = [el("h1", { class: "state__title", text: view.title }), el("p", { class: "state__body", text: view.body })];
  if (view.detail) children.push(el("p", { class: "state__detail", text: view.detail }));
  if (view.actions?.length) {
    children.push(
      el("div", {
        class: "state__actions",
        children: view.actions.map((action) =>
          el("button", {
            class: action.primary ? "button button--primary" : "button",
            text: action.label,
            attrs: { type: "button" },
            on: { click: () => action.run() },
          }),
        ),
      }),
    );
  }
  replace(ui.docState, children);
}

function hideSections(): void {
  for (const section of SECTIONS) section.hidden = true;
}

function showLanding(): void {
  const docs = state.index?.docs ?? [];
  if (docs.length === 0) {
    showState({
      title: "No documents found",
      body: "The documentation root contains no Markdown files.",
      detail: state.index?.root ?? "",
    });
    return;
  }
  showState({
    title: "Artifact Viewer",
    body: `${plural(docs.length, "document")} from ${state.index?.root ?? "the documentation root"}. Pick a document, or search across titles, headings, and text.`,
    actions: [
      { label: "Search documentation", run: openPalette, primary: true },
      { label: "Keyboard shortcuts", run: () => ui.keys.showModal() },
    ],
  });
}

function showErrorState(error: unknown): void {
  const viewerError = error instanceof ViewerError ? error : null;
  const title = viewerError ? viewerError.message : "This document could not be opened.";
  const body = viewerError?.code === "not_found"
    ? "It may have been renamed or removed since the link was made."
    : viewerError?.code === "outside_root"
      ? "That path lies outside the documentation root; the viewer only serves files inside it."
      : "The local viewer reported an error while reading it.";
  showState({
    title,
    body,
    ...(viewerError?.detail ? { detail: viewerError.detail } : {}),
    actions: [
      { label: "Try again", run: () => void applyRoute(state.route), primary: true },
      { label: "Back to documents", run: () => navigate(emptyRoute()) },
    ],
  });
}

/* ── Shell sync: mode bar, provenance strip, mode buttons ── */

function syncShell(): void {
  const doc = state.doc;
  const route = state.route;

  ui.modebarPath.textContent = route.path ?? "No document selected";
  replace(ui.modebarState, doc ? provenanceChips(doc.provenance) : []);

  for (const button of ui.modes) {
    const mode = button.dataset.mode as Projection;
    const pressed = route.mode === mode;
    button.setAttribute("aria-pressed", String(pressed));
    // A control never looks actionable when the affordance behind it does not exist.
    if (mode === "edit") {
      const editable = Boolean(doc) && !doc!.provenance.readOnly;
      button.disabled = !editable;
      button.title = !doc ? "Open a document first" : doc!.provenance.readOnly ? "Historical revisions are read-only" : "Edit";
    } else if (mode === "history" || mode === "compare") {
      button.disabled = !doc;
      button.title = doc ? button.getAttribute("aria-label") ?? mode : "Open a document first";
    } else {
      button.disabled = !doc && mode !== "read";
      button.title = doc || mode === "read" ? button.getAttribute("aria-label") ?? mode : "Open a document first";
    }
  }

  syncTreeSelection();
  renderProvstrip();
  renderContextRail();
  document.title = doc ? `${state.rendered?.title ?? route.path} — Artifact Viewer` : "Artifact Viewer — Documentation Mode";
}

function provenanceChips(provenance: DocumentResponse["provenance"]): HTMLElement[] {
  const chips: HTMLElement[] = [];
  if (provenance.source === "revision" && provenance.revision) {
    chips.push(el("span", { class: "chip chip--revision", text: `Revision ${provenance.revision.shortHash}` }));
    chips.push(el("span", { class: "chip chip--dot", text: "read-only" }));
    return chips;
  }
  const label = workingTreeStateLabel(provenance);
  chips.push(el("span", { class: `chip ${label.tone}`.trim(), text: label.text }));
  if (state.dirty) chips.push(el("span", { class: "chip chip--dirty chip--dot", text: "unsaved" }));
  if (provenance.workingTree.head) chips.push(el("span", { class: "chip", text: provenance.workingTree.head.shortHash }));
  return chips;
}

/** The provenance strip sits *around* the artifact: source, state, and source-specific actions. */
function renderProvstrip(): void {
  const doc = state.doc;
  if (!doc) {
    ui.provstrip.hidden = true;
    return;
  }
  ui.provstrip.hidden = false;
  const provenance = doc.provenance;
  const facts = el("div", { class: "provstrip__facts" });
  facts.append(el("span", { text: sourceLabel(provenance) }));
  if (provenance.source === "revision" && provenance.revision) {
    const revision = provenance.revision;
    facts.append(el("span", { text: formatDate(revision.date) }));
    facts.append(el("span", { text: revision.author }));
    facts.append(el("span", { text: revision.subject }));
    facts.append(el("span", { text: `path at revision: ${revision.pathAtRevision}` }));
  } else {
    const last = provenance.workingTree.lastCommit;
    if (last) facts.append(el("span", { text: `last commit ${last.shortHash} · ${formatDate(last.date)}` }));
    else if (provenance.workingTree.available) facts.append(el("span", { text: "no commits yet" }));
    else if (provenance.workingTree.reason) facts.append(el("span", { text: provenance.workingTree.reason }));
  }

  const actions = el("div", { class: "provstrip__actions" });
  if (provenance.source === "revision") {
    // Bounds are known only after history loads; until then both stay enabled and loading is silent.
    const known = state.historyCache.get(state.route.path ?? "");
    const found = known?.available ? known.entries.findIndex((entry) => entry.hash.startsWith(provenance.revision?.hash ?? "\u0000")) : -1;
    const atOldest = found !== -1 && found === (known?.entries.length ?? 0) - 1;
    const atNewest = found === 0;
    actions.append(
      buttonQuiet("Previous revision", () => stepRevision(-1), { disabled: atOldest, ...(atOldest ? { title: "This is the oldest revision" } : {}) }),
      buttonQuiet("Next revision", () => stepRevision(1), { disabled: atNewest, ...(atNewest ? { title: "Newer than HEAD — open Current instead" } : {}) }),
      buttonQuiet("Compare", () => navigate({ ...state.route, mode: "compare", from: state.route.rev ?? "HEAD", to: "working" })),
      buttonQuiet("Current", () => navigate({ ...state.route, rev: null, mode: "read", anchor: null })),
    );
  }

  replace(ui.provstrip, [el("span", { class: "provstrip__path", text: provenance.path }), facts, actions]);
  ui.provstrip.querySelector(".provstrip__facts")?.classList.add("provstrip__spacer");
}

function buttonQuiet(label: string, run: () => void, options: { disabled?: boolean; title?: string } = {}): HTMLButtonElement {
  return el("button", {
    class: "button button--quiet",
    text: label,
    attrs: { type: "button", ...(options.disabled ? { disabled: true } : {}), ...(options.title ? { title: options.title } : {}) },
    on: { click: run },
  });
}

/* ── Projection: the artifact never changes; only how it is presented does ── */

async function renderProjection(): Promise<void> {
  if (!state.doc) return;
  switch (state.route.mode) {
    case "read":
      renderRead();
      break;
    case "source":
      renderSource();
      break;
    case "edit":
      renderEdit();
      break;
    case "history":
      await renderHistory();
      break;
    case "compare":
      await renderCompare();
      break;
  }
}

/**
 * Read: the one Markdown pipeline. Working tree and every historical revision travel through
 * this exact function — the renderer is chosen by artifact type, never by source.
 */
function renderRead(): void {
  const doc = state.doc;
  if (!doc) return;
  const rendered = renderMarkdown(doc.artifact.content, { path: doc.artifact.path, rootPrefix: state.rootPrefix });
  state.rendered = rendered;
  state.diagramsMounted = false;

  hideSections();
  ui.docBody.hidden = false;
  clear(ui.docBody);
  // The children move out of the container into article.doc itself: breakout rules key on
  // `.doc > .diagram`, so an extra wrapper would silently shrink diagrams to the prose measure.
  ui.docBody.append(...Array.from(rendered.fragment.childNodes));
  mountDiagrams(rendered);
  wireInternalLinks();
  window.requestAnimationFrame(updateTableScrollHints);

  // A link to a section must land on the section; the anchor stays in the URL so the link remains shareable.
  if (state.route.anchor) {
    const target = document.getElementById(state.route.anchor);
    if (target) {
      target.scrollIntoView({ block: "start" });
      flashTarget(target);
    } else {
      ui.reading.scrollTop = 0;
    }
    state.route.anchor = null; // consumed once; the URL keeps it so the link stays shareable
  } else if (state.pendingHeading) {
    const heading = rendered.headings.find((item) => item.text === state.pendingHeading);
    state.pendingHeading = null;
    if (heading) {
      const target = document.getElementById(heading.slug);
      target?.scrollIntoView({ block: "start" });
      flashTarget(target);
    } else {
      ui.reading.scrollTop = state.scrollMemory.get(scrollKey()) ?? 0;
    }
  } else {
    ui.reading.scrollTop = state.scrollMemory.get(scrollKey()) ?? 0;
  }
  syncOutlineSelection();
}

/** Parsed structure for the context rail even when the visible projection is not Read. */
function ensureRendered(): void {
  if (state.rendered || !state.doc) return;
  state.rendered = renderMarkdown(state.doc.artifact.content, { path: state.doc.artifact.path, rootPrefix: state.rootPrefix });
}

function mountDiagrams(rendered: RenderedDocument): void {
  if (state.diagramsMounted) return;
  state.diagramsMounted = true;
  for (const artifact of rendered.artifacts) {
    if (artifact.type === "mermaid") void mountDiagram(artifact.element, artifact.source, openDiagramFocus);
  }
}

function updateTableScrollHints(): void {
  if (ui.docBody.hidden) return;
  ui.docBody.querySelectorAll<HTMLElement>(".table-scroll").forEach((table) => {
    const next = table.nextElementSibling;
    const hint = next?.classList.contains("table-scroll__hint") ? next : null;
    if (table.scrollWidth > table.clientWidth + 2) {
      if (!hint) table.after(el("p", { class: "table-scroll__hint", text: "Scroll table horizontally to read all columns →" }));
    } else {
      hint?.remove();
    }
  });
}

/** Internal documentation links navigate inside the viewer; external links stay external. */
function wireInternalLinks(): void {
  ui.docBody.querySelectorAll<HTMLAnchorElement>("a[data-outside]").forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      toast(`That link points outside the documentation root: ${anchor.dataset.outside}`, "error");
    });
  });
  ui.docBody.querySelectorAll<HTMLAnchorElement>("a[data-doc-path], a[data-anchor]").forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      const path = anchor.dataset.docPath ?? state.route.path ?? "";
      const target = anchor.dataset.anchor ?? null;
      navigate({ path, rev: state.route.rev, mode: "read", anchor: target, from: null, to: null });
      if (narrowViewport.matches) setRail("nav", false);
    });
  });
}

/** Source: the canonical Markdown, exactly as it sits on disk or in Git. Read-only by design. */
function renderSource(): void {
  const doc = state.doc;
  if (!doc) return;
  hideSections();
  ui.docSource.hidden = false;
  const readOnlyNote = doc.provenance.readOnly ? `revision ${doc.provenance.revision?.shortHash ?? ""} · read-only` : "working tree · canonical Markdown";
  replace(ui.docSource, [
    el("p", { class: "source-view__note", text: readOnlyNote }),
    el("pre", { children: [el("code", { text: doc.artifact.content })] }),
  ]);
  ui.reading.scrollTop = 0;
}

/* ── Edit projection: Markdown stays canonical; the save is deliberate, guarded, and local ── */

function renderEdit(): void {
  const doc = state.doc;
  if (!doc) return;
  if (doc.provenance.readOnly) {
    showState({
      title: "Historical revisions are read-only",
      body: `${doc.provenance.revision?.shortHash ?? "This revision"} is a Git revision, not the working file. Editing only ever writes to the current Markdown source.`,
      detail: doc.provenance.path,
      actions: [{ label: "Return to current", run: () => navigate({ ...state.route, rev: null, mode: "read", anchor: null }), primary: true }],
    });
    return;
  }

  hideSections();
  ui.docEditor.hidden = false;
  const buffer = state.editorText ?? doc.artifact.content;

  const textarea = el("textarea", {
    attrs: { spellcheck: "false", "aria-label": `Markdown source of ${doc.provenance.path}` },
  }) as HTMLTextAreaElement;
  textarea.value = buffer;

  const preview = el("div", { class: "editor__preview" });
  const previewDoc = el("div", { class: "doc" });
  preview.append(previewDoc);
  const saveButton = el("button", { class: "button button--primary", text: "Save", attrs: { type: "button", disabled: !state.dirty } }) as HTMLButtonElement;
  const discardButton = el("button", { class: "button button--quiet", text: "Discard changes", attrs: { type: "button", disabled: !state.dirty } }) as HTMLButtonElement;
  const note = el("p", { class: "editor__note", text: state.dirty ? "unsaved changes" : "editing the working-tree Markdown" });

  const paintDirty = () => {
    saveButton.disabled = !state.dirty;
    discardButton.disabled = !state.dirty;
    note.textContent = state.dirty ? "unsaved changes" : "editing the working-tree Markdown";
    note.classList.toggle("note", state.dirty);
    note.classList.toggle("note--danger", false);
    note.classList.toggle("editor__note", !state.dirty);
    syncShellChipsOnly();
  };

  const renderPreview = () => {
    const rendered = renderMarkdown(textarea.value, { path: doc.artifact.path, rootPrefix: state.rootPrefix });
    clear(previewDoc);
    previewDoc.append(...Array.from(rendered.fragment.childNodes));
    for (const artifact of rendered.artifacts) {
      if (artifact.type === "mermaid") void mountDiagram(artifact.element, artifact.source);
    }
  };

  const schedulePreview = debounce(renderPreview, 250);

  textarea.addEventListener("input", () => {
    state.editorText = textarea.value;
    const nowDirty = textarea.value !== doc.artifact.content;
    if (nowDirty !== state.dirty) {
      state.dirty = nowDirty;
      if (!nowDirty) state.editorText = null;
      paintDirty();
    }
    schedulePreview();
  });

  textarea.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      state.editorText = textarea.value;
      void saveDocument().then(paintDirty);
    }
  });

  saveButton.addEventListener("click", () => {
    state.editorText = textarea.value;
    void saveDocument().then(paintDirty);
  });
  discardButton.addEventListener("click", () => {
    textarea.value = doc.artifact.content;
    state.editorText = null;
    state.dirty = false;
    paintDirty();
    renderPreview();
    toast("Changes discarded");
  });

  const bar = el("div", { class: "editor__bar", children: [saveButton, discardButton, note] });
  const panes = el("div", {
    class: "editor__panes",
    children: [
      el("div", { class: "editor__pane", children: [el("span", { class: "editor__label", text: "Markdown (source of truth)" }), textarea] }),
      el("div", { class: "editor__pane", children: [el("span", { class: "editor__label", text: "Preview" }), preview] }),
    ],
  });
  replace(ui.docEditor, [bar, panes]);
  renderPreview();
}

/**
 * One deliberate save: writes the editor buffer to the canonical Markdown file, guarded by the
 * hash the server served so a concurrent disk change is refused rather than overwritten.
 * Returns false when the save did not happen; the buffer is never silently dropped.
 */
async function saveDocument(): Promise<boolean> {
  const doc = state.doc;
  if (!doc || doc.provenance.readOnly) return true;
  const content = state.editorText;
  if (content === null || content === doc.artifact.content) {
    state.dirty = false;
    state.editorText = null;
    return true;
  }
  try {
    const result = await api.save({ path: doc.provenance.path, content, expectedSha256: doc.sha256 });
    doc.artifact.content = content;
    doc.sha256 = result.sha256;
    doc.provenance.workingTree = result.workingTree;
    state.editorText = null;
    state.dirty = false;
    state.rendered = null; // next Read re-renders from the saved source
    syncShell();
    toast(`Saved ${result.path}`);
    // Re-sync the search index entry so search reflects the saved text.
    if (state.index && state.search) {
      const entry = state.index.docs.find((candidate) => candidate.path === result.path);
      if (entry) {
        entry.text = plainText(content);
        entry.bytes = result.bytes;
        entry.mtimeMs = result.mtimeMs;
        state.search = new SearchIndex(state.index);
      }
    }
    return true;
  } catch (error) {
    const viewerError = error instanceof ViewerError ? error : null;
    toast(viewerError?.message ?? "The document could not be saved.", "error");
    if (viewerError?.code === "conflict") {
      const bar = ui.docEditor.querySelector(".editor__bar");
      if (bar && !bar.querySelector(".note--danger")) {
        const detail = el("p", { class: "note note--danger", text: `${viewerError.message}${viewerError.detail ? ` (${viewerError.detail})` : ""}` });
        const reload = el("button", { class: "button", text: "Reload from disk", attrs: { type: "button" } });
        reload.addEventListener("click", () => {
          state.dirty = false;
          state.editorText = null;
          state.loadedKey = "";
          void applyRoute(state.route);
        });
        bar.append(detail, reload);
      }
    }
    return false;
  }
}

/** Chips reflect editor dirt without re-rendering the whole projection. */
function syncShellChipsOnly(): void {
  if (state.doc) replace(ui.modebarState, provenanceChips(state.doc.provenance));
}

/* ── History projection: local Git is the version-history backend; nothing is fabricated ── */

async function loadHistory(path: string): Promise<HistoryResponse> {
  const cached = state.historyCache.get(path);
  if (cached) return cached;
  const response = await api.history(path);
  state.historyCache.set(path, response);
  // Previous/Next bounds in the provenance strip are knowable only once history arrives.
  if (state.route.path === path && state.doc) renderProvstrip();
  return response;
}

async function renderHistory(): Promise<void> {
  const doc = state.doc;
  if (!doc) return;
  hideSections();
  ui.docHistory.hidden = false;
  replace(ui.docHistory, [el("p", { class: "empty-note", text: "Loading revision history…" })]);

  let history: HistoryResponse;
  try {
    history = await loadHistory(doc.provenance.path);
  } catch (error) {
    const message = error instanceof ViewerError ? error.message : "The history could not be read.";
    replace(ui.docHistory, [el("p", { class: "note note--danger", text: message }), currentButton()]);
    return;
  }
  if (state.route.mode !== "history") return; // user moved on while Git was working

  if (!history.available) {
    replace(ui.docHistory, [
      el("p", { class: "note", text: `Revision history is unavailable: ${history.reason ?? "unknown reason"}` }),
      el("p", { class: "empty-note", text: "Reading the current document still works; Git is only needed for history." }),
      currentButton(),
    ]);
    return;
  }
  if (history.entries.length === 0) {
    replace(ui.docHistory, [
      el("p", { class: "empty-note", text: "This document has no commits yet — it is new in the working tree." }),
      currentButton(),
    ]);
    return;
  }

  const list = el("ul", { class: "history__list" });
  const activeRev = state.route.rev;
  if (activeRev === null) {
    list.append(entryRow({ subject: "Current working file", hashLabel: "working tree", meta: "as it sits on disk now", current: true }, null));
  }
  for (const entry of history.entries) {
    const isActive = activeRev !== null && entry.hash.startsWith(activeRev);
    list.append(
      entryRow(
        {
          subject: entry.subject,
          hashLabel: entry.shortHash,
          meta: `${formatDate(entry.date)} · ${entry.author}${entry.pathAtRevision !== history.path ? ` · was ${entry.pathAtRevision}` : ""}`,
          current: isActive,
          head: entry.hash === history.entries[0]?.hash,
        },
        entry,
      ),
    );
  }
  replace(ui.docHistory, [list]);
}

interface EntryView {
  subject: string;
  hashLabel: string;
  meta: string;
  current?: boolean;
  head?: boolean;
}

function entryRow(view: EntryView, revision: RevisionRef | null): HTMLElement {
  const badges = el("span", { class: "history__badges" });
  if (view.current) badges.append(el("span", { class: "chip chip--revision", text: "viewing" }));
  else if (view.head) badges.append(el("span", { class: "chip", text: "HEAD" }));
  const button = el("button", {
    class: "history__entry",
    attrs: { type: "button", ...(view.current ? { "aria-current": "true" } : {}) },
    children: [
      el("span", { children: [el("span", { class: "history__subject", text: view.subject }), el("span", { class: "history__meta", text: `${view.hashLabel} · ${view.meta}` })] }),
      badges,
    ],
  });
  button.addEventListener("click", () => {
    navigate({ ...state.route, rev: revision ? revision.hash : null, mode: "read", anchor: null, from: null, to: null });
  });
  const item = el("li");
  item.append(button);
  return item;
}

function currentButton(): HTMLElement {
  const button = el("button", {
    class: "button button--primary",
    text: "Open current document",
    attrs: { type: "button" },
    on: { click: () => navigate({ ...state.route, rev: null, mode: "read", anchor: null }) },
  });
  return el("div", { class: "state__actions", children: [button] });
}

/** Previous (older) / next (newer) revision relative to the one being viewed. */
function stepRevision(direction: -1 | 1): void {
  const path = state.route.path;
  if (!path) return;
  void loadHistory(path).then((history) => {
    if (!history.available || history.entries.length === 0) return;
    const active = state.route.rev;
    let index: number;
    if (active === null) index = direction === -1 ? 0 : -1; // at "current", Previous enters history at HEAD
    else {
      const found = history.entries.findIndex((entry) => entry.hash.startsWith(active));
      if (found === -1) return;
      // Entries are newest-first: "Previous" means older (found + 1), "Next" means newer (found - 1).
      index = found - direction;
    }
    if (index < 0) {
      navigate({ ...state.route, rev: null, mode: "read", anchor: null }); // newer than newest commit = working tree
      return;
    }
    const target = history.entries[index];
    if (target) navigate({ ...state.route, rev: target.hash, mode: "read", anchor: null, from: null, to: null });
  });
}

/* ── Compare projection: the diff is its own artifact; the Markdown renderer is untouched ── */

async function renderCompare(): Promise<void> {
  const doc = state.doc;
  if (!doc) return;
  hideSections();
  ui.docCompare.hidden = false;
  replace(ui.docCompare, [el("p", { class: "empty-note", text: "Loading comparison…" })]);

  const path = doc.provenance.path;
  let history: HistoryResponse | null = null;
  try {
    history = await loadHistory(path);
  } catch {
    history = null; // compare still works for working/HEAD without the full list
  }
  if (state.route.mode !== "compare") return;

  const fromRef = state.route.from ?? (state.route.rev ?? "HEAD");
  const toRef = state.route.to ?? "working";

  const fromSelect = refSelect("From", fromRef, history);
  const toSelect = refSelect("To", toRef, history);
  const controls = el("div", {
    class: "compare__controls",
    children: [
      fromSelect.field,
      toSelect.field,
      el("button", {
        class: "button",
        text: "Swap",
        attrs: { type: "button" },
        on: {
          click: () => navigate({ ...state.route, mode: "compare", from: toSelect.select.value, to: fromSelect.select.value }),
        },
      }),
    ],
  });
  const summary = el("p", { class: "compare__summary", text: "Loading comparison…" });
  const diffBox = el("div", { class: "diff" });
  replace(ui.docCompare, [controls, summary, diffBox]);

  const apply = () => navigate({ ...state.route, mode: "compare", from: fromSelect.select.value, to: toSelect.select.value });
  fromSelect.select.addEventListener("change", apply);
  toSelect.select.addEventListener("change", apply);

  let response;
  try {
    response = await api.compare(path, fromRef, toRef);
  } catch (error) {
    const message = error instanceof ViewerError ? error.message : "These two states could not be compared.";
    summary.textContent = message;
    replace(diffBox, [el("p", { class: "empty-note", text: error instanceof ViewerError && error.detail ? error.detail : "" })]);
    return;
  }
  if (state.route.mode !== "compare") return;
  drawDiff(diffBox, response.from.content, response.to.content);
  const added = diffBox.querySelectorAll(".diff__line--added").length;
  const removed = diffBox.querySelectorAll(".diff__line--removed").length;
  summary.textContent = `${response.from.label} → ${response.to.label} · ${added} added, ${removed} removed · ${added + removed === 0 ? "identical" : "line-level source diff"}`;
}

function refSelect(label: string, active: string, history: HistoryResponse | null): { field: HTMLElement; select: HTMLSelectElement } {
  const select = el("select", { attrs: { "aria-label": label } }) as HTMLSelectElement;
  const options: { value: string; text: string }[] = [
    { value: "working", text: "Working tree (current)" },
    { value: "HEAD", text: "HEAD" },
  ];
  if (history?.available) {
    for (const entry of history.entries) options.push({ value: entry.hash, text: `${entry.shortHash} · ${formatDate(entry.date)} · ${entry.subject}` });
  }
  for (const option of options) {
    const node = el("option", { text: option.text, attrs: { value: option.value } });
    select.append(node);
  }
  // A ref the list does not carry (short hash in the URL) still gets an honest entry.
  if (!options.some((option) => option.value === active || option.value.startsWith(active))) {
    select.append(el("option", { text: active, attrs: { value: active } }));
  }
  select.value = active;
  return { field: el("label", { class: "compare__field", children: [el("span", { class: "editor__label", text: label }), select] }), select };
}

/** Line-level unified diff rendered as a hunk grid; 3 lines of context, like `git diff`. */
function drawDiff(container: HTMLElement, fromText: string, toText: string): void {
  const patch = structuredPatch("before", "after", fromText, toText, "", "", { context: 3 });
  if (patch.hunks.length === 0) {
    replace(container, [el("p", { class: "empty-note", text: "No differences between these two states." })]);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const hunk of patch.hunks) {
    const block = el("div", { class: "diff__hunk" });
    block.append(el("div", { class: "diff__header", text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` }));
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const line of hunk.lines) {
      const kind = line[0] === "+" ? "added" : line[0] === "-" ? "removed" : "context";
      const row = el("div", { class: `diff__line diff__line--${kind}` });
      row.append(el("span", { class: "diff__number", text: kind === "added" ? "" : String(oldLine) }));
      row.append(el("span", { class: "diff__number", text: kind === "removed" ? "" : String(newLine) }));
      row.append(
        el("span", {
          class: "diff__text",
          children: [el("span", { class: "diff__sign", text: kind === "added" ? "+" : kind === "removed" ? "−" : "" }), document.createTextNode(line.slice(1))],
        }),
      );
      block.append(row);
      if (kind !== "added") oldLine += 1;
      if (kind !== "removed") newLine += 1;
    }
    fragment.append(block);
  }
  replace(container, [fragment]);
}

/* ── Document tree: derived from the real documentation hierarchy, filterable, keyboard-first ── */

interface TreeNode {
  name: string;
  path: string | null; // null = folder
  children: TreeNode[];
}

function buildTree(docs: readonly IndexEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: null, children: [] };
  const prefix = `${state.rootPrefix}/`;
  for (const doc of docs) {
    const relative = doc.path.startsWith(prefix) ? doc.path.slice(prefix.length) : doc.path;
    const segments = relative.split("/");
    let cursor = root;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index] ?? "";
      const isFile = index === segments.length - 1;
      if (isFile) {
        cursor.children.push({ name: doc.title || segment.replace(/\.md$/i, ""), path: doc.path, children: [] });
      } else {
        let folder = cursor.children.find((child) => child.path === null && child.name === segment);
        if (!folder) {
          folder = { name: segment, path: null, children: [] };
          cursor.children.push(folder);
        }
        cursor = folder;
      }
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => (left.path === right.path ? left.name.localeCompare(right.name) : left.path === null ? -1 : right.path === null ? 1 : 0));
    for (const node of nodes) sort(node.children);
  };
  sort(root.children);
  return root.children;
}

function renderTree(filter = ""): void {
  const docs = state.index?.docs ?? [];
  const needle = filter.trim().toLowerCase();
  const visible = needle ? new Set(docs.filter((doc) => doc.path.toLowerCase().includes(needle) || doc.title.toLowerCase().includes(needle)).map((doc) => doc.path)) : null;
  const tree = buildTree(docs);
  if (!state.expansionSeeded && !visible) {
    seedExpansion(tree);
    state.expansionSeeded = true;
  }
  replace(ui.tree, [treeFragment(tree, visible)]);
  const total = docs.length;
  const shown = visible ? visible.size : total;
  ui.treeCount.textContent = needle && shown !== total ? `${shown} of ${total}` : plural(total, "document");
  ui.treeNote.textContent = needle && shown === 0 ? "No documents match this filter." : state.index ? state.index.root : "";
  syncTreeSelection();
}

function treeFragment(nodes: readonly TreeNode[], visible: Set<string> | null): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    if (node.path !== null) {
      if (visible && !visible.has(node.path)) continue;
      const item = el("li", { attrs: { role: "none" } });
      const row = el("div", { class: "tree__row" });
      const link = el("a", {
        class: "tree__link",
        text: node.name,
        attrs: { href: appHref(node.path), title: node.path, "data-path": node.path, role: "treeitem", tabindex: "-1", "aria-level": String(treeLevel(node)) },
      });
      row.append(link);
      item.append(row);
      fragment.append(item);
    } else {
      const children = node.children;
      const matching = visible
        ? new Set(
            (function collect(nodes: readonly TreeNode[]): string[] {
              const paths: string[] = [];
              for (const item of nodes) {
                if (item.path !== null) {
                  if (visible.has(item.path)) paths.push(item.path);
                } else paths.push(...collect(item.children));
              }
              return paths;
            })(children),
          )
        : null;
      if (visible && matching && matching.size === 0) continue;
      const expanded = visible ? true : state.expanded.has(node.name) || state.expanded.has(folderKey(node));
      const item = el("li", { attrs: { role: "none" } });
      const row = el("div", { class: "tree__row" });
      const glyph = icon("i-chevron", 12);
      glyph.classList.add("tree__chevron");
      const disclosure = el("button", {
        class: "tree__disclosure",
        attrs: { type: "button", "aria-expanded": String(expanded), "aria-label": `${expanded ? "Collapse" : "Expand"} ${node.name}` },
        children: [glyph],
      });
      const folder = el("span", { class: "tree__folder", text: node.name, attrs: { role: "treeitem", "aria-expanded": String(expanded), tabindex: "-1" } });
      const group = el("ul", { attrs: { role: "group" }, children: [treeFragment(children, visible)] });
      if (!expanded) group.hidden = true;
      disclosure.addEventListener("click", () => {
        const open = disclosure.getAttribute("aria-expanded") === "true";
        disclosure.setAttribute("aria-expanded", String(!open));
        group.hidden = open;
        folder.setAttribute("aria-expanded", String(!open));
        if (!open) state.expanded.add(folderKey(node));
        else state.expanded.delete(folderKey(node));
      });
      row.append(disclosure, folder);
      item.append(row, group);
      fragment.append(item);
    }
  }
  return fragment;
}

function seedExpansion(nodes: readonly TreeNode[]): void {
  for (const node of nodes) {
    if (node.path === null) {
      state.expanded.add(folderKey(node));
      seedExpansion(node.children);
    }
  }
}

function folderKey(node: TreeNode): string {
  return `${state.rootPrefix}/${node.name}`;
}

function treeLevel(node: TreeNode): number {
  return node.path ? 2 : 1;
}

function syncTreeSelection(): void {
  const current = state.route.path;
  ui.tree.querySelectorAll<HTMLAnchorElement>("a[data-path]").forEach((link) => {
    const active = link.dataset.path === current;
    if (active) {
      link.setAttribute("aria-current", "page");
      link.setAttribute("tabindex", "0");
    } else {
      link.removeAttribute("aria-current");
      link.setAttribute("tabindex", "-1");
    }
  });
}

/** Roving tabindex: arrows move, Enter opens, Left/Right fold — a real tree, not a list of links. */
function wireTreeKeyboard(): void {
  ui.tree.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLAnchorElement)) return;
    const links = Array.from(ui.tree.querySelectorAll<HTMLAnchorElement>("a[data-path]")).filter((link) => link.offsetParent !== null);
    const index = links.indexOf(active);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = links[index + (event.key === "ArrowDown" ? 1 : -1)];
      next?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      links[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      links[links.length - 1]?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const folder = active.closest("li")?.parentElement?.previousElementSibling?.querySelector<HTMLButtonElement>(".tree__disclosure");
      if (folder && event.key === "ArrowLeft") {
        event.preventDefault();
        folder.click();
        folder.focus();
      }
    }
  });
  ui.tree.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-path]");
    if (!link) return;
    event.preventDefault();
    const path = link.dataset.path;
    if (!path) return;
    navigate({ path, rev: null, mode: "read", anchor: null, from: null, to: null });
    if (narrowViewport.matches) setRail("nav", false);
  });
}

/* ── Context rail: progressive disclosure around the artifact; never inside it ── */

function renderContextRail(): void {
  ensureRendered();
  renderOutline();
  renderMetadata();
  renderArtifactList();
  renderRelationships();
  renderProvenancePanel();
  renderRevisionsPanel();
}

function renderOutline(): void {
  const headings = state.rendered?.headings ?? [];
  if (!state.doc || headings.length === 0) {
    replace(ui.outline, [el("p", { class: "empty-note", text: state.doc ? "This document has no headings." : "No document open." })]);
    return;
  }
  const list = el("ul", { class: "context-list" });
  for (const heading of headings) {
    const button = el("button", {
      class: "outline__item",
      text: heading.text,
      attrs: { type: "button", "data-depth": String(heading.depth), "data-slug": heading.slug },
    });
    button.addEventListener("click", () => {
      if (state.route.mode !== "read") navigate({ ...state.route, mode: "read", anchor: heading.slug });
      else {
        const target = document.getElementById(heading.slug);
        target?.scrollIntoView({ block: "start" });
        flashTarget(target ?? null);
      }
      if (narrowViewport.matches) setRail("context", false);
    });
    const item = el("li", { attrs: { role: "none" } });
    item.append(button);
    list.append(item);
  }
  replace(ui.outline, [list]);
  syncOutlineSelection();
}

/** Which heading is in view — updated on scroll, cheap enough to run in a rAF. */
function syncOutlineSelection(): void {
  const headings = state.rendered?.headings ?? [];
  if (headings.length === 0) return;
  let activeSlug = headings[0]?.slug ?? "";
  for (const heading of headings) {
    const element = document.getElementById(heading.slug);
    if (element && element.getBoundingClientRect().top < 140) activeSlug = heading.slug;
  }
  ui.outline.querySelectorAll<HTMLButtonElement>(".outline__item").forEach((button) => {
    if (button.dataset.slug === activeSlug) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
}

function renderMetadata(): void {
  const doc = state.doc;
  if (!doc) {
    replace(ui.metadata, [el("p", { class: "empty-note", text: "No document open." })]);
    return;
  }
  const record = el("dl", { class: "record" });
  record.append(recordRow("Path", doc.provenance.path, true));
  const rendered = state.rendered;
  record.append(recordRow("Size", `${new TextEncoder().encode(doc.artifact.content).length} bytes`));
  if (rendered) {
    record.append(recordRow("Headings", String(rendered.headings.length)));
    const diagrams = rendered.artifacts.filter((artifact) => artifact.type === "mermaid").length;
    const tables = rendered.artifacts.filter((artifact) => artifact.type === "table").length;
    const languages = [...new Set(rendered.artifacts.filter((artifact) => artifact.type === "code").map((artifact) => artifact.language))];
    if (diagrams) record.append(recordRow("Diagrams", plural(diagrams, "Mermaid diagram")));
    if (tables) record.append(recordRow("Tables", plural(tables, "table")));
    if (languages.length) record.append(recordRow("Code", languages.join(", "), true));
  }
  if (rendered?.frontmatter) {
    for (const [key, value] of Object.entries(rendered.frontmatter)) {
      if (value === null || value === undefined) continue;
      record.append(recordRow(key, typeof value === "string" ? value : JSON.stringify(value)));
    }
  } else if (rendered) {
    record.append(recordRow("Frontmatter", "none"));
  }
  if (rendered?.frontmatterError) record.append(recordRow("Frontmatter error", rendered.frontmatterError));
  replace(ui.metadata, [record]);
}

function renderArtifactList(): void {
  const artifacts = state.rendered?.artifacts ?? [];
  if (artifacts.length === 0) {
    replace(ui.artifacts, [el("p", { class: "empty-note", text: state.doc ? "No child artifacts — plain prose." : "No document open." })]);
    return;
  }
  const counts = new Map<string, number>();
  for (const artifact of artifacts) counts.set(artifact.type, (counts.get(artifact.type) ?? 0) + 1);
  const record = el("dl", { class: "record" });
  for (const [type, count] of counts) record.append(recordRow(type, plural(count, type)));
  const list = el("ul", { class: "linklist" });
  artifacts.forEach((artifact, index) => {
    const label = artifact.type === "code" ? `#${index + 1} ${artifact.label}` : artifact.label;
    const button = el("button", { text: label, attrs: { type: "button" } });
    button.addEventListener("click", () => {
      if (state.route.mode !== "read") {
        navigate({ ...state.route, mode: "read", anchor: `viewer-artifact-${index + 1}` });
      } else {
        artifact.element.scrollIntoView({ block: "center" });
        flashTarget(artifact.element);
      }
      if (narrowViewport.matches) setRail("context", false);
    });
    const item = el("li");
    item.append(button);
    list.append(item);
  });
  replace(ui.artifacts, [record, list]);
}

function renderRelationships(): void {
  const doc = state.doc;
  if (!doc) {
    replace(ui.relationships, [el("p", { class: "empty-note", text: "No document open." })]);
    return;
  }
  const children: (Node | null | undefined)[] = [];
  const outgoing = state.rendered?.internalLinks ?? [];
  const backlinks = state.index?.backlinks[doc.provenance.path] ?? [];

  if (outgoing.length > 0) {
    children.push(el("p", { class: "editor__label", text: `Links to (${outgoing.length})` }));
    const list = el("ul", { class: "linklist" });
    const seen = new Set<string>();
    for (const link of outgoing) {
      const key = link.path ?? link.anchor ?? link.text;
      if (seen.has(key) || !link.path) continue;
      seen.add(key);
      const item = el("li");
      const button = el("button", { text: link.path, attrs: { type: "button", title: link.text } });
      button.addEventListener("click", () => navigate({ path: link.path ?? "", rev: null, mode: "read", anchor: link.anchor ?? null, from: null, to: null }));
      item.append(button);
      list.append(item);
    }
    children.push(list);
  }

  if (backlinks.length > 0) {
    children.push(el("p", { class: "editor__label", text: `Linked from (${backlinks.length})` }));
    const list = el("ul", { class: "linklist" });
    for (const source of backlinks) {
      const item = el("li");
      const button = el("button", { text: source, attrs: { type: "button" } });
      button.addEventListener("click", () => navigate({ path: source, rev: null, mode: "read", anchor: null, from: null, to: null }));
      item.append(button);
      list.append(item);
    }
    children.push(list);
  }

  const external = state.index?.docs.find((candidate) => candidate.path === doc.provenance.path)?.externalTargets ?? [];
  if (external.length > 0) children.push(el("p", { class: "empty-note", text: `${plural(external.length, "link")} outside the documentation root.` }));
  if (children.length === 0) children.push(el("p", { class: "empty-note", text: "No relationships yet." }));
  replace(ui.relationships, children);
}

function renderProvenancePanel(): void {
  const doc = state.doc;
  if (!doc) {
    replace(ui.provenance, [el("p", { class: "empty-note", text: "No document open." })]);
    return;
  }
  const provenance = doc.provenance;
  const record = el("dl", { class: "record" });
  record.append(recordRow("Source", sourceLabel(provenance), true));
  if (provenance.source === "revision" && provenance.revision) {
    const revision = provenance.revision;
    record.append(recordRow("Commit", revision.hash, true));
    record.append(recordRow("Date", formatDate(revision.date)));
    record.append(recordRow("Author", `${revision.author} <${revision.email}>`));
    record.append(recordRow("Message", revision.subject));
    record.append(recordRow("Path then", revision.pathAtRevision, true));
    record.append(recordRow("Writable", "no — historical revisions are read-only"));
  } else {
    const workingTree = provenance.workingTree;
    const label = workingTreeStateLabel(provenance);
    record.append(recordRow("Working tree", label.text));
    if (workingTree.porcelain) record.append(recordRow("Status", workingTree.porcelain, true));
    if (workingTree.head) record.append(recordRow("HEAD", `${workingTree.head.shortHash} · ${formatDate(workingTree.head.date)}`));
    if (workingTree.lastCommit) record.append(recordRow("Last commit", `${workingTree.lastCommit.shortHash} · ${workingTree.lastCommit.subject}`));
    if (!workingTree.available && workingTree.reason) record.append(recordRow("Git", workingTree.reason));
    record.append(recordRow("Writable", state.dirty ? "yes — unsaved changes present" : "yes"));
  }
  replace(ui.provenance, [record]);
}

function renderRevisionsPanel(): void {
  const path = state.route.path;
  if (!path) {
    replace(ui.revisions, [el("p", { class: "empty-note", text: "No document open." })]);
    return;
  }
  replace(ui.revisions, [el("p", { class: "empty-note", text: "Loading…" })]);
  void loadHistory(path).then((history) => {
    if (state.route.path !== path) return;
    if (!history.available) {
      replace(ui.revisions, [el("p", { class: "empty-note", text: history.reason ?? "History unavailable." })]);
      return;
    }
    if (history.entries.length === 0) {
      replace(ui.revisions, [el("p", { class: "empty-note", text: "No commits yet." })]);
      return;
    }
    const list = el("ul", { class: "linklist" });
    for (const entry of history.entries.slice(0, 8)) {
      const item = el("li");
      const button = el("button", { text: `${entry.shortHash} · ${formatDate(entry.date)} · ${entry.subject}`, attrs: { type: "button", title: `${entry.author} — ${entry.subject}` } });
      button.addEventListener("click", () => navigate({ ...state.route, rev: entry.hash, mode: "read", anchor: null, from: null, to: null }));
      item.append(button);
      list.append(item);
    }
    const more = el("p", { class: "empty-note", text: `${plural(history.entries.length - 8 > 0 ? history.entries.length - 8 : 0, "older revision")} in History.` });
    replace(ui.revisions, [list, history.entries.length > 8 ? more : null]);
  }).catch((error: unknown) => {
    if (state.route.path === path) replace(ui.revisions, [el("p", { class: "empty-note", text: error instanceof Error ? error.message : "History is unavailable." })]);
  });
}

/* ── Search: an in-memory index over the startup corpus; results open in the viewer ── */

let paletteResults: SearchResult[] = [];
let paletteActive = 0;

function openPalette(): void {
  if (!ui.palette.open) ui.palette.showModal();
  ui.paletteInput.focus();
  ui.paletteInput.select();
  runPaletteSearch();
}

function runPaletteSearch(): void {
  const query = ui.paletteInput.value.trim();
  paletteResults = state.search ? state.search.search(query) : [];
  paletteActive = 0;
  if (query === "") {
    replace(ui.paletteResults, [el("li", { children: [el("p", { class: "empty-note", text: `${plural(state.search?.size ?? 0, "document")} indexed. Type to search titles, paths, headings, and text.` })] })]);
    ui.paletteInput.removeAttribute("aria-activedescendant");
    return;
  }
  if (paletteResults.length === 0) {
    replace(ui.paletteResults, [el("li", { children: [el("p", { class: "empty-note", text: `No documents match “${query}”.` })] })]);
    ui.paletteInput.removeAttribute("aria-activedescendant");
    return;
  }
  const list = paletteResults.map((result, index) => paletteRow(result, index));
  replace(ui.paletteResults, list);
  markPaletteActive();
}

function paletteRow(result: SearchResult, index: number): HTMLElement {
  const row = el("li", { attrs: { role: "none" } });
  const button = el("button", {
    class: "palette__result",
    attrs: { type: "button", role: "option", id: `palette-option-${index}`, "aria-selected": "false" },
    children: [
      el("span", { class: "palette__title", text: result.title }),
      el("span", { class: "palette__path", text: result.path }),
      result.snippet ? el("span", { class: "palette__snippet", children: highlightSnippet(result.snippet, ui.paletteInput.value) }) : null,
      !result.snippet && result.why ? el("span", { class: "palette__path", text: `matched: ${result.why}${result.headingText ? ` — “${result.headingText}”` : ""}` }) : null,
    ].filter(Boolean) as (Node | null)[],
  });
  button.addEventListener("click", () => activateResult(index));
  button.addEventListener("mousemove", () => {
    paletteActive = index;
    markPaletteActive();
  });
  row.append(button);
  return row;
}

function highlightSnippet(snippet: string, query: string): (Node | Text)[] {
  const needle = query.trim().split(/\s+/)[0] ?? "";
  if (!needle) return [document.createTextNode(snippet)];
  const parts = snippet.toLowerCase().split(needle.toLowerCase());
  const nodes: (Node | Text)[] = [];
  let cursor = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    if (part) nodes.push(document.createTextNode(snippet.slice(cursor, cursor + part.length)));
    cursor += part.length;
    if (index < parts.length - 1) {
      nodes.push(el("mark", { text: snippet.slice(cursor, cursor + needle.length) }));
      cursor += needle.length;
    }
  }
  if (cursor < snippet.length) nodes.push(document.createTextNode(snippet.slice(cursor)));
  return nodes;
}

function markPaletteActive(): void {
  const rows = ui.paletteResults.querySelectorAll<HTMLButtonElement>(".palette__result");
  rows.forEach((row, index) => {
    const active = index === paletteActive;
    row.setAttribute("aria-selected", String(active));
    if (active) {
      row.scrollIntoView({ block: "nearest" });
      ui.paletteInput.setAttribute("aria-activedescendant", row.id);
    }
  });
}

function activateResult(index: number): void {
  const result = paletteResults[index];
  if (!result) return;
  ui.palette.close();
  state.pendingHeading = result.headingText ?? null;
  navigate({ path: result.path, rev: null, mode: "read", anchor: null, from: null, to: null });
  if (narrowViewport.matches) setRail("nav", false);
}

/* ── Diagram focus: the same Mermaid render, given room; zoom, pan, source, return ── */

const diagramView = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, source: "", lastFocus: null as HTMLElement | null };

function openDiagramFocus(source: string, svg: string): void {
  diagramView.source = source;
  diagramView.scale = 1;
  diagramView.x = 0;
  diagramView.y = 0;
  diagramView.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.diagramTitle.textContent = "Mermaid diagram";
  ui.diagramInner.innerHTML = svg;
  ui.diagramSource.textContent = source;
  ui.diagramSource.hidden = true;
  ui.diagramSourceToggle.setAttribute("aria-expanded", "false");
  applyDiagramTransform();
  if (!ui.diagram.open) ui.diagram.showModal();
}

function applyDiagramTransform(): void {
  ui.diagramInner.style.transform = `translate(${diagramView.x}px, ${diagramView.y}px) scale(${diagramView.scale})`;
}

function wireDiagramDialog(): void {
  const zoom = (factor: number) => {
    diagramView.scale = Math.min(6, Math.max(0.2, diagramView.scale * factor));
    applyDiagramTransform();
  };
  must<HTMLButtonElement>("diagram-zoom-in").addEventListener("click", () => zoom(1.25));
  must<HTMLButtonElement>("diagram-zoom-out").addEventListener("click", () => zoom(0.8));
  must<HTMLButtonElement>("diagram-reset").addEventListener("click", () => {
    diagramView.scale = 1;
    diagramView.x = 0;
    diagramView.y = 0;
    applyDiagramTransform();
  });
  ui.diagramSourceToggle.addEventListener("click", () => {
    const open = ui.diagramSourceToggle.getAttribute("aria-expanded") === "true";
    ui.diagramSourceToggle.setAttribute("aria-expanded", String(!open));
    ui.diagramSource.hidden = open;
  });
  ui.diagram.addEventListener("close", () => {
    ui.diagramInner.replaceChildren();
    diagramView.lastFocus?.focus();
  });

  ui.diagramStage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    diagramView.dragging = true;
    diagramView.startX = event.clientX - diagramView.x;
    diagramView.startY = event.clientY - diagramView.y;
    ui.diagramStage.dataset.panning = "true";
    ui.diagramStage.setPointerCapture(event.pointerId);
  });
  ui.diagramStage.addEventListener("pointermove", (event) => {
    if (!diagramView.dragging) return;
    diagramView.x = event.clientX - diagramView.startX;
    diagramView.y = event.clientY - diagramView.startY;
    applyDiagramTransform();
  });
  const endPan = () => {
    diagramView.dragging = false;
    delete ui.diagramStage.dataset.panning;
  };
  ui.diagramStage.addEventListener("pointerup", endPan);
  ui.diagramStage.addEventListener("pointercancel", endPan);
  ui.diagramStage.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return; // plain scrolling must scroll the page behind the dialog
      event.preventDefault();
      diagramView.scale = Math.min(6, Math.max(0.2, diagramView.scale * (event.deltaY < 0 ? 1.12 : 0.9)));
      applyDiagramTransform();
    },
    { passive: false },
  );
}

/* ── Rails: disclosure panels below the desktop breakpoint, columns above it ── */

function setRail(which: "nav" | "context", open: boolean): void {
  const key = which === "nav" ? "data-nav" : "data-context";
  ui.shell.setAttribute(key, open ? "open" : "closed");
  const toggle = which === "nav" ? ui.navToggle : ui.contextToggle;
  toggle.setAttribute("aria-expanded", String(open));
}

function wireRails(): void {
  ui.navToggle.addEventListener("click", () => setRail("nav", ui.shell.dataset.nav !== "open"));
  ui.contextToggle.addEventListener("click", () => setRail("context", ui.shell.dataset.context !== "open"));
  ui.backdrop.addEventListener("click", () => {
    setRail("nav", false);
    setRail("context", false);
  });
  // Below the desktop breakpoint the rails overlay the text: opening one closes the other.
  const applyViewport = () => {
    if (narrowViewport.matches) {
      setRail("nav", false);
      setRail("context", false);
    } else {
      setRail("nav", true);
      setRail("context", true);
    }
  };
  applyViewport();
  narrowViewport.addEventListener("change", applyViewport);
}

/* ── Modes and global keyboard ── */

function setMode(mode: Projection): void {
  if (!state.doc && mode !== "read") return;
  if (state.route.mode === mode) return;
  navigate({ ...state.route, mode });
}

function wireModes(): void {
  for (const button of ui.modes) {
    button.addEventListener("click", () => setMode(button.dataset.mode as Projection));
  }
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘K / Ctrl+K", label: "Search documentation" },
  { keys: "/", label: "Search (when not typing)" },
  { keys: "?", label: "This list" },
  { keys: "Esc", label: "Close dialog or panel" },
  { keys: "1 2 3 4 5", label: "Read · Source · Edit · History · Compare" },
  { keys: "↑ ↓", label: "Move in the document tree" },
  { keys: "Enter", label: "Open the focused document" },
  { keys: "Ctrl/⌘ S", label: "Save the editor (in Edit mode)" },
  { keys: "[ ]", label: "Older / newer revision (with History open)" },
];

function renderKeymap(): void {
  const list = el("ul", { class: "keymap" });
  for (const shortcut of SHORTCUTS) {
    const item = el("li", { children: [el("kbd", { text: shortcut.keys }), el("span", { class: "keymap__label", text: shortcut.label })] });
    list.append(item);
  }
  replace(ui.keymap, [list]);
}

function wireKeyboard(): void {
  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openPalette();
      return;
    }
    if (mod && event.key.toLowerCase() === "s" && state.route.mode === "edit") return; // handled by the editor
    if (isTyping(event.target)) {
      if (event.key === "Escape" && ui.palette.open) ui.palette.close();
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      openPalette();
    } else if (event.key === "?") {
      event.preventDefault();
      if (!ui.keys.open) ui.keys.showModal();
    } else if (event.key === "Escape") {
      if (ui.diagram.open) ui.diagram.close();
      else if (ui.palette.open) ui.palette.close();
      else if (ui.keys.open) ui.keys.close();
      else if (narrowViewport.matches && (ui.shell.dataset.nav === "open" || ui.shell.dataset.context === "open")) {
        setRail("nav", false);
        setRail("context", false);
      }
    } else if (!mod && !event.altKey) {
      const modes: Record<string, Projection> = { "1": "read", "2": "source", "3": "edit", "4": "history", "5": "compare" };
      const mode = modes[event.key];
      if (mode) {
        event.preventDefault();
        setMode(mode);
      } else if (event.key === "[" && state.route.path) {
        stepRevision(-1);
      } else if (event.key === "]" && state.route.path) {
        stepRevision(1);
      }
    }
  });
}

function wirePalette(): void {
  ui.searchTrigger.addEventListener("click", openPalette);
  ui.keysButton.addEventListener("click", () => ui.keys.showModal());
  ui.paletteInput.addEventListener("input", runPaletteSearch);
  ui.paletteInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      paletteActive = Math.min(paletteActive + 1, paletteResults.length - 1);
      markPaletteActive();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      paletteActive = Math.max(paletteActive - 1, 0);
      markPaletteActive();
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateResult(paletteActive);
    }
  });
  document.querySelectorAll<HTMLElement>("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => must<HTMLDialogElement>(button.dataset.closeDialog ?? "").close());
  });
}

function wireTreeFilter(): void {
  ui.treeFilter.addEventListener("input", debounce(() => renderTree(ui.treeFilter.value), 120) as unknown as () => void);
}

function wireScrollMemory(): void {
  ui.reading.addEventListener("scroll", () => {
    rememberScroll();
    syncOutlineSelection();
  }, { passive: true });
}

function wireUnloadGuard(): void {
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

/* ── Boot ── */

async function boot(): Promise<void> {
  wireRails();
  wireModes();
  wireKeyboard();
  wirePalette();
  wireTreeFilter();
  wireTreeKeyboard();
  wireScrollMemory();
  wireUnloadGuard();
  window.addEventListener("resize", updateTableScrollHints);
  wireDiagramDialog();
  renderKeymap();

  // Platform-correct shortcut hint: ⌘ only where ⌘ exists.
  const isApple = /Mac|iPhone|iPad/.test(navigator.platform);
  ui.searchHint.textContent = isApple ? "⌘K" : "Ctrl K";

  showState({ title: "Loading…", body: "Reading the documentation corpus." });
  try {
    const [index, health] = await Promise.all([api.index(), api.health().catch(() => null)]);
    state.index = index;
    state.search = new SearchIndex(index);
    state.rootPrefix = index.root.replace(/\/$/, "");
    if (health) {
      state.git = { available: health.git.available, reason: health.git.reason };
    }
    renderTree();
  } catch (error) {
    showState({
      title: "The viewer could not load the documentation index.",
      body: error instanceof ViewerError ? error.message : "The local server did not answer.",
      ...(error instanceof ViewerError && error.detail ? { detail: error.detail } : {}),
      actions: [{ label: "Retry", run: () => void boot(), primary: true }],
    });
    return;
  }

  const route = parseHash();
  if (!route.path) {
    history.replaceState(null, "", "#/"); // stable landing URL; replaceState does not fire hashchange
    await applyRoute(emptyRoute());
  } else {
    await applyRoute(route);
  }
}

void boot();
