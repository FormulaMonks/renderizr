# 19. Keep the edge ends of edges with vertices out of spreading

Date: 2026-10-06

## Status

Accepted

References [7. Avoid elements in every routing mode](0007-avoid-elements-in-every-routing-mode.md): vertices still turn avoidance off for their relationship.

## Context

The engine spreads the edge ends that share a side of an element. Ends whose aims come closer than the minimum gap merge into one block centered on their average aim, so moving one end's aim moves the whole block. While editing, dragging one edge's vertex moved the edge end of an edge the author never touched. Edit mode also saves the side an author picks for an edge end as a vertex 20 units straight out from that side, and that vertex has to hold the side.

## Decision

Treat an edge with vertices as routed by the author all the way to its edge ends. Put each of its ends right under its nearest vertex when that vertex lies straight out from a side and within the side's span; otherwise, where the line from the element's center toward that vertex crosses the side, within the side's span. Leave these ends out of spreading, so they never move another end. Spread the ends of edges without vertices among themselves. Draw this way in reading and in editing.

## Consequences

- Moving a vertex moves only its own edge.
- A side the author picks draws a perpendicular stub in every routing mode.
- Every view with vertices draws its edge ends this way, built sites included.
- Edge ends may sit close together or overlap.
- An edge's first vertex can take its end out of a block it shared, and the remaining ends spread once without it.

## Alternatives considered

- Spreading every edge end: an edit to one edge moves others.
- Storing a side anywhere but a vertex: Structurizr defines no field for it.
