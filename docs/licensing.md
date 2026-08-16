# Licensing and attribution

Renderizr is MIT-licensed. The pages it produces are not purely Renderizr: every rendered `index.html` is a bundle of minified third-party code — Structurizr's diagram renderer under Apache-2.0, JointJS under MPL-2.0, jQuery, highlight.js, markdown-it and a dozen others under MIT and BSD terms. This page explains who owes attribution to whom, and the routes by which that attribution can reach the page a reader actually opens.

The component-by-component list, with versions, exact copyright lines and full licence texts, is [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md). The short-form block meant for pasting is [`NOTICE`](../NOTICE). This page is about plumbing, not inventory.

## Three parties, three obligations

**Renderizr the project** owes the notices for everything it vendors and bundles. That obligation is discharged by `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES.md` and `vendor/structurizr/LICENSE`, all committed at the root of the repository. They arrive with every install by either route: `npx github:FormulaMonks/renderizr` clones the repository, and an npm tarball carries all four because `NOTICE`, `THIRD-PARTY-NOTICES.md` and `vendor` are named in `package.json`'s `files` array (`LICENSE` npm includes unasked). Verified with `npm pack --dry-run` — 83 files, all four present. The one file that is *not* in the tarball is this page: `docs/` is not in `files`. See [finding 5](../THIRD-PARTY-NOTICES.md#5-the-npm-tarball-carries-the-notices-the-page-they-link-to-is-not-in-it).

**You, running `renderizr your-workspace.json`,** are producing a new distribution: an HTML file containing minified copies of all that third-party code. MIT and BSD both require the copyright and permission notices to travel with binary distributions; MPL-2.0 section 3.2 requires recipients to be told where to get JointJS's source. **Renderizr's build does not put those notices into the HTML for you.** Only jQuery's `/*! ... */` banner survives minification; every other header is stripped. If you hand someone the rendered file and nothing else, the notices did not travel.

**Whoever opens the page** owes nothing, and is the person the notices are for.

## What the page already says

`src/main.ts` renders a footer on every page:

> Diagrams rendered using [Structurizr](https://structurizr.com/) and [C4 notation.](https://c4model.com/) Created with [Renderizr](https://github.com/FormulaMonks/renderizr).

That is credit, and it is genuinely useful — it names the two upstreams a reader is most likely to want to look up. It is **not** licence attribution: it carries no copyright lines, no licence names, and no source-availability statement for JointJS. Do not treat it as discharging anything.

## Route 1 — ship `NOTICE` beside the output

The default build writes a directory. Put the notice in it:

```bash
npx github:FormulaMonks/renderizr ./workspace.json --out ./site
cp NOTICE ./site/NOTICE          # from a clone of this repository
```

`NOTICE` is written to stand on its own: it carries the copyright line and resolved version of all 17 bundled components, the MIT permission notice verbatim, the BSD-2 and BSD-3 conditions and disclaimers verbatim, a URL to the Apache-2.0 licence text, and the JointJS source-availability statement. Copying that one file is therefore enough to discharge MIT section 1, the BSD conditions, Apache-2.0 section 4(a) and MPL-2.0 section 3.2(b) for the rendered output. Serve or publish the directory as a whole and the notices travel with the pages, which is what MIT's "included in all copies or substantial portions" asks for.

Copy `THIRD-PARTY-NOTICES.md` alongside it if you want the recipient to have the provenance and the full licence texts too — that is generosity, not obligation:

```bash
cp NOTICE THIRD-PARTY-NOTICES.md ./site/
```

This is the cheapest correct answer for GitHub Pages, S3, or any host that takes a directory. It is worth linking to from wherever your site links to its other boilerplate, so a reader can find it rather than having to guess the URL.

It does nothing for `--single-file`, whose whole point is that there is only one file.

## Route 2 — a Colophon section in the workspace

This is the route that works everywhere, including `--single-file` and a Claude artifact, because it puts the attribution inside the document itself. It needs no change to Renderizr: workspace documentation is already rendered as pages, so a documentation section holding the notices becomes a page of the site.

Add a section to your workspace JSON:

```json
{
  "documentation": {
    "sections": [
      {
        "id": "colophon",
        "title": "Colophon",
        "filename": "colophon.md",
        "order": 99,
        "format": "Markdown",
        "content": "# Colophon\n\n## Credits and licences\n\nRendered with Renderizr (MIT).\n\n- Structurizr diagram renderer — Copyright Structurizr — Apache-2.0\n- Bootstrap Icons — Copyright (c) 2019-2024 The Bootstrap Authors — MIT\n- JointJS — Copyright 2013 client IO — MPL-2.0 — source: https://github.com/clientIO/joint\n- jQuery — Copyright OpenJS Foundation and other contributors — MIT\n- highlight.js — Copyright (c) 2006, Ivan Sagalaev — BSD-3-Clause\n"
      }
    ]
  }
}
```

The fields match the section shape declared in `src/types/structurizr-documentation.ts`. One of them is load-bearing in a way that is easy to get wrong: **a section with neither `id` nor `filename` renders as an empty Documentation page** — the nav entry appears, the content does not. Either key on its own is enough; supplying both, as above, is the safe habit.

**The `content` string in that example is truncated to keep it readable.** It names 5 of the 17 components that ship in rendered output, and it shortens the JointJS entry to a bare repository URL — no version, no "at no charge" — so it is *not* compliant as written. Do not copy it into a workspace.

Take the real body from [`NOTICE`](../NOTICE), which carries all 17 components with their resolved versions, the MIT permission notice, the BSD conditions and disclaimers, the Apache-2.0 licence URL and the JointJS source-availability statement MPL-2.0 section 3.2(b) requires. JSON has no multi-line strings, so the whole file has to become one escaped string. Generate it rather than retyping it — **from the root of a Renderizr checkout**, since the path is relative and `NOTICE` lives there:

````bash
node -e 'console.log(JSON.stringify("# Colophon\n\n```\n" + require("fs").readFileSync("NOTICE","utf8") + "```\n"))'
````

The single quotes are load-bearing: the snippet contains double quotes and backticks, and only `'…'` keeps the shell out of both. Run from anywhere else and the only failure you get is `ENOENT: no such file or directory, open 'NOTICE'` — point `readFileSync` at an absolute path in that case.

That prints one line: a ready-to-paste JSON string value for `content`, fenced so the notice renders as preformatted text rather than being reflowed. Against the `NOTICE` in this repository it is 11,030 bytes and begins

````text
"# Colophon\n\n```\nRenderizr\nCopyright (c) 2024-2026 Formula.Monks\n\nLicensed …
````

— outer quotes included, because the quoted string *is* the JSON value. If you generate the workspace from DSL or from a script, do the same read-and-inject there rather than maintaining a second copy by hand.

The result is a "Colophon" entry in the Documentation navigation, rendered like any other documentation page — verified against a `--single-file` build of the Big Bank plc example. Because the section lives in the workspace, it survives every build flag, including `--single-file` and `artifact.html`.

If you would rather not give attribution a whole page, the same content works appended to the end of an existing section.

## Route 3 — not implemented: a colophon Renderizr builds itself

Renderizr could carry the notices without anyone remembering to. The pieces are already in place: `scripts/plugins.js` has a `branding()` plugin that injects into `<head>` through `transformIndexHtml`, and `src/main.ts` renders the `<footer id="disclaimer">` quoted above. A plugin that read `NOTICE` at build time and emitted it as a hidden `<template>`, or a footer link that opened it in a dialog, would make every rendered page self-attributing with no workspace changes and no second copy to maintain.

This does not exist today. It is written down here so that the absence is a known gap rather than an oversight, and so nobody assumes the footer is doing more than it does. Until it exists, route 1 or route 2 is required for a distribution to carry its notices.

## Fonts

`--font Inter` downloads the family from Google Fonts at build time and inlines the woff2 files as data URIs. The embedded font is then part of your distribution.

Renderizr does not read that family's licence and cannot — Google Fonts serves families under SIL OFL 1.1, Apache-2.0 and the Ubuntu Font Licence, and the `css2` API returns no licence information. **Attribution for the embedded font is yours.** Check the family's page on fonts.google.com, and add its copyright line to whichever route above you chose. OFL 1.1 families in particular carry a Reserved Font Name and a copyright notice that has to be reproduced.

Builds without `--font` embed no font and use the system stack, and this section does not apply to them.

## Your own content is yours

The workspace JSON, its documentation and decision records, and any theme, element icon or branding logo it references are embedded verbatim and belong to whoever wrote them. Renderizr applies no licence to them and claims nothing over the rendered result. A `--logo` image is likewise yours to clear.

## Before a release

- [ ] `LICENSE` year range still covers the current year.
- [ ] `THIRD-PARTY-NOTICES.md` matches the resolved dependency tree. The way to check is to re-run the Rollup scan described under [How this list was produced](../THIRD-PARTY-NOTICES.md#how-this-list-was-produced) — not to read `package.json`, which lists ranges that do not match what gets bundled.
- [ ] `pnpm sync:vendor` has been run if the Structurizr submodule moved, so `vendor/structurizr/LICENSE` and the recorded upstream commit are current.
- [ ] Any new runtime dependency has been added to the "ships in the rendered output" table with its licence checked on disk, in `node_modules`, rather than guessed from the package name.
- [ ] A new licence family — anything reciprocal beyond MPL-2.0, anything with an advertising clause, anything unlicensed — is escalated rather than added quietly. MPL-2.0 is already the strictest thing in the tree.
