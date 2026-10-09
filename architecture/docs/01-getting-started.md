# Getting started

Renderizr renders a [Structurizr](https://structurizr.com/) workspace as a static site, or as a single self-contained HTML file you can host anywhere. The site holds every view, the workspace documentation and the decision log. This site is Renderizr's own architecture, rendered by Renderizr.

## Who it is for

You keep a C4 model in Structurizr, and you want everyone else to read it without an account, a running server or a copy of the DSL. Renderizr takes the workspace JSON you already have and turns it into pages you can put behind a URL. The engine draws each view from its workspace semantics: positions, styles, themes, shapes and routing. Diagrams read the way they do in Structurizr, with real text wrapping and embedded fonts.

Renderizr renders a workspace and leaves its definition to you: the model, the views and the styles all come from your workspace, unchanged.

## Requirements

- **Node 20 or newer.** The build checks the version before anything else and stops with a clear message, because `npx` runs whatever Node comes first on the `PATH`.
- **A workspace in JSON.** [structurizr-cli](https://docs.structurizr.com/cli) exports one from your DSL, and the Structurizr [server API](https://docs.structurizr.com/commands) hands one back. Renderizr never parses DSL.
- **Network access at build time**, only when the workspace, the logo or the font is remote, or when the workspace references themes or icons by URL. The rendered output never needs it.

Builds need nothing else: no JVM, no Docker, no Graphviz and no PlantUML. Only [edit mode](02-usage.md#edit-mode) on a `workspace.dsl` needs Structurizr's tools.

## Render a workspace

Point Renderizr at a workspace JSON file, by path or by URL. This command renders the Big Bank plc example:

```bash
npx github:FormulaMonks/renderizr https://raw.githubusercontent.com/structurizr/structurizr/main/structurizr-export/src/test/resources/big-bank-plc.json
```

Your own workspace works the same way:

```bash
npx github:FormulaMonks/renderizr ./workspace.json
```

The build takes a couple of seconds once npm has fetched the package, and writes the site into `./structurizr-output`: an `index.html`, an `assets/` folder and a favicon. The site uses relative URLs, so it works from any folder on any static host.

## Open the site

Serve the output folder with any static server:

```bash
npx servor structurizr-output
```

Then open the URL it prints. The views sit down the side; the header leads to the documentation and the decisions.

To open the result straight off your disk, or to send it to someone as one file, render with `--single-file` instead:

```bash
npx github:FormulaMonks/renderizr ./workspace.json --single-file
```

Then open `structurizr-output/index.html` in a browser. It needs no server and makes no network requests.

## What you get

- **Every view**, listed down the side: landscape, context, container, component, dynamic, deployment, image, filtered and custom, each with its own mark and key.
- **A live engine** built for workspace JSON. Diagrams pan and zoom, dynamic views animate, labels toggle, and an element with several activation targets opens a target menu.
- **Workspace documentation** as pages, with a table of contents and heading anchors. Heading ids match GitHub's, and relative links between documentation files and decisions open the matching page. Markdown gets GitHub-style alerts, permalinks and highlighting, and Renderizr converts AsciiDoc to the same pages.
- **The decision log**, with status pills, supersessions and amendments, grouped by year.
- **Light and dark**, following the reader's system setting until they choose one. The page and the diagrams keep separate preferences.
- **Deep links that last**: routing lives in the URL hash, so a link to a view, document or decision still works after a reload, over `file://` and inside a sandboxed frame.

Renderizr reads documentation and decisions from the workspace level (`documentation.sections` and `documentation.decisions`). It leaves out sections attached to an individual software system or container.

## Next steps

- [Usage](02-usage.md) covers every flag, the single file, edit mode and using Renderizr from an AI agent.
- [Contributing](03-contributing.md) takes you from a clone to a merged pull request.
- [Reference](04-reference.md) covers local development, every pnpm script, Structurizr's tools for edit mode, the project layout and adding a test.
