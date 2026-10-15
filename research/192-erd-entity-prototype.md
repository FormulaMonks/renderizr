# Prototype: draw an ERD entity collapsed and expanded

A rough ERD in the React Flow engine, to react to how an entity looks and behaves collapsed and expanded. This branch builds on `chore/184/mermaid-compact-layout` and never merges.

## Run it

```bash
pnpm dev -- test/__fixtures__/mermaid-erd.json
```

Open the **Shop** or **Shop, left to right** view.

## What the prototype does

- **Fixture**: `test/__fixtures__/mermaid-erd.json` carries `mermaid-erd/shop.mmd` (six entities with mixed-case aliases such as `CUSTOMER["Customer"]`: composite keys, an entity with no key attribute, one with no attributes, every cardinality) as `shop` and, with `direction LR`, as `shop-lr`. Structurizr isn't installed here, so the JSON is hand-built the way Structurizr encodes `content`; `workspace.dsl` shows the source it stands for.
- **Build** (`scripts/mermaid/index.js`, `readErd`): each entity becomes a custom element tagged `Mermaid:entity` that carries its attributes as JSON in a property; each relationship carries its start and end markers in two properties and draws dashed when non-identifying. ERDs take Mermaid's ERD spacing (140 between nodes, 80 between ranks, scaled) in place of the flowchart's 50 and 50. Mermaid names an edge's cardinalities backwards (`cardA` sits at entity B), which the build undoes.
- **Page** (`src/engine/geometry/entity.ts`, `graph.ts`): the page sizes an entity from its header and the rows its state shows, with its own text measurement, before Dagre runs. A collapsed entity draws like a C4 element box: every collapsed entity of the diagram at one size (the largest any of them needs, in a C4 element's 3:2 proportions), its name in bold centered over its `PK` and `FK` attributes (`id [PK]`). An expanded one adds the type column, the `UK` and keyless rows and, with descriptions on, the comment column. The last column shown takes whatever width the header leaves over, so keys sit right after the name. The header keeps the entity's fill; rows take a light tint of it, with dark text mixed from the fill.
- **Island** (`island.tsx`): an expanded entity draws as a box node with an HTML header, a row per attribute and a band at the bottom. A round plus or minus button sits at the bottom center of every entity with attributes; it is a real button with `aria-expanded`. Overrides live in the canvas, for the view and the preference they were made under. Every expand or collapse, from an entity or the toolbar, refits the diagram.
- **Toolbar** (`current-view.ts`): an icon button (Bootstrap's arrows expand and arrows collapse) labeled "Expand all entities" or "Collapse all entities" joins the toolbar's main group on a view the build marks as an ERD, and stores `entitiesCollapsed` beside the label toggles.
- **End markers**: one, zero or one, one or more and zero or more, drawn as strokes at each end, with hollow circles filled with the canvas background. They replace the arrowhead. Each end runs straight out of its side for the longest marker's length plus a little before the route may bend, and side choice counts bends from those stubs, so no marker sits on a knee.

## Pictures

| | Light | Dark |
| --- | --- | --- |
| Collapsed (first visit) | ![](192/light-shop-collapsed.png) | ![](192/dark-shop-collapsed.png) |
| Expanded (Expand all) | ![](192/light-shop-expanded.png) | ![](192/dark-shop-expanded.png) |
| Expanded, ORDER collapsed by its chevron | ![](192/light-shop-order-collapsed.png) | ![](192/dark-shop-order-collapsed.png) |
| Left to right, collapsed | ![](192/light-shop-lr-collapsed.png) | ![](192/dark-shop-lr-collapsed.png) |
| Left to right, expanded | ![](192/light-shop-lr-expanded.png) | ![](192/dark-shop-lr-expanded.png) |

## Findings

- **The entity fits the engine.** The geometry modules take an entity as a Box of the size the page computes; edge labels and the style cascade need no change. The silent source's primary fill carries over from the compact layout prototype.
- **Sizing belongs to the page.** The size depends on the state, the descriptions toggle and the font, so only the page knows it, as the flowchart prototype found for nodes.
- **Refit on every toggle.** A first try panned so a clicked entity's header kept its screen position to the pixel, but the toolbar button then kept a stale viewport and left entities off screen. Refitting after every expand or collapse keeps the whole diagram in view; the drive checks every entity sits inside the canvas after a toggle click and after Collapse all.
- **The jump reads well without animation.** Dagre rerunning reorders more than the toggled entity, and a refit shows the new arrangement at once. Easing node positions moved the boxes but not the edges, which the router draws at their final place at once, so the prototype drops it.
- **Collapsed entities as C4 boxes.** One size for every collapsed entity makes a collapsed ERD read like a C4 view, and the box comes close to the expanded size, so a toggle moves less. An entity with no attributes never toggles; it draws the collapsed box while the others are collapsed and a bare header while they are expanded.
- **Spacing.** With the flowchart's spacing, routes and labels crowded between close entities and hugged their sides. Mermaid's ERD spacing leaves room for two straight ends and a label in every gap of the fixture. Where a route's straight end lands near another entity, the router now keeps as much clearance as still leaves the end outside it, in place of none.
- **Markers need straight ends.** Without a rule, the router bent routes closer to an entity than a marker is long, so markers broke across the knee, worst where entities sit close together. Two router changes fix every edge in the fixture: a stub as long as the marker at each end, and side choice that counts bends from the stubs (otherwise a side whose stub points away from the other entity wins on its midpoint and the route doubles back). Mermaid's rank separation (75) just fits two stubs at the default thickness (36 each).
- **An entity with no key attribute** collapses to its header and keeps a toggle, which reads well (DELIVERY-ADDRESS). An entity with no attributes draws no chevron (CATEGORY).
- **Shared sides** still crowd where two ends meet one side (CUSTOMER's `uses` and `places` in some states); the spacing rule from the edge ends decision covers that.

## Left out

Entity styling from `style` and `classDef`, entity aliases with brackets, attribute keys spaced along shared sides, keyboard focus order for chevrons, export, edit mode.
