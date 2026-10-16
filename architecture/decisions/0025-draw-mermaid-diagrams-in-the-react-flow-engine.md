# 25. Draw Mermaid diagrams in the React Flow engine

Date: 2026-10-16

## Status

Accepted

Amends [13. Scope the label toggles to element text](0013-scope-the-label-toggles-to-element-text.md): the descriptions toggle also hides an entity's attribute comments.

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): a Mermaid diagram takes the workspace's styles where its source is silent.

References [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md): a Mermaid diagram draws through the same engine contract.

References [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md): Dagre lays out flowcharts and entity relationship diagrams.

References [21. Build exports from the view's geometry as a pure SVG](0021-build-exports-from-the-views-geometry-as-a-pure-svg.md): export draws a Mermaid diagram from the geometry the engine drew.

References [24. Read Mermaid source from the image view's content](0024-read-mermaid-source-from-the-image-views-content.md): it decides where the source comes from.

## Context

Flowcharts, entity relationship diagrams and sequence diagrams sit beside the C4 views in a workspace, and authors want them to read like those views: the workspace's colors and font, zoom and pan, the color schemes, activation targets and export. Structurizr draws them as pictures through a Mermaid server, and Renderizr shows that picture as it is.

Mermaid's own renderer draws all three, but in a single-file page it would make the page about five times its size, and it returns an opaque SVG: no geometry for export, Mermaid's own links in place of activation targets, Mermaid's routes in place of routing modes and avoidance, and a `<style>` theme in place of the workspace's styles. The `@mermaid-js/parser` package covers none of the three types. Mermaid core still reads them with Jison grammars and db classes, which run on their own once their imports of Mermaid's config store, themes, sanitizer, d3 and logger point at small stand-ins. They return the same model as Mermaid, frontmatter and `%%{init}%%` included, and run in plain Node with no DOM. Shipped in the page, that trimmed parser would add about 40 percent to the island.

A prototype drew a flowchart from an image view's source with Dagre, the geometry modules, our router and the style cascade, at almost no cost to the page. A second drew a sequence diagram with a layout of our own in one pass over the message list, within a few percent of Mermaid's size, with no Dagre and no router. Mermaid 12 lays out flowcharts with ELK by default. Bundling ELK would cost about 3.4 times the island and add a second layout engine, while handing Dagre the sources first moves a cycle break to where ELK puts it.

## Decision

Draw Mermaid flowcharts, entity relationship diagrams and sequence diagrams in the React Flow engine.

- **Parse in the build.** Read the source with Mermaid's own Jison grammars and db classes, cut loose from Mermaid core and generated into one ESM file from a pinned Mermaid tag under Mermaid's MIT notice. Run it in `loadWorkspace`, and hand the page a plain model per diagram: nodes, edges, subgraphs, classes, direction, entities, participants, messages, the merged config and the title. Keep the `mermaid` package out of Renderizr's dependencies, and the parser out of the page.
- **Give a Mermaid diagram a view type of its own.** `resolveView` turns it into the resolved view a custom view gets, so drawing, styles, routing and export work as they do for every view. The page sizes nodes with its own text measurement.
- **Lay out flowcharts and entity relationship diagrams with Dagre.** Hand Dagre the sources first, in model order, then every other node in model order. Keep plain model order when the source sets `layout: dagre`. Bundle no ELK, and warn once per diagram that `layout: elk` and `elk` keys go unused.
- **Lay out sequence diagrams with our own code.** One pass over the parsed message list places participants, messages, activation bars, notes and fragments. The resolved view carries an optional sequence script that the page lays out in place of placement and routing.
- **Hide attribute comments with the descriptions toggle.** In an entity relationship diagram, an expanded entity shows its attributes' comments only while descriptions are on.

## Consequences

- A Mermaid diagram takes the workspace's font, colors and color schemes, zoom and pan, activation targets and export with no engine of its own.
- The page grows only by the model each diagram carries and the code that draws entities, end markers and sequence diagrams. Builds, `pnpm dev` and edit mode all parse through `loadWorkspace`.
- Renderizr accepts exactly the syntax Mermaid's grammars accept at the pinned tag. Every Mermaid upgrade means regenerating the parser file and checking its stand-ins.
- The build reports a parse error with the image view's key, and the page shows an error in place of the diagram.
- A diagram drawn with `layout: elk` in Mermaid places its nodes differently in Renderizr: only the cycle break follows ELK.
- A Mermaid diagram draws read-only in edit mode, since Structurizr defines no layout data for an image view to store.
- The descriptions toggle hides attribute comments beside element descriptions. Edge descriptions still always draw.

## Alternatives considered

- Mermaid's own renderer: it would make the single-file page about five times its size and leave no geometry for export or the reader features.
- `@mermaid-js/parser`: it reads none of the three types.
- Third-party Mermaid parsers: none reads frontmatter or `%%{init}%%`, one drops messages inside `loop` and `alt`, and one accepts broken source without an error.
- Parsing in the page: it adds the parser to every page for work the build can do once.
- Rewriting each diagram into a custom view in the build: it puts synthetic elements in the model, shows a custom view's icon, lets edit mode arrange the diagram and guesses node sizes before the page measures text.
- Bundling ELK: it costs several times the island and adds a second layout engine.

## Reference links

- [Mermaid](https://github.com/mermaid-js/mermaid)
- [MIT license](https://opensource.org/license/mit)
