# Usage

```bash
npx github:FormulaMonks/renderizr <workspace> [options]
npx github:FormulaMonks/renderizr edit [path] [options]
```

The first form renders a workspace. The second starts [edit mode](#edit-mode). `renderizr --help` and `renderizr edit --help` print the same reference as text.

## Options

The one required argument is the workspace: a local path or an `http(s)` URL to a Structurizr workspace **JSON** file. Every flag is optional.

```bash
npx github:FormulaMonks/renderizr ./workspace.json \
  --single-file \
  --logo ./logo.svg \
  --font "Inter"
```

| Flag | Effect |
| --- | --- |
| `-o, --out <dir>` | Output directory, relative to the current directory. Default `structurizr-output`. The build empties it first |
| `--single-file` | Emit one self-contained `index.html` with every asset inlined, plus `artifact.html` |
| `--base <path>` | Base public path for the multi-file build. The default is empty, which emits relative URLs (`./assets/…`) that work from any folder. Set it to a path such as `/renderizr/` when the page must reference its assets absolutely |
| `--logo <path\|url>` | Image at the top left of the header. The build fetches it, minifies it when it is SVG, and embeds it as a data URI. It recognizes PNG, JPEG, GIF, WebP and SVG from their bytes, and rejects an SVG that holds a script |
| `--logo-alt <text>` | Alt text for the logo. Default empty |
| `--logo-href <url>` | Wraps the logo in a link |
| `--font <family>` | A [Google Fonts](https://fonts.google.com) family, such as `Inter` or `"Source Sans 3"`. The build downloads it as woff2 and embeds it, diagram labels included |
| `--font-weights <list>` | Comma-separated weights. Default `400,700`. The build prefers a variable font that covers the range when the family has one |
| `--font-subsets <list>` | Comma-separated subsets. Default `latin` |
| `--font-italic` | Also embed the italic faces, which roughly doubles the font's weight |
| `--primary-color <color>` | A CSS color, such as `#e4572e` or `rgb(228 87 46)`, for links, the active page and view, and edit mode's marks, in light and dark alike. Default is Renderizr's blue |
| `-h, --help` | Print the reference as text and exit |

A font is the one option with a real cost: an embedded family outweighs every other option together, and each extra weight, subset or italic face adds to it.

## Default output

Without `--single-file`, the build writes `index.html`, an `assets/` folder and a favicon. The files use relative URLs, so the site works from any folder of a static host such as GitHub Pages or S3. Use `--base` when a host needs absolute asset paths.

## Single file

`--single-file` inlines every stylesheet, script, font, icon and the workspace itself into one document that makes no network requests at all:

```bash
npx github:FormulaMonks/renderizr ./workspace.json --single-file
```

The build writes two files:

| File | Use it for |
| --- | --- |
| `index.html` | Anywhere a URL can point: GitHub Pages, S3, an email attachment, or straight off your disk over `file://` |
| `artifact.html` | Hosts that supply their own document scaffolding, such as a Claude artifact. It holds the same page without its own `<html>`, `<head>` or `<body>` |

Pick the single file when a folder of files is hard to hand over. One file goes in a chat message, an email, a wiki attachment or a bucket with no build step, and it opens off a USB stick on a machine with no network.

The build fetches themes, element icons and a logo referenced by URL, and folds them all in. The page never reaches for the network, so it also works under a strict content security policy.

## Edit mode

Edit mode lets you arrange the layout of a workspace's views in a browser, with the editing features of Structurizr Local's diagram editor, and saves that layout into `workspace.json`. It changes layout only: element positions, vertices, routing modes, label positions and the canvas. You keep writing the model, styles, documentation and decisions in the DSL or the JSON. Builds stay read-only.

```bash
npx github:FormulaMonks/renderizr edit ./architecture
```

`renderizr edit [path]` takes a `workspace.dsl`, a `workspace.json` or a folder, and opens the current folder when you leave the path out. A file path can carry any name. In a folder, edit mode looks only for the exact names `workspace.dsl` and `workspace.json`, and never in subfolders. It starts a local server and runs until you press Ctrl+C. The terminal prints the URL: open it in your browser, and use it again to come back to edit mode.

| You open | Edit mode runs | It saves into |
| --- | --- | --- |
| A `workspace.dsl`, or a folder that holds one, with Structurizr's tools set up | A DSL session: Structurizr's tools read the DSL, and the page updates whenever a file in the DSL's folder changes | The `workspace.json` beside the DSL |
| A `workspace.dsl`, or a folder that holds one, without the tools but with a `workspace.json` beside it | A JSON session on that `workspace.json`. The terminal says so, and warns when the DSL changed after the JSON | That `workspace.json` |
| A `workspace.dsl`, or a folder that holds one, without the tools and without a `workspace.json` | Nothing: it stops before the server starts and says how to set the tools up | Nothing |
| A `workspace.json`, or a folder that holds only one | A JSON session, with no tools and no JVM | That `workspace.json`, in place |

[Structurizr's tools for a DSL session](04-reference.md#structurizrs-tools-for-a-dsl-session) says how edit mode finds the tools and how to set them up.

On a view you can edit, the toolbar shows a pencil. Two buttons take you back to reading: **Save and close** (the check mark) saves what waits, and **Discard changes and close** (the cross) puts every view back as it was when you started editing, saves that and closes. A view with automatic layout shows the pencil disabled, since its layout comes from `autoLayout` in the DSL. A filtered view links to its base view, and an image view has nothing to edit. A view with no stored layout yet opens with the positions Renderizr would draw, and your first edit saves them.

Edit mode saves 5 seconds after your last change, and at once on Cmd/Ctrl+S. A dot in the toolbar shows the state of saving: yellow while changes wait, gray and pulsing while a save runs, green once saved and red when a save failed. Its tooltip says why a save failed.

### Edit mode flags

`renderizr edit` takes the branding flags of the build (`--logo`, `--logo-alt`, `--logo-href`, `--font`, `--font-weights`, `--font-subsets`, `--font-italic` and `--primary-color`), so edit mode looks like your site, plus two of its own:

| Flag | Effect |
| --- | --- |
| `--port <n>` | Port for the local server. Default `7341`, or the next free one when that one is taken |
| `--open` | Also open the URL in your browser. Without it, edit mode only prints the URL |

It refuses `--out`, `--single-file` and `--base`, because edit mode writes no output.

The server listens on `127.0.0.1` only, so nothing but your machine reaches it, and every save carries a token that only the printed URL holds.

### Keyboard shortcuts

Keys match by physical key, so Option's characters on macOS stay out of the way. `?` opens the same list in edit mode.

| Command | Keys |
| --- | --- |
| Align left, horizontal centers, right | Alt+A, Alt+H, Alt+D |
| Align top, vertical centers, bottom | Alt+W, Alt+V, Alt+S |
| Distribute horizontally, vertically | Alt+Shift+H, Alt+Shift+V |
| Cycle routing modes for the selected edge | Alt+R |
| Nudge the selection by 5, by 50 | Arrow keys, Shift+arrow keys |
| Pan, with nothing selected | Arrow keys |
| Select every element in the view | Cmd/Ctrl+A |
| Close a menu, then clear the selection or the selected edge, then end the animation | Escape |
| Add the focused element to the selection, or take it out | A tap on Space (holding Space while dragging pans) |
| Open the focused item's activation targets | Enter |
| Walk the focus order | Tab |
| Zoom in, zoom out, fit the diagram | `+`, `-`, `0` |
| Undo | Cmd/Ctrl+Z |
| Redo | Cmd/Ctrl+Shift+Z, and Ctrl+Y on Windows and Linux |
| Save now | Cmd/Ctrl+S |
| Open the keyboard shortcuts | `?` |

With the pointer, a drag moves an element or the selection, and a drag on empty canvas draws a marquee. A double-click on an edge adds a vertex, and a double-click on a vertex removes it. A selected edge marks each edge end: drag one onto a side of its element to choose that side. A drag on an edge's label slides it along the route. The edit toolbar also holds the routing mode of the selected edge, the canvas size (Decrease, Increase and Auto) and **Calculate layout**, which lays out the whole view once, the way an automatic layout would, and stores the result as a calculated layout. Undo covers all of it.

### What edit mode writes

Edit mode saves only fields Structurizr defines, the way Structurizr Local saves them, so Structurizr reads the file back unchanged:

- Element `x` and `y`; relationship `vertices`, `routing` and `position`; view `dimensions`. It deletes `paperSize` when you change the canvas size, and keeps a stored `jump` as it found it.
- The stamps Structurizr Local writes: `lastModifiedDate`, `lastModifiedAgent` (`renderizr/<version>`), the workspace `id` (`1` when the file has none) and `views.configuration.lastSavedView`. It keeps `lastModifiedUser` when present.
- The first edit of a view stores `x` and `y` for every element in it, so the view looks the same after a reload. An element you place at exactly (0,0) moves to (5,0), since Renderizr reads (0,0) as an unplaced element.

It writes the file the way Structurizr does: a Structurizr read followed by a Structurizr write. It drops keys Structurizr doesn't define, keeps only `scope` in the workspace `configuration`, truncates fractions and keeps the file's line endings. In a DSL session the file holds what `merge` writes, so it loses what structurizr-java 5 no longer writes, such as `model.enterprise` and element `location`. Edit mode writes only when the content changes, so opening a workspace and looking at it writes nothing.

### Vertices turn avoidance off

An edge without vertices goes around the elements in its way. Any vertex turns that avoidance off for its relationship, and choosing a side adds a vertex: an edge that used to bend around elements runs straight through them once you choose a side. Add vertices to route it around them again.

An edge with vertices also keeps each edge end where its nearest vertex aims it, and those ends stop spreading along the side with the ends of other edges. Reading mode and builds draw them the same way.

## Use Renderizr from an AI agent

Renderizr ships an agent skill, so a coding agent can render a workspace for you:

```bash
npx skills add formulamonks/renderizr
```

The skill teaches the agent the command, which of the two `--single-file` outputs to hand over, how to get JSON out of a DSL workspace, and how to check that the result is self-contained before passing it on. Ask for "an artifact of the architecture" and you get one back.

It pairs with [Scaffoldizr](https://formulamonks.github.io/scaffoldizr/), whose skill authors a workspace for this one to render: `npx skills add formulamonks/scaffoldizr`. The skill lives in [`.agents/skills/renderizr`](https://github.com/FormulaMonks/renderizr/tree/main/.agents/skills/renderizr) if you want to read it first.

## Renderizr or structurizr-site-generatr

[structurizr-site-generatr](https://github.com/avisi-cloud/structurizr-site-generatr) solves the same problem and makes the opposite trades, so the choice is usually clear:

| | Renderizr | structurizr-site-generatr |
| --- | --- | --- |
| Runtime | Node 20 or newer, one `npx` command | A JVM, installed with Homebrew or a tarball, or Docker |
| Input | Workspace JSON | Structurizr DSL, read by the official parser, also straight from a git repository |
| Diagrams | Renderizr's own engine, which honors the workspace's layout and styles: pan, zoom and dynamic-view animation | PlantUML export to SVG, PNG and `.puml`, downloadable as files |
| Output shape | One page with hash routing, or one file | A page per view and per software system, crawlable and linkable |
| Documentation and decisions | Workspace level | Workspace level and per software system |
| Full-text search | No | Yes, a Lunr index over the whole site |
| Several branches | No | Yes, side by side |
| Network at runtime | None: every asset is inlined or local | Browser dependencies come from a CDN by default |
| Styling | Your workspace's own styles and themes, plus a logo, a font and a primary color | Site colors, favicon and a custom stylesheet, set as view properties in the model |

Pick **structurizr-site-generatr** for a browsable documentation site with search, one URL per system, several branches published together and per-system documentation, when a JVM or Docker in the pipeline is fine.

Pick **Renderizr** when the workspace should keep the layout and styling you gave it in Structurizr and should travel: a live engine, no toolchain beyond Node, and output you can attach to a message or drop into a bucket. If you keep your model in DSL, export the JSON with [structurizr-cli](https://docs.structurizr.com/cli) first and hand that to Renderizr.
