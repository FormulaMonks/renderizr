# 14. Rank large views with tight-tree

Date: 2026-10-04

## Status

Accepted

Amends [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md): the ranker for a view of more than 100 elements.

## Context

Dagre ranks a graph with network simplex by default, and the Structurizr renderer does the same, so [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md) gives every automatic layout that ranker. Network simplex stops scaling on large views with groups. The large acceptance view (a system landscape with 300 elements, 600 relationships and 20 groups) reaches `data-ready` after 10.6 s in headless Chrome against a budget of 5 s, and network simplex takes about 9 s of that. Routing takes about 1.3 s, so faster routing or rendering cannot bring the view under budget.

We timed both rankers in Node on generated grouped views with two relationships per element and one group per 15 elements, laid out in tiers, three seeds each:

| Elements | Network simplex | Tight-tree |
|---|---|---|
| 50 | 49–62 ms | 44–59 ms |
| 100 | 142–191 ms | 84–110 ms |
| 125 | 376–479 ms | 102–125 ms |
| 150 | 452–5012 ms | 138–208 ms |
| 200 | 1349–72180 ms | 203–229 ms |
| 300 | 12.3 s (the large acceptance view) | 337–414 ms |

Up to 100 elements network simplex stays well under a second. Past about 125 its time grows without bound, and the same size can take half a second or a minute depending on the relationships. Apart from the large acceptance view, the largest automatic view in the acceptance set has 11 elements.

## Decision

Rank a view of more than 100 elements with Dagre's tight-tree ranker. Keep network simplex for every other view. Count the elements Dagre places; boundaries do not count. Keep the threshold and the choice in `src/engine/layout/automatic.ts`, beside the rest of the Dagre setup.

## Consequences

- Every automatic layout of up to 100 elements keeps network simplex and the layout it gives: the boxes and routes of the 33 ordinary automatic views in the acceptance set and the test fixtures matched before and after the change.
- The large acceptance view reaches `data-ready` in about 2.1 s in headless Chrome.
- A view of more than 100 elements can look different from the same view in the Structurizr renderer: tight-tree ranks fewer elements on their optimal rank, so some relationships span more ranks.
- A view that grows past 100 elements changes ranker, so adding one element can rearrange the whole layout.
- On graphs with many relationships between groups that run both ways, Dagre's time goes into ordering rather than ranking, and tight-tree does not help there.

## Alternatives considered

- Dagre 2.0.4: it ranks the large view no faster (12.2 s in Node) and moves elements in 27 of the 33 automatic views, by 350 to 6,300 units.
- Dagre 3.1.1: it moves elements in the same 27 views and fails on the large view with `Not possible to find intersection inside of the rectangle`.
- Tight-tree for every view: fast, but ordinary views would lose the ranking the Structurizr renderer gives them.
- Faster routing and rendering (route caching, React Flow's `onlyRenderVisibleElements`, a grid index for avoidance): ranking alone exceeds the budget.

## Reference links

- [Dagre wiki: configuring the layout](https://github.com/dagrejs/dagre/wiki)
- [Dagre releases](https://github.com/dagrejs/dagre/releases)
