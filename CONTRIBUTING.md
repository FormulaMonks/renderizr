# Contributing to Renderizr

Thanks for being here. This document is meant to take you from a fresh clone to a merged pull request without needing to ask anyone a question. If it fails at that, that is a bug in this file — [open an issue](https://github.com/FormulaMonks/renderizr/issues/new/choose) and say where it lost you.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Questions about *using* Renderizr belong in [SUPPORT.md](SUPPORT.md); security problems belong in [SECURITY.md](SECURITY.md) and must not be filed as public issues.

## Table of contents

- [Prerequisites](#prerequisites)
- [Get the code](#get-the-code)
- [Install](#install)
- [The commands](#the-commands)
- [Commits](#commits)
- [The git hooks](#the-git-hooks)
- [Project layout](#project-layout)
- [Adding a test](#adding-a-test)
- [Pull requests](#pull-requests)
- [How a review goes](#how-a-review-goes)
- [How a release happens](#how-a-release-happens)

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node | 20 or newer | `scripts/build.js` refuses to run below 20 — it needs a global `fetch` and `util.parseArgs` defaults. `package.json` declares `"engines": { "node": ">=20" }`. On 20.0–20.5 the `test/` suite skips itself loudly, because importing `src/` needs `module.register`, which landed in 20.6 |
| pnpm | 10 or newer (11.x in use) | The lockfile is `pnpm-lock.yaml` and `pnpm-workspace.yaml` carries the build allow-list. npm and yarn will appear to work and will drift the lockfile |
| git | any | The repository has one submodule |

That is the whole list. No IDE is required, no JDK, no global CLI.

Development happens on Node 24 — that is what `.mise.toml` pins and what the committed `mise.lock` resolves. Node 20 remains supported for people *running* the tool; if you have [mise](https://mise.jdx.dev) installed, `mise install` in the repository root gets you the exact Node and pnpm the maintainers use:

```bash
mise install     # optional; installs Node 24 and pnpm per .mise.toml + mise.lock
```

If you would rather not install mise, use any Node 20+ and pnpm you already have. Nothing in the build reads mise.

`.vscode/extensions.json` recommends the [Biome](https://biomejs.dev) extension and `.vscode/settings.json` wires up format-on-save. Both are conveniences — Biome has editor plugins for Zed, JetBrains, Neovim and others, and `pnpm exec biome check --write .` covers you from any editor at all.

## Get the code

Clone with the submodule:

```bash
git clone --recurse-submodules https://github.com/FormulaMonks/renderizr.git
cd renderizr
```

**If you already cloned without `--recurse-submodules`**, this fixes it in place — no need to re-clone:

```bash
git submodule update --init --recursive
```

### About the submodule

`submodules/structurizr` tracks [structurizr/structurizr](https://github.com/structurizr/structurizr), the upstream source of the diagram renderer. It is **optional for day-to-day work**: the handful of files the build actually reads are committed under `vendor/structurizr`, so install, dev, build, test and lint all pass on a clone with an empty `submodules/` directory. You need the submodule checked out only when you want to pull in a newer upstream renderer:

```bash
git submodule update --init --remote submodules/structurizr
pnpm sync:vendor      # copies the files the build imports into vendor/structurizr
```

Commit the resulting `vendor/structurizr` changes together with the submodule pointer bump.

## Install

```bash
pnpm install
pnpm hooks      # once per clone — installs the git hooks
```

`pnpm hooks` is a separate step rather than a `prepare` script on purpose. `prepare` runs when a package is installed from a git URL, and `npx github:FormulaMonks/renderizr` is exactly that — so a `prepare` script here would run husky inside every consumer's install tree, in a directory that is usually not a git repository at all. Contributors are the only people who want the hooks, so installing them is opt-in and costs you one command.

You can confirm it took:

```bash
git config --get core.hooksPath   # should print .husky/_
```

## The commands

Every command below is run from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server on <http://localhost:5173>, rendering this repository's own workspace (`architecture/workspace.json`) |
| `pnpm dev -- path/to/workspace.json` | Same, against a workspace of your choice — a local path or a URL |
| `pnpm build <workspace> [flags]` | Type-checks with `tsc`, then runs the real production build into `./structurizr-output` |
| `pnpm test` | `node --test` over `scripts/*.test.js` (the build pipeline) and `test/*.test.js` (the app) |
| `pnpm exec biome check .` | Lint + format check, reports only |
| `pnpm exec biome check --write .` | Lint + format, fixes in place |
| `pnpm exec biome ci .` | Exactly what the pre-commit hook and CI run: check, never fix, non-zero on any finding |
| `pnpm exec tsc --noEmit` | Type-check `src/` on its own |
| `pnpm sync:vendor` | Refresh `vendor/structurizr` from the submodule (see above) |

### Dev server

```bash
pnpm dev                                  # this repo's workspace
pnpm dev -- ../some-project/workspace.json
pnpm dev -- https://example.com/workspace.json
RENDERIZR_WORKSPACE=./ws.json pnpm dev    # or set it in the environment
```

The dev server also accepts `--logo <path|url>`, `--font <family>` and `--single-file` — but the order matters, and only one order works:

```bash
pnpm dev -- --font Inter --logo ./logo.svg architecture/workspace.json   # works
pnpm dev -- architecture/workspace.json --font Inter                     # ENOENT: … open '…/Inter'
```

`vite.config.ts` takes the workspace to be the *last* argument that does not start with `-` (`args.filter(arg => !arg.startsWith("-")).at(-1)`), so a flag's value placed after the path wins and gets loaded as the workspace. Put every flag with a value **before** the workspace path. `--single-file` takes no value and is safe anywhere.

The same rule catches `RENDERIZR_WORKSPACE`: the environment variable is only consulted when *no* bare argument was passed at all, so `RENDERIZR_WORKSPACE=ws.json pnpm dev -- --font Inter` still ENOENTs on `Inter`. Use the environment variable on its own (`RENDERIZR_WORKSPACE=ws.json pnpm dev`), or pass the workspace on the command line, last.

`scripts/build.js` does not share this quirk — it parses arguments properly, so `pnpm build` accepts flags in any position.

### Build

```bash
pnpm build architecture/workspace.json
pnpm build architecture/workspace.json --single-file --font Inter
pnpm build https://raw.githubusercontent.com/structurizr/ui/main/examples/big-bank-plc.json
```

Output lands in `./structurizr-output` unless `--out` says otherwise. `pnpm build` runs `tsc` first, so a type error fails the build before Vite starts.

> [!IMPORTANT]
> Do **not** write `pnpm build -- <workspace> --flag`. pnpm forwards the literal `--` to the script, and Node's `parseArgs` treats everything after a bare `--` as a positional — so `--single-file` arrives as a second workspace and the build exits 1 with `Expected one workspace, got 2: architecture/workspace.json, --single-file`. Pass the arguments without the `--` separator: `pnpm build <workspace> --single-file`. `pnpm dev` is the opposite: it *does* want the separator, `pnpm dev -- <workspace>`, because Vite would otherwise try to interpret the path itself.

### Lint and format

Biome is the only linter and the only formatter — no ESLint, no Prettier. The settings that matter: 4-space indent, `submodules/`, `vendor/` and `architecture/` excluded, `.gitignore` respected. See `biome.json`.

```bash
pnpm exec biome check .            # what's wrong
pnpm exec biome check --write .    # fix what can be fixed
```

`biome ci` never writes. When the pre-commit hook rejects your change, run `check --write` on the offending file and `git add` it again — the recipe is spelled out below.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint with `@commitlint/config-conventional` (see `commitlint.config.cjs`). The rules you will actually hit:

- The header is `type(optional-scope): subject` — for example `fix: stop emitting escapes a Claude artifact upload rejects`.
- Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Anything else is rejected.
- The type must be lower-case, the subject must not be empty, and the subject must not end with a full stop.
- The header must be at most 100 characters.
- A breaking change is `feat!:` / `feat(cli)!:`, or a `BREAKING CHANGE:` footer, or both.

### Let czg write it for you

You do not have to remember any of that. Run `git commit` with **no** `-m` and the `prepare-commit-msg` hook launches [czg](https://cz-git.qbb.sh/cli/), an interactive prompt that composes a valid message:

```bash
git add -A
git commit          # czg takes over
```

Or invoke it directly, which also stages nothing behind your back:

```bash
pnpm exec czg
```

`.czrc` configures it: no emoji, no scope list (type a scope freely or choose `none`).

## The git hooks

Three hooks, all in `.husky/`, all installed by `pnpm hooks`.

| Hook | Runs | Purpose |
| --- | --- | --- |
| `prepare-commit-msg` | `pnpm exec czg --hook` | Opens the interactive message prompt when you did not pass `-m`. Skips itself on amend, on rebase, and when a message is already set |
| `pre-commit` | `pnpm exec lint-staged` | Runs `biome ci` over staged `.json .ts .js .cjs .mjs .mts .css .tsx .jsx` files (`.lintstagedrc.json`) |
| `commit-msg` | `pnpm exec commitlint --edit` | Validates the message you just wrote |

### When a hook fails

**pre-commit — `Some errors were emitted while running checks` / `husky - pre-commit script failed (code 1)`**

Biome found a formatting or lint problem in a staged file. It printed a diff of what it wanted. Fix and re-stage:

```bash
pnpm exec biome check --write .
git add -A
git commit
```

If the finding is a lint rule rather than formatting, `--write` will not silence it — read the rule name in the output and fix the code. Do not add a blanket ignore; if the rule is genuinely wrong for this repository, say so in your PR and we will change `biome.json` instead.

**commit-msg — `✖ found N problems` / `husky - commit-msg script failed (code 1)`**

Your message is not a valid conventional commit; the output names the rule (`type-empty`, `subject-full-stop`, `header-max-length`, …). Your staged changes are untouched. Rewrite the message:

```bash
git commit          # czg will prompt you this time
```

If the commit was already created and only the message is wrong, `git commit --amend` re-runs the same check.

**Nothing happened and you expected a prompt**

`git config --get core.hooksPath` prints nothing → you have not run `pnpm hooks` in this clone.

### Turning a hook off

Each hook honors a per-clone git config switch, which is the polite way to opt out for a stretch of work (a long rebase, a scripted batch of commits):

```bash
git config custom.hooks.pre-commit false
git config custom.hooks.commit-msg false
git config custom.hooks.prepare-commit-msg false
git config --unset custom.hooks.pre-commit    # back on
```

`git commit --no-verify` skips `pre-commit` and `commit-msg` for a single commit.

Either way the checks still run in CI — the switches save you time locally, they do not lower the bar. Specifically: `biome ci` runs in the `static` job, and the `pr title` job runs the *same* `commitlint.config.cjs` over your pull request **title**. That is the one message that has to be conventional no matter what you did locally, because every PR is squash-merged and the title becomes the squash commit — the one release-please reads. Individual commit messages inside the branch do not survive the squash, so a hook you skipped costs you nothing; a title you did not think about fails the build.

## Project layout

```
scripts/        the build pipeline — plain ESM JavaScript, no TypeScript, runs on Node
src/            the single-page app that ships in the output — TypeScript, bundled by Vite
test/           the tests for src/, plus the DOM and module-hook harness they run on
vendor/         third-party code committed verbatim; not linted, not edited by hand
submodules/     upstream sources, for regenerating vendor/ only
architecture/   Renderizr's own Structurizr workspace, which the dev server renders by default
public/         static files copied into every build (currently the favicon)
```

| Path | What lives there |
| --- | --- |
| `scripts/build.js` | CLI entry point (`bin: renderizr`). Enforces the Node floor, parses arguments, loads assets, runs Vite |
| `scripts/cli.js` | Option definitions and `--help` text |
| `scripts/assets.js` | Fetching and embedding the workspace, themes, element icons, logo and font |
| `scripts/config.js` | The Vite configuration, shared by the build and the dev server |
| `scripts/plugins.js` | Build plugins: Structurizr globals, CSS trimming, branding injection, single-file inlining |
| `scripts/escapes.js` | Rewrites escape sequences a Claude artifact upload rejects; fails the build if any survive |
| `scripts/sync-vendor.js` | Copies the files the build imports out of the submodule into `vendor/structurizr` |
| `scripts/*.test.js` | Tests for the build pipeline, next to the module each one covers |
| `test/*.test.js` | Tests for `src/` — router, menu, pages, theme, markdown, plus an end-to-end build |
| `test/support/` | The harness those tests import: `dom.js`, `ts.js`, `vite-hooks.js`, `browser.js`, `history.js` |
| `src/main.ts` | App entry point |
| `src/components/` | Reusable UI: router, menu, navigation, theme, markdown renderer, scroll-spy |
| `src/pages/` | The three top-level pages: `diagrams`, `docs`, `adrs` |
| `src/types/` | Type declarations for the Structurizr workspace, diagram and documentation shapes |
| `src/structurizr-globals.ts` | The globals the vendored renderer expects, injected as a classic script |
| `vendor/structurizr/` | Structurizr's renderer, stylesheet and icons, copied verbatim from the submodule |
| `vite.config.ts` | Dev server only — production goes through `scripts/build.js` |

Two rules follow from that shape:

1. **Never hand-edit `vendor/`.** Change the upstream or change `scripts/sync-vendor.js`, then run `pnpm sync:vendor`. Biome ignores `vendor/` precisely so upstream formatting survives review.
2. **`scripts/` is JavaScript, `src/` is TypeScript.** `tsconfig.json` includes only `src`, so `pnpm exec tsc --noEmit` will not type-check the pipeline; the tests in `scripts/` are what guard it. Keep `scripts/` plain ESM so `npx` can run it with no build step.

## Adding a test

Tests use the Node built-in runner — no Jest, no Vitest, no config. There are two directories, and which one a test belongs in follows from what it covers:

| Testing | Put it in | Imports |
| --- | --- | --- |
| Anything in `scripts/` — the CLI, asset loading, the Vite config, the build plugins | `scripts/<module>.test.js`, next to the module | The module directly: `import { parseCliArgs } from "./cli.js"` |
| Anything in `src/` — the router, the menu, a page, the markdown renderer | `test/<subject>.test.js` | `test/support/ts.js`, which installs the DOM and the TypeScript hooks: `const { default: Menu } = await importSrc("components/menu")` |

`pnpm test` expands both globs, so a new file ending in `.test.js` in either directory is picked up with nothing else to register. Files under `test/support/` are the harness, not tests, and are not matched by the glob.

### A pipeline test

Create `scripts/<module>.test.js` next to the module it covers:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCliArgs } from "./cli.js";

test("defaults the output directory", () => {
    const options = parseCliArgs(["workspace.json"]);
    assert.equal(options.out, "structurizr-output");
});
```

Then:

```bash
pnpm test
```

`scripts/escapes.test.js` is the model to copy — it drives table-style cases through a single `test()` per input and asserts on behavior rather than on internals.

Export the function you want to test from its module. Everything in `scripts/` is ESM, so this is a plain named export; there is no need to make the CLI's `main` path testable to test the parts.

### An application test

`src/` is TypeScript and the app expects a browser, so `test/support/` supplies both. Import it first — that is what installs the globals — then import the module under test through `importSrc`:

```js
import assert from "node:assert/strict";
import { importSrc, srcTest, stubElement } from "./support/ts.js";

const { default: Menu } = await importSrc("components/menu");

srcTest("renders one entry per view", () => {
    const element = stubElement();
    // …
    assert.equal(element.querySelectorAll("li").length, 3);
});
```

`test/menu.test.js` is the model to copy. Three things about the harness are worth knowing before you fight it:

- **The DOM in `test/support/dom.js` is a purpose-built subset, not jsdom.** It covers the parsing, selectors, events and window APIs `src/` actually uses, and it is itself tested by `test/dom.test.js`. Its selector engine **throws on any selector syntax it does not implement** rather than quietly matching nothing — that deliberate strictness is how a `button:last-child` that had silently stopped matching was caught. So valid CSS that a component ships can still fail here. When it does, the fix is to extend the engine in `dom.js` and add a case to `test/dom.test.js` — never to rewrite the component's selector to something the harness happens to understand.
- **Timers and animation frames are fake.** Nothing deferred runs until a test calls `dom.runTimers()`, which is why the suite never sleeps.
- **`installDOM()` returns the same window for the whole process.** Use `dom.reset()` in a `beforeEach`; `history/hash` captures `document.defaultView` at import time and a second window would strand it.

`test/e2e.test.js` goes further and runs a real `--single-file` build in headless Chrome. It skips itself with a message when no Chrome-shaped binary is on the machine, so it never fails a clone that has none.

### Coverage

```bash
pnpm test:coverage
```

Read the number it prints with one caveat in mind: V8's in-process coverage only sees files that were *loaded in that process*, so six source files never appear in the table at all — `src/main.ts`, `src/pages/diagrams.ts`, `src/components/current-view.ts`, `src/components/diagram-navigation.ts`, `src/structurizr-globals.ts` and `src/structurizr-runtime.ts`. They are exercised only by the headless-Chrome end-to-end test, in a browser V8 cannot instrument from here. A high "all files" percentage is a statement about the thirteen files in the table, not about `main.ts`.

## Pull requests

Before you open one, run the same four things CI runs. Each takes seconds:

```bash
pnpm install --frozen-lockfile
pnpm exec biome ci .
pnpm exec tsc --noEmit
pnpm test
```

Then build something real and look at it — a docs or rendering change that only passes the tests has not been tested:

```bash
pnpm build architecture/workspace.json --single-file
# then open structurizr-output/index.html in a browser — it needs no server
```

What a good pull request looks like here:

- **One concern per PR.** Branch off `main`; name the branch after the change (`fix/setext-headings-hijack-page-structure`, `feat/reading-experience`).
- **Conventional commits throughout**, because the changelog and the version bump are generated from them. A `feat:` in a PR of `fix:` commits changes what the next release is called.
- **A description that says what changed and why.** For anything visual, a before/after screenshot or a link to a rendered `--single-file` output is worth more than a paragraph.
- **Tests for anything in `scripts/`.** New behavior gets a test; a fixed bug gets the test that would have caught it.
- **Docs updated in the same PR.** A new CLI flag means `scripts/cli.js` usage text *and* the flag table in `README.md`. A changed workflow means this file.
- **No unrelated reformatting.** Biome's settings are the settings; if a diff is mostly whitespace, something is configured wrong locally.
- **No new runtime dependency without saying why.** Everything in `dependencies` ends up inlined into a self-contained HTML file that people email around — weight is a feature here, and adding to it needs a sentence of justification in the PR.
- **Draft PRs are welcome** for work you want eyes on early. Mark it ready when CI is green.

## How a review goes

1. You open the PR against `main`. Two workflows run on it: CI (`.github/workflows/ci.yml`) — lint, typecheck, the test suite on Node 20/22/24, the end-to-end render, and a check that the PR *title* is a conventional commit — and CodeQL (`.github/workflows/codeql.yml`). The OpenSSF Scorecard check (`.github/workflows/scorecard.yml`) does **not** run on pull requests, deliberately: it scores properties of the repository itself (branch protection, token permissions, pinned dependencies, maintenance activity) rather than of your diff, and `publish_results: true` needs an `id-token: write` token that a pull request — a fork's especially — does not get. It runs on pushes to `main`, on branch-protection changes and weekly. A red Scorecard is therefore a maintainer's problem, never a blocker on your PR.
2. A maintainer (see [MAINTAINERS.md](MAINTAINERS.md)) reviews it. Expect a first response within about a week; this is a small project and reviews come in bursts. A ping on the PR after that is entirely fair.
3. Review comments come in three flavours, and they are labeled so you are never guessing:
   - **blocking** — must change before merge.
   - **suggestion** — take it or explain why not; either answer merges.
   - **nit** — cosmetic, never blocking.
4. Push fixes as new commits rather than force-pushing while a review is in flight, so reviewers can read the delta. Squashing happens at merge, so the intermediate commits cost nothing.
5. Once approved and green, a maintainer merges. **Every PR is squash-merged** — the squash commit message is the conventional-commit header the release tooling reads, so it gets edited to say what the whole PR did, not what the last commit did.
6. Nothing merges into `main` without a passing CI run and one approving review from someone other than the author — maintainers' own changes included. `main` carries no branch protection today, so that is a rule the maintainers hold themselves to rather than a setting GitHub enforces; it is written down in [MAINTAINERS.md](MAINTAINERS.md#the-rules-maintainers-hold-themselves-to) precisely so it can be pointed at when someone breaks it.

If a PR goes quiet for 30 days with unaddressed blocking feedback, we will close it with a note. That is bookkeeping, not a verdict — reopen it whenever you pick it back up.

## How a release happens

You do not need to do anything for a release; this section is so you know what happens to your change after it merges.

- **`main` is the shipping surface.** Consumers run `npx github:FormulaMonks/renderizr`, which resolves to the default branch, so a merged PR is in front of users as soon as it lands. That is the main reason every change goes through a reviewed, CI-green pull request — see [MAINTAINERS.md](MAINTAINERS.md#the-rules-maintainers-hold-themselves-to).
- **Releases are prepared by [release-please](https://github.com/googleapis/release-please).** Every push to `main` runs `.github/workflows/release.yml`, which recomputes the next version from the conventional-commit types since the last tag and keeps a `chore(release): X.Y.Z` pull request open with the version bump and the [CHANGELOG.md](CHANGELOG.md) entry in it. That is why the commit convention is enforced rather than merely suggested.
- **Merging that pull request is the release.** It bumps `package.json`, writes the changelog entry, creates the `vX.Y.Z` tag and publishes the GitHub Release with the generated notes — all from the same commit history, so the four can never disagree. Below `1.0.0`, `feat:` bumps the minor, everything else the patch, and a breaking change bumps the minor rather than the major (`bump-minor-pre-major` in `release-please-config.json`).
- **Each Release carries artifacts**: a source tarball built with `npm pack`, the fixture workspace rendered as a static site (`.zip`), the same workspace rendered with `--single-file`, and `SHA256SUMS.txt`. The job asserts the single-file build references no external assets before it uploads anything.
- **Nothing is published to a registry.** `package.json` is marked `"private": true` and there is no publish job, so a release cannot reach npm by any path, deliberate or accidental. `npx github:FormulaMonks/renderizr` reads git, and the GitHub Release is the whole distribution channel.

Your commit subject is the line that shows up in those notes. Write it for the person reading the changelog, not for the person reading the diff.
