# 10. Place unplaced elements around a stored layout

Date: 2026-10-02

## Status

Accepted

References [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md): a view with every element at (0,0) still gets Dagre.

References [9. Derive boundaries from their children](0009-derive-boundaries-from-their-children.md): placement avoids derived boundary boxes.

Referenced by [17. Save layout the way Structurizr reads and writes it](0017-save-layout-the-way-structurizr-reads-and-writes-it.md).

## Context

Structurizr writes a missing position as `x: 0, y: 0`. An element added to the DSL after a layout was saved, or one the layout merge fails to match, arrives at (0,0) while the rest of the view keeps its stored positions. Structurizr's renderer piles such elements in the top-left corner. Laying out the whole view instead would discard the author's layout for the sake of one element.

## Decision

Lay out a view automatically only when every element is at (0,0). When some are, keep the stored layout and place each unplaced element next to the elements it relates to: try slots one separation away from each connected element, nearest to their center first, and take the first that clears other elements and foreign boundaries. Log each placement.

## Consequences

- On Big Bank plc's views this placed 30 elements with zero overlaps, against 13 overlaps for the pile at (0,0).
- An element deliberately placed at exactly (0,0) in a stored view moves.
- The layout editor can show new elements somewhere sensible and save real coordinates once the author drags them.

## Alternatives considered

- Dagre-relative placement: more code, lands farther from the neighbors, and Dagre can't pin stored elements.
- ELK's interactive mode: it treats positions as hints and costs 432 KB gzipped.

## Reference links

- [Structurizr `DefaultLayoutMergeStrategy`](https://github.com/structurizr/java/blob/master/structurizr-core/src/main/java/com/structurizr/view/DefaultLayoutMergeStrategy.java)
- [Big Bank plc workspace](https://github.com/structurizr/structurizr/blob/main/structurizr-export/src/test/resources/big-bank-plc.json)
- [Dagre](https://github.com/dagrejs/dagre)
- [ELK](https://github.com/kieler/elkjs)
