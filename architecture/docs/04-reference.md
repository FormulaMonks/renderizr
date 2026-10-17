# Reference

The details you look up while working on Renderizr: running it from a clone, every pnpm script, Structurizr's tools for edit mode, where the code lives and where a new test goes. [Contributing](03-contributing.md) covers the workflow around them.

## Local development

```bash
pnpm dev
```

Vite serves this repository's own workspace, `architecture/workspace.json`, on <http://localhost:5173>, with hot reload for `src/`. To check a change, point the dev server at a versioned fixture under `test/__fixtures__/` that shows it:

```bash
pnpm dev -- test/__fixtures__/edge-routing.json --font Inter
```

Always put `--` before the arguments. Without it, Vite reads them itself and stops on any option it does not know. The dev server accepts the branding flags `--logo <path|url>`, `--logo-alt <text>`, `--logo-href <url>`, `--font <family>` and `--primary-color <color>`, and `--single-file`, before or after the workspace path, and reads `RENDERIZR_WORKSPACE` from the environment when you pass no workspace. It takes the workspace's `renderizr.*` branding properties the way `pnpm render` does, and prints the same branding notices. Git tracks the fixtures, so `git status` shows whether anything changed one while you looked. When no fixture shows your change, add one in the same pull request.

To build what users get, run the production build:

```bash
pnpm render architecture/workspace.json --single-file
```

`pnpm render` runs `tsc` first, so a type error fails the build before Vite starts, then writes into `./structurizr-output` unless `--out` says otherwise. It takes its arguments with no `--`. Open `structurizr-output/index.html` in a browser to look at the result; a single file needs no server.

## pnpm scripts reference

Run every script from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Serves a workspace with Vite and hot reload, as [Local development](#local-development) shows |
| `pnpm render <workspace> [options]` | Type-checks, then runs the production build. It takes the CLI's [options](02-usage.md#options) |
| `pnpm preview` | Builds `architecture/workspace.json` and serves the output with `vite preview` |
| `pnpm test` | `node --test` over `scripts/*.test.js` and `scripts/mermaid/*.test.js` (the build pipeline) and `test/*.test.js` (the app), then `test/acceptance.test.js` on its own |
| `pnpm test:coverage` | The test suite with V8 coverage |
| `pnpm test:structurizr` | Runs edit mode's DSL pipeline against the Structurizr tools that `STRUCTURIZR_CLI` names, and skips itself when it is not set |
| `pnpm typecheck` | Type-checks `src/` |
| `pnpm lint` | Runs `biome ci .`: lint and format, never fixing, failing on any finding. CI and the pre-commit hook run the same check |
| `pnpm format` | Lint and format, fixing what Biome can fix in place |
| `pnpm lint:renovate` | Validates `renovate.json` |
| `pnpm architecture:merge` | Writes `architecture/workspace.json` again from `architecture/workspace.dsl` with Structurizr's tools, the way a DSL session of edit mode writes it. CI fails when the committed workspace differs from its DSL |
| `pnpm fixtures:acceptance` | Merges the acceptance fixture's DSL into its `workspace.json` with Structurizr's tools |
| `pnpm fixtures:large` | Writes the large landscape fixture again from its generator |
| `pnpm mermaid:parser` | Writes `scripts/mermaid/parser.js` again from Mermaid's source at the release `MERMAID_VERSION` pins, as [The Mermaid parser](#the-mermaid-parser) describes |
| `pnpm hooks` | Installs the git hooks, once per clone |
| `pnpm release:pr` | Opens or updates the release pull request with your own `gh` login, for maintainers |
| `pnpm release:tag` | Tags a merged release and creates its GitHub Release, for maintainers |

The script that renders a workspace is `render`, never `build`. npm prepares a git dependency with a full `npm install --include dev` whenever its `package.json` has a `build`, `prepare`, `prepack`, `install`, `preinstall` or `postinstall` script, and that slows every cold `npx` by seconds. `scripts/install.test.js` fails when one of those names comes back.

`pnpm architecture:merge` and `pnpm fixtures:acceptance` find Structurizr's tools the way [edit mode](#structurizrs-tools-for-a-dsl-session) does: `STRUCTURIZR_CLI` as a whole command, or `structurizr-cli` on the `PATH`.

Biome is the only linter and the only formatter. It indents with 4 spaces, skips `architecture/` and the workspaces copied from Structurizr, and respects `.gitignore`; `biome.json` holds the rest.

## Structurizr's tools for a DSL session

Renderizr never parses DSL. A DSL session runs Structurizr's own tools: `merge -workspace workspace.dsl -layout workspace.json`, which lays the saved layout over the model as Structurizr Local does, or `export` on the first run, while no `workspace.json` exists yet. Edit mode finds the tools in this order:

1. The `STRUCTURIZR_CLI` environment variable, read as a whole command.
2. `structurizr-cli` on your `PATH`.

The tools need Java 21 to 25; Groovy `!script` blocks fail on Java 26. Edit mode works with the 2026 distribution (`structurizr.war` and the `structurizr/structurizr` Docker image, where every tool is a subcommand) and with the archived `structurizr-cli` 2025.11.09.

```bash
STRUCTURIZR_CLI="java -jar ~/bin/structurizr.war" npx github:FormulaMonks/renderizr edit ./architecture
```

With Docker and no Java on your machine:

```bash
STRUCTURIZR_CLI='docker run --rm -v "$PWD:/usr/local/structurizr" structurizr/structurizr' npx github:FormulaMonks/renderizr edit ./architecture
```

Edit mode runs the command through the shell from the DSL's folder, so `$PWD` in single quotes expands there and the container mounts that folder. The tools write into a temporary `.renderizr-*` folder beside the DSL, which edit mode deletes after each run, and never write `workspace.json` themselves.

When a DSL change breaks the parse, the terminal prints the tools' output and the page shows the error over the last workspace that parsed, which stays editable. The next good run clears it.

Two behaviors come from Structurizr and stay as Structurizr has them:

- **The id fallback.** `merge` carries each element's position over by its canonical name and falls back to its id. When a DSL change renames an element and shifts the ids of others, `merge` can hand the renamed element another element's position. Check the views after a rename.
- **Unwatched includes.** Edit mode watches every file under the DSL's folder, except `workspace.json`, dot folders and `node_modules`. A file that `!include` pulls in from outside that folder goes unwatched, as in Structurizr Local: save a file inside the folder to run the tools again.

## Mermaid diagram notices

The build prints two kinds of notice about [Mermaid diagrams](02-usage.md#mermaid-diagrams), both on stderr, both naming the image view's key, and finishes either way. `pnpm dev` and edit mode print them to the terminal too.

A diagram Renderizr can't draw prints its reason, and the page shows the same text in place of the canvas: `Mermaid diagram "<key>": <reason>.`

| Reason | When |
| --- | --- |
| the image view carries no Mermaid source | A content field names the Mermaid server's `/svg/` or `/img/` path but holds nothing Renderizr can decode as text |
| a parse error at line N: … | Mermaid's own grammar stops on the source. The line counts from the top of the `.mmd` file, frontmatter included, and the message says what the parser stopped after |
| the content fields disagree | The image view fills more than one of `content`, `contentLight` and `contentDark`, and they hold different sources once CRLF becomes LF, or one holds a picture beside the Mermaid source |
| an edge to a subgraph isn't something Renderizr draws yet | An edge starts or ends at a subgraph rather than at a node. A construct that carries meaning fails the whole diagram rather than draw it wrong |

A diagram that draws but uses what Renderizr leaves out prints one warning that lists it, each entry once, in this order: the config's entries, then the subgraphs' and nodes', then the links', then the classes': `Image view "<key>": Renderizr supports only a subset of Mermaid styling; ignored: <entries>`.

| Entry | What Renderizr does instead |
| --- | --- |
| `theme "<name>"` | Draws Mermaid's `default` theme in place of a theme Mermaid doesn't know |
| A theme variable, such as `mainBkg` | Derives the palette without a theme variable that [Styles](02-usage.md#styles) doesn't list |
| `look` | Draws Mermaid's `classic` look in place of `handDrawn` or `neo` |
| `htmlLabels` | Draws every label as plain text lines, whatever `htmlLabels` says; also named for a label that holds HTML, as Structurizr's `mermaid <viewKey>` writes it |
| `layout: elk` | Lays the diagram out with Dagre, since Renderizr doesn't bundle ELK |
| `elk.<option>` | Leaves out each ELK option |
| A CSS property, such as `opacity` | Leaves out a property that a node's or subgraph's `style`, a `classDef` or a `linkStyle` sets and that [Styles](02-usage.md#styles) doesn't list. A link's `fill:none` names nothing, since a line draws no fill |
| `shape "<name>"` | Draws a rectangle in place of a stadium, subroutine, asymmetric, parallelogram, trapezoid or double circle node, or of any other `@{ shape }` name |
| `invisible links` | Leaves each `~~~` link out of the drawing and the layout |
| `link length` | Lays a longer link (`--->`) out as an ordinary one |
| `Markdown strings` | Draws the text of a Markdown string without its emphasis |
| `fa: icons` | Draws a label without its Font Awesome icons |

## The Mermaid parser

The build reads Mermaid source with `scripts/mermaid/parser.js`: Mermaid's own flowchart, ERD and sequence grammars and db classes, its frontmatter and directive reader and its theme code, cut loose from the rest of Mermaid and bundled into one ES module with Mermaid's MIT notice at the top. Only the build runs it; the page never carries it, and `mermaid` never enters Renderizr's dependencies.

`pnpm mermaid:parser` writes the file again. It checks out Mermaid's source at the tag that `MERMAID_VERSION` in `scripts/mermaid/generate/index.js` pins, installs its bundling tools into a folder of its own under the system's temporary folder, and bundles the reader with the stand-ins in `scripts/mermaid/generate/`. Two runs at one pin write the same bytes on any machine. It needs `git`, `npm` and the network.

Renovate raises the pin as a dependency update and never merges it on its own: run `pnpm mermaid:parser` on its branch, commit the parser it writes and check the Mermaid fixtures under `test/__fixtures__/` before it merges.

## Project layout

| Path | What lives there |
| --- | --- |
| `scripts/` | The build pipeline and edit mode's server, in plain ESM JavaScript that Node runs with no build step |
| `scripts/build.js` | The CLI entry point: checks the Node version, parses arguments, loads assets and runs Vite |
| `scripts/cli.js` | Option definitions and `--help`, for the build and for `renderizr edit` |
| `scripts/assets.js` | Fetching and embedding the workspace, themes, element icons, logo and font |
| `scripts/branding.js` | Choosing the branding from the flags and the workspace's `renderizr.*` properties, shared by the build, edit mode and the dev server |
| `scripts/edit.js`, `scripts/edit-plugin.js` | Edit mode: the session a path opens, the local server and its save endpoint |
| `scripts/dsl-pipeline.js`, `scripts/structurizr-tools.js` | Running Structurizr's tools on a `workspace.dsl` |
| `scripts/workspace-writer.js`, `scripts/structurizr-schema.js` | Writing `workspace.json` the way Structurizr does |
| `scripts/config.js` | The Vite configuration, shared with the dev server |
| `scripts/plugins.js` | Build plugins: branding injection and single-file inlining |
| `scripts/escapes.js` | Rewrites the escape sequences a Claude artifact upload rejects, and fails the build if any survive |
| `scripts/mermaid/` | Reading the Mermaid source an image view carries: decoding it, the generated parser and the plain model of each diagram the page draws |
| `vite.config.ts` | The dev server only; the production build goes through `scripts/build.js` |
| `src/` | The page that ships in the output, in TypeScript, bundled by Vite |
| `src/model/` | The typed workspace model and style resolution, ported from Structurizr, and `resolveView` |
| `src/engine/` | The React Flow engine: the diagram contract in `index.ts`, geometry, layout and the island |
| `src/pages/`, `src/components/` | The diagrams, documentation and decisions pages, and the parts they share |
| `test/` | Tests for `src/`, and the DOM and module hooks they run on in `test/support/` |
| `test/__fixtures__/` | Versioned workspaces for tests and for checking changes in the dev server |
| `architecture/` | Renderizr's own workspace, which this site renders |

The model layer in `src/model/` reads the workspace: a typed port of Structurizr's workspace model and style resolution, and `resolveView`, which turns any view key into a concrete view. `src/engine/geometry/` and `src/engine/layout/` are plain functions over that view: boundaries, shapes, unplaced elements, routes, and Dagre for automatic layout. The island in `src/engine/react-flow/` is a React root built on [React Flow](https://reactflow.dev) that draws the result inside the diagram target and nowhere else, and `src/engine/index.ts` is the only way in: `mountEngine` and the `Engine` it returns. The rest of the page stays plain TypeScript.

`scripts/` stays JavaScript and `src/` stays TypeScript. `tsconfig.json` includes only `src`, so the tests in `scripts/` are what guard the pipeline.

## Adding a test

Tests use the Node built-in runner. Put a test where its subject lives:

| Testing | Put it in | Import |
| --- | --- | --- |
| Anything in `scripts/` | `scripts/<module>.test.js`, next to the module | The module directly: `import { parseCliArgs } from "./cli.js"` |
| Anything in `src/` | `test/<subject>.test.js` | Through `test/support/ts.js`, which installs the DOM and the TypeScript hooks: `await importSrc("components/menu")` |

`pnpm test` picks up a new file ending in `.test.js` in either folder with nothing to register. `scripts/escapes.test.js` and `test/menu.test.js` are good models to copy.

The DOM in `test/support/dom.js` is a purpose-built subset, and its selector engine throws on any selector it does not implement. When valid CSS a component ships fails there, extend `dom.js` and add a case to `test/dom.test.js`. Timers and animation frames are fake: nothing deferred runs until a test calls `dom.runTimers()`.

`test/e2e.test.js` runs a real `--single-file` build in headless Chrome, and `test/acceptance.test.js` holds the engine's drawing of every acceptance view to the rules in `test/support/engine-checks.js`. Both skip themselves when the machine has no Chrome.
