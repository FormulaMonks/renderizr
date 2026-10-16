# 24. Add support for Mermaid diagrams

Date: 2026-10-16

## Status

Accepted

Amends [13. Scope the label toggles to element text](0013-scope-the-label-toggles-to-element-text.md): the descriptions toggle also hides an entity's attribute comments.

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): a Mermaid diagram takes the workspace's styles where its source is silent.

References [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md): a Mermaid diagram draws through the same engine contract.

References [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md): Dagre lays out flowcharts and entity relationship diagrams.

References [16. Open workspace.dsl through Structurizr's merge](0016-open-workspace-dsl-through-structurizrs-merge.md): a changed Mermaid file under the DSL's folder already reruns `merge`.

References [21. Build exports from the view's geometry as a pure SVG](0021-build-exports-from-the-views-geometry-as-a-pure-svg.md): export draws a Mermaid diagram from the geometry the engine drew.

## Context

Flowcharts, entity relationship diagrams and sequence diagrams sit beside the C4 views in a workspace, and authors want them to read like those views: the workspace's colors and font, zoom and pan, the color schemes, activation targets and export. Authors write them with Structurizr's `mermaid` keyword in an image view (`image <key> { mermaid diagram.mmd }`). Structurizr draws them as pictures through a Mermaid server, and Renderizr shows that picture as it is.

Structurizr stores no source field. It encodes the source into the image view's `content` URL (or `contentLight` and `contentDark`) as `<mermaid.url>/svg/<encoded>` or `<mermaid.url>/img/<encoded>`, where the encoded part is `pako:` plus deflated JSON that wraps the source, or plain Base64 with `mermaid.compress` set to `false`. Structurizr's `export`, `merge` and Structurizr Local write the same URL field for field. Decoding the URL gives back the source byte for byte, frontmatter and `%%{init}%%` included. With `mermaid.inline` set to `true`, Structurizr fetches the server's picture during the parse and stores it as a data URI, and the source is gone. A property of Renderizr's own could carry the source instead, but authors would write every diagram twice, and one added to `workspace.json` by hand disappears on the next `merge`, because Structurizr rebuilds image views from the DSL.

Mermaid's own renderer draws all three types, but in a single-file page it would make the page about five times its size, and it returns an opaque SVG: no geometry for export, Mermaid's own links in place of activation targets, Mermaid's routes in place of routing modes and avoidance, and a `<style>` theme in place of the workspace's styles. The `@mermaid-js/parser` package covers none of the three types. Mermaid core still reads them with Jison grammars and db classes, which run on their own once their imports of Mermaid's config store, themes, sanitizer, d3 and logger point at small stand-ins. They return the same model as Mermaid, frontmatter and `%%{init}%%` included, and run in plain Node with no DOM. Shipped in the page, that trimmed parser would add about 40 percent to the island.

A prototype drew a flowchart from an image view's source with Dagre, the geometry modules, our router and the style cascade, at almost no cost to the page. A second drew a sequence diagram with a layout of our own in one pass over the message list, within a few percent of Mermaid's size, with no Dagre and no router. Mermaid 12 lays out flowcharts with ELK by default. Bundling ELK would cost about 3.4 times the island and add a second layout engine, while handing Dagre the sources first moves a cycle break to where ELK puts it.

## Decision

Draw Mermaid flowcharts, entity relationship diagrams and sequence diagrams in the React Flow engine, from the source the image view already carries.

- **Read the source from the image view's content.** Resolve `mermaid.url` from the image view's properties, then from the view set's. Treat a content field as Mermaid source when it starts with `<mermaid.url>/svg/` or `<mermaid.url>/img/`. Decode its last segment: inflate and strip Structurizr's JSON template for `pako:`, decode Base64 otherwise. Use Node's `zlib`, add no library and leave the workspace as Structurizr writes it.
- **Choose which image views draw.** Draw an image view as a Mermaid diagram when its source is a flowchart, an entity relationship diagram or a sequence diagram, and every content field it fills holds that same source once CRLF becomes LF. Show an error in place of the diagram when the fields disagree. Keep an image view whose content holds a picture, inlined Mermaid included, and an image view of any other Mermaid type, as an ordinary image view. Draw `mermaid <viewKey>`, Structurizr's flowchart export of a C4 view, as an ordinary flowchart.
- **Parse in the build.** Read the source with Mermaid's own Jison grammars and db classes, cut loose from Mermaid core and generated into one ESM file from a pinned Mermaid tag under Mermaid's MIT notice. Run it in `loadWorkspace`, and hand the page a plain model per diagram: nodes, edges, subgraphs, classes, direction, entities, participants, messages, the merged config and the title. Keep the `mermaid` package out of Renderizr's dependencies, and the parser out of the page.
- **Give a Mermaid diagram a view type of its own.** `resolveView` turns it into the resolved view a custom view gets, so drawing, styles, routing and export work as they do for every view. The page sizes nodes with its own text measurement.
- **Lay out flowcharts and entity relationship diagrams with Dagre.** Hand Dagre the sources first, in model order, then every other node in model order. Keep plain model order when the source sets `layout: dagre`. Bundle no ELK, and warn once per diagram that `layout: elk` and `elk` keys go unused.
- **Lay out sequence diagrams with our own code.** One pass over the parsed message list places participants, messages, activation bars, notes and fragments. The resolved view carries an optional sequence script that the page lays out in place of placement and routing.
- **Hide attribute comments with the descriptions toggle.** In an entity relationship diagram, an expanded entity shows its attributes' comments only while descriptions are on.

## Consequences

- Authors change nothing, and the workspace keeps opening in Structurizr as before, where the Mermaid server draws the same source.
- A Mermaid diagram takes the workspace's font, colors and color schemes, zoom and pan, activation targets and export with no engine of its own.
- The page grows only by the model each diagram carries and the code that draws entities, end markers and sequence diagrams. Builds, `pnpm dev` and edit mode all parse through `loadWorkspace`.
- A DSL session redraws a Mermaid diagram when its file changes, since `merge` reruns and reencodes the source.
- `mermaid.url` stays required whenever an image view uses `mermaid`, though Renderizr never calls the server.
- Renderizr depends on the shape of Structurizr's URL. A change to its template or encoding in a later Structurizr release breaks the decoding, and the build then shows an error in place of each diagram.
- A literal backslash followed by `n` in the source decodes as a line break, since Structurizr's compressed form escapes only newlines and quotes.
- An author who inlines a Mermaid picture keeps that picture, because no source remains to draw.
- Renderizr accepts exactly the syntax Mermaid's grammars accept at the pinned tag. Every Mermaid upgrade means regenerating the parser file and checking its stand-ins.
- The build reports a parse error with the image view's key, and the page shows an error in place of the diagram.
- A diagram drawn with `layout: elk` in Mermaid places its nodes differently in Renderizr: only the cycle break follows ELK.
- A Mermaid diagram draws read-only in edit mode, since Structurizr defines no layout data for an image view to store.
- The descriptions toggle hides attribute comments beside element descriptions. Edge descriptions still always draw.

## Alternatives considered

- A Renderizr property that holds the source: authors would duplicate every diagram, and the hand-edited form vanishes on the next `merge`.
- Fetching the picture from the Mermaid server: the build would need the network, and the picture would carry none of the workspace's styles or the reader features of a view.
- Mermaid's own renderer: it would make the single-file page about five times its size and leave no geometry for export or the reader features.
- `@mermaid-js/parser`: it reads none of the three types.
- Third-party Mermaid parsers: none reads frontmatter or `%%{init}%%`, one drops messages inside `loop` and `alt`, and one accepts broken source without an error.
- Parsing in the page: it adds the parser to every page for work the build can do once.
- Rewriting each diagram into a custom view in the build: it puts synthetic elements in the model, shows a custom view's icon, lets edit mode arrange the diagram and guesses node sizes before the page measures text.
- Bundling ELK: it costs several times the island and adds a second layout engine.

## Reference links

- [Mermaid](https://github.com/mermaid-js/mermaid)
- [MIT license](https://opensource.org/license/mit)
