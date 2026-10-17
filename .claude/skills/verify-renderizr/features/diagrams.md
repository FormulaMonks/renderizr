# Diagrams

The diagrams page lists every view of the workspace down the side and draws the chosen one with the React Flow engine. The diagram pans and zooms, dynamic views animate, labels toggle, and an element with several activation targets opens a target menu.

## Sub-features

- `views-list` lists every view with its title and key, and marks the open one.
- `views-deep-link` opens a view from its URL, including after a reload.
- `views-draw` draws the view: elements, boundaries, edges and labels, then reports ready.
- `views-controls` zooms in, zooms out, fits the diagram and toggles the theme and labels.
- `views-targets` follows an element's activation targets, or opens the target menu when it has several.

## How to get to it (user POV)

- Open the site; the diagrams page is the default page.
- Choose **Diagrams** in the header.
- Choose a view in the list on the left.
- Open a link to `#/?page=diagrams&view=<key>`.

## Driving it with drive.mjs

Preconditions:

- A build of `architecture/workspace.json` (`$S/launch.sh $RUN build architecture/workspace.json --single-file`) or a dev server on a fixture.

- **Default page.** `{ "open": "{{build}}" }`, `{ "ready": true }`. A view is drawn and `location.hash` names `page=diagrams`.
- **Choose a view.** `{ "click": "li[data-viewkey=\"Site-Components\"] button" }`, wait until `location.hash.includes('view=Site-Components')`, then `{ "ready": true }`; `.react-flow__node[data-id]` counts 12. Shot before and after.
- **Deep link.** `{ "open": "{{build}}#/?page=diagrams&view=Container-001" }`, `{ "ready": true }`. Assert `document.querySelectorAll('.react-flow__node[data-id="5"], .react-flow__node[data-id="13"]').length === 2` (the Command-Line Interface and Static Site containers).
- **Zoom.** Read `document.querySelector('.react-flow__viewport').style.transform`, `{ "clickLabel": "Zoom in" }`, and assert the transform's `scale` grew (0.365 to 0.438 on a 1440×900 window); `{ "clickLabel": "Fit diagram" }` brings the whole view back in.
- **ERD entities.** On a dev server for `test/__fixtures__/mermaid-erd.json`, `steps/erd-entities.json` drives the toolbar's "Expand all entities" button: every entity expands, one entity's own toggle (`[data-entity-toggle]`, its state in `aria-expanded`) collapses it alone, "Collapse all entities" collapses every one, a reload (`about:blank`, then the view again) keeps the preference and drops the override, `shop-lr` follows the same preference, and the descriptions toggle hides the comment column. The technologies toggle and the entities button read `.toggle-technologies` and `.toggle-entities`.
- **ERD entities by keyboard.** On the same dev server, `steps/erd-entity-keys.json` focuses the canvas (`[data-view-key][data-ready]`, one Tab stop of the page) and presses Tab: the walk visits the five toggles once each and skips `CATEGORY`, which has no attributes and no toggle. Enter on Customer's toggle expands that entity alone and Space collapses it, and after each refit `document.activeElement` is still `[data-focus-item="toggle:mermaid:CUSTOMER"]`.
- **Flowchart links by keyboard.** On a dev server for `test/__fixtures__/mermaid-flowchart.json`, `steps/flowchart-links.json` opens the `links` view, focuses the canvas and presses Tab: the walk visits `orders`, `prepare`, `check`, `pipeline`, `shop` and `signup` in reading order, each a `role="button"` named for its node, and the next Tab leaves the canvas. `here`, which links to the view itself, and `notify`, a click callback, have no `data-focus-item`.
- **Sequence notes.** On a dev server for `test/__fixtures__/mermaid-sequence.json`, `steps/sequence-notes.json` opens `checkout`, where the descriptions toggle shows and the technologies toggle hides, and clicks "Hide descriptions in diagrams": every `[data-sequence="note"]` goes and the messages (`.react-flow__edge`) stay; "Show descriptions in diagrams" brings the notes back.
- **Targets.** On `Container-001`, the Command-Line Interface container has one activation target, its component view: click `.react-flow__node[data-id="5"]` and the hash moves straight to `view=CLI-Components`, with no target menu. An element with several targets opens a `[role="menu"]` listing them instead.

## Gotchas

- `[data-ready="true"]` turns true once per drawn view; after switching views, wait for `ready` again before reading positions.
- Element and relationship ids are the workspace's ids, not the DSL identifiers; read them off the workspace JSON (`views.*[].elements[].id`).
- `Renderizr` (the system context view) uses automatic layout, so its positions come from Dagre and may differ from any stored coordinates.
- Each view in the list is a `button` inside `li[data-viewkey]`, not a link.
- The theme toggles in the diagram toolbar and the header are separate preferences, kept in `localStorage`: a fresh `open` in a fresh Chrome profile starts from the system scheme `--scheme` sets.
