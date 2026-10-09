# Documentation

The documentation page shows the workspace's documentation sections as pages, in filename order (`01-…`, `02-…`), with a table of contents built from their headings, a pager, links between sections that open the matching page, and images drawn from the copies Structurizr embeds in the workspace. Renderizr's own site carries four sections: Getting started, Usage, Contributing and Reference.

## Sub-features

- `docs-order` lists the sections in filename order, each titled by its first heading.
- `docs-toc` builds the table of contents from each section's headings and marks the page on screen.
- `docs-pager` moves to the next and previous page.
- `docs-links` opens the right section and heading from a relative link (`02-usage.md#edit-mode`), and shows a link to a file outside the workspace as plain text.
- `docs-images` draws each image a section references from `documentation.images`, with no request.

## How to get to it (user POV)

- Choose **Documentation** in the header.
- Choose a section or a heading in the table of contents on the left.
- Follow a link in a section's text, or the pager at the bottom.
- Open a link to `#/?page=docs&section=<file>&subsection=<heading-id>`.

## Driving it with drive.mjs

Preconditions:

- `$S/launch.sh $RUN build architecture/workspace.json --single-file`, so images must come from the workspace (the page is a `file://` URL with nothing beside it).

- **Whole recipe.** Run `node $S/drive.mjs $RUN .claude/skills/verify-renderizr/steps/documentation.json --name docs-`. It covers the bullets below and writes `docs-1-getting-started.png`, `docs-2-render-a-workspace.png`, `docs-3-reference.png` and `docs-results.json`.
- **Order.** Opening `#/?page=docs` lists `a[data-item-id^="section:"]` as `Getting started`, `Usage`, `Contributing`, `Reference`.
- **Images.** On `section=01-getting-started&subsection=render-a-workspace`, `#docs-content img` holds three images, each loaded (`naturalWidth > 0`) from a `data:image/png;base64,` source.
- **Links between sections.** On `subsection=next-steps`, the links carry routes (`#/?page=docs&section=04-reference`); clicking the Reference link opens the section whose `h1` reads `Reference`.
- **Header entry.** From the diagrams page, `{ "click": "a[data-page=\"docs\"]" }` opens the first section.
- **Pager.** On `#/?page=docs`, `{ "click": "#docs-pager button[data-page-index]" }` moves to the next page: the hash gains `subsection=who-it-is-for`.

## Gotchas

- Each `##` heading is its own page: `#docs-content` holds one page at a time, so look for an image or a link on the page that holds it (`subsection=<heading-id>`).
- Heading ids follow GitHub's slugs: `Structurizr's tools for a DSL session` becomes `structurizrs-tools-for-a-dsl-session`.
- Structurizr embeds an image only when a section references it, and only PNG, JPEG, GIF and SVG (WebP is skipped). After changing `architecture/docs/`, run `pnpm architecture:merge` with Structurizr's tools before building, or the build shows the old workspace.
- A link to a repository file outside the workspace (`CONTRIBUTING.md`) renders as plain text with a "Not part of this workspace" title, by design.
