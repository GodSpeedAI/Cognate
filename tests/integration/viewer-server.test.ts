/**
 * Artifact Viewer — J0 through J10 integration tests.
 *
 * Affordance-dependency order:
 *   J0  — Launch: `just show-documents` startup, banner, health check, loopback binding, port collision
 *   J1  — Browse: tree discovery, corpus indexing, document count
 *   J2  — Render: representative Markdown (headings, tables, code, links)
 *   J4  — Navigate: internal relative links, external targets
 *   J5  — Search: search index, matching on title, path, headings, text
 *   J6  — History: local Git log follow, real commit provenance
 *   J7  — Revision: loading historical Git commit content
 *   J8  — Compare: diff between revisions, diff between working and HEAD
 *   J9  — Edit: save safe doc, conflict detection, content preservation
 *   J10 — Safety: path traversal rejected, extensions restricted, assets bounded
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCorpus, indexResponse } from "../../scripts/viewer/corpus.ts";
import { LocalGitProvider } from "../../scripts/viewer/git.ts";
import { confine, resolveRoot, ViewerError } from "../../scripts/viewer/paths.ts";
import { DocumentationService, sha256 } from "../../scripts/viewer/service.ts";
import { parseOptions, listen, createHandler, hyperlink } from "../../scripts/show-documents.ts";
import { prepareAssets } from "../../scripts/viewer/assets.ts";
import { SearchIndex } from "../../docs/.viewer/src/search.ts";
import { extractHeadings, splitFrontmatter, countTables, fenceInfo, resolveRelative, slugify, slugFor } from "../../docs/.viewer/src/document-parse.ts";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const DOCS_ROOT = resolve(REPO_ROOT, "docs");

describe("J0 — Launch & Configuration", () => {
  test("parseOptions accepts defaults", () => {
    const opts = parseOptions([]);
    expect(opts.port).toBe(4177);
    expect(opts.docsRoot).toBe("docs");
    expect(opts.open).toBe(false);
    expect(opts.hyperlinks).toBe(true);
    expect(opts.help).toBe(false);
  });

  test("parseOptions accepts CLI overrides", () => {
    const opts = parseOptions(["--port", "4999", "--docs", "docs", "--open", "--no-hyperlink"]);
    expect(opts.port).toBe(4999);
    expect(opts.docsRoot).toBe("docs");
    expect(opts.open).toBe(true);
    expect(opts.hyperlinks).toBe(false);
  });

  test("parseOptions rejects invalid port", () => {
    expect(() => parseOptions(["--port", "-1"])).toThrow();
    expect(() => parseOptions(["--port", "70000"])).toThrow();
    expect(() => parseOptions(["--port", "abc"])).toThrow();
  });

  test("hyperlink helper formats OSC-8 correctly", () => {
    const url = "http://127.0.0.1:4177";
    const linked = hyperlink("Open", url, true);
    expect(linked).toContain("\u001b]8;;");
    expect(linked).toContain(url);
    const plain = hyperlink("Open", url, false);
    expect(plain).toBe("Open");
  });

  test("listen handles port collision gracefully", async () => {
    const handler = async () => new Response("ok");
    const first = await listen(handler, { port: 48991, hostname: "127.0.0.1" });
    expect(first.port).toBe(48991);
    expect(first.changed).toBe(false);

    // Second listen on same port should pick a nearby free port
    const second = await listen(handler, { port: 48991, hostname: "127.0.0.1" });
    expect(second.port).toBeGreaterThan(48991);
    expect(second.changed).toBe(true);

    first.server.stop(true);
    second.server.stop(true);
  });

  test("server binds loopback only and serves health check", async () => {
    const corpus = await buildCorpus(DOCS_ROOT);
    const git = new LocalGitProvider(REPO_ROOT);
    const service = new DocumentationService(corpus, git);
    const assets = await prepareAssets({ viewerDir: resolve(DOCS_ROOT, ".viewer"), repositoryRoot: REPO_ROOT });
    const handler = createHandler({ corpus, service, assets, git, version: "0.1.0" });
    const { server, port } = await listen(handler, { port: 48993, hostname: "127.0.0.1" });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.documents).toBeGreaterThanOrEqual(50);
      expect(data.git.available).toBe(true);

      // Security headers present
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    } finally {
      server.stop(true);
    }
  });
});

describe("J1 — Browse & Corpus Indexing", () => {
  let corpus: Awaited<ReturnType<typeof buildCorpus>>;

  beforeAll(async () => {
    corpus = await buildCorpus(DOCS_ROOT);
  });

  test("corpus discovers all repository documentation", () => {
    expect(corpus.docs.length).toBeGreaterThanOrEqual(50);
    expect(corpus.prefix).toBe("docs");
    expect(corpus.repositoryRoot).toBe(REPO_ROOT);
  });

  test("corpus builds indexResponse wire representation", () => {
    const wire = indexResponse(corpus);
    expect(wire.root).toBe("docs/");
    expect(wire.docs.length).toBe(corpus.docs.length);
    expect(typeof wire.generatedAt).toBe("string");
    expect(Object.keys(wire.backlinks).length).toBeGreaterThan(0);
  });

  test("every indexed document has required metadata", () => {
    for (const doc of corpus.docs) {
      expect(doc.path).toMatch(/^docs\/.+\.md$/);
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.bytes).toBeGreaterThan(0);
      expect(Array.isArray(doc.headings)).toBe(true);
      expect(Array.isArray(doc.links)).toBe(true);
    }
  });

  test("backlinks accurately reflect cross-document references", () => {
    // architecture.md is widely referenced
    const backlinks = corpus.backlinks["docs/architecture.md"];
    expect(backlinks).toBeDefined();
    expect(backlinks!.length).toBeGreaterThan(0);
  });
});

describe("J2 — Markdown Document Parsing", () => {
  test("extractHeadings parses # hierarchy and computes unique slugs", () => {
    const md = "# Title\n\n## Sub Section\n\n### Sub Sub\n\n## Sub Section\n";
    const headings = extractHeadings(md);
    expect(headings.length).toBe(4);
    expect(headings[0]).toEqual({ depth: 1, text: "Title", slug: "title" });
    expect(headings[1]).toEqual({ depth: 2, text: "Sub Section", slug: "sub-section" });
    expect(headings[2]).toEqual({ depth: 3, text: "Sub Sub", slug: "sub-sub" });
    expect(headings[3]).toEqual({ depth: 2, text: "Sub Section", slug: "sub-section-1" });
  });

  test("extractHeadings ignores headings inside code fences", () => {
    const md = "# Real\n\n```markdown\n# Fake In Code\n```\n\n## Real Two\n";
    const headings = extractHeadings(md);
    expect(headings.length).toBe(2);
    expect(headings[0]?.text).toBe("Real");
    expect(headings[1]?.text).toBe("Real Two");
  });

  test("fenceInfo identifies mermaid blocks and language tags", () => {
    const md = "```mermaid\ngraph TD; A-->B;\n```\n\n```typescript\nconst x = 1;\n```\n";
    const info = fenceInfo(md);
    expect(info.mermaid).toBe(1);
    expect(info.codeBlocks).toBe(2);
    expect(info.languages).toContain("mermaid");
    expect(info.languages).toContain("typescript");
  });

  test("countTables counts markdown tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n\nSome text\n\n| C | D |\n|---|---|\n| 3 | 4 |\n";
    expect(countTables(md)).toBe(2);
  });

  test("splitFrontmatter handles YAML frontmatter and prose without frontmatter", () => {
    const withFm = "---\ntitle: Hello\nversion: 1\n---\n# Body\n";
    const fm = splitFrontmatter(withFm);
    expect(fm.data).toEqual({ title: "Hello", version: 1 });
    expect(fm.body).toBe("# Body\n");

    const noFm = "# Plain Body\n";
    const plain = splitFrontmatter(noFm);
    expect(plain.data).toBeNull();
    expect(plain.body).toBe(noFm);
  });

  test("slugify handles Unicode and punctuation cleanly", () => {
    expect(slugify("Planes (spec §7)")).toBe("planes-spec-7");
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("`code_sample` test")).toBe("codesample-test");
  });
});

describe("J4 — Navigation & Relative Link Resolution", () => {
  test("resolveRelative handles sibling and parent paths", () => {
    expect(resolveRelative("docs/tutorials/start.md", "human-in-the-loop.md")).toBe("docs/tutorials/human-in-the-loop.md");
    expect(resolveRelative("docs/tutorials/start.md", "../architecture.md")).toBe("docs/architecture.md");
    expect(resolveRelative("docs/architecture.md", "decisions/ADR-0001.md")).toBe("docs/decisions/ADR-0001.md");
  });

  test("resolveRelative normalizes redundant slashes and dots", () => {
    expect(resolveRelative("docs/a.md", "./b.md")).toBe("docs/b.md");
    expect(resolveRelative("docs/sub/a.md", ".././sub2/b.md")).toBe("docs/sub2/b.md");
  });
});

describe("J5 — Search Index", () => {
  let searchIndex: SearchIndex;

  beforeAll(async () => {
    const corpus = await buildCorpus(DOCS_ROOT);
    searchIndex = new SearchIndex(indexResponse(corpus));
  });

  test("indexes all documents", () => {
    expect(searchIndex.size).toBeGreaterThanOrEqual(50);
  });

  test("searches by title with highest relevance", () => {
    const results = searchIndex.search("Architecture");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.path).toBe("docs/architecture.md");
    expect(results[0]?.why).toBe("title");
  });

  test("searches by body text and returns excerpts", () => {
    const results = searchIndex.search("RealityTrace");
    expect(results.length).toBeGreaterThan(0);
    const found = results.some((r) => r.path.includes("ADR-0007") || r.path.includes("realitytrace") || r.snippet?.toLowerCase().includes("realitytrace"));
    expect(found).toBe(true);
  });

  test("searches by heading text", () => {
    const results = searchIndex.search("Planes spec");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.path).toBe("docs/architecture.md");
  });

  test("empty query returns empty results", () => {
    expect(searchIndex.search("")).toEqual([]);
    expect(searchIndex.search("   ")).toEqual([]);
  });

  test("pathsMatching filters paths for tree search", () => {
    const matching = searchIndex.pathsMatching("tutorials");
    expect(matching.size).toBeGreaterThan(0);
    for (const p of matching) {
      expect(p.toLowerCase()).toContain("tutorials");
    }
  });
});

describe("J6 — Git History & Provenance", () => {
  const git = new LocalGitProvider(REPO_ROOT);

  test("reports Git availability and version", async () => {
    const avail = await git.availability();
    expect(avail.available).toBe(true);
    expect(avail.version).toContain("git version");
  });

  test("retrieves real commit history for tracked document", async () => {
    const history = await git.history("docs/architecture.md", 20);
    expect(history.length).toBeGreaterThanOrEqual(2);
    for (const rev of history) {
      expect(rev.hash).toMatch(/^[0-9a-f]{40}$/);
      expect(rev.shortHash).toMatch(/^[0-9a-f]{7,}$/);
      expect(rev.author.length).toBeGreaterThan(0);
      expect(rev.subject.length).toBeGreaterThan(0);
      expect(rev.pathAtRevision).toBe("docs/architecture.md");
    }
  });

  test("reports working tree state truthfully", async () => {
    const facts = await git.workingTree("docs/architecture.md");
    expect(facts.tracked).toBe(true);
    expect(["clean", "modified"]).toContain(facts.state);
  });

  test("reports last commit and repository HEAD", async () => {
    const last = await git.lastCommit("docs/architecture.md");
    expect(last).not.toBeNull();
    expect(last!.hash).toMatch(/^[0-9a-f]{40}$/);

    const head = await git.repositoryHead();
    expect(head).not.toBeNull();
    expect(head!.hash).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("J7 — Historical Revision Retrieval", () => {
  const git = new LocalGitProvider(REPO_ROOT);

  test("reads document content at specific commit hash", async () => {
    const history = await git.history("docs/architecture.md", 5);
    expect(history.length).toBeGreaterThanOrEqual(2);

    const olderRev = history[history.length - 1]!;
    const content = await git.content(olderRev.pathAtRevision, olderRev.hash);
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("Architecture");
  });

  test("throws ViewerError for non-existent revision", async () => {
    await expect(git.content("docs/architecture.md", "0000000000000000000000000000000000000000")).rejects.toThrow();
  });
});

describe("J8 — Compare & Diff", () => {
  let service: DocumentationService;

  beforeAll(async () => {
    const corpus = await buildCorpus(DOCS_ROOT);
    const git = new LocalGitProvider(REPO_ROOT);
    service = new DocumentationService(corpus, git);
  });

  test("compares two historical revisions", async () => {
    const hist = await service.history("docs/architecture.md", 5);
    expect(hist.entries.length).toBeGreaterThanOrEqual(2);

    const fromRev = hist.entries[1]!.hash;
    const toRev = hist.entries[0]!.hash;

    const compare = await service.compare("docs/architecture.md", fromRev, toRev);
    expect(compare.path).toBe("docs/architecture.md");
    expect(compare.from.ref).toBe(fromRev);
    expect(compare.to.ref).toBe(toRev);
    expect(compare.from.content.length).toBeGreaterThan(0);
    expect(compare.to.content.length).toBeGreaterThan(0);
    expect(compare.from.provenance.readOnly).toBe(true);
    expect(compare.to.provenance.readOnly).toBe(true);
  });

  test("compares revision to working tree", async () => {
    const hist = await service.history("docs/architecture.md", 5);
    const fromRev = hist.entries[hist.entries.length - 1]!.hash;

    const compare = await service.compare("docs/architecture.md", fromRev, "working");
    expect(compare.to.ref).toBe("working");
    expect(compare.to.label).toBe("Working tree");
    expect(compare.to.provenance.readOnly).toBe(false);
  });
});

describe("J9 — Edit, Save & Conflict Safety", () => {
  let service: DocumentationService;
  const testDocRepo = "docs/.viewer-test-scratch.md";
  const testDocAbs = resolve(DOCS_ROOT, ".viewer-test-scratch.md");

  beforeAll(async () => {
    writeFileSync(testDocAbs, "# Test Scratch Document\n\nInitial content.\n");
    const corpus = await buildCorpus(DOCS_ROOT);
    const git = new LocalGitProvider(REPO_ROOT);
    service = new DocumentationService(corpus, git);
  });

  afterAll(() => {
    if (existsSync(testDocAbs)) unlinkSync(testDocAbs);
  });

  test("loads document with content hash", async () => {
    const res = await service.document(testDocRepo, null);
    expect(res.artifact.content).toContain("Initial content");
    expect(res.provenance.readOnly).toBe(false);
    expect(res.sha256).toBe(sha256(res.artifact.content));
  });

  test("saves modified content when expectedSha256 matches", async () => {
    const doc = await service.document(testDocRepo, null);
    const newContent = "# Test Scratch Document\n\nUpdated content with new lines.\n";
    const saveRes = await service.save({
      path: testDocRepo,
      content: newContent,
      expectedSha256: doc.sha256,
    });
    expect(saveRes.path).toBe(testDocRepo);
    expect(saveRes.sha256).toBe(sha256(newContent));

    // Verify written to disk
    const onDisk = readFileSync(testDocAbs, "utf8");
    expect(onDisk).toBe(newContent);
  });

  test("rejects save on conflict when file was modified on disk", async () => {
    const staleSha = sha256("old stale content that does not match disk");
    await expect(service.save({
      path: testDocRepo,
      content: "# Conflict Attempt\n",
      expectedSha256: staleSha,
    })).rejects.toThrow(/conflict|changed on disk/i);
  });

  test("historical revisions cannot be saved (they are read-only)", async () => {
    const doc = await service.document("docs/architecture.md", "HEAD");
    expect(doc.provenance.readOnly).toBe(true);
    // There is no save API that targets a revision; save only takes a path
  });
});

describe("J10 — Path Confinement & Safety Boundaries", () => {
  test("confine allows normal document paths inside root", () => {
    const result = confine(DOCS_ROOT, "docs/architecture.md");
    expect(result.repoPath).toBe("docs/architecture.md");
    expect(result.absolute).toBe(resolve(DOCS_ROOT, "architecture.md"));
  });

  test("confine allows root-relative document paths", () => {
    const result = confine(DOCS_ROOT, "architecture.md");
    expect(result.repoPath).toBe("docs/architecture.md");
  });

  test("confine rejects path traversal with 403", () => {
    expect(() => confine(DOCS_ROOT, "../../package.json")).toThrow(ViewerError);
    try {
      confine(DOCS_ROOT, "../../package.json");
    } catch (e: any) {
      expect(e.status).toBe(403);
      expect(e.code).toBe("outside_root");
    }
  });

  test("confine rejects absolute paths with 403", () => {
    expect(() => confine(DOCS_ROOT, "/etc/passwd")).toThrow(ViewerError);
    try {
      confine(DOCS_ROOT, "/etc/passwd");
    } catch (e: any) {
      expect(e.status).toBe(403);
      expect(e.code).toBe("outside_root");
    }
  });

  test("confine rejects NUL bytes with 400", () => {
    expect(() => confine(DOCS_ROOT, "architecture.md\0.txt")).toThrow(ViewerError);
    try {
      confine(DOCS_ROOT, "architecture.md\0.txt");
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.code).toBe("invalid_path");
    }
  });

  test("confine rejects non-existent document with 404", () => {
    expect(() => confine(DOCS_ROOT, "docs/does-not-exist-at-all.md")).toThrow(ViewerError);
    try {
      confine(DOCS_ROOT, "docs/does-not-exist-at-all.md");
    } catch (e: any) {
      expect(e.status).toBe(404);
      expect(e.code).toBe("not_found");
    }
  });

  test("confine enforces allowed extensions", () => {
    expect(() => confine(DOCS_ROOT, "docs/.viewer/viewer.css", { extensions: [".md"] })).toThrow(ViewerError);
    try {
      confine(DOCS_ROOT, "docs/.viewer/viewer.css", { extensions: [".md"] });
    } catch (e: any) {
      expect(e.status).toBe(415);
      expect(e.code).toBe("not_a_document");
    }
  });

  test("service.asset only serves allowlisted asset types", () => {
    const corpus = { root: DOCS_ROOT, repositoryRoot: REPO_ROOT } as any;
    const git = {} as any;
    const service = new DocumentationService(corpus, git);

    // .md is not an image asset
    expect(() => service.asset("docs/architecture.md")).toThrow(ViewerError);
    try {
      service.asset("docs/architecture.md");
    } catch (e: any) {
      expect(e.status).toBe(415);
    }
  });
});
