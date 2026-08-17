# Rendering a workspace as a Claude artifact

`--single-file` exists for exactly this. It writes **two** files, and the difference between them is the whole point.

```bash
npx github:FormulaMonks/renderizr ./architecture/workspace.json --single-file --out /tmp/arch
```

```
/tmp/arch/
├── artifact.html   ← upload this one
└── index.html
```

## Which file to hand over

| | `artifact.html` | `index.html` |
|---|---|---|
| Document scaffolding | none — no `<html>`, `<head>` or `<body>` | a complete document |
| Intended host | somewhere that supplies its own document, i.e. **a Claude artifact** | a browser opening a file directly |
| Opening it from disk | works, browsers are forgiving | works |

**Upload `artifact.html`.** A Claude artifact is wrapped in a document skeleton at publish time, so handing over `index.html` nests a document inside a document. It usually still renders, which is what makes the mistake easy to miss and worth getting right the first time.

Use `index.html` when the user wants a file to email, drop in a bucket, or open by double-clicking.

## What is inside

Everything. Stylesheets, scripts, fonts, icons, the Structurizr renderer and the workspace JSON are all inlined. The page makes **no network requests at all** — it works from `file://`, inside a sandboxed frame, with the network unplugged.

That is a checkable claim, not a promise. See [verifying](./verifying.md).

## Size

A real model lands around **1 MB**, roughly 320 KB gzipped. Measured:

| Workspace | `artifact.html` | gzipped |
|---|---|---|
| Big Bank plc (the Structurizr example) | 1.07 MB | ~327 KB |
| A small fixture workspace | 1.02 MB | ~320 KB |

Most of that is the Structurizr renderer itself, so size is close to constant — a bigger model is not a proportionally bigger file. The floor is about a megabyte no matter how small the workspace.

Claude artifacts allow up to 16 MB, so an ordinary workspace is nowhere near the limit. If a render ever approaches it, the cause is embedded imagery in the workspace or its documentation, not the number of elements.

Adding `--font` costs another 45–70 KB gzipped, and `--font-italic` roughly doubles that.

## What the reader gets

- Every view in the workspace, listed down the side, each with its own key.
- Diagrams drawn by Structurizr's own renderer: pan, zoom, dynamic-view playback, and the description and technology labels toggling.
- Workspace documentation as pages, with a table of contents and heading anchors.
- The decision log, with status pills, supersessions and decisions grouped by year.
- Light and dark, following the reader's system setting.
- Hash-based routing, so a link to a particular view, document or decision survives a reload and works over `file://`.

## What it is not

Renderizr renders a workspace; it does not edit one. There is no authoring UI, and nothing written back to `workspace.json`. Diagram layout comes from the workspace — if a diagram is laid out badly, fix it in the model, then re-render.
