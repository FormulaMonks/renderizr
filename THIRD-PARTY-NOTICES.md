# Third-party notices

Renderizr itself is MIT-licensed (see [`LICENSE`](LICENSE)), and that license covers only the code written for this project. It does not cover the third-party code Renderizr bundles, or the parts of Renderizr derived from Structurizr's Apache-2.0 code (the model layer in `src/model/`). `LICENSE` says nothing about any of that on purpose: GitHub identifies a project's license by matching that file against a known template, and a single extra sentence in it makes the repository read as "Other" rather than MIT. This file is where the rest belongs. It lists every component Renderizr bundles and inlines, with its version, its license, its copyright line as it appears on disk, and whether it ends up inside the pages Renderizr renders or only runs while the build runs.

Last verified: **2026-10-05**, against the working tree at that date. Every copyright line below was copied from a file on disk in `node_modules/` or from the Structurizr source the model layer derives from; none of it is inferred from a package name. For all but one, that file is the component's own `LICENSE`. The exception:

- **Structurizr**: the repository's `LICENSE` (reproduced at `licenses/Apache-2.0.txt`) is the stock Apache-2.0 boilerplate and still carries the unfilled `Copyright [yyyy] [name of copyright owner]` placeholder at line 189, so it names nobody. `Structurizr` is taken from the `<organization>` element of the repository's `pom.xml`.

---

## Read this first

Four things a reader needs to know before trusting the list. **None of them is a license incompatibility**: nothing in this tree conflicts with anything else in it, or with Renderizr's MIT license, and no copyleft component remains in the output. Two of them are obligations that are easy to miss, one is a limit on what this project can promise, and one is about what the published package carries.

### 1. The build strips every license header. This file is the notice.

Renderizr minifies through esbuild and Rollup with no legal-comment preservation configured. Verified by building the Big Bank plc example and searching the output: **no license banner or copyright line of any component listed below survives**.

The practical consequence: **a Renderizr-generated `index.html` or `artifact.html`, distributed on its own, does not carry the copyright and permission notices that MIT, ISC, BSD-2-Clause and BSD-3-Clause require.** Handing someone the HTML file and nothing else is a compliance gap, not a technicality.

The fix is attribution that reaches the reader of the page rather than only the reader of this repository. [`docs/licensing.md`](https://github.com/FormulaMonks/renderizr/blob/main/docs/licensing.md) describes the routes, from the zero-effort one (ship `NOTICE` next to the output) to the thorough one (a colophon inside the page). That one link is absolute rather than repo-relative on purpose: `docs/` is not in `package.json`'s `files` array, so it is the one document referenced here that an installed copy of this package does not contain. See [finding 4](#4-the-release-tarball-carries-the-notices-the-page-they-link-to-is-not-in-it).

### 2. The model layer is a derivative of Structurizr's Apache-2.0 code

`src/model/` ports Structurizr's workspace model, finders and style resolution to TypeScript. Each ported file carries an Apache-2.0 header that names the upstream files it came from and states that Renderizr modified it, as section 4(b) requires, and the Apache-2.0 text travels with the package at `licenses/Apache-2.0.txt`, as section 4(a) requires. The port ships, minified, inside every rendered page, so Structurizr appears in the table below as "portions derived from" rather than as a bundled component. Structurizr ships no NOTICE file, so nothing is owed under section 4(d).

### 3. Fonts embedded with `--font` are outside Renderizr's knowledge

`--font <family>` makes `scripts/assets.js` fetch a family from Google Fonts at build time and inline the woff2 files as data URIs. Renderizr never reads that family's license and cannot: Google Fonts hosts families under SIL OFL 1.1, Apache License 2.0 and the Ubuntu Font License, and the API does not return the license with the CSS.

**The font embedded in your output is your attribution obligation, not Renderizr's.** Check the family's license at fonts.google.com before shipping. OFL 1.1 in particular forbids selling the font on its own and requires the Reserved Font Name to be respected. Neither is a problem for an embedded subset in a web page, but the copyright notice still has to be reproduced somewhere the recipient can find it.

Builds run without `--font` embed no font at all and use the system stack.

### 4. The release tarball carries the notices; the page they link to is not in it

The source tarball attached to each GitHub Release **does** contain this file. It is built with `npm pack`, which honors the `files` array. Verified with `npm pack --dry-run` against the current `package.json`: 99 files, of which the four that matter here are all present:

```
LICENSE
NOTICE
THIRD-PARTY-NOTICES.md
licenses/Apache-2.0.txt
```

`LICENSE` is there because npm always includes it; the other three because `NOTICE`, `THIRD-PARTY-NOTICES.md` and `licenses` are named in `package.json`'s `files` array. So a consumer who installs `@formula-monks/renderizr` from a registry gets the Apache-2.0, MIT, ISC and BSD notices for everything the tool bundles, without cloning anything. Reproduce it with:

```bash
npm pack --dry-run --json |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const f=JSON.parse(s)[0].files.map(x=>x.path);
    for (const n of ["LICENSE","NOTICE","THIRD-PARTY-NOTICES.md","licenses/Apache-2.0.txt"])
      console.log(f.includes(n) ? "in   " + n : "OUT  " + n);
  })'
```

**The one real residue is `docs/`.** It is not in the `files` array, so `docs/licensing.md` is not in the tarball, and a repo-relative link to it from [finding 1](#1-the-build-strips-every-license-header-this-file-is-the-notice) above would resolve to nothing inside an installed package. That link is therefore written as an absolute URL to the copy on GitHub, which is readable from anywhere. If `docs` is later added to `files`, the absolute link keeps working and can be turned back into a relative one at leisure.

This file's own obligations do not depend on that: everything a redistributor is required to reproduce is *in this file*, not behind the link. `docs/licensing.md` explains how to route attribution into rendered output, which is guidance rather than a notice.

---

## How this list was produced

Not from `package.json`. The runtime dependency block there is a poor guide to what ships: React Flow pulls in `@xyflow/system`, `zustand`, `classcat` and eight `d3-*` modules that `package.json` never names, and React pulls in `scheduler` and `use-sync-external-store`.

The list of components that reach the bundle was taken from Rollup itself, by running the real `--single-file` build of the Big Bank plc example with a plugin that records the `node_modules` package of every module Rollup parses, and of every `?raw` import it loads:

```js
cfg.plugins.push({
    name: "scan",
    moduleParsed(info) { /* record info.id when it is under node_modules */ },
    load(id) { /* record ?raw imports under node_modules too */ },
});
```

That produced exactly the twenty-nine npm packages in the table below. Everything else in `node_modules` (a few hundred transitive build dependencies) never enters the output.

To re-verify after a dependency change, repeat that scan and diff it against this table.

---

## Ships in the rendered output

Everything in this section is present, minified, inside every `index.html` Renderizr writes, in both the multi-file and the `--single-file` build. Versions are the resolved versions actually bundled, not the ranges declared.

| Component | Version | License | Copyright line as shipped |
| --- | --- | --- | --- |
| [Structurizr](https://github.com/structurizr/structurizr) (portions derived from, in `src/model/`) | ported from `structurizr-workspace.js`, `structurizr-ui.js`, `structurizr-util.js` and `structurizr-diagram.js` | Apache-2.0 | Structurizr; no per-file header; repository `LICENSE` and `pom.xml` |
| [React](https://github.com/facebook/react) (`react`) | 19.3.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [React DOM](https://github.com/facebook/react) (`react-dom`) | 19.3.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [scheduler](https://github.com/facebook/react) | 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [use-sync-external-store](https://github.com/facebook/react) | 1.7.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [@xyflow/react](https://github.com/xyflow/xyflow) (React Flow) | 12.12.0 | MIT | Copyright (c) 2019-2025 webkid GmbH |
| [@xyflow/system](https://github.com/xyflow/xyflow) | 0.0.83 | MIT | Copyright (c) 2019-2025 webkid GmbH |
| [zustand](https://github.com/pmndrs/zustand) | 4.5.7 | MIT | Copyright (c) 2019 Paul Henschel |
| [classcat](https://github.com/jorgebucaran/classcat) | 5.0.5 | MIT | Copyright © Jorge Bucaran <<https://jorgebucaran.com>> |
| [d3-color](https://github.com/d3/d3-color) | 3.1.0 | ISC | Copyright 2010-2022 Mike Bostock |
| [d3-dispatch](https://github.com/d3/d3-dispatch) | 3.0.1 | ISC | Copyright 2010-2021 Mike Bostock |
| [d3-drag](https://github.com/d3/d3-drag) | 3.0.0 | ISC | Copyright 2010-2021 Mike Bostock |
| [d3-ease](https://github.com/d3/d3-ease) | 3.0.1 | BSD-3-Clause | Copyright 2010-2021 Mike Bostock; Copyright 2001 Robert Penner |
| [d3-interpolate](https://github.com/d3/d3-interpolate) | 3.0.1 | ISC | Copyright 2010-2021 Mike Bostock |
| [d3-selection](https://github.com/d3/d3-selection) | 3.0.0 | ISC | Copyright 2010-2021 Mike Bostock |
| [d3-timer](https://github.com/d3/d3-timer) | 3.0.1 | ISC | Copyright 2010-2021 Mike Bostock |
| [d3-transition](https://github.com/d3/d3-transition) | 3.0.1 | ISC | Copyright 2010-2021 Mike Bostock |
| [d3-zoom](https://github.com/d3/d3-zoom) | 3.0.0 | ISC | Copyright 2010-2021 Mike Bostock |
| [@dagrejs/dagre](https://github.com/dagrejs/dagre) | 1.1.8 | MIT | Copyright (c) 2012-2014 Chris Pettitt |
| [@dagrejs/graphlib](https://github.com/dagrejs/graphlib) | 2.2.4 | MIT | Copyright (c) 2012-2014 Chris Pettitt |
| [Bootstrap Icons](https://github.com/twbs/icons) (`bootstrap-icons`) | 1.13.1, 28 icons | MIT | Copyright (c) 2019-2024 The Bootstrap Authors |
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.12.0 | BSD-3-Clause | Copyright (c) 2006, Ivan Sagalaev. All rights reserved. |
| [history](https://github.com/remix-run/history) | 5.3.0 | MIT | Copyright (c) React Training 2016-2020; Copyright (c) Remix Software 2020-2021 |
| [markdown-it](https://github.com/markdown-it/markdown-it) | 14.3.0 | MIT | Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin |
| [markdown-it-anchor](https://github.com/valeriangalliat/markdown-it-anchor) | 9.2.1 | Unlicense | Public domain dedication; no copyright asserted |
| [markdown-it-shift-headings](https://github.com/juliendargelos/markdown-it-shift-headings) | 1.0.2 | MIT | Copyright (c) 2019 Julien Dargelos |
| [entities](https://github.com/fb55/entities) | 4.5.0 | BSD-2-Clause | Copyright (c) Felix Böhm. All rights reserved. |
| [linkify-it](https://github.com/markdown-it/linkify-it) | 5.0.2 | MIT | Copyright (c) 2015 Vitaly Puzrin |
| [mdurl](https://github.com/markdown-it/mdurl) | 2.0.0 | MIT | Copyright (c) 2015 Vitaly Puzrin, Alex Kocharin; `.parse()` derived from Joyent's node.js `url`, Copyright Joyent, Inc. and other Node contributors |
| [punycode.js](https://github.com/mathiasbynens/punycode.js) | 2.3.1 | MIT | Copyright Mathias Bynens, https://mathiasbynens.be/ |
| [uc.micro](https://github.com/markdown-it/uc.micro) | 2.1.0 | MIT | Copyright Mathias Bynens, https://mathiasbynens.be/ |

### Details worth having

**Structurizr (portions derived from)**: `src/model/` is a typed port of the workspace model, the finders and the style resolution in four files of `structurizr-application/src/main/resources/static/static/js/` in [structurizr/structurizr](https://github.com/structurizr/structurizr). Each ported file names the upstream files it came from in its header. Renderizr **modified** that code, stated here as Apache-2.0 section 4(b) requires: it ported it to typed TypeScript, made it side-effect free and took the color scheme as an input to style resolution; at build time, esbuild minifies it and `scripts/escapes.js` rewrites escape sequences in the bundle that a Claude artifact upload rejects. The upstream repository contains **no NOTICE file**, so nothing is owed under section 4(d). Renderizr no longer ships any of Structurizr's code verbatim. `submodules/structurizr` stays as a checkout of the upstream repository for the acceptance fixtures only.

**React and React Flow**: React Flow (`@xyflow/react`) draws every diagram inside a React root. `@xyflow/system` is its framework-independent core, `zustand` holds its store, `classcat` builds its class names, and the eight `d3-*` modules handle panning, zooming, dragging and the transitions between viewports. React brings `scheduler`, and zustand brings `use-sync-external-store`. React Flow's "React Flow" attribution badge is turned off; the footer of every page credits React Flow by name instead.

**dagre / graphlib**: imported by `src/engine/layout/automatic.ts` for automatic layout, at the exact versions `package.json` pins.

**Bootstrap Icons**: the 28 SVGs the page imports from the `bootstrap-icons` package by Vite's `?raw` imports, so the SVG markup is embedded directly in the JavaScript. Every file carries the `class="bi bi-<name>"` marker.

**highlight.js**: imported as `highlight.js/lib/core` plus eleven language grammars (bash, css, java, javascript, json, markdown, python, sql, typescript, xml, yaml). No highlight.js stylesheet ships: the syntax colors in `src/components/markdown-renderer.module.css` are written for this project and only reuse highlight.js's public `hljs-*` class names, which is interface rather than copied theme code.

**markdown-it and its dependencies**: `entities`, `linkify-it`, `mdurl`, `punycode.js` and `uc.micro` are markdown-it's runtime dependencies and are bundled with it. `argparse`, markdown-it's sixth dependency, serves only its CLI and does **not** reach the bundle; the Rollup scan confirms this.

**history**: `history/hash` only. Its optional `@babel/runtime` dependency is not pulled into the bundle.

---

## Build-time only

These run on the machine performing the build. None of their code appears in the rendered output, so none of them creates an attribution obligation for anyone distributing a Renderizr-generated page. They are listed because distributing this *repository* distributes the manifest that pulls them in.

| Component | Version | License | Copyright line |
| --- | --- | --- | --- |
| [Vite](https://github.com/vitejs/vite) | 7.3.6 | MIT | Copyright (c) 2019-present, VoidZero Inc. and Vite contributors |
| [Rollup](https://github.com/rollup/rollup) | 4.62.4 | MIT | Copyright (c) 2017 [these people](https://github.com/rollup/rollup/graphs/contributors) |
| [TypeScript](https://github.com/microsoft/TypeScript) | 5.9.3 | Apache-2.0 | Microsoft Corporation |
| [Biome](https://github.com/biomejs/biome) | 1.8.2 | MIT OR Apache-2.0 | Copyright (c) 2023 Biome Developers and Contributors |
| [@commitlint/cli](https://github.com/conventional-changelog/commitlint) | 20.5.3 | MIT | Mario Nebl |
| [@commitlint/config-conventional](https://github.com/conventional-changelog/commitlint) | 20.5.3 | MIT | Mario Nebl |
| [czg](https://github.com/Zhengqbbb/cz-git) | 1.13.2 | MIT | Zhengqbbb |
| [husky](https://github.com/typicode/husky) | 9.1.7 | MIT | typicode |
| [lint-staged](https://github.com/lint-staged/lint-staged) | 16.4.0 | MIT | Andrey Okonetchnikov |
| [@types/markdown-it](https://github.com/DefinitelyTyped/DefinitelyTyped) | 14.1.2 | MIT | DefinitelyTyped contributors |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | 22.20.1 | MIT | DefinitelyTyped contributors |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.3.0 | MIT | DefinitelyTyped contributors |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.3.0 | MIT | DefinitelyTyped contributors |

Vite bundles Rollup, esbuild and PostCSS inside its own distribution; their licenses are reproduced in `node_modules/vite/LICENSE.md`, which Vite ships for exactly this purpose. TypeScript ships `node_modules/typescript/ThirdPartyNoticeText.txt` covering its own dependencies. Biome is dual-licensed and may be taken under either MIT or Apache-2.0; nothing here depends on the choice, since Biome only lints.

`test/__fixtures__/big-bank-plc.json`, `test/__fixtures__/groups.json` and `test/__fixtures__/amazon-web-services.json` are unmodified copies of the workspaces in `structurizr-export/src/test/resources/` of the Apache-2.0 [structurizr/structurizr](https://github.com/structurizr/structurizr) repository, at commit `9ff16634`. The tests render them. The build never reads them, and `package.json` leaves `test/` out of the package.

---

## Not third-party, and not Renderizr's to license

**Your workspace.** The workspace JSON, its documentation, its decision records, and any theme, element icon or branding logo it references are embedded verbatim into the output. They belong to whoever wrote them. Renderizr claims nothing over them and applies no license to them.

**Your logo and font.** `--logo` embeds an image you supply. `--font` embeds a Google Fonts family; see finding 3.

**Project assets.** `public/favicon.png` and everything under `src/` and `scripts/` are original to this project and covered by `LICENSE`, except the Structurizr-derived files in `src/model/` described above.

---

## Full license texts

### MIT License

Applies to React, react-dom, scheduler, use-sync-external-store, @xyflow/react, @xyflow/system, zustand, classcat, dagre, graphlib, Bootstrap Icons, history, markdown-it, markdown-it-shift-headings, linkify-it, mdurl, punycode.js, uc.micro, and the build-time components marked MIT above. The text is identical in each case; substitute the copyright line from the tables.

```
Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### BSD 3-Clause License: highlight.js

```
BSD 3-Clause License

Copyright (c) 2006, Ivan Sagalaev.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### ISC License: d3-color, d3-dispatch, d3-drag, d3-interpolate, d3-selection, d3-timer, d3-transition, d3-zoom

The text is identical in each case; substitute the copyright line from the table (`Copyright 2010-2022 Mike Bostock` for d3-color, `Copyright 2010-2021 Mike Bostock` for the rest).

```
Copyright 2010-2021 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

### BSD 3-Clause License: d3-ease

```
Copyright 2010-2021 Mike Bostock
Copyright 2001 Robert Penner
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### BSD 2-Clause License: entities

```
Copyright (c) Felix Böhm
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this
list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, this
list of conditions and the following disclaimer in the documentation and/or
other materials provided with the distribution.

THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### The Unlicense: markdown-it-anchor

```
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org/>
```

### Apache License 2.0: Structurizr, TypeScript

The full text is 11,357 bytes and is reproduced verbatim in this repository at [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt), which is included in the published package. It is byte-identical to the `LICENSE` of [structurizr/structurizr](https://github.com/structurizr/structurizr) and is also available at <https://www.apache.org/licenses/LICENSE-2.0>.

The modifications made to the Apache-2.0 licensed Structurizr code, as section 4(b) requires them to be stated, are described under [Details worth having](#details-worth-having) above.

### SIL Open Font License 1.1 / Apache-2.0 / Ubuntu Font License: fonts

Not reproduced here, because Renderizr cannot know which one applies to your build. See finding 3.
