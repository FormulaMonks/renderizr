# Publishing a workspace as a Claude artifact

`--artifact` exists for exactly this. It writes the page as a folder of separate files, split by how often each one changes, so you read the runtime once per Renderizr version and send only the workspace on every later publish.

```bash
npx github:FormulaMonks/renderizr ./architecture/workspace.json --artifact --out /tmp/arch
```

```
/tmp/arch/
├── index.html            shell: the page, with the workspace's name in <title>
├── manifest.json         shell: every file with its layer, size and hash
├── renderizr.js          runtime
├── renderizr-vendor.js   runtime
├── renderizr-rolldown-runtime.js  runtime: the bundler's helpers
├── renderizr.css         runtime
├── renderizr-docs.js     docs-runtime, only when a workspace has documentation or decisions
├── workspace.json        workspace: the landscape scoped or lone workspace
├── payments.json         workspace: one per other workspace of a set
└── branding.css          branding, only when the render embeds a font
```

## The manifest

`manifest.json` describes the folder:

```json
{
  "renderizr": "2.8.0",
  "buildDate": "2026-11-06T16:29:09.023Z",
  "files": [
    { "path": "index.html", "layer": "shell", "bytes": 826, "sha256": "79ca…" },
    { "path": "renderizr.js", "layer": "runtime", "bytes": 205073, "sha256": "8d85…" },
    { "path": "manifest.json", "layer": "shell", "bytes": 1053 }
  ]
}
```

- `renderizr` is the version that built the runtime. Runtime and documentation runtime files carry the same hashes for every render at that version.
- `buildDate` is when the render ran. The page fetches `manifest.json` at runtime to show it in exports, so the published artifact must hold the manifest.
- `files` lists every file the render wrote, with the path as published, relative to `index.html`. The manifest lists itself last, with no hash.

## Read in this order

1. `manifest.json`, to learn what the folder holds and which version built it.
2. `index.html`, the shell. It holds the theme script, the mount point, the links to the stylesheets and the module script for `renderizr.js`. It carries no `<html>`, `<head>` or `<body>`, since the artifact host supplies the document.
3. Each workspace payload: `workspace.json`, then each `<slug>.json`.
4. `branding.css`, when the manifest lists it.
5. The runtime and documentation runtime, last, and only when you have to send them (below).

A workspace payload can hold very long lines: documentation and decision content, the `structurizr.dsl` property and data URIs (logos, images) each stay one JSON string. Every other file keeps its lines short. Read a payload with a tool that shows whole lines.

## Publish for the first time

Publish `index.html` as the page, and every other file the manifest lists through `files`, at the same path. Declare the `downloads` capability (`capabilities: {downloads: true}`): the artifact viewer saves a file only through `downloads`, so the page saves each export through it and hides its export buttons when the artifact did not declare it. The shell's `<title>` gives the artifact its name in the gallery and the browser tab.

**Copy the runtime when you can.** List the person's artifacts and read the `manifest.json` of each one that looks like a Renderizr render. When one names the same `renderizr` version as the new manifest, map each `runtime` and `docs-runtime` path to an `{artifact, path}` source pointing at it. The server copies those files, so you never read or send them. Send the shell, the payloads, `branding.css` and `manifest.json` from disk.

- When no artifact names the same version, read and send the runtime files yourself. The next render at that version copies them from this one.
- A source artifact rendered from a workspace with no documentation or decisions has no `renderizr-docs.js`. When the new manifest lists `docs-runtime` and the source lacks it, read and send that one file, and copy the rest.
- Never copy across versions. A runtime of another version may not read this version's workspace payloads.

## Update an artifact

After a change to the workspace, render it again into a fresh folder and update the artifact this conversation published, at the same URL. Compare the new manifest with the published one, and send only the files whose `sha256` changed, plus `manifest.json`. Files you leave out stay as they were.

- A model change in one workspace changes only that workspace's payload: `workspace.json` or its `<slug>.json`.
- A branding change changes the payloads and, for a font, `branding.css`.
- The runtime changes only with the Renderizr version. When it did, the whole artifact is a first publish again: copy or send the runtime as above.
- Remove a file the new manifest no longer lists, such as `renderizr-docs.js` after the last documentation section is gone, by passing `null` for its path.

## What is inside

Everything the page needs. The runtime, the workspace payloads and `branding.css` carry the stylesheets, scripts, fonts, icons, the diagram engine and the workspace. The page loads only files of its own folder, by relative paths, so it makes **no network requests**: it works under the artifact viewer's content security policy, served from any static host, with the network unplugged.

Check it before you publish: see [verifying](./verifying.md).

## Size

Weigh a render against its runtime, which is the same for every workspace:

| Part | Weight |
|---|---|
| The runtime | the bulk of a render with no documentation |
| The documentation runtime | about two fifths of the runtime |
| A workspace payload | grows with the model and its documentation: about a seventh of the runtime for Big Bank plc, more than the whole runtime for a workspace with long documentation and many decisions |
| `branding.css` for `--font` | about an eighth of the runtime per family |
| The shell and the manifest | next to nothing |

What you read per publish matters more than the total. A first publish that copies the runtime from another artifact reads only the shell, the payloads and the branding; an update reads only what changed. The whole folder weighs about what `--single-file`'s `index.html` does, far below the 16 MB a Claude artifact allows. If a render ever approaches the limit, look for embedded imagery in the workspace or its documentation: the number of elements barely moves the size.

## What the reader gets

- Every view in the workspace, listed down the side, each with its own key.
- Diagrams drawn by Renderizr's own engine from the workspace's layout and styles: pan, zoom, dynamic-view animation, and the description and technology labels toggling.
- Workspace documentation as pages, with a table of contents and heading anchors.
- The decision log, with status pills, supersessions and decisions grouped by year.
- Export of the view on screen as PNG or SVG, which the artifact viewer asks the reader to confirm before it saves the file. This needs the `downloads` capability.
- Light and dark, following the reader's system setting.
- Hash-based routing, so a link to a particular view, document or decision survives a reload.

## One file instead

When the user wants a file to email, drop in a bucket, or open by double-clicking, render with `--single-file`. It writes one `index.html` with every asset and workspace inlined. It is a whole document, so do not publish it as a Claude artifact: the host would nest it inside its own.

## What it is not

A build renders a workspace and writes nothing back to `workspace.json`. Layout comes from the workspace: if a diagram's layout looks wrong, a person fixes it with `npx renderizr edit` or in Structurizr, then you render again.
