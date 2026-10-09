# Decisions

The decisions page lists the workspace's architecture decisions newest first, grouped by year, headed by how many are recorded and how many are in force, with a status for each and a graph of the supersede, amend and reference links between them. Opening a decision shows its text, with links to other decisions that open them.

## Sub-features

- `adrs-index` lists every decision with its number, status and title, and counts them.
- `adrs-open` opens a decision's page from the menu, an index row or a link. The graph's dots open nothing.
- `adrs-status` shows Accepted, Amended or Superseded, matching each decision's `## Status`.
- `adrs-graph` draws a lane for each supersede or amend chain and a dotted line for each reference, and lights the open or pointed-at decision's links.
- `adrs-links` opens the linked decision from a relative link in a decision's text.

## How to get to it (user POV)

- Choose **Decisions** in the header.
- Choose a decision in the menu, or a row in the index (click, or focus it and press Enter).
- Follow a link to another decision inside a decision's text.
- Open a link to `#/?page=adrs&adr=<id>`.

## Driving it with drive.mjs

Preconditions:

- `$S/launch.sh $RUN build architecture/workspace.json --single-file`. Renderizr's own log has 19 decisions, all in force; 14 amends 4, the log's only amend.

- **Index.** `{ "open": "{{build}}#/?page=adrs" }`, then `{ "waitFor": "document.querySelector('circle[data-mark=\"dot\"]')" }`. Assert the heading's count reads `19 recorded, 19 in force` and shoot the index.
- **Status.** Assert `document.querySelector('circle[data-mark="dot"][data-decision="4"]').dataset.status === 'amended'`, and `'accepted'` for `data-decision="14"`.
- **Open from the list.** `{ "click": "a[data-item-id=\"14\"]" }`, then wait until `#decision-title h2` contains `Rank large views with tight-tree`. The hash reads `adr=14`. Shot.
- **Highlight.** On decision 14, assert `#adrs-graph path[data-highlighted][data-kind="amend"][data-from="14"][data-to="4"]` exists, a `circle[data-mark="ring"][data-decision="14"]` marks it, and the other marks carry `data-dimmed`.
- **Related only.** `{ "click": "#adrs-related" }`, then wait for `aria-pressed="true"`. The menu's `a[data-item-id]` entries are exactly `14` and `4`.
- **Link to another decision.** On decision 14, click `#decision-content a[href="#4"]` (the "Amends 4. …" note) and assert `location.hash.includes('adr=4')` and that `#decision-title h2` contains `Use Dagre for automatic layout`.
- **Index row by keyboard.** On the index, focus `#adrs-index a[data-item-id="15"]`, press `Tab`, and assert row 14's link to 4 carries `data-highlighted`. `Enter` opens `adr=14`.
- **Deep link.** `{ "open": "{{build}}#/?page=adrs&adr=9" }` opens decision 9 directly, with the index hidden.
- **Dots open nothing.** On decision 9, `{ "click": "#adrs-graph circle[data-mark=\"dot\"][data-decision=\"2\"]" }` leaves the hash at `adr=9`.
- **Scrolling lanes.** `$S/launch.sh $RUN dev test/__fixtures__/decision-graph-scroll.json` (82 decisions, 62 in force). The index shows `#adrs-index-controls`, and its `‹` lowers `[data-lanes]`'s `scrollLeft`. Opening a decision and expanding the menu's graph shows `#adrs-lanes`.

## Gotchas

- Statuses come from each ADR's `## Status` first line; an amended ADR still counts as in force.
- The counts and ids above follow the log on `main`. Check `ls architecture/decisions` against them on any other branch, and update them only when an ADR lands on `main`.
- Read links off `path[data-mark="edge"]` or the workspace's `links`, never off a `stretch` or `join`: a stretch's `data-from` and `data-to` name the dots at the ends of a lane segment, which can pair two decisions that never link (the index's `17>14`).
- `architecture/workspace.json` must be merged from the DSL (`pnpm architecture:merge`) after an ADR changes, or the page shows the old log.
- The graph's columns depend on every link in the log; adding an ADR can shift every lane (the `test/decision-graph.test.js` snapshot of our own decisions counts them).
- The decision's title, date and status pill sit in `#decision-title` (`h2`), outside `#decision-content`, which holds only the body.
- Structurizr rewrites a link between decisions to `#<id>`, so links read `href="#12"`, never a file name or a route.
- Dates without a time sort by number within a day.
