# Renderizr

Render a [Structurizr](https://structurizr.com/) workspace — its diagrams, documentation and architecture decisions — as a static site, or as a single self-contained HTML file you can host anywhere.

## Usage

```bash
npx github:FormulaMonks/renderizr {path/to/workspace.json}
```

Where `{path/to/workspace.json}` is either a local path or an accessible URL. Needs Node 20 or newer; nothing else to install.

### Example

```bash
# Renders the Structurizr Big Bank plc example
npx github:FormulaMonks/renderizr https://raw.githubusercontent.com/structurizr/ui/main/examples/big-bank-plc.json

# Outputs to ./structurizr-output — serve it with any static server
npx servor structurizr-output
```

## Single file

`--single-file` inlines every stylesheet, script, font, icon and the workspace itself into one document with no network requests at all:

```bash
npx github:FormulaMonks/renderizr ./workspace.json --single-file
```

You get two files:

| File | Use it for |
| --- | --- |
| `index.html` | Anywhere a URL can point: GitHub Pages, S3, an email attachment, or straight off your disk over `file://` |
| `artifact.html` | Hosts that supply their own document scaffolding, such as a Claude artifact — same page, no `<html>`/`<head>`/`<body>` of its own |

Routing lives in the URL hash, so deep links to a view, a document or a decision survive a reload, a `file://` origin and a sandboxed frame.

## Customization

```bash
npx github:FormulaMonks/renderizr ./workspace.json \
  --single-file \
  --logo ./logo.svg \
  --font "Inter"
```

| Flag | Effect |
| --- | --- |
| `--logo <path\|url>` | Image shown at the top left. Fetched at build time, minified if it is SVG, and embedded as a data URI |
| `--logo-alt <text>` | Alt text for the logo |
| `--logo-href <url>` | Wraps the logo in a link |
| `--font <family>` | A [Google Web Font](https://fonts.google.com) family. Downloaded as woff2 and embedded, including into the diagram labels |
| `--font-weights <list>` | Comma-separated weights, default `400,700`. A variable font covering the range is preferred when the family has one |
| `--font-subsets <list>` | Comma-separated subsets, default `latin` |
| `--font-italic` | Also embed the italic faces |
| `--single-file` | Emit one self-contained document, as above |
| `-o, --out <dir>` | Output directory, default `structurizr-output` |
| `--base <path>` | Base public path for the multi-file build |

A font is the one option with a real cost: Inter at latin, weights 400–700, adds about 50KB gzipped. Run with `--help` for the full list.

Workspace themes, element icons and any branding logo referenced by URL are all fetched during the build and folded in, so the rendered page never reaches for the network.

---

## Local Development

### Setup

```bash
pnpm install
```

The Structurizr submodule is optional — the files the build reads from it are committed under `vendor/structurizr`. Check it out only to pull in a newer upstream:

```bash
git submodule update --init --remote submodules/structurizr
pnpm sync:vendor
```

### Dev server

```bash
pnpm dev -- {path/to/workspace.json}
```

### Build locally

```bash
pnpm build -- {path/to/workspace.json} [--single-file] [--logo ...] [--font ...]
# Outputs to ./structurizr-output/
```

> [!NOTE]
> A `mise` task `workspace-dev` is defined in `.mise.toml` and points to `scripts/render-workspace.sh`. That script is not committed — create it as a personal convenience wrapper to avoid retyping the workspace path:
>
> ```bash
> #!/bin/bash
> pnpm dev -- ./path/to/your/local-workspace.json
> ```

### How the build is put together

| File | Responsibility |
| --- | --- |
| `scripts/build.js` | CLI entry point — parses arguments, loads the workspace and assets, runs the build |
| `scripts/cli.js` | Argument definitions and `--help` |
| `scripts/assets.js` | Fetching and embedding the workspace, themes, icons, logo and font |
| `scripts/config.js` | The Vite configuration, shared with the dev server |
| `scripts/plugins.js` | Build plugins: Structurizr globals, CSS trimming, branding injection, single-file inlining |
| `scripts/sync-vendor.js` | Copies the files the build reads out of the submodule into `vendor/structurizr` |
| `vite.config.ts` | Dev server only; production goes through `scripts/build.js` |

Diagrams are drawn by Structurizr's own renderer, taken from [structurizr/structurizr](https://github.com/structurizr/structurizr) — the same code the official local server serves, so a workspace renders here exactly as it does there. The renderer, its stylesheet and the icons live in `vendor/structurizr`, copied verbatim from the submodule and committed: neither npm nor pnpm fetches submodules for a git dependency, so an `npx` install would otherwise arrive with nothing to render with. `pnpm sync:vendor` refreshes them, taking exactly the files the source imports. `src/structurizr-globals.ts` supplies the handful of globals it expects, and `scripts/plugins.js` concatenates and injects it as a classic script (the renderer is written for sloppy mode, which an ES module forbids; an inline script is not `eval`, so a strict CSP still passes). The comments in both explain the details.
