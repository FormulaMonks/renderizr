# 23. Lay out with Dagre 2.0.4

Date: 2026-10-15

## Status

Amended

Amended by [25. Lay out with Dagre 3.1.1](0025-lay-out-with-dagre-3-1-1.md).

Amends [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md): the Dagre version, and the quirks an automatic layout keeps.

References [14. Rank large views with tight-tree](0014-rank-large-views-with-tight-tree.md): it measured Dagre 2.0.4 and 3.1.1 as faster rankers.

## Context

[4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md) pins Dagre 1.1.8 and keeps the Structurizr renderer's look, quirks included. One of those quirks makes every automatic view with a boundary far taller than its ranks need.

Dagre nests each boundary in ranks of its own and then removes the ranks nothing sits on. Dagre 1.1.8 offsets ranks by the lowest rank of every node, boundaries included. A boundary has no rank, so the offset is `NaN` and Dagre removes no rank at all. Every empty rank costs a rank separation: between two ranks inside one boundary the gap is three rank separations, and five inside two. Dagre 2.0.1 leaves out the nodes without a rank and fixes it.

Measured in headless Chrome, as the width and height in pixels the elements of each view span:

| View | Dagre 1.1.8 | Dagre 2.0.4 |
|---|---|---|
| `groups.json` SystemLandscape | 650 × 5,911 | 650 × 2,911 |
| `groups.json` Containers | 1,350 × 2,339 | 1,350 × 1,439 |
| `cyclic-groups.json` CyclicGroups | 13,303 × 15,143 | 13,303 × 9,143 |

Dagre 2.x and 3.x ship one bundled build each, and their `exports` map closes `lib/`. `src/engine/layout/automatic.ts` runs Dagre's ordering step itself through `customOrder` and imported its pieces from `lib/order/`.

## Decision

Pin `@dagrejs/dagre` to exactly 2.0.4 for every automatic layout. Port the pieces of Dagre's ordering step that `automatic.ts` runs into `src/engine/layout/dagre-order.ts`, step for step from the pinned version, under Dagre's MIT notice. Keep the ordering step in `automatic.ts` in step with Dagre's own, so a view Dagre orders soundly keeps Dagre's order.

## Consequences

- Automatic layouts of views with boundaries keep one rank separation between ranks. 18 of the 32 automatic views in the acceptance set and the test fixtures get shorter, by up to 56%, and every element keeps its rank.
- Removing the empty ranks also removes the relationship bends Dagre kept on them, so some views get narrower: Amazon Web Services' deployment view drops from 10,620 to 4,320 units wide.
- Dagre 2.0.4 also keeps the later of two orders with the same number of crossings. That moves elements along their rank in 7 of the 32 views: Big Bank plc's System Context and both deployment views, at either separation, and Renderizr's own context view. Big Bank plc's development deployment view gets about 6% wider.
- Automatic layouts of views with boundaries no longer match the Structurizr renderer's height. The quirks [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md) keeps are the wide boundaries and the diagonal polylines.
- Every Dagre upgrade now means checking the port against that version's `lib/order/` and `lib/util.js`. `renovate.json` keeps the exact pin.
- The large acceptance view lays out in about 1.4 s in Node, against 2.0 s with Dagre 1.1.8.

## Alternatives considered

- Dagre 3.1.1: it lays out the large acceptance view now that tight-tree ranks it, but it moves elements along their rank in 9 views where 2.0.4 keeps them, so it changes more than the fix needs.
- Patching Dagre 1.1.8's `removeEmptyRanks` in place: it fixes the bug alone, and leaves the project maintaining a fork of Dagre 1.1.8.
- Running the ported ordering step on every view without 2.0.4's rule for ties: it would keep the 7 views where they were, but every view would then follow an order Dagre itself no longer gives.

## Reference links

- [Dagre releases](https://github.com/dagrejs/dagre/releases)
- [Dagre 2.0.1: `removeEmptyRanks` skips nodes without a rank](https://github.com/dagrejs/dagre/compare/v2.0.0...v2.0.1)
- [MIT license](https://opensource.org/license/mit)
