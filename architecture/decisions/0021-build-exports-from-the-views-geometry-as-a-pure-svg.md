# 21. Build exports from the view's geometry as a pure SVG

Date: 2026-10-14

## Status

Accepted

References [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md): export joins the engine contract as one more thing the engine draws.

Referenced by [25. Draw Mermaid diagrams in the React Flow engine](0025-draw-mermaid-diagrams-in-the-react-flow-engine.md).

## Context

Readers want to paste a view into slides and other documents, so the diagrams toolbar offers an export as SVG and as PNG. It must work in the single-file and artifact builds, under a strict CSP, with no network. The React Flow engine draws element labels as HTML over each shape. An SVG that carries HTML needs a `<foreignObject>`, and Safari taints any canvas that draws such an SVG, so a PNG made from it fails to save. Libraries that capture the DOM (html-to-image and its kind) wrap the page in exactly that `<foreignObject>`, and each adds a dependency. The Screen Capture API asks for permission on every call and sees only on-screen pixels.

Shapes are geometry modules that return SVG outline paths, boundary and edge labels already come broken into lines, and the engine knows every label box before it renders. A serializer can build the whole view from that geometry. A prototype did so for about 1% of the page and matched the drawn view in the light and dark schemes and across animation steps.

## Decision

Build every export from the geometry the engine last drew, as a standalone SVG with no `<foreignObject>`. Draw each label as `<text>` lines broken where the drawn label breaks, embed the page's own `@font-face` rules for the export's font, and draw icons and indicator glyphs as `<image>` from `data:` URLs. Make the PNG by loading that SVG into an `<img>` from a `data:` URL and drawing it onto a `<canvas>` element. Write the serializer ourselves and add no dependency.

The engine keeps its own copy of the element label layout for the serializer, and a test draws a fixture and checks that the island and the export break element labels at the same places.

## Consequences

- One pipeline serves both formats, and neither taints a canvas in any browser engine.
- The SVG holds real text, so it stays sharp at any size and its labels can be searched.
- Element label layout lives in two places: the island's CSS and the serializer. A change to one needs the other, and the parity test catches a drift.
- Anything the engine draws later needs a matching branch in the serializer before it shows up in an export.
- An icon given as an `http(s)` URL draws on the dev server's page and stays blank in the export, because an SVG loaded through `<img>` fetches nothing.

## Alternatives considered

- Capture the DOM with a library such as html-to-image. It copies the drawn view with no second layout, but it relies on `<foreignObject>`, so Safari refuses the PNG, and it adds a dependency.
- The Screen Capture API. It asks for permission on every export, sees only what is on screen at screen resolution, and crops to an element only in desktop Chromium.
- Draw the PNG straight onto a `<canvas>` element with `Path2D` and `fillText`. It needs no `img-src`, but it needs a second renderer beside the SVG serializer. It stays a fallback in case a host's CSP blocks `data:` images.
- Move element label layout into shared geometry so the island draws pre-broken lines. It removes the second copy, but it reworks how the island draws every label, which is a bigger change than export.
