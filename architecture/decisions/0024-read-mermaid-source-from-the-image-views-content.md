# 24. Read Mermaid source from the image view's content

Date: 2026-10-16

## Status

Accepted

References [16. Open workspace.dsl through Structurizr's merge](0016-open-workspace-dsl-through-structurizrs-merge.md): a changed Mermaid file under the DSL's folder already reruns `merge`.

Referenced by [25. Draw Mermaid diagrams in the React Flow engine](0025-draw-mermaid-diagrams-in-the-react-flow-engine.md).

## Context

Authors write Mermaid flowcharts, entity relationship diagrams and sequence diagrams into a workspace with Structurizr's `mermaid` keyword in an image view (`image <key> { mermaid diagram.mmd }`). Structurizr stores no source field. It encodes the source into the image view's `content` URL (or `contentLight` and `contentDark`) as `<mermaid.url>/svg/<encoded>` or `<mermaid.url>/img/<encoded>`, where the encoded part is `pako:` plus deflated JSON that wraps the source, or plain Base64 with `mermaid.compress` set to `false`. Structurizr's `export`, `merge` and Structurizr Local write the same URL field for field. Decoding the URL gives back the source byte for byte, frontmatter and `%%{init}%%` included. With `mermaid.inline` set to `true`, Structurizr fetches the server's picture during the parse and stores it as a data URI, and the source is gone.

A property of Renderizr's own could carry the source instead. One set in the DSL survives `export`, `merge` and Local, but authors would write every diagram twice. One added to `workspace.json` by hand disappears on the next `merge`, because Structurizr rebuilds image views from the DSL.

## Decision

Read a Mermaid diagram's source from the image view's content fields, and leave the workspace as Structurizr writes it.

- Resolve `mermaid.url` from the image view's properties, then from the view set's.
- Treat a content field as Mermaid source when it starts with `<mermaid.url>/svg/` or `<mermaid.url>/img/`. Decode its last segment: inflate and strip Structurizr's JSON template for `pako:`, decode Base64 otherwise. Use Node's `zlib`, and add no library.
- Draw an image view as a Mermaid diagram when its source is a flowchart, an entity relationship diagram or a sequence diagram, and every content field it fills holds that same source once CRLF becomes LF. Show an error in place of the diagram when the fields disagree.
- Keep an image view whose content holds a picture, inlined Mermaid included, and an image view of any other Mermaid type, as an ordinary image view.
- Draw `mermaid <viewKey>`, Structurizr's flowchart export of a C4 view, as an ordinary flowchart.

## Consequences

- Authors change nothing, and the workspace keeps opening in Structurizr as before, where the Mermaid server draws the same source.
- A DSL session redraws a Mermaid diagram when its file changes, since `merge` reruns and reencodes the source.
- `mermaid.url` stays required whenever an image view uses `mermaid`, though Renderizr never calls the server.
- Renderizr depends on the shape of Structurizr's URL. A change to its template or encoding in a later Structurizr release breaks the decoding, and the build then shows an error in place of each diagram.
- A literal backslash followed by `n` in the source decodes as a line break, since Structurizr's compressed form escapes only newlines and quotes.
- An author who inlines a Mermaid picture keeps that picture, because no source remains to draw.

## Alternatives considered

- A Renderizr property that holds the source: authors would duplicate every diagram, and the hand-edited form vanishes on the next `merge`.
- Fetching the picture from the Mermaid server: the build would need the network, and the picture would carry none of the workspace's styles or the reader features of a view.
