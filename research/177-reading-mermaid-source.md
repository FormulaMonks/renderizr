# Reading Mermaid flowchart, ERD and sequence source

Research for the Mermaid diagram map: which parsers can read a flowchart, an entity relationship diagram and a sequence diagram into a model the React Flow engine can draw, what each costs, and whether the parse can run in the build.

## Answer

Read the source with Mermaid's own Jison grammars and db classes, cut loose from the rest of Mermaid core, and run them in the build. The page then receives a parsed model and carries no parser at all.

- **`@mermaid-js/parser` covers none of the three types.** Its 2.0.1 release parses 15 types (architecture, cynefin, eventmodeling, gitGraph, info, packet, pie, radar, four railroad dialects, treeView, treemap, wardley). Flowcharts, ERDs and sequence diagrams still parse with Jison inside `mermaid` core at 12.2.0, and the one attempt to move flowcharts to Langium closed unmerged.
- **Mermaid core has a parse-only path, but not a cheap one.** `mermaid.parse(text)` returns the diagram type and the merged frontmatter and `%%{init}%%` config, and `mermaid.mermaidAPI.getDiagramFromText(text)` returns the populated db (vertices, edges, subgraphs, entities, relationships, actors, messages) without drawing. Bundling either pulls in the whole of Mermaid: 5,133 kB minified, 1,461 kB gzipped, because every diagram type stays reachable from the registry.
- **The grammars and db classes alone cost 173 kB minified, 52 kB gzipped** for all three types, frontmatter included, once the db classes' imports of the config store, themes, DOMPurify, d3, the shape renderer and the logger point at small stand-ins. They return the same model as Mermaid itself on every sample.
- **Parsing runs in Node with no DOM.** The trimmed grammars and db classes need nothing from a browser. Mermaid's own package parses ERDs and sequence diagrams in plain Node too, but a flowchart crashes on `DOMPurify.addHook is not a function` until something supplies a DOM (jsdom) or swaps DOMPurify for a stub.
- **Mermaid's own renderer costs 5,133 kB minified, 1,461 kB gzipped in a single file**, five times today's whole single-file page, and returns an SVG string: no geometry for export, no activation targets and no routing of ours.

## Method

- Installed `mermaid@12.2.0` and `@mermaid-js/parser@2.0.1` (both published in October 2026) with `esbuild@0.28.2`, `jison@0.4.18` (the version Mermaid's build uses) and `jsdom@26.1.0`, and checked out Mermaid's source at tag `mermaid@12.2.0` (commit `1fb7869`).
- Bundled one minimal entry per option with esbuild: ESM, `platform: browser`, `target: es2022`, minified, no code splitting unless stated, so every dynamic import lands in the one file the way Renderizr's single-file build inlines it. Sizes are in kB of 1,024 bytes; gzip is level 9 on each output file. The metafile gives each package's share.
- Compiled `.jison` files with the same transform Mermaid's build uses (`.build/jisonTransformer.ts`).
- Ran every option on four samples under Node 24.19.0: a flowchart with YAML frontmatter, an `%%{init}%%` directive, a subgraph, `classDef`, `style` and two `click` lines; an ERD with frontmatter, attributes and keys; a sequence diagram with an `%%{init}%%` directive, an actor, activations, `loop`, `alt` and a note; and a flowchart with a syntax error.

The harness lives in [`research/177/`](177/). `./setup.sh` installs it and checks out Mermaid's source; [Reproduce](#reproduce) lists the commands.

## The parsers that exist

### `@mermaid-js/parser`

The Langium-based package that Mermaid moves diagram types into one at a time. At 2.0.1 its `parse(diagramType, text)` accepts `architecture`, `cynefin`, `eventmodeling`, `gitGraph`, `info`, `packet`, `pie`, `radar`, `railroad`, `railroadAbnf`, `railroadEbnf`, `railroadPeg`, `treeView`, `treemap` and `wardley`. Upstream `develop` holds the same list in `packages/parser/src/language/`. A pull request titled "[WIP] Trying to add flowchart Langium parser" closed in April 2026 without merging, and no pull request moves ERDs or sequence diagrams. Count on Jison for all three types for the foreseeable future.

### Mermaid core

In `packages/mermaid/src/diagrams/` at 12.2.0:

| Type | Grammar | Db class | Diagram module |
| --- | --- | --- | --- |
| Flowchart | `flowchart/parser/flow.jison`, wrapped by `flowParser.ts` | `flowchart/flowDb.ts` (`FlowDB`) | `flowchart/flowDiagram.ts` |
| ERD | `er/parser/erDiagram.jison` | `er/erDb.ts` (`ErDB`) | `er/erDiagram.ts` |
| Sequence | `sequence/parser/sequenceDiagram.jison` | `sequence/sequenceDb.ts` (`SequenceDB`) | `sequence/sequenceDiagram.ts` |

Each diagram module imports its renderer at the top level, so importing it drags the renderer in. The grammar and db class sit below it and import no renderer directly.

Two public calls read without drawing:

- `mermaid.parse(text)` resolves to `{ diagramType, config }`: `flowchart-v2`, `er` or `sequence`, and the config merged from frontmatter and `%%{init}%%`. It throws on a syntax error, or returns `false` with `{ suppressErrors: true }`. It also registers the built-in diagram types, so it has to run once before the next call.
- `mermaid.mermaidAPI.getDiagramFromText(text)` resolves to a `Diagram` whose `db` holds the parsed model. `mermaidAPI` is marked deprecated and `@internal` in the type declarations, so treat it as unstable.

The package's `exports` map exposes only `.`, so a caller can't reach a single diagram's chunk without bypassing it.

### Third-party packages

| Package | What it is | Three types | Frontmatter and `%%{init}%%` | Notes |
| --- | --- | --- | --- | --- |
| `mermaid-parser-bundle@0.2.1` | Mermaid's own grammars and db classes for all 34 types, bundled with render-only modules stubbed | Yes, through Mermaid's db classes | Neither: frontmatter fails with `Parse error on line 1`, and the result carries no config | Built from Mermaid ≈ 11.17.2. One company maintains it. Zero dependencies, 1 MB installed. Its approach matches the trimmed option below, for every type. |
| `mermaid-ast@0.8.2` | Mermaid's Jison grammars vendored from 11.12.2, with its own AST builders | Yes | Neither: both make it fail to detect the type | Drops every message inside `loop` and `alt` and the note's text on the sequence sample. One maintainer. |
| `@zombie-mermaid/mermaid-parser@5.6.1` | Hand-written parsers, the internal package of a Mermaid reimplementation | Flowcharts through `parseMermaid`; ERDs and sequence diagrams only through per-type functions | Neither | Accepts the broken flowchart without an error. Declared internal, with no support commitment. |

None of them reads frontmatter or directives, so each would still need the preprocessing the trimmed option already does, and each lags Mermaid or departs from it.

## What a parse returns

Every option that keeps Mermaid's db classes returns the same model. On the samples:

**Flowchart** (`FlowDB`). `getVertices()` is a `Map` of `{ id, text, labelType, type, styles, classes, link, linkTarget, props, domId }`, where `type` names the shape (`square`, `diamond`, `stadium`, `cylinder`, and the `@{ shape: … }` names) and `link` holds a `click … href` target. `getEdges()` is an array of `{ start, end, type, stroke, text, length, id }`, with `type` such as `arrow_point` or `arrow_open` and `stroke` one of `normal`, `thick`, `dotted` or `invisible`. `getSubGraphs()` gives `{ id, title, nodes }`, `getClasses()` the `classDef`s, `getDirection()` the direction and `getTooltip(id)` a `click` tooltip. A `click … callback` only adds the `clickable` class. `getData()` returns renderer-neutral layout data: nodes (with `isGroup` and `parentId` for subgraphs), and edges with `arrowTypeStart`, `arrowTypeEnd`, `pattern` and `curve` already resolved from the config.

**ERD** (`ErDB`). `getEntities()` is a `Map` of `{ id, label, alias, attributes: [{ type, name, keys, comment }], cssStyles, cssClasses }`. `getRelationships()` gives `{ entityA, entityB, roleA, relSpec: { cardA, cardB, relType } }`, where the cardinalities are `ONLY_ONE`, `ZERO_OR_ONE`, `ONE_OR_MORE`, `ZERO_OR_MORE` (and `MD_PARENT`) and `relType` is `IDENTIFYING` or `NON_IDENTIFYING`. `getData()` returns nodes and edges with crow's foot ends as `arrowTypeStart` and `arrowTypeEnd` (`only_one`, `zero_or_more`, …).

**Sequence** (`SequenceDB`). `getActors()` is a `Map` of `{ name, description, type, links, properties, prevActor, nextActor }`, with `type` one of `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections` or `queue`. `getMessages()` is one flat, ordered list: messages carry `{ from, to, message, type, activate }`, and the same list holds the structure as markers in `type`, from `LINETYPE`: `LOOP_START`/`LOOP_END`, `ALT_START`/`ALT_ELSE`/`ALT_END`, `OPT_*`, `PAR_START`/`PAR_AND`/`PAR_END`, `CRITICAL_*`, `BREAK_*`, `RECT_*`, `ACTIVE_START`/`ACTIVE_END`, `AUTONUMBER` and `NOTE` (with `placement` `LEFTOF`, `RIGHTOF` or `OVER`). `getBoxes()`, `getCreatedActors()` and `getDestroyedActors()` cover boxes and actor lifetimes. The parse gives order and nesting only: no coordinates, and no `getData()`. Mermaid's sequence renderer computes every position itself while it measures text in the DOM.

## What each option costs

Sizes of one minified file with everything it reaches:

| Option | Minified | Gzipped | What fills it |
| --- | --- | --- | --- |
| Mermaid's renderer, `mermaid.render` | 5,133 kB | 1,461 kB | `mermaid` 1,668 kB, `elkjs` 1,446 kB, `@mermaid-js/parser` 643 kB, `cytoscape` 439 kB, `katex` 267 kB, `cytoscape-fcose` 124 kB, `chevrotain` 93 kB, then `lodash-es`, `marked`, `dagre-d3-es`, `dompurify`, `roughjs` and a dozen `d3-*` modules |
| Mermaid's parse API, `mermaid.parse` plus `getDiagramFromText` | 5,133 kB | 1,461 kB | The same file: the registry keeps every diagram type and renderer reachable |
| Mermaid's renderer, code-split, the files the three types load | 1,615 kB | 405 kB | Entry, the three diagram chunks and the Dagre layout chunk; a single-file build can't split, so it pays the row above |
| Mermaid's grammars and db classes from source, unmodified imports | 946 kB | 242 kB | `katex` 263 kB, themes 165 kB, shape and label rendering 117 kB, `js-yaml`, `marked`, `dompurify`, `roughjs`, `d3-*` |
| The same, flowchart only | 877 kB | 223 kB | `FlowDB` imports the shape renderer to validate shape names, which brings KaTeX and the themes |
| The same, ERD and sequence only | 399 kB | 86 kB | Themes and config defaults through `getConfig` |
| **Grammars and db classes, trimmed, frontmatter included** | **173 kB** | **52 kB** | `js-yaml` 45 kB, `flow.jison` 41 kB, `sequenceDiagram.jison` 31 kB, `erDiagram.jison` 21 kB, `FlowDB` 15 kB, `SequenceDB` 11 kB, `ErDB` 5 kB |
| The three grammars alone | 92 kB | 24 kB | The floor for any option that keeps Mermaid's grammars |
| `mermaid-parser-bundle`, `parse` | 1,095 kB | 285 kB | All 34 types in one file; no tree shaking possible |
| `mermaid-ast`, three parsers | 95 kB | 28 kB | Vendored grammars and its own AST builders |
| `@zombie-mermaid/mermaid-parser`, three parsers | 35 kB | 12 kB | Hand-written regular expressions |
| Mermaid's base theme, palette from `primaryColor` | 28 kB | 8 kB | `theme-base.js` 17 kB, `khroma` 10 kB |

For scale: the React Flow island measures 407 kB minified, 132 kB gzipped, and a single-file build of a fixture workspace about 1,022 kB, 319 kB gzipped. The trimmed parser in the page would add about 40% to the island; Mermaid's renderer would make the single-file page about five times its size. Parsing in the build adds nothing to the page.

"Trimmed" means the db classes' imports go to small stand-ins ([`scripts/stubs/mermaid-core.mjs`](177/scripts/stubs/mermaid-core.mjs), wired by [`scripts/trim-plugin.mjs`](177/scripts/trim-plugin.mjs)):

- `diagram-api/diagramAPI.js` and `config.js`: a plain config object instead of the config store, whose defaults import every theme.
- `diagrams/common/common.js`: `sanitizeText` returns the text as is. React escapes text it renders, and the build never writes the label into HTML.
- `rendering-util/rendering-elements/shapes.js`: `isValidShape` against a list of names instead of the shape renderer. A real trim keeps Mermaid's list of shape names.
- `utils.js`: `getEdgeId`, and `formatUrl` with a `javascript:` and `data:` guard instead of `@braintree/sanitize-url`.
- `svgDrawCommon.js`, `logger.js`, `d3` and `dompurify`: no-ops. They serve tooltips on the drawn SVG and logging.

`js-yaml` stays, because frontmatter and the flowchart's `A@{ shape: … }` node metadata are YAML.

## Parsing in Node

| Option | Runs in plain Node | Install weight | Node version |
| --- | --- | --- | --- |
| `mermaid` package | ERDs and sequence diagrams: yes. Flowcharts: only with a DOM or a DOMPurify stub, see below | 199 MB, 73 packages | `>=22.12.0` |
| Trimmed grammars and db classes | Yes, all three, no DOM | One generated ESM file, 323 kB unminified, with `js-yaml` inside or as a dependency | Any Node Renderizr supports |
| `mermaid-parser-bundle` | Yes, all three | 1 MB, no dependencies | `>=20` |

`FlowDB.addVertex` sanitizes every label through `DOMPurify.sanitize`, and the first sanitize calls `DOMPurify.addHook`. Without a `window`, DOMPurify 3.4 exports neither function, so the flowchart parse throws `TypeError: DOMPurify.addHook is not a function`; `securityLevel: "loose"` only moves the crash to `DOMPurify.sanitize is not a function`. Two workarounds work:

- A jsdom window on `globalThis` before importing Mermaid (`node-flowchart.mjs jsdom`), which adds jsdom to the dependencies.
- A module hook that resolves `dompurify` to a stub (`node-stub.mjs`, with `module.registerHooks`, available from Node 22.15).

Importing `mermaid` takes 450–600 ms in Node; each parse after that takes 10–20 ms on the samples. The trimmed parser parses each sample in 2–4 ms.

Renderizr's `scripts/` is plain ESM with no build step, so the trimmed option ships as a generated file: a script bundles the grammars and db classes from a pinned Mermaid tag with esbuild and the Jison transform, and the repo commits the output with Mermaid's MIT notice in `THIRD-PARTY-NOTICES.md`. Moving to a newer Mermaid means running that script at the new tag and running the parse tests.

## Frontmatter and `%%{init}%%`

Mermaid reads both before the grammar sees the text (`preprocess.ts`): it normalizes line endings, cuts the frontmatter with `extractFrontMatter` (YAML under `JSON_SCHEMA`, keeping only `title`, `displayMode` and `config`), reads `%%{init: …}%%` and `%%{initialize: …}%%` with `utils.detectInit` (JSON, run through `sanitizeDirective`) and `%%{wrap}%%`, merges the two with the directive winning, and strips `%%` comment lines. The grammars never see either.

- **`mermaid.parse`** returns the merged config as `config`, for example `{ flowchart: { curve: "linear", nodeSpacing: 40, rankSpacing: 70 }, themeVariables: { primaryColor: "#ff6600", fontFamily: "Inter" }, theme: "base" }` for the flowchart sample. The frontmatter `title` doesn't appear there; `getDiagramFromText` leaves it unset too, so a caller reads it from the frontmatter itself. The db's own `getConfig()` returns that type's section merged with Mermaid's defaults, and `getData()` applies it (edge `curve`).
- **The trimmed reader** reuses Mermaid's `extractFrontMatter`, `directiveRegex` and `cleanupComments` and merges the two the same way ([`entries/trimmed-read.mjs`](177/scripts/entries/trimmed-read.mjs)), and returns the same config and the title. It still has to port `sanitizeDirective` (`utils/sanitizeDirective.ts`), which drops keys outside Mermaid's config schema and keys such as `__proto__`, cleans CSS in `themeCSS` and `fontFamily`, and blanks `themeVariables` values with unexpected characters.
- **`@mermaid-js/parser`** has nothing to read here, and the third-party packages read neither.

Mermaid also rewrites the text itself before the grammar sees it, and a reader of its own has to do the same: `cleanupText` turns double-quoted HTML attributes into single-quoted ones, `encodeEntities` (`utils.ts`) swaps entity codes such as `#quot;` and `#35;` for private placeholders the grammar passes through, and `Diagram.fromText` appends a line break. Labels come back with those placeholders, which `decodeEntities` turns into `&quot;` and `&#35;`; the build should decode them to plain characters so the page renders text. Labels written as Markdown strings come back with `labelType: "markdown"` and the Markdown in `text`.

The config gives the engine what the map's styling needs: `flowchart.curve`, `nodeSpacing`, `rankSpacing`, `er.layoutDirection`, `themeVariables.primaryColor` and `fontFamily`, and the sequence settings (`mirrorActors`, `showSequenceNumbers`, `wrap`). Mermaid derives its palette from `primaryColor` in `themes/theme-base.js` with `khroma`; that code runs in Node too, so the build can compute the palette, for both color schemes, without the page carrying it.

## Errors

A syntax error throws an `Error` whose `message` reads `Parse error on line 4:` followed by the line, a caret and `Expecting 'SQE', 'DOUBLECIRCLEEND', …, got '1'`, and whose `hash` carries `{ text, token, line, loc: { first_line, last_line, first_column, last_column }, expected: [...] }`. A lexer error reads `Lexical error on line …` with the same `hash`. Line numbers count from the first line after the frontmatter; Mermaid 12 adds a `setFrontmatterLineOffset` hook for db classes that want source positions, and the trimmed reader can add the frontmatter's line count itself. Mermaid appends a line break before parsing, so on the broken sample it reports line 4 where the bare grammar reports line 3.

Db classes throw plain errors without `hash` for semantic limits, for example a flowchart over `maxEdges` (500 by default) or a node whose `@{ shape: … }` names no shape. An unknown type throws `UnknownDiagramError` from `mermaid.parse`; the trimmed reader detects the three types itself and reports anything else as unsupported.

Parsing in the build turns each of these into a message the build can print with the image view's key, and an error the page shows in place of the diagram.

## Build or page

Parse in the build. `loadWorkspace` in `scripts/assets.js` already turns the workspace into what the page imports, for builds, `pnpm dev` and edit mode alike, and the source sits in the image view's `content` URL, which Node's `zlib` decodes. A step there can decode each Mermaid source, parse it and hand the page a plain, serializable model per image view. The page then needs no parser, no `js-yaml` and no Mermaid code, and every parse error surfaces at build time.

Parsing in the page works too, at about 52 kB gzipped for the trimmed parser, but buys nothing: authors never edit Mermaid source in the page, and the page has the source only because the build put it there.

### Edit mode

Edit mode serves the workspace as a watched virtual module and pushes each new workspace to the page. In a DSL session, a change to an `.mmd` file under the DSL's folder already reruns Structurizr's `merge`, and the reloaded workspace goes through `loadWorkspace` again, so the parse reruns and the page redraws with no extra wiring. Without a DSL, a change to `workspace.json` reloads the same way. The parse adds a few milliseconds per diagram to each reload. The workspace writer starts from the file on disk and never saves the page's copy, so a parsed model attached to the page's workspace never reaches `workspace.json`.

## Mermaid's own renderer, for contrast

Bundling `mermaid` and calling `mermaid.render` would draw all three types, and every other Mermaid type, as Mermaid draws them. It would cost:

- **Size.** 5,133 kB minified, 1,461 kB gzipped in a single file, since the single-file build inlines every dynamic import: about five times today's whole single-file page. A split static site could load 1,615 kB, 405 kB gzipped, for the three types.
- **Geometry for export.** `render` returns an SVG string. The engine would hold no node positions, sizes or routes, so an export would have to read them back out of Mermaid's SVG instead of building the file from the view's geometry.
- **Activation targets.** Mermaid binds `click` itself, as an `<a>` or a callback, through `bindFunctions` and its `securityLevel`. Activation targets, their indicators and keyboard access belong to the engine and would need Mermaid's SVG re-parsed to find each node.
- **Routing.** Mermaid routes with its own Dagre or ELK pass and draws curves with d3. Routing modes, avoidance, edge ends and jump-overs would not apply.
- **Styling, zoom and animation.** Mermaid writes its theme into a `<style>` element in the SVG, so the workspace's styles, font and color scheme would reach it only through Mermaid's config and a fresh render per scheme. Zoom and pan, and one message per step for sequence diagrams, would need building again around an opaque SVG.
- **Runtime.** Mermaid measures text in a live DOM while it lays out, so it needs a measurable container, the same constraint the island already handles.

## Recommendation

1. Read Mermaid source with Mermaid's own grammars and db classes, trimmed as above, generated into one ESM file from a pinned Mermaid tag. Keep Mermaid's grammar so the syntax Renderizr accepts matches what Structurizr's Mermaid server draws.
2. Parse in the build, in `loadWorkspace`, and give the page a plain model per image view: the flowchart's vertices, edges, subgraphs, classes and direction, the ERD's entities and relationships, and the sequence's actors and ordered messages with their fragment markers, plus the merged config and the title.
3. Read frontmatter and directives with Mermaid's own `extractFrontMatter` and `directiveRegex`, and port `sanitizeDirective`, `cleanupText` and `encodeEntities` so the grammars see exactly the text Mermaid gives them.
4. Compute the palette from `primaryColor` in the build with Mermaid's base theme, if the styling work wants Mermaid's derived colors.
5. Leave `@mermaid-js/parser` aside until it covers these types, and leave the `mermaid` package out of Renderizr's dependencies: 199 MB, Node 22.12 or later, and a DOM workaround for flowcharts buy nothing the trimmed file lacks.

## Reproduce

From `research/177/`, with Node 24:

```bash
./setup.sh
cd scripts
node measure.mjs entries/full-render.mjs
node measure.mjs entries/full-render.mjs --split --reach flowDiagram-,erDiagram-,sequenceDiagram-,mermaid.core/dagre-
node measure.mjs entries/parse-api.mjs
node measure.mjs entries/source-parse.mjs --plugin jison-plugin.mjs
node measure.mjs entries/source-flow.mjs --plugin jison-plugin.mjs
node measure.mjs entries/source-er-sequence.mjs --plugin jison-plugin.mjs
node measure.mjs entries/grammars-only.mjs --plugin jison-plugin.mjs
node measure.mjs entries/theme-base.mjs --plugin jison-plugin.mjs
node measure.mjs entries/trimmed-read.mjs --plugin trim-plugin.mjs
node measure.mjs entries/third-bundle.mjs
node measure.mjs entries/third-ast.mjs
node measure.mjs entries/third-zombie.mjs
node node-parse.mjs                 # mermaid.parse and the db in plain Node; the flowchart fails on DOMPurify
node node-flowchart.mjs jsdom       # the flowchart with a jsdom window
node node-stub.mjs                  # all three with DOMPurify swapped for a stub
node node-getdata.mjs               # getData() layout data for the flowchart and ERD
node run-trimmed.mjs                # the trimmed reader on every sample
BODY=1 node run-third.mjs           # the third-party packages, frontmatter and directives stripped
```

`DEPTH=9` breaks Mermaid's source down by file, and `TOP=n` sets how many packages `measure.mjs` lists.
