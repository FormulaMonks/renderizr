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
- **Targets.** On `Container-001`, the Command-Line Interface container has one activation target, its component view: click `.react-flow__node[data-id="5"]` and the hash moves straight to `view=CLI-Components`, with no target menu. An element with several targets opens a `[role="menu"]` listing them instead.

## Gotchas

- `[data-ready="true"]` turns true once per drawn view; after switching views, wait for `ready` again before reading positions.
- Element and relationship ids are the workspace's ids, not the DSL identifiers; read them off the workspace JSON (`views.*[].elements[].id`).
- `Renderizr` (the system context view) uses automatic layout, so its positions come from Dagre and may differ from any stored coordinates.
- Each view in the list is a `button` inside `li[data-viewkey]`, not a link.
- The theme toggles in the diagram toolbar and the header are separate preferences, kept in `localStorage`: a fresh `open` in a fresh Chrome profile starts from the system scheme `--scheme` sets.
