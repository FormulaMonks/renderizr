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

**Upload `artifact.html`.** The host wraps a Claude artifact in a document skeleton at publish time, so handing over `index.html` nests a document inside a document. It usually still renders, which is what makes the mistake easy to miss and worth getting right the first time.

Use `index.html` when the user wants a file to email, drop in a bucket, or open by double-clicking.

## What is inside

Everything. The build inlines stylesheets, scripts, fonts, icons, the diagram engine and the workspace JSON. The page makes **no network requests at all** — it works from `file://`, inside a sandboxed frame, with the network unplugged.

That is a checkable claim, not a promise. See [verifying](./verifying.md).

## Size

Weigh a render against the page Renderizr ships. The page (the diagram engine, React, the styles and the documentation pages) makes up nearly all of a render, so size stays close to constant as a model grows.

| What you add | Raw | Gzipped |
|---|---|---|
| A small workspace | the page | the page, about a third of raw |
| A landscape of 300 elements and 600 relationships | +15% | +5% |
| `--font` | +8% | +20% |
| `--font` and `--font-italic` | +15% | +35% |

The page weighs about a twentieth of the 16 MB a Claude artifact allows, and the build's tests keep it under a tenth. The rest belongs to the workspace. If a render ever approaches the limit, look for embedded imagery in the workspace or its documentation: the number of elements barely moves the size.

## What the reader gets

- Every view in the workspace, listed down the side, each with its own key.
- Diagrams drawn by Renderizr's own engine from the workspace's layout and styles: pan, zoom, dynamic-view animation, and the description and technology labels toggling.
- Workspace documentation as pages, with a table of contents and heading anchors.
- The decision log, with status pills, supersessions and decisions grouped by year.
- Light and dark, following the reader's system setting.
- Hash-based routing, so a link to a particular view, document or decision survives a reload and works over `file://`.

## What it is not

A build renders a workspace and writes nothing back to `workspace.json`. Layout comes from the workspace: if a diagram's layout looks wrong, a person fixes it with `npx renderizr edit` or in Structurizr, then you render again.
