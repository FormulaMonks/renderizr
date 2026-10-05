# Licensing and attribution

Renderizr is MIT-licensed. The pages it produces are not purely Renderizr: every rendered `index.html` is a bundle of minified third-party code (React, React Flow, Dagre, highlight.js, markdown-it and two dozen others under MIT, ISC and BSD terms) and a model layer derived from Structurizr's Apache-2.0 code. This page explains who owes attribution to whom, and the routes by which that attribution can reach the page a reader actually opens.

The component-by-component list, with versions, exact copyright lines and full license texts, is [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md). The short-form block meant for pasting is [`NOTICE`](../NOTICE). This page is about plumbing, not inventory.

## Three parties, three obligations

**Renderizr the project** owes the notices for everything it bundles and derives. `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES.md` and `licenses/Apache-2.0.txt` discharge that obligation, all committed in the repository. They arrive with every install by either route: `npx github:FormulaMonks/renderizr` clones the repository, and an npm tarball carries all four because `package.json`'s `files` array names `NOTICE`, `THIRD-PARTY-NOTICES.md` and `licenses` (`LICENSE` npm includes unasked). Verified with `npm pack --dry-run`: 99 files, all four present. The one file that is *not* in the tarball is this page: `docs/` is not in `files`. See [finding 4](../THIRD-PARTY-NOTICES.md#4-the-release-tarball-carries-the-notices-the-page-they-link-to-is-not-in-it).

**You, running `renderizr your-workspace.json`,** produce a new distribution: an HTML file containing minified copies of all that third-party code. MIT, ISC and BSD all require the copyright and permission notices to travel with binary distributions, and Apache-2.0 requires recipients to get a copy of its license. **Renderizr's build does not put those notices into the HTML for you.** Minification strips every license header. If you hand someone the rendered file and nothing else, the notices did not travel.

**Whoever opens the page** owes nothing, and is the person the notices are for.

## What the page already says

`src/main.ts` renders a footer on every page:

> Diagrams from a [Structurizr](https://structurizr.com/) workspace, in [C4 notation](https://c4model.com/), drawn with [React Flow](https://reactflow.dev/). Created with [Renderizr](https://github.com/FormulaMonks/renderizr).

That is credit, and it is genuinely useful: it names the upstreams a reader is most likely to want to look up. It is **not** license attribution: it carries no copyright lines and no license names. Do not treat it as discharging anything.

## Route 1 — ship `NOTICE` beside the output

The default build writes a directory. Put the notice in it:

```bash
npx github:FormulaMonks/renderizr ./workspace.json --out ./site
cp NOTICE ./site/NOTICE          # from a clone of this repository
```

We wrote `NOTICE` to stand on its own: it carries the copyright line and resolved version of all 30 components that ship in rendered output, the MIT and ISC permission notices verbatim, the BSD-2 and BSD-3 conditions and disclaimers verbatim, and a URL to the Apache-2.0 license text. Copying that one file is therefore enough to discharge MIT section 1, the ISC and BSD conditions and Apache-2.0 section 4(a) for the rendered output. Serve or publish the directory as a whole and the notices travel with the pages, which is what MIT's "included in all copies or substantial portions" asks for.

Copy `THIRD-PARTY-NOTICES.md` alongside it if you want the recipient to have the provenance and the full license texts too — that is generosity, not obligation:

```bash
cp NOTICE THIRD-PARTY-NOTICES.md ./site/
```

This is the cheapest correct answer for GitHub Pages, S3, or any host that takes a directory. It is worth linking to from wherever your site links to its other boilerplate, so a reader can find it rather than having to guess the URL.

It does nothing for `--single-file`, whose whole point is that there is only one file.

## Route 2 — a Colophon section in the workspace

This is the route that works everywhere, including `--single-file` and a Claude artifact, because it puts the attribution inside the document itself. It needs no change to Renderizr: Renderizr already renders workspace documentation as pages, so a documentation section holding the notices becomes a page of the site.

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
        "content": "# Colophon\n\n## Credits and licenses\n\nRendered with Renderizr (MIT).\n\n- Structurizr (portions derived from): Copyright Structurizr, Apache-2.0\n- React: Copyright (c) Meta Platforms, Inc. and affiliates, MIT\n- React Flow: Copyright (c) 2019-2025 webkid GmbH, MIT\n- Bootstrap Icons: Copyright (c) 2019-2024 The Bootstrap Authors, MIT\n- highlight.js: Copyright (c) 2006, Ivan Sagalaev, BSD-3-Clause\n"
      }
    ]
  }
}
```

The fields match the section shape declared in `src/types/structurizr-documentation.ts`. One of them is load-bearing in a way that is easy to get wrong: **a section with neither `id` nor `filename` renders as an empty Documentation page** — the nav entry appears, the content does not. Either key on its own is enough; supplying both, as above, is the safe habit.

**We truncated the `content` string in that example to keep it readable.** It names 5 of the 30 components that ship in rendered output, with no versions and no license texts, so it is *not* compliant as written. Do not copy it into a workspace.

Take the real body from [`NOTICE`](../NOTICE), which carries all 30 components with their resolved versions, the MIT and ISC permission notices, the BSD conditions and disclaimers and the Apache-2.0 license URL. JSON has no multi-line strings, so the whole file has to become one escaped string. Generate it rather than retyping it, **from the root of a Renderizr checkout**, since the path is relative and `NOTICE` lives there:

````bash
node -e 'console.log(JSON.stringify("# Colophon\n\n```\n" + require("fs").readFileSync("NOTICE","utf8") + "```\n"))'
````

The single quotes are load-bearing: the snippet contains double quotes and backticks, and only `'…'` keeps the shell out of both. Run from anywhere else and the only failure you get is `ENOENT: no such file or directory, open 'NOTICE'` — point `readFileSync` at an absolute path in that case.

That prints one line: a ready-to-paste JSON string value for `content`, fenced so the notice renders as preformatted text rather than being reflowed. Against the `NOTICE` in this repository it is 13,460 bytes and begins

````text
"# Colophon\n\n```\nRenderizr\nCopyright (c) 2024-2026 Formula.Monks\n\nLicensed …
````

— outer quotes included, because the quoted string *is* the JSON value. If you generate the workspace from DSL or from a script, do the same read-and-inject there rather than maintaining a second copy by hand.

The result is a "Colophon" entry in the Documentation navigation, rendered like any other documentation page — verified against a `--single-file` build of the Big Bank plc example. Because the section lives in the workspace, it survives every build flag, including `--single-file` and `artifact.html`.

If you would rather not give attribution a whole page, the same content works appended to the end of an existing section.

## Route 3 — not implemented: a colophon Renderizr builds itself

Renderizr could carry the notices without anyone remembering to. The pieces are already in place: `scripts/plugins.js` has a `branding()` plugin that injects into `<head>` through `transformIndexHtml`, and `src/main.ts` renders the `<footer id="disclaimer">` quoted above. A plugin that read `NOTICE` at build time and emitted it as a hidden `<template>`, or a footer link that opened it in a dialog, would make every rendered page self-attributing with no workspace changes and no second copy to maintain.

This does not exist today. This page writes it down so that the absence is a known gap rather than an oversight, and so nobody assumes the footer does more than it does. Until it exists, a distribution needs route 1 or route 2 to carry its notices.

## Fonts

`--font Inter` downloads the family from Google Fonts at build time and inlines the woff2 files as data URIs. The embedded font is then part of your distribution.

Renderizr does not read that family's license and cannot — Google Fonts serves families under SIL OFL 1.1, Apache-2.0 and the Ubuntu Font License, and the `css2` API returns no license information. **Attribution for the embedded font is yours.** Check the family's page on fonts.google.com, and add its copyright line to whichever route above you chose. OFL 1.1 families in particular carry a Reserved Font Name and a copyright notice that you have to reproduce.

Builds without `--font` embed no font and use the system stack, and this section does not apply to them.

## Your own content is yours

Renderizr embeds the workspace JSON, its documentation and decision records, and any theme, element icon or branding logo it references verbatim, and they belong to whoever wrote them. Renderizr applies no license to them and claims nothing over the rendered result. A `--logo` image is likewise yours to clear.

## Before a release

- [ ] `LICENSE` year range still covers the current year.
- [ ] `THIRD-PARTY-NOTICES.md` matches the resolved dependency tree. The way to check is to re-run the Rollup scan described under [How this list was produced](../THIRD-PARTY-NOTICES.md#how-this-list-was-produced) — not to read `package.json`, which lists ranges that do not match what the build bundles.
- [ ] A file ported from Structurizr into `src/model/` carries the Apache-2.0 header naming its upstream files and saying that Renderizr modified it.
- [ ] The "ships in the rendered output" table lists any new runtime dependency, with its license checked on disk, in `node_modules`, rather than guessed from the package name.
- [ ] Escalate a new license family (anything reciprocal, such as MPL-2.0 or the GPL family, anything with an advertising clause, anything unlicensed) rather than add it quietly. No copyleft component ships in the output today.
