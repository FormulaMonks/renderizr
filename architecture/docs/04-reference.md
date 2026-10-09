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

Always put `--` before the arguments. Without it, Vite reads them itself and stops on any option it does not know. The dev server accepts `--logo <path|url>`, `--font <family>` and `--single-file`, before or after the workspace path, and reads `RENDERIZR_WORKSPACE` from the environment when you pass no workspace. Git tracks the fixtures, so `git status` shows whether anything changed one while you looked. When no fixture shows your change, add one in the same pull request.

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
| `pnpm test` | `node --test` over `scripts/*.test.js` (the build pipeline) and `test/*.test.js` (the app), then `test/acceptance.test.js` on its own |
| `pnpm test:coverage` | The test suite with V8 coverage |
| `pnpm test:structurizr` | Runs edit mode's DSL pipeline against the Structurizr tools that `STRUCTURIZR_CLI` names, and skips itself when it is not set |
| `pnpm typecheck` | Type-checks `src/` |
| `pnpm lint` | Runs `biome ci .`: lint and format, never fixing, failing on any finding. CI and the pre-commit hook run the same check |
| `pnpm format` | Lint and format, fixing what Biome can fix in place |
| `pnpm lint:renovate` | Validates `renovate.json` |
| `pnpm architecture:merge` | Writes `architecture/workspace.json` again from `architecture/workspace.dsl` with Structurizr's tools, the way a DSL session of edit mode writes it. CI fails when the committed workspace differs from its DSL |
| `pnpm fixtures:acceptance` | Merges the acceptance fixture's DSL into its `workspace.json` with Structurizr's tools |
| `pnpm fixtures:large` | Writes the large landscape fixture again from its generator |
| `pnpm hooks` | Installs the git hooks, once per clone |
| `pnpm release:pr` | Opens or updates the release pull request with your own `gh` login, for maintainers |
| `pnpm release:tag` | Tags a merged release and creates its GitHub Release, for maintainers |

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

## Project layout

| Path | What lives there |
| --- | --- |
| `scripts/` | The build pipeline and edit mode's server, in plain ESM JavaScript that Node runs with no build step |
| `scripts/build.js` | The CLI entry point: checks the Node version, parses arguments, loads assets and runs Vite |
| `scripts/cli.js` | Option definitions and `--help`, for the build and for `renderizr edit` |
| `scripts/assets.js` | Fetching and embedding the workspace, themes, element icons, logo and font |
| `scripts/edit.js`, `scripts/edit-plugin.js` | Edit mode: the session a path opens, the local server and its save endpoint |
| `scripts/dsl-pipeline.js`, `scripts/structurizr-tools.js` | Running Structurizr's tools on a `workspace.dsl` |
| `scripts/workspace-writer.js` | Writing `workspace.json` the way Structurizr does |
| `src/` | The page that ships in the output, in TypeScript, bundled by Vite |
| `src/model/` | The typed workspace model and style resolution, ported from Structurizr, and `resolveView` |
| `src/engine/` | The React Flow engine: the diagram contract in `index.ts`, geometry, layout and the island |
| `src/pages/`, `src/components/` | The diagrams, documentation and decisions pages, and the parts they share |
| `test/` | Tests for `src/`, and the DOM and module hooks they run on in `test/support/` |
| `test/__fixtures__/` | Versioned workspaces for tests and for checking changes in the dev server |
| `architecture/` | Renderizr's own workspace, which this site renders |

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
