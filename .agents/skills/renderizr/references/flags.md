# Flags

The authoritative list is `npx github:FormulaMonks/renderizr --help`, which is generated from the parser itself. This page says what each flag is *for* and what it costs.

```
renderizr <workspace.json|url> [options]
```

The workspace is positional and required: a local path or a URL to a Structurizr workspace **in JSON**. Renderizr does not parse DSL — see the SKILL for how to export one.

## Output

| Flag | Default | What it does |
|---|---|---|
| `-o, --out <dir>` | `structurizr-output` | Where the build is written, relative to the current directory. **The directory is emptied first.** |
| `--single-file` | off | Inlines every asset and the workspace into one document, and emits `artifact.html` alongside it. See [artifacts](./artifacts.md). |
| `--base <path>` | `""` | Base public path for the **multi-file** build. Rewrites `./assets/…` to `<base>/assets/…`. Needed when the site is served from a subdirectory, e.g. `--base /renderizr/` for a GitHub project Pages site. Has no meaning with `--single-file`, where there are no separate assets. |
| `-h, --help` | | Print the usage and exit |

## Branding

| Flag | Default | What it does |
|---|---|---|
| `--logo <path\|url>` | none | Image shown top-left in the header, embedded as a data URI. A local path is read from disk; a URL is fetched at build time. |
| `--logo-alt <text>` | `""` | Alt text for the logo. Set it — the logo is otherwise an unlabeled image. |
| `--logo-href <url>` | none | Wraps the logo in a link, usually back to the team or product homepage. |

## Typography

| Flag | Default | What it does |
|---|---|---|
| `--font <family>` | system fonts | A Google Web Font family, e.g. `Inter` or `Source Sans 3`. Fetched at build time and embedded as woff2 data URIs. Costs roughly 45–70 KB gzipped. |
| `--font-weights <list>` | `400,700` | Comma-separated weights. A variable font covering the range is preferred when one exists. |
| `--font-subsets <list>` | `latin` | Comma-separated subsets. Add e.g. `latin-ext` or `greek` only if the workspace needs them — each one costs bytes. |
| `--font-italic` | off | Also embed the italic faces. Roughly doubles the font weight. |

The font is embedded, not linked, so a branded build is exactly as offline as an unbranded one once it is built.

## Network

A render is fully offline **unless** you pass `--font`, a remote `--logo`, or a workspace URL. Those are fetched during the build and then inlined; the output never fetches anything at runtime regardless.

This matters on a locked-down machine or in CI without egress: a local workspace with no `--font` and no remote `--logo` will build with the network unplugged.

## Requirements

Node 20 or newer, and nothing else. Renderizr checks the running version and exits with a message naming it, because `npx` runs against whatever Node is first on `PATH` — often not the one the shell reports.
