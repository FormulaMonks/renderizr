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

- `$S/launch.sh $RUN build architecture/workspace.json --single-file`. In Renderizr's own log, 14 amends 4.
- Read the expected counts from the workspace you built, never from this file, and write them into the steps (an unquoted heredoc expands them):

  ```bash
  read RECORDED IN_FORCE < <(node -p 'const d = require("./architecture/workspace.json").documentation.decisions; `${d.length} ${d.filter((x) => /^(accepted|amended)$/i.test(x.status.trim())).length}`')
  ```

- **Index.** `{ "open": "{{build}}#/?page=adrs" }`, then `{ "waitFor": "document.querySelector('circle[data-mark=\"dot\"]')" }`. Assert the heading's count reads `$RECORDED recorded, $IN_FORCE in force` and shoot the index.
- **Status.** Assert `document.querySelector('circle[data-mark="dot"][data-decision="4"]').dataset.status === 'amended'`, and `'accepted'` for `data-decision="14"`.
- **Open from the list.** `{ "click": "a[data-item-id=\"14\"]" }`, then wait until `#decision-title h2` contains `Rank large views with tight-tree`. The hash reads `adr=14`. Shot.
- **Highlight.** On decision 14, `{ "links": "#adrs-graph", "highlighted": true, "expect": ["14>4 amend"] }`. Assert a `circle[data-mark="ring"][data-decision="14"]` marks it and the other marks carry `data-dimmed`.
- **Related only.** `{ "click": "#adrs-related" }`, then wait for `aria-pressed="true"`. The menu's `a[data-item-id]` entries are exactly `14` and `4`.
- **Link to another decision.** On decision 14, click `#decision-content a[href="#4"]` (the "Amends 4. …" note) and assert `location.hash.includes('adr=4')` and that `#decision-title h2` contains `Use Dagre for automatic layout`.
- **Index row hover.** On the index, `{ "hover": "#adrs-index a[data-item-id=\"14\"]" }`, then `{ "links": "#adrs-index-graph", "highlighted": true, "expect": ["14>4 amend"] }`. The index draws its own graph in `#adrs-index-graph`; `#adrs-graph` is the menu's, on a decision's page.
- **Index row by keyboard.** On the index, focus `#adrs-index a[data-item-id="15"]` and press `Tab`: row 14 lights the same links. `Enter` opens `adr=14`.
- **Deep link.** `{ "open": "{{build}}#/?page=adrs&adr=9" }` opens decision 9 directly, with the index hidden.
- **Dots open nothing.** On decision 9, `{ "click": "#adrs-graph circle[data-mark=\"dot\"][data-decision=\"2\"]" }` leaves the hash at `adr=9`.
- **Scrolling lanes.** `$S/launch.sh $RUN dev test/__fixtures__/decision-graph-scroll.json` (82 decisions, 62 in force). The index shows `#adrs-index-controls`, and its `‹` lowers `[data-lanes]`'s `scrollLeft`. Opening a decision and expanding the menu's graph shows `#adrs-lanes`.

## Gotchas

- Statuses come from each ADR's `## Status` first line; an amended ADR still counts as in force.
- The ids above (4, 9, 14, 15) hold on any branch that carries their ADRs. Check `ls architecture/decisions` when a step can't find one.
- Read links with the `links` step, never straight off `data-from` and `data-to`. A collapsed graph draws its links as `edge` marks; an expanded one, like the index's, as `stretch` and `join` marks. A `reference` stretch only carries a lane up to a reference, so its ends can pair two decisions that never link.
- `architecture/workspace.json` must be merged from the DSL (`pnpm architecture:merge`) after an ADR changes, or the page shows the old log.
- The graph's columns depend on every link in the log; adding an ADR can shift every lane (the `test/decision-graph.test.js` snapshot of our own decisions counts them).
- The decision's title, date and status pill sit in `#decision-title` (`h2`), outside `#decision-content`, which holds only the body.
- Structurizr rewrites a link between decisions to `#<id>`, so links read `href="#12"`, never a file name or a route.
- Dates without a time sort by number within a day.
