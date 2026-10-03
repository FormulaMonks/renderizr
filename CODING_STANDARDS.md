# Coding standards

How the code in this repository is written. [CONTRIBUTING.md](CONTRIBUTING.md) covers the workflow: toolchain, commands, hooks, project layout, where a test goes, commits and pull requests. This file covers what a linter cannot check. Prose follows [`.claude/rules/writing.md`](.claude/rules/writing.md); decisions follow [`.claude/rules/adr-guidelines.md`](.claude/rules/adr-guidelines.md). Use the terms in [`GLOSSARY.md`](GLOSSARY.md) in identifiers, comments and test names, and none of the words it lists under _Avoid_.

## Lint and formatting

- Biome 1.x defaults apart from the 4-space indent: 80 columns, LF, double quotes, trailing commas, semicolons. Biome 1.8 as configured processes no `.css` files, so `.editorconfig` holds the stylesheet rules. `src/main.css` is indented with 2 spaces; match the file you are in.
- Order imports by hand (`organizeImports` is off): `node:` builtins, packages, local modules, then stylesheets and `?raw` assets last.
- Suppress a rule inline and with a reason: `// biome-ignore lint/<group>/<rule>: <why this line is fine>`. Nothing is ignored at file or config level for a one-off. `noNonNullAssertion` is the one rule off repo-wide.
- Prefer `// @ts-expect-error <reason>` over `@ts-ignore`, so the directive fails once the problem goes away.

## TypeScript in `src/`

- Declare shapes with `type`; the codebase has one `interface`. Model closed sets as unions of string literals; there are no `enum`s.
- Mark type-only imports with `import type` or the inline `type` modifier. Write relative imports without an extension; stylesheets keep `.module.css`, vendored icons take `?raw`.
- Use `#private` fields for everything a class owns. The `private` keyword appears nowhere.
- `const` by default, `for (const x of xs)` over `.forEach`, `??` and `?.` over manual checks, `readonly` on a field assigned once. Name an ignored parameter `__`.
- A non-null assertion is for an element the same function just wrote into the DOM, or for state an earlier guard established. Everywhere else, narrow: `if (!this.container) return;`.
- `any` appears only at the untyped-JSON boundary, each use behind a `biome-ignore` that says why. Past `WorkspaceModel`, everything is typed.
- Module-level constants are `SCREAMING_CASE` with a doc comment. Small helpers are `const name = (...) => ...` one-liners; anything exported and longer than a line is a `function` declaration.
- A component or page is an `export default class`. Functions and types are named exports. The one barrel is `src/model/index.ts`. Where there is no element to own, write a module of functions with module-level state, as `components/theme.ts` and `storage.ts` do.

## Browser code

### Components and pages

Every piece of UI extends `Component` (`src/components/_component.ts`) or `Page` (`src/pages/_page.ts`); the underscore marks the abstract bases.

- `render()` builds markup and attaches listeners. `clear()` undoes all of it: every listener removed, every observer disconnected, every React root unmounted. Keep a list of bound listeners the way `Menu` does. Make `render()` call `clear()` first so it is safe to call twice.
- Hold child components in fields. The minifier renames classes, so a lookup by `constructor.name` returns `undefined` in a built page.
- A component's own shell is a template literal assigned to `innerHTML`. Content the workspace author wrote goes through `MarkdownRenderer`.
- State and identity travel as `data-*` attributes (`data-item-id`, `data-view-key`, `data-theme`, `data-page`). CSS selects on them and so do the tests.
- Navigation goes through `history/hash`. Correcting where the reader already is (a default, following the URL, redirecting from an unknown page) is a `replace`; a navigation the reader asked for is a `push`.
- Read and write preferences through `storage.ts`. `localStorage` throws in an opaque-origin frame, where a published artifact runs, and a lost preference must never take the page down.

### Styles

- One `name.module.css` beside each component or page, imported as `styles`, camelCase class names applied as `${styles.x}`.
- Every color is a `--color-*` custom property in `src/main.css`: light under `:root`, dark under `:root[data-theme="dark"]`. Component CSS never queries `prefers-color-scheme`; `theme.ts` and the inline script in `index.html` resolve the preference to `data-theme` before first paint. The diagram canvas keeps its own scheme under `data-diagram-theme`.
- `rem` for type and spacing, `px` for borders, radii and hairlines. A comment above a rule says what the visual decision is for. Prefer specificity to `!important`.

### What the output promises

A rendered page opens from `file://`, as one self-contained file, offline, under a strict Content Security Policy. In code:

- No network request at runtime; everything is embedded by `scripts/assets.js`.
- No `eval` in any form: no `new Function`, no WebAssembly, no workers ([8. Write our own router in TypeScript](architecture/decisions/0008-write-our-own-router-in-typescript.md)).
- No runtime `<style>` element and no `setAttribute("style")`. Use class names and, inside the island, React `style` props.
- Hash routing and relative paths only. A `href="#id"` the router does not own is canceled.
- A container can be 0×0 when the page mounts. Defer work that needs a size with `whenMeasurable`.

### The engine boundary

- React lives in `src/engine/react-flow/island.tsx` and `index.ts` only; `.tsx` is written nowhere else. The page reaches the island through `mountEngine` and the `Engine` handle, and `contract.ts` names nothing from React ([3. Mount React Flow as an island behind the engine contract](architecture/decisions/0003-mount-react-flow-as-an-island-behind-the-engine-contract.md)).
- Geometry and the model are pure functions over numbers and JSON, with no DOM and no React, so they run under `node --test`.
- A build carries exactly one engine, resolved through `virtual:renderizr-engine` ([12. Ship behind a flag, then cut over in one release](architecture/decisions/0012-ship-behind-a-flag-then-cut-over-in-one-release.md)). Shared code imports neither engine's entry directly.
- Ported upstream code carries the Apache-2.0 header naming the upstream files and what was modified, as `src/model/` does, and the package is listed in `THIRD-PARTY-NOTICES.md`.

## Node code in `scripts/`

- Use only what Node 20 ships. Import builtins with the `node:` prefix. A bin starts with `#! /usr/bin/env node`.
- Write to `process.stdout` and `process.stderr` with `.write()` and a trailing `\n`: progress to stdout, warnings and errors to stderr. `console.*` appears in no shipped code.
- `process.exit` is called in `cli.js` (usage errors, `--help`) and in the Node-floor guard at the top of `build.js`. Everything else throws an `Error` whose message names the input and what was expected: `Unknown engine '${engine}'; expected one of: …`.
- Degrade when the output can still be right (a theme that fails to load warns and the build carries on). Fail when it would be wrong (an unrecognized image, invalid JSON, an escape sequence that survived rewriting).
- Export the parts as named functions; `build.js` is the one module with top-level side effects. A flag lives in `OPTIONS` in `cli.js` and its `USAGE` text.

## Comments

- Every module opens with a docblock saying what it is and why it exists.
- Comments say why. When a line exists because of a bug, name the bug ("which is how heading anchors ended up landing underneath it"). That is the reason the next reader will want to delete the line.
- Cite decisions by number in parentheses where the code carries them out: `(ADR 3)`, `(spec 9.7)`.
- Section a long file with `/* ---------------- name */` dividers. There are no `TODO` or `FIXME` comments in the tree: open an issue, or do the work.

## Test style

- Flat `test(...)` calls grouped under section dividers; `describe` only where one file covers several modules. Import `srcTest as test` so a file skips itself, with a reason on stderr, on a Node too old for the module hooks.
- Name a test as a lowercase sentence stating behavior a reader could observe: "the footer's version comes from package.json", "--help wins even when the workspace is missing". Flags and identifiers appear verbatim.
- Drive cases through a `const` table and a `for` loop, as `scripts/escapes.test.js` does.
- Assert through the real surface: dispatch events on the DOM, read what was rendered, run the CLI in a child process with `runCli` when the path calls `process.exit`. Give an assertion a message that says what went wrong.
- Tests are offline by construction: `no-network.js` poisons `fetch` in child builds and `helpers.js` throws on an unstubbed URL.

## Dependencies

- `jquery`, `@joint/*` and `@dagrejs/*` are pinned to exact versions: the vendored renderer reads them off `window` and is sensitive to which build it gets. Everything else uses a caret range.
- Updates arrive through Renovate. Packages inlined into rendered output get one pull request each and never auto-merge; dev tooling is grouped and auto-merges on patch and minor; the `engines` range is never bumped by a bot.
- `pnpm-workspace.yaml` allows build scripts for `@biomejs/biome` and `esbuild` only. A package needing a postinstall step is added to that list deliberately.
