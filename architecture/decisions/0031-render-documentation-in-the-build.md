# 31. Render documentation in the build

Date: 2026-11-17

## Status

Accepted

Amends [24. Add support for Mermaid diagrams](0024-add-support-for-mermaid-diagrams.md): a Mermaid block in documentation is a second source of Mermaid diagrams.

References [29. Load the landscape scoped workspace from its payload under --artifact](0029-load-the-landscape-scoped-workspace-from-its-payload-under-artifact.md): the documentation runtime stays the same byte for byte for every workspace.

## Context

The documentation and decisions pages render every section and decision in the browser with markdown-it and 11 highlight.js languages, and those two make up the larger part of the documentation runtime. Authors write their documentation the way they write on GitHub, and the same files often render on GitHub too. GitHub's footnotes, task lists, emoji, bare URLs, math and diagrams show as the text the author typed, and Structurizr DSL in a fence shows plain.

Each of those added to the page grows every page load. Math with a renderer in the page roughly doubles the documentation runtime, and KaTeX's fonts add about 1.5 MB to every single file. The full emoji set adds about a quarter, and highlight.js's common languages nearly half. In the build, the same features cost the page close to nothing: Temml writes MathML, which the browser draws with its own math font, and an expression weighs about a tenth of KaTeX's HTML.

AsciiDoc goes through a small pass of Renderizr's own that misreads collapsible blocks, example blocks and TeX braces, and the decisions page skips it. Structurizr renders AsciiDoc with asciidoctor.js. Raw HTML in a section reaches the page as written, `style` attributes and scripts included, where GitHub sanitizes it.

[24. Add support for Mermaid diagrams](0024-add-support-for-mermaid-diagrams.md) draws Mermaid diagrams from image views only. Authors also write Mermaid blocks in their documentation, and Structurizr's Mermaid documentation plugin rewrites them into the same encoded server links an image view carries.

## Decision

Render every documentation section and decision to HTML in the build, and hand the page the HTML.

- **Render once, for every mode.** `prepareWorkspace` renders each section and decision of every documentation scope for the multi-file site, `--single-file`, `--artifact`, every workspace of a set, `pnpm dev` and edit mode. Markdown goes through markdown-it and its plugins, AsciiDoc through asciidoctor.js, code through highlight.js with every language it knows and a Structurizr DSL grammar of Renderizr's own, and math through Temml into MathML. The link and image resolvers, the title fallback and the decision formatter move into the build with it.
- **Carry the HTML in the workspace payload** in place of the source, with class names that stay the same from build to build.
- **Keep in the page only what reads the HTML**: splitting a section into pages, the documentation menu, the pager, footnotes per page, and opening and printing collapsed sections. Drop markdown-it and highlight.js from the documentation runtime, and add Temml's stylesheet and font.
- **Sanitize the author's raw HTML** in the build, from GitHub's allowlist plus `video`, keeping `id` and `class`. Drop `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, event handlers, `style` attributes and `javascript:` links. Renderizr's own markup stays whole.
- **Turn Mermaid blocks into Mermaid diagrams.** Before the build reads Mermaid diagrams, add one Mermaid image view for each flowchart, entity relationship diagram or sequence diagram block in documentation (a ` ```mermaid ` fence, AsciiDoc's `[mermaid]` block or the encoded image link Structurizr's plugin writes), with the element of its documentation scope as its element. Keep Mermaid's own view type and add no element to the model. The section shows a diagram card in the block's place.

## Consequences

- The documentation runtime loses about half its weight, carries no parser and stays the same byte for byte for every workspace. A render with no documentation or decisions still leaves it out.
- The workspace payload grows by about 8% on prose, and more on heavily highlighted code. A Claude artifact carries HTML where it carried Markdown, so Claude reads the rendered sections.
- `pnpm dev` and edit mode reload a changed section rendered, since both already rerun `prepareWorkspace` when a file changes.
- AsciiDoc renders the way Structurizr renders it, in decisions too, and the hand-written pass retires.
- The build depends on markdown-it, asciidoctor.js, highlight.js, Temml, asciimath2tex and a sanitizer. Their upgrades touch the build only. asciidoctor.js converts asynchronously, so the step awaits it.
- A section that relied on a `style` attribute or a script renders without it.
- The diagrams page lists documentation's Mermaid diagrams among the image views. Each one's key comes from its title, so retitling a block changes its address.
- Math looks the way the browser's MathML draws it, so it differs slightly from browser to browser.

## Alternatives considered

- Rendering in the page with more plugins: math, emoji and highlighting would multiply the documentation runtime on every page load, and KaTeX's fonts would land in every single file.
- KaTeX in the build: each expression weighs about ten times its MathML, and the stylesheet and fonts still land in every single file.
- Leaving raw HTML as written: the same file would read differently on GitHub and in Renderizr, scripts included.
- Drawing a Mermaid block in the section: Mermaid's own renderer would make the single file several times its size, and the React Flow engine would run once per block on the documentation page.
- Rewriting a Mermaid block into a custom view: [24. Add support for Mermaid diagrams](0024-add-support-for-mermaid-diagrams.md) already rejects it, for the same reasons.

## Reference links

- [GitHub's advanced formatting](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting)
- [markdown-it](https://github.com/markdown-it/markdown-it)
- [asciidoctor.js](https://github.com/asciidoctor/asciidoctor.js)
- [highlight.js](https://github.com/highlightjs/highlight.js)
- [Temml](https://temml.org)
