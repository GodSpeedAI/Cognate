# Artifact Viewer

## Register

product

## Users

Developers and maintainers reading this repository's documentation while working locally. They need to find a document, understand its Markdown and diagrams, check where a statement came from, compare revisions, and make a deliberate source edit.

## Product Purpose

`just show-documents` opens a fast local interface over the existing `docs/` corpus. Markdown remains the source, Mermaid stays in Markdown, and local Git provides revision history. Success means a reader can move from the documentation tree to the relevant section or diagram, inspect truthful provenance, and return to the current file without losing context.

## Brand Personality

Precise, calm, and technical. The application should feel like a dependable developer workbench with the document as its primary surface.

## Anti-references

Generic dashboards, card grids, decorative gradients, fake data, oversized empty hero areas, and controls with no working action. The interface must not look like a content management system or a marketing page.

## Design Principles

1. Keep reading central; reveal history, metadata, and editing when needed.
2. Label the source of every version and make historical read-only state unmistakable.
3. Keep one interaction path for mouse, keyboard, and direct URLs.
4. Use the repository's actual documents and Git facts; never invent content or history.

## Accessibility & Inclusion

Use semantic regions, visible keyboard focus, named controls, readable contrast, and reduced-motion behavior. Keep narrow-screen document reading usable at 320px and above.
