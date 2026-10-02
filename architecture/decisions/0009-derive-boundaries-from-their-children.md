# 9. Derive boundaries from their children

Date: 2026-10-02

## Status

Accepted

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): it draws a childless deployment node where Structurizr removes it.

References [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md): Dagre places elements and the boundaries are derived afterwards.

Referenced by [10. Place unplaced elements around a stored layout](0010-place-unplaced-elements-around-a-stored-layout.md).

## Context

Software systems, containers, groups and deployment nodes are drawn as boundaries around their children. Structurizr's renderer computes a boundary's box from its children, ignores coordinates stored on it, and removes a deployment node when none of its children are in the view.

## Decision

Draw an element as a boundary when at least one of its children is in the view, and as an ordinary element otherwise; always draw a group as a boundary. Derive each boundary's box from its children (50 padding, a wrapped label band at the bottom), deepest first, before React renders, and ignore coordinates stored on it. Draw a deployment node with none of its children in the view as an ordinary element at its stored coordinates.

## Consequences

- One rule covers every view type, filtered views and animations included.
- A childless deployment node appears where Structurizr hides it, so a higher-level deployment view can show a node as a single box.
- Boundary sizes depend on measured label text, so the font swap re-derives them once.
- Boundaries carry no stored geometry, which suits the layout editor: dragging a child recomputes its boundary.

## Reference links

- [Structurizr renderer source](https://github.com/structurizr/structurizr)
