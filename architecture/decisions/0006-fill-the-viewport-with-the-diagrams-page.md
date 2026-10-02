# 6. Fill the viewport with the diagrams page

Date: 2026-10-02

## Status

Accepted

References [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md): the island owns the viewport and input.

## Context

The diagrams page grows with the diagram and scrolls. A legibility rule sizes the canvas, a two-pass fit runs on resize, and about 300 lines in `src/pages/diagrams.ts` work around wheel, pinch and pan. React Flow pans and zooms inside its own container.

## Decision

Make the diagrams route a full-viewport shell: keep the header, view drawer, toolbar and footer visible, and let the canvas take the remaining space, sized by CSS. Pan and zoom inside the canvas with map-like input owned by the island. Refit the view on resize until the reader zooms or pans.

## Consequences

- Delete the legibility rule, the page-side fit and the input handlers.
- Layout, input and the toolbar all assume the shell, so returning to page scroll would touch all three.
- A plain mouse wheel pans the diagram, which readers will notice.

## Alternatives considered

- Keep page scroll and grow the page with the diagram: it keeps the workarounds that React Flow's in-canvas pan replaces.

## Reference links

- [React Flow](https://reactflow.dev/)
