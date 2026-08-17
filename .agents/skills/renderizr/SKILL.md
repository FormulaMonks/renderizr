---
name: renderizr
description: Renders a Structurizr workspace as a Claude artifact or a static site, using the Renderizr CLI. Use when the user wants to see, share, publish or hand over a C4 architecture model — "show me the architecture", "turn this workspace into an artifact", "publish these diagrams" — or mentions Renderizr, workspace.json or artifact.html.
license: MIT
compatibility: Requires Node 20 or newer. Nothing else — no JVM, no Docker, no Graphviz, no PlantUML. Renderizr itself is run with `npx` and needs no installation.
allowed-tools: Bash(npx:*), Bash(node:*)
metadata:
  author: Andrés Zorro <andres.zorro@monks.com>
  version: 1.0.0
---

# Renderizr — a Structurizr workspace as one shareable file

This skill renders a [Structurizr workspace](https://docs.structurizr.com/workspaces) — its views, documentation and decision log — into a browsable static site, or into a single self-contained HTML file that can be uploaded as a Claude artifact and opened by anyone, with no server and no network.

Diagrams are drawn by Structurizr's own renderer rather than re-implemented, so they pan, zoom and play back dynamic views exactly as they do in Structurizr.

## When to use this skill

- The user wants to **see** an architecture model rather than read its source.
- The user wants to **share** a model with people who have no Structurizr account, no server and no copy of the DSL.
- The user asks for an **artifact**, a **preview**, or "publish the diagrams".
- The user is working in a repository that has an `./architecture` folder — often one created by [Scaffoldizr](https://formulamonks.github.io/scaffoldizr/) — and wants output from it.

Do **not** use this skill to author or edit a model. Renderizr renders; it does not parse DSL and never writes to the workspace. Editing the model is Scaffoldizr's job.

## The one command

```bash
npx github:FormulaMonks/renderizr <workspace.json|url> --single-file --out <dir>
```

That writes two files into `<dir>`:

| File | What it is | Use it for |
|---|---|---|
| `artifact.html` | The page **without** its own `<html>`/`<head>`/`<body>` scaffolding | **Uploading as a Claude artifact** — the host supplies the document |
| `index.html` | The same page as a complete standalone document | Opening from disk, emailing, dropping in a bucket |

Both inline every stylesheet, script, font, icon and the workspace itself. Neither makes a single network request.

**For a Claude artifact, use `artifact.html`.** Handing over `index.html` instead produces a document nested inside a document.

Drop `--single-file` to get a directory — `index.html` plus `assets/` — for hosting on a static server or GitHub Pages.

## Getting a workspace to render

Renderizr takes **JSON**, either a local path or a URL. It does not parse DSL.

- **A `workspace.json` already on disk** — usually `./architecture/workspace.json`. Use it directly.
- **Only a `workspace.dsl`** — export it first with [structurizr-cli](https://docs.structurizr.com/cli), which exports a DSL workspace to JSON. In a Scaffoldizr repository, `./architecture/scripts/export.sh` (or `export.ps1`) does this for you.
- **A URL** — passed straight through, e.g. the Big Bank plc example:

  ```bash
  npx github:FormulaMonks/renderizr \
    https://raw.githubusercontent.com/structurizr/ui/main/examples/big-bank-plc.json \
    --single-file --out /tmp/big-bank
  ```

`workspace.json` is a **compiled output** in a Scaffoldizr repository. Render it, but never edit it — it is overwritten on the next export.

## Recommended flow

1. **Find the workspace.** Look for `./architecture/workspace.json`. If only `workspace.dsl` exists, export it first and say so; do not silently render a stale JSON.
2. **Render it**, into a temporary directory rather than the repository, unless the user asked for the output to be kept:

   ```bash
   npx github:FormulaMonks/renderizr ./architecture/workspace.json --single-file --out /tmp/renderizr-out
   ```

3. **Check it is genuinely self-contained** before handing it over — see [verifying](./references/verifying.md). One command, and it is the difference between an artifact that opens and one that renders blank for the recipient.
4. **Hand over `artifact.html`.** Say which file it is and roughly how big; a real model lands around 1 MB.

## Flags

Full reference in [flags](./references/flags.md). The ones that matter most:

| Flag | Effect |
|---|---|
| `--single-file` | One self-contained document, plus `artifact.html`. **Use for artifacts.** |
| `-o, --out <dir>` | Output directory (default `structurizr-output`) |
| `--base <path>` | Base public path for the multi-file build, e.g. `/repo-name/` for project Pages |
| `--logo <path\|url>` | Image top-left in the header, embedded as a data URI |
| `--font <family>` | A Google Web Font, fetched at build time and embedded as woff2 |

`--font` and a remote `--logo` are the only things that need network access during a build. Without them a render is fully offline.

## Things that will bite you

Each of these has been verified against the tool, not inferred:

- **Node 20 is a hard floor.** `npx` runs against whatever Node is first on `PATH`, which is often not the one the shell reports. Renderizr checks and exits with a clear message rather than failing deep inside the build.
- **`artifact.html` and `index.html` are not interchangeable.** See the table above.
- **The output directory is emptied** before writing. Never point `--out` at a directory holding anything you want to keep.
- **`https://` in the output is not a leak.** A rendered page contains ordinary hyperlinks to `structurizr.com`, `c4model.com` and the like. Self-containment is about *asset* references — `<script src>`, `<link href>`, `<img src>` — of which there are none. Check the right thing; see [verifying](./references/verifying.md).
- **Working inside a clone of the Renderizr repository is different.** `pnpm build <workspace> [flags]` — and specifically *not* `pnpm build -- <workspace> --flag`, which makes the flag arrive as a second workspace. `pnpm dev` is the opposite and does want the `--`. This only applies inside the repository; `npx` users are unaffected.

## References

- [flags](./references/flags.md) — every CLI flag, what it does, and what it costs
- [artifacts](./references/artifacts.md) — the Claude artifact path in detail, including size and what to hand over
- [verifying](./references/verifying.md) — proving an artifact is self-contained before you hand it over
