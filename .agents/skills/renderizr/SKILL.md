---
name: renderizr
description: Renders a Structurizr workspace as a Claude artifact, a static site or one self-contained HTML file, using the Renderizr CLI. Use when the user wants to see, share, publish or hand over a C4 architecture model ("show me the architecture", "turn this workspace into an artifact", "publish these diagrams"), or mentions Renderizr, workspace.json or a Renderizr manifest.json.
license: MIT
compatibility: Requires Node 22.13 or newer. Nothing else (no JVM, no Docker, no Graphviz, no PlantUML). Renderizr itself runs with `npx` and needs no installation.
allowed-tools: Bash(npx:*), Bash(node:*)
disable-model-invocation: true
metadata:
  author: Andrés Zorro <andres.zorro@monks.com>
  version: 3.1.1 # x-release-please-version
---

# Renderizr: a Structurizr workspace as a page anyone can open

This skill renders a [Structurizr workspace](https://docs.structurizr.com/workspaces) (its views, documentation and decision log) into a page you can publish as a Claude artifact, a browsable static site, or a single self-contained HTML file. Every output opens with no server of its own and makes no network requests.

Renderizr draws the diagrams with its own engine from everything the workspace says (positions, styles, themes, shapes and routing), so they pan, zoom and animate dynamic views the way they do in Structurizr.

## When to use this skill

- The user wants to **see** an architecture model rather than read its source.
- The user wants to **share** a model with people who have no Structurizr account, no server and no copy of the DSL.
- The user asks for an **artifact**, a **preview**, or "publish the diagrams".
- The user works in a repository that has an `./architecture` folder, often one created by [Scaffoldizr](https://formulamonks.github.io/scaffoldizr/), and wants output from it.

Do **not** use this skill to author or edit a model: that is Scaffoldizr's job. Renderizr renders a workspace, and its edit mode (`npx renderizr edit`) lets a person arrange the layout of its views in a browser; the agent never drives edit mode.

## Pick the output

| Flag            | What it writes                                                   | Use it for                                        |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| `--artifact`    | A folder of separate files and a `manifest.json` that lists them | **Publishing a Claude artifact**                  |
| `--single-file` | One self-contained `index.html`                                  | Opening from disk, emailing, dropping in a bucket |
| neither         | `index.html`, `assets/` and a favicon                            | A static host such as GitHub Pages                |

## Publishing a Claude artifact

```bash
npx github:FormulaMonks/renderizr <workspace.json|url> --artifact --out <dir>
```

That writes a folder, and `manifest.json` says what each file is:

| Layer          | Files                                                                                                                              | What it is                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `shell`        | `index.html`, `manifest.json`                                                                                                      | The page that loads the rest, with the workspace's name in its `<title>`, and the manifest itself            |
| `runtime`      | `renderizr.js`, `renderizr-vendor.js`, `renderizr-rolldown-runtime.js`, `renderizr.css`                                            | Renderizr's code and styles, the same byte for byte for every workspace at a Renderizr version               |
| `docs-runtime` | `renderizr-docs.js`                                                                                                                | The code of the documentation and decisions pages. Left out when no workspace has documentation or decisions |
| `workspace`    | `workspace.json`, one `<slug>.json` per other workspace of a set (`<slug>--payload.json` for the slugs `workspace` and `manifest`) | The workspace payloads: each workspace with its branding                                                     |
| `branding`     | `branding.css`                                                                                                                     | Embedded font faces, when the render embeds a font                                                           |

The manifest also names the Renderizr version that built the runtime (`renderizr`) and the build date (`buildDate`), and gives each file its `bytes` and `sha256`. It lists itself last, with no hash.

Publish the folder with these rules, in full in [artifacts](./references/artifacts.md):

1. **Read `manifest.json`, then `index.html`, then each workspace payload, then `branding.css`.** Read the runtime last, and only when you have to send it.
2. **Copy the runtime from an artifact that already holds it.** List the person's artifacts and look for one whose published `manifest.json` names the same Renderizr version. When one exists, copy each `runtime` and `docs-runtime` file from it with an `{artifact, path}` source and do not read them. When none exists, read and send them. A source with no `renderizr-docs.js` cannot supply one: when the new manifest lists `docs-runtime` and the source lacks it, read and send that file.
3. **On an update, send only what changed.** For an artifact this conversation published, compare the new manifest with the published one and send only the files whose `sha256` changed, plus `manifest.json`.
4. **Declare the `downloads` capability**, for example `capabilities: {downloads: true}`, so the reader can export views.

Publish `index.html` as the page and every other file through `files`, `manifest.json` included: the page fetches it at runtime for the build date.

## Getting a workspace to render

Renderizr takes a `workspace.json` or a `workspace.dsl`, as a local path or a URL, or a folder of them. It does not parse DSL itself: a `workspace.dsl` runs through Structurizr's tools (`STRUCTURIZR_CLI`, else `structurizr-cli` on the `PATH`, with Java 21 to 25), and the build fails naming the file when it finds none.

- **A `workspace.json` already on disk**: usually `./architecture/workspace.json`. Use it directly; it needs no tools.
- **Only a `workspace.dsl`**: render it when the tools are installed. Otherwise export it first with [structurizr-cli](https://docs.structurizr.com/cli), which exports a DSL workspace to JSON. In a Scaffoldizr repository, `./architecture/scripts/export.sh` (or `export.ps1`) does this for you.
- **Several workspaces of Structurizr's enterprise pattern**: pass them all, or their folder, in any order. Renderizr takes the landscape scoped workspace as the entry point and follows each software system's element link to a `workspace.json` or `workspace.dsl`. See [flags](./references/flags.md).
- **A URL**: passed straight through, for example the Big Bank plc example:

  ```bash
  npx github:FormulaMonks/renderizr \
    https://raw.githubusercontent.com/structurizr/structurizr/main/structurizr-export/src/test/resources/big-bank-plc.json \
    --artifact --out /tmp/big-bank
  ```

In a Scaffoldizr repository `workspace.json` holds the views' layout as well as the exported model: Renderizr's edit mode and Structurizr Local save layout into it, and Structurizr's `merge` keeps that layout when the DSL changes. Render it, and never edit it by hand.

## Recommended flow

1. **Find the workspace.** Look for `./architecture/workspace.json`. If only `workspace.dsl` exists, export it first and say so; do not silently render a stale JSON. An export that overwrites a `workspace.json` holding layout loses it: when one exists, export with `merge -layout workspace.json`.
2. **Render it**, into a temporary directory rather than the repository, unless the user asked you to keep the output:

   ```bash
   npx github:FormulaMonks/renderizr ./architecture/workspace.json --artifact --out /tmp/renderizr-out
   ```

3. **Check it** before publishing: see [verifying](./references/verifying.md).
4. **Publish it** with the rules above, or hand over `--single-file`'s `index.html` when the user wants one file to keep or send.

## Flags

Full reference in [flags](./references/flags.md). The ones that matter most:

| Flag                 | Effect                                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| `--artifact`         | A folder to publish as a Claude artifact, with a manifest. **Use for artifacts.** |
| `--single-file`      | One self-contained `index.html`                                                   |
| `-o, --out <dir>`    | Output directory (default `structurizr-output`)                                   |
| `--base <path>`      | Base public path for the multi-file build, e.g. `/repo-name/` for project Pages   |
| `--logo <path\|url>` | Image top-left in the header, embedded as a data URI                              |
| `--font <family>`    | A Google Web Font, fetched at build time and embedded as woff2                    |

`--font` and a remote `--logo` are the only things that need network access during a build. Without them a render is fully offline.

## Things that will bite you

We verified each of these against the tool:

- **Node 22.13 is a hard floor.** `npx` runs against whatever Node is first on `PATH`, which is often not the one the shell reports. Renderizr checks and exits with a clear message rather than failing deep inside the build.
- **`--single-file`'s `index.html` is a whole document.** Publishing it as a Claude artifact nests a document inside the one the host supplies. `--artifact`'s `index.html` is the fragment the host expects.
- **Copy runtime files only between artifacts of the same Renderizr version.** The manifest's `renderizr` says which version built them, and a runtime of another version may not read this version's workspace payloads.
- **An artifact without `downloads` can't export.** The artifact viewer lets a page save a file only through its `downloads` capability. Publish without declaring it and the page hides its export buttons.
- **A workspace payload can hold very long lines.** Documentation and decision content, the `structurizr.dsl` property and data URIs each stay one JSON string. Read a payload with a tool that shows whole lines.
- **Renderizr empties the output directory** before writing. Never point `--out` at a directory holding anything you want to keep.
- **`https://` in the output is not a leak.** A rendered page contains ordinary hyperlinks to `structurizr.com`, `c4model.com` and the like. Self-containment is about _asset_ references (`<script src>`, `<link href>`, `<img src>`) that point off the page's own files, of which there are none. Check the right thing; see [verifying](./references/verifying.md).
- **Working inside a clone of the Renderizr repository is different.** `pnpm render <workspace> [flags]`, and specifically _not_ `pnpm render -- <workspace> --flag`, which makes the flag arrive as a second workspace. `pnpm dev` is the opposite and does want the `--`. This only applies inside the repository; `npx` users are unaffected.

## References

- [flags](./references/flags.md): every CLI flag, what it does, and what it costs
- [artifacts](./references/artifacts.md): publishing a Claude artifact in detail, including the manifest, copying the runtime, updates and size
- [verifying](./references/verifying.md): proving an output is self-contained before you hand it over
