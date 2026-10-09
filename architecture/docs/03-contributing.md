# Contributing

This section takes you from a fresh clone to a merged pull request. Bug reports, feature requests and pull requests are all welcome on [GitHub](https://github.com/FormulaMonks/renderizr). Everyone taking part follows the [Code of Conduct](https://github.com/FormulaMonks/renderizr/blob/main/CODE_OF_CONDUCT.md). Report a security problem privately through [GitHub Security Advisories](https://github.com/FormulaMonks/renderizr/security/advisories/new), never as a public issue.

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node | 22.13 or newer | pnpm 11 needs it. Renderizr itself runs on Node 20 or newer, and CI checks that floor with npm in a separate job |
| pnpm | 11 | The lockfile is `pnpm-lock.yaml`, and `pnpm-workspace.yaml` carries the build allow-list. npm and yarn drift the lockfile |
| git | any | The repository has one optional submodule |

Development runs on Node 24, which `.mise.toml` pins and `mise.lock` resolves. With [mise](https://mise.jdx.dev) installed, `mise install` in the repository root gets you the exact Node and pnpm the maintainers use. Any Node and pnpm that meet the table work too; nothing in the build reads mise.

## Get the code

```bash
git clone https://github.com/FormulaMonks/renderizr.git
cd renderizr
pnpm install
pnpm hooks
```

`pnpm hooks` installs the git hooks, once per clone. It stays a separate step because a `prepare` script runs whenever a package manager installs a package from a git URL, and `npx github:FormulaMonks/renderizr` does exactly that. Confirm the hooks took with `git config --get core.hooksPath`, which prints `.husky/_`.

### The submodule

`submodules/structurizr` tracks [structurizr/structurizr](https://github.com/structurizr/structurizr). Install, dev, build, test and lint all pass without it. Only the acceptance harness and the end-to-end test read workspaces from it, and they skip those workspaces with a reason when it is absent. Check it out to run them:

```bash
git submodule update --init --checkout submodules/structurizr
```

The command needs `--checkout`. `.gitmodules` sets `update = none` on the submodule, because npm clones a git dependency with `--recurse-submodules`, and every cold `npx` would otherwise download the whole Structurizr repository. The same setting means `git pull` leaves the submodule where it is when the gitlink moves: run the command again after a change that bumps it.

## The dev server

```bash
pnpm dev
```

Vite serves this repository's own workspace, `architecture/workspace.json`, on <http://localhost:5173>, with hot reload for `src/`. To check a change, point the dev server at a versioned fixture under `test/__fixtures__/` that shows it:

```bash
pnpm dev -- test/__fixtures__/edge-routing.json --font Inter
```

Always put `--` before the arguments. Without it, Vite reads them itself and stops on any option it does not know. The dev server accepts `--logo <path|url>`, `--font <family>` and `--single-file`, before or after the workspace path, and reads `RENDERIZR_WORKSPACE` from the environment when you pass no workspace. Git tracks the fixtures, so `git status` shows whether anything changed one while you looked. When no fixture shows your change, add one in the same pull request.

## The build

```bash
pnpm render architecture/workspace.json --single-file
```

`pnpm render` runs `tsc` first, so a type error fails the build before Vite starts, then writes into `./structurizr-output` unless `--out` says otherwise. It takes its arguments with no `--`. Open `structurizr-output/index.html` in a browser to look at the result; a single file needs no server.

## Checks

| Command | What it does |
| --- | --- |
| `pnpm test` | `node --test` over `scripts/*.test.js` (the build pipeline) and `test/*.test.js` (the app), then `test/acceptance.test.js` on its own |
| `pnpm typecheck` | Type-checks `src/` |
| `pnpm lint` | Runs `biome ci .`: lint and format, never fixing, failing on any finding. CI and the pre-commit hook run the same check |
| `pnpm format` | Lint and format, fixing what Biome can fix in place |
| `pnpm test:coverage` | The test suite with V8 coverage |
| `pnpm architecture:merge` | Writes `architecture/workspace.json` again from `architecture/workspace.dsl` with Structurizr's tools, the way a DSL session of edit mode writes it. CI fails when the committed workspace differs from its DSL |
| `pnpm fixtures:acceptance` | Merges the acceptance fixture's DSL into its `workspace.json` with Structurizr's tools |
| `pnpm fixtures:large` | Writes the large landscape fixture again from its generator |

`pnpm architecture:merge` and `pnpm fixtures:acceptance` find Structurizr's tools the way [edit mode](02-usage.md#structurizrs-tools-for-a-dsl-session) does: `STRUCTURIZR_CLI` as a whole command, or `structurizr-cli` on the `PATH`.

Biome is the only linter and the only formatter. It indents with 4 spaces, skips `submodules/` and `architecture/`, and respects `.gitignore`; `biome.json` holds the rest.

### Git hooks

`pnpm hooks` installs three hooks from `.husky/`:

| Hook | Runs | Purpose |
| --- | --- | --- |
| `prepare-commit-msg` | `pnpm exec czg --hook` | Opens an interactive prompt that writes the commit message when you pass no `-m` |
| `pre-commit` | `pnpm exec lint-staged` | Runs `biome ci` over the staged source files |
| `commit-msg` | `pnpm exec commitlint --edit` | Checks the message against Conventional Commits |

When `pre-commit` fails, run `pnpm format`, stage the files again and commit. When `commit-msg` fails, the output names the rule; run `git commit` again and let czg write the message. A per-clone switch turns each hook off, such as `git config custom.hooks.pre-commit false`, and `git config --unset` turns it back on. CI runs the same checks either way.

## Branches and commits

Name every branch `<type>/<issue>/<short-description>`, for example `feat/42/resolve-view` or `fix/57/hash-routes-under-file`:

- `<type>` is `feat` for a new capability, `fix` for a bug and `chore` for everything else (docs, CI, refactors, dependencies and tooling).
- `<issue>` is the number of the GitHub issue the branch works on. Leave the segment out when the work has no issue: `chore/bump-biome`.
- `<short-description>` is a few lower-case words in kebab-case that say what the branch does.

Write commit messages as [Conventional Commits](https://www.conventionalcommits.org). The header reads `type(optional-scope): subject`, at most 100 characters, with a lower-case type and a subject that ends without a full stop. The types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` and `test`. Mark a breaking change with `feat!:` or a `BREAKING CHANGE:` footer.

A maintainer squash-merges every pull request, so the pull request title becomes the commit that release-please reads. CI checks the title with the same commitlint rules.

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

## Pull requests

Before you open one, run what CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Then build something real and look at it in a browser. A rendering or documentation change that only passes the tests stays untested.

- **Keep one concern per pull request.** Branch off `main` and name the branch as [Branches and commits](#branches-and-commits) says.
- **Fill in the template**: what the change does and why, how a reviewer can see it work, and any additional notes. For anything visual, a screenshot before and after says more than a paragraph.
- **Test anything in `scripts/`.** New behavior gets a test, and a fixed bug gets the test that would have caught it.
- **Update the docs in the same pull request.** A new CLI flag changes `scripts/cli.js`, the flag table in the README and the [usage section](02-usage.md#options).
- **Justify every new runtime dependency.** Everything in `dependencies` ends up inlined into a file people email around, so its weight needs a sentence of reasoning.
- **Open a draft** for work you want eyes on early, and mark it ready when CI passes.

## Reviews

CI runs lint, type checks, the test suite on Node 22 and 24, an npm install and build on Node 20, the end-to-end render and the pull request title check; CodeQL runs too. A maintainer reviews the pull request, usually within a week. Reviewers label each comment:

- **blocking**: change it before merge.
- **suggestion**: take it or explain why not; either answer merges.
- **nit**: cosmetic, never blocking.

Push fixes as new commits while a review is open, so reviewers can read the change since their last look. The ruleset on `main` requires a passing CI run, and maintainers also wait for one approving review from someone other than the author before they merge.

## Releases

Contributors do nothing for a release. Consumers run `npx github:FormulaMonks/renderizr`, which resolves to `main`, so a merged pull request reaches users as soon as it lands.

[release-please](https://github.com/googleapis/release-please) keeps a release pull request open on `main` with the next version and its changelog entry, computed from the Conventional Commits since the last tag. Merging it tags the release and publishes the GitHub Release, with a source tarball, the fixture workspace rendered as a static site and as a single file, and checksums. Each release also renders `architecture/workspace.json` from its tag and publishes it to this site, so the site always shows the latest release. Nothing goes to a package registry.
