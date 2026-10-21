# 25. Lay out with Dagre 3.1.1

Date: 2026-10-21

## Status

Accepted

Amends [23. Lay out with Dagre 2.0.4](0023-lay-out-with-dagre-2-0-4.md): the Dagre version, and the ordering step the port follows.

## Context

[23. Lay out with Dagre 2.0.4](0023-lay-out-with-dagre-2-0-4.md) pins Dagre 2.0.4 and turned down 3.1.1 because it moves elements along their rank in 9 views where 2.0.4 keeps them. Staying on 2.0.4 freezes the port in `src/engine/layout/dagre-order.ts` on a line Dagre no longer develops, so every later fix to Dagre's layout means a jump across the same changes anyway.

Dagre 3 rewrites the library in TypeScript and ships its own types. It drops the global `dagre` namespace the port took its types from, and it changes the ordering step in two ways:

- Each sweep breaks ties between equal barycenters to the right. On the sweeps that alternate, the side flips only after a rank that broke a tie. Dagre 2.0.4 broke ties to the left on two sweeps of every four and to the right on the other two.
- Two dummy nodes of one edge that tie on a rank are an edge and its reverse. Dagre takes the reversed one out of the sort and puts it back right after the other.

Dagre 3 can also order a dynamic layout against its earlier layout. `customOrder` hands Dagre's own step no earlier layout, so those comparisons always tie and change nothing here.

Measured in Node on the acceptance set and the test fixtures, as the width and height in units the elements of each view span:

| View | Dagre 2.0.4 | Dagre 3.1.1 | Elements along their rank |
|---|---|---|---|
| Big Bank plc SystemLandscape | 3,068 × 2,176 | 2,700 × 2,176 | swapped on 2 of 4 ranks |
| Big Bank plc SystemLandscape, tight | 2,418 × 1,676 | 2,208 × 1,676 | swapped on 2 of 4 ranks |
| Big Bank plc Components | 3,790 × 2,767 | 3,903 × 2,767 | mirrored on 3 of 4 ranks |
| Big Bank plc Components, tight | 3,125 × 1,967 | 3,238 × 1,967 | mirrored on 3 of 4 ranks |
| Big Bank plc SystemContext | 1,200 × 1,821 | 1,200 × 1,821 | same order, 2 elements shift |
| Big Bank plc SystemContext, tight | 1,000 × 1,421 | 1,043 × 1,421 | same order, 3 elements shift |
| `cyclic-groups.json` CyclicGroups | 13,303 × 9,143 | 12,170 × 9,143 | reordered on 10 of 13 ranks |
| `large-landscape.json` LargeLandscapeAutomatic | 156,323 × 2,608 | 154,778 × 2,608 | reordered on all 4 ranks |
| Acceptance LandscapeAutomatic | 2,030 × 2,839 | 2,085 × 2,839 | same order, every element shifts |

Every other automatic view keeps every element and every route where it was.

## Decision

Pin `@dagrejs/dagre` to exactly 3.1.1 for every automatic layout. Port the pieces of Dagre 3.1.1's ordering step that `automatic.ts` runs into `src/engine/layout/dagre-order.ts`, step for step, its rule for ties and its handling of reversed edges included, and leave out the comparisons by an earlier layout that `customOrder` never reaches. Keep the rest of [23. Lay out with Dagre 2.0.4](0023-lay-out-with-dagre-2-0-4.md) as it stands.

## Consequences

- 9 automatic views change and every element keeps its rank, so no view gets taller. Big Bank plc's SystemLandscape gets about 12% narrower and its Components view about 3% wider.
- Big Bank plc's SystemLandscape and Components views mirror the order of the ranks that change, so they read differently from the Structurizr renderer's layout of the same views.
- On every view whose order Dagre leaves sound, the ported ordering step gives exactly Dagre's order. The large landscape view is the one view in the set that falls back to the port, and it follows Dagre 3.1.1's rule for ties there too.
- The large acceptance view lays out about as fast as with Dagre 2.0.4.
- Every Dagre upgrade still means checking the port against that version's `lib/order/` and `lib/util.ts`. `renovate.json` keeps the exact pin.

## Alternatives considered

- Staying on Dagre 2.0.4: it keeps the 9 views where they are, and leaves every later Dagre fix behind the same jump.
- Dagre 3.1.1 with 2.0.4's rule for ties in the port: the port would stop matching Dagre's own step, and only the one view that falls back to it would keep its order.

## Reference links

- [Dagre releases](https://github.com/dagrejs/dagre/releases)
- [Dagre 3.1.1 `lib/order`](https://github.com/dagrejs/dagre/tree/v3.1.1/lib/order)
- [MIT license](https://opensource.org/license/mit)
