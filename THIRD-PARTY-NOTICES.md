# Third-party notices

Renderizr itself is MIT-licensed (see [`LICENSE`](LICENSE)). It vendors, bundles and inlines a substantial amount of code it did not write. This file lists every one of those components, with its version, its license, its copyright line as it appears on disk, and whether it ends up inside the pages Renderizr renders or only runs while the build is happening.

Last verified: **2026-08-16**, against the working tree at that date and the Structurizr submodule at commit `9ff16634c3b8574584262ae8545510bbb1d1b4bd`. Every copyright line below was copied from a file on disk in `node_modules/`, `vendor/` or `submodules/` — none of it is inferred from a package name. For all but two, that file is the component's own `LICENSE`. The two exceptions are called out where they appear and are worth knowing about up front:

- **Bootstrap Icons** — the icons arrive through the Structurizr repository, which ships no separate `LICENSE` for them. The line here comes from the `/*! … */` banner of the submodule's `bootstrap-icons.css`, which reads `Copyright 2019-2024 The Bootstrap Authors`; the `(c)` is this document's and matches upstream's own `LICENSE` at github.com/twbs/icons.
- **Structurizr** — `vendor/structurizr/LICENSE` is the stock Apache-2.0 boilerplate and still carries the unfilled `Copyright [yyyy] [name of copyright owner]` placeholder at line 189, so it names nobody. `Structurizr` is taken from the `<organization>` element of the submodule's `pom.xml`.

---

## Read this first

Five things a reader needs to know before trusting the list. **None of them is a license incompatibility** — nothing in this tree conflicts with anything else in it, or with Renderizr's MIT license. Three of them are obligations that are easy to miss, one is a limit on what this project can promise, and one is a provenance wrinkle.

### 1. JointJS is MPL-2.0, not MIT — and that is not plain permissive

`@joint/core` and `@joint/layout-directed-graph` are published under the **Mozilla Public License 2.0**, a file-level copyleft. This is worth stating loudly because JointJS is commonly assumed to be MIT, and because the same vendor sells a proprietary edition (JointJS+) under entirely different terms. The npm packages this project depends on are the open-source ones; the license text shipped in `node_modules/@joint/core/LICENSE` is unmodified MPL-2.0, headed `Copyright 2013 client IO`, with **no Exhibit B attached** — so the code is not marked "Incompatible With Secondary Licenses".

There is no conflict with Renderizr's MIT license. MPL-2.0 section 3.3 expressly permits combining Covered Software into a Larger Work distributed under terms of your choice, provided the MPL terms continue to apply to the Covered Software itself. Two obligations follow, and they attach to the *rendered output* as much as to this repository:

- **Section 3.2 — source availability.** Anyone who receives the minified JointJS code inside a Renderizr-generated page must be told how to get the corresponding Source Code Form under MPL-2.0, at no charge. The statement that satisfies this is in [Source availability for MPL-2.0 components](#source-availability-for-mpl-20-components) below, and it is the reason `NOTICE` needs to travel with generated output.
- **Section 3.4 — notices.** The MPL notice may not be removed from the Covered Software. Renderizr's build strips it; see finding 2.

No Renderizr source file is a Modification of JointJS. JointJS is imported and called, never edited, so nothing in `src/` becomes Covered Software.

### 2. The build strips almost every license header. This file is the notice.

Renderizr minifies through esbuild and Rollup with no legal-comment preservation configured. Verified by building the Big Bank plc example and grepping the output: of every component listed below, **only jQuery's banner survives**, because it uses the `/*!` form that minifiers keep by default. JointJS's ESM entry point (`joint.mjs`, the file Vite actually resolves) carries no banner at all — the MPL Exhibit A notice exists only in the UMD `dist/joint.js`, which this build never reads.

The practical consequence: **a Renderizr-generated `index.html` or `artifact.html`, distributed on its own, does not carry the copyright and permission notices that MIT, BSD-2-Clause and BSD-3-Clause require, nor the MPL-2.0 notice.** Handing someone the HTML file and nothing else is a compliance gap, not a technicality.

The fix is attribution that reaches the reader of the page rather than only the reader of this repository. [`docs/licensing.md`](https://github.com/FormulaMonks/renderizr/blob/main/docs/licensing.md) describes the routes, from the zero-effort one (ship `NOTICE` next to the output) to the thorough one (a colophon inside the page). That one link is absolute rather than repo-relative on purpose — `docs/` is not in `package.json`'s `files` array, so it is the one document referenced here that an installed copy of this package does not contain. See [finding 5](#5-the-npm-tarball-carries-the-notices-the-page-they-link-to-is-not-in-it).

### 3. Fonts embedded with `--font` are outside Renderizr's knowledge

`--font <family>` makes `scripts/assets.js` fetch a family from Google Fonts at build time and inline the woff2 files as data URIs. Renderizr never reads that family's license and cannot: Google Fonts hosts families under SIL OFL 1.1, Apache License 2.0 and the Ubuntu Font License, and the API does not return the license with the CSS.

**The font embedded in your output is your attribution obligation, not Renderizr's.** Check the family's license at fonts.google.com before shipping. OFL 1.1 in particular forbids selling the font on its own and requires the Reserved Font Name to be respected — neither is a problem for an embedded subset in a web page, but the copyright notice still has to be reproduced somewhere the recipient can find it.

Builds run without `--font` embed no font at all and use the system stack.

### 4. One vendored icon does not match the current submodule checkout

`vendor/structurizr/bootstrap-icons/lightbulb-fill.svg` has different path data from the same file in `submodules/structurizr` at the pinned commit; the other 27 icons match byte-for-byte apart from a trailing newline on five of them. The vendored copy simply predates an upstream icon refresh. Both revisions are Bootstrap Icons under the same MIT license, so this is a provenance wrinkle rather than a licensing one — noted here so nobody rediscovers it and assumes the file was hand-edited. `pnpm sync:vendor` resolves it.

### 5. The release tarball carries the notices; the page they link to is not in it

The source tarball attached to each GitHub Release **does** contain this file. It is built with `npm pack`, which honors the `files` array — verified with `npm pack --dry-run` against the current `package.json`, 83 files, of which the four that matter here are all present:

```
LICENSE
NOTICE
THIRD-PARTY-NOTICES.md
vendor/structurizr/LICENSE
```

`LICENSE` is there because npm always includes it; the other three because `vendor`, `NOTICE` and `THIRD-PARTY-NOTICES.md` are named in `package.json`'s `files` array. So a consumer who installs `@formula-monks/renderizr` from a registry gets the Apache-2.0, MPL-2.0, MIT and BSD notices for everything the tool bundles, without cloning anything. Reproduce it with:

```bash
npm pack --dry-run --json |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const f=JSON.parse(s)[0].files.map(x=>x.path);
    for (const n of ["LICENSE","NOTICE","THIRD-PARTY-NOTICES.md","vendor/structurizr/LICENSE"])
      console.log(f.includes(n) ? "in   " + n : "OUT  " + n);
  })'
```

**The one real residue is `docs/`.** It is not in the `files` array, so `docs/licensing.md` is not in the tarball, and the repo-relative link to it from [finding 2](#2-the-build-strips-almost-every-license-header-this-file-is-the-notice) above resolves to nothing inside an installed package. That link is therefore written as an absolute URL to the copy on GitHub, which is readable from anywhere. If `docs` is later added to `files`, the absolute link keeps working and can be turned back into a relative one at leisure — nothing breaks either way.

This file's own obligations do not depend on that: everything a redistributor is required to reproduce is *in this file*, not behind the link. `docs/licensing.md` explains how to route attribution into rendered output, which is guidance, not a notice.

---

## How this list was produced

Not from `package.json`. The runtime dependency block there is a poor guide to what ships: it pins `@dagrejs/dagre@1.1.8`, but the bundle contains `1.0.4`, because `@joint/layout-directed-graph` pins `~1.0.4` and pnpm resolves both.

The list of components that reach the bundle was taken from Rollup itself, by running the real build with a plugin that records the `node_modules` path of every module Rollup parses:

```js
cfg.plugins.push({
    name: "scan",
    moduleParsed(info) { /* record info.id when it is under node_modules */ },
});
```

That produced exactly the fifteen npm packages in the table below. Everything else in `node_modules` — 200-odd transitive build dependencies — never enters the output. The vendored Structurizr files and Bootstrap Icons were added by inspecting `vendor/` and `scripts/sync-vendor.js` directly.

To re-verify after a dependency change, repeat that scan and diff it against this table.

---

## Ships in the rendered output

Everything in this section is present, minified, inside every `index.html` Renderizr writes — both the multi-file and the `--single-file` build. Versions are the resolved versions actually bundled, not the ranges declared.

| Component | Version | License | Copyright line as shipped |
| --- | --- | --- | --- |
| [Structurizr diagram renderer](https://github.com/structurizr/structurizr) | commit `9ff1663` | Apache-2.0 | Structurizr — no per-file header; repository `LICENSE` and `pom.xml` |
| [Bootstrap Icons](https://github.com/twbs/icons) | 28 icons; vendored copies predate the submodule's v1.13.1 | MIT | Copyright (c) 2019-2024 The Bootstrap Authors |
| [@joint/core](https://github.com/clientIO/joint) | 4.1.3 | **MPL-2.0** | Copyright 2013 client IO |
| [@joint/layout-directed-graph](https://github.com/clientIO/joint) | 4.1.3 | **MPL-2.0** | Copyright 2013 client IO |
| [@dagrejs/dagre](https://github.com/dagrejs/dagre) | 1.0.4 | MIT | Copyright (c) 2012-2014 Chris Pettitt |
| [@dagrejs/graphlib](https://github.com/dagrejs/graphlib) | 2.1.13 | MIT | Copyright (c) 2012-2014 Chris Pettitt |
| [jQuery](https://github.com/jquery/jquery) | 3.6.3 | MIT | Copyright OpenJS Foundation and other contributors, https://openjsf.org/ |
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.9.0 | BSD-3-Clause | Copyright (c) 2006, Ivan Sagalaev. All rights reserved. |
| [history](https://github.com/remix-run/history) | 5.3.0 | MIT | Copyright (c) React Training 2016-2020; Copyright (c) Remix Software 2020-2021 |
| [markdown-it](https://github.com/markdown-it/markdown-it) | 14.1.0 | MIT | Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin |
| [markdown-it-anchor](https://github.com/valeriangalliat/markdown-it-anchor) | 9.0.1 | Unlicense | Public domain dedication; no copyright asserted |
| [markdown-it-shift-headings](https://github.com/juliendargelos/markdown-it-shift-headings) | 1.0.2 | MIT | Copyright (c) 2019 Julien Dargelos |
| [entities](https://github.com/fb55/entities) | 4.5.0 | BSD-2-Clause | Copyright (c) Felix Böhm. All rights reserved. |
| [linkify-it](https://github.com/markdown-it/linkify-it) | 5.0.0 | MIT | Copyright (c) 2015 Vitaly Puzrin |
| [mdurl](https://github.com/markdown-it/mdurl) | 2.0.0 | MIT | Copyright (c) 2015 Vitaly Puzrin, Alex Kocharin; `.parse()` derived from Joyent's node.js `url`, Copyright Joyent, Inc. and other Node contributors |
| [punycode.js](https://github.com/mathiasbynens/punycode.js) | 2.3.1 | MIT | Copyright Mathias Bynens, https://mathiasbynens.be/ |
| [uc.micro](https://github.com/markdown-it/uc.micro) | 2.1.0 | MIT | Copyright Mathias Bynens, https://mathiasbynens.be/ |

### Details worth having

**Structurizr diagram renderer** — five JavaScript files and one stylesheet, copied verbatim from `structurizr-application/src/main/resources/static/static/` in [structurizr/structurizr](https://github.com/structurizr/structurizr) into `vendor/structurizr/` by `scripts/sync-vendor.js`, and committed. The full Apache-2.0 text travels with them at `vendor/structurizr/LICENSE`, which is byte-identical to the submodule's `LICENSE` and is included in the published package via the `files` field. Renderizr **modifies** these files during the build in two ways, stated here as Apache-2.0 section 4(b) requires: the five are concatenated into one unit and minified by esbuild (`scripts/plugins.js`), and `scripts/escapes.js` rewrites escape sequences in the resulting bundle that a Claude artifact upload rejects. The upstream repository contains **no NOTICE file** at the pinned commit, so nothing is owed under section 4(d).

The same renderer is developed in [structurizr/ui](https://github.com/structurizr/ui) (MIT, Copyright (c) 2023 Structurizr Limited), which is now archived — `gh api repos/structurizr/ui` reports `"archived": true` with `"pushed_at": "2026-01-14"`; GitHub returns `"archived_at": null`, so the exact archive date is not recoverable and none is claimed here. Renderizr takes its copy from `structurizr/structurizr` and therefore relies on the Apache-2.0 grant in that repository. Both grants are permissive and compatible with MIT redistribution; the Apache-2.0 one is the stricter of the two and is what this document complies with.

**Bootstrap Icons** — the 28 SVGs under `vendor/structurizr/bootstrap-icons/`. They arrive through the Structurizr repository, which carries no separate attribution for them, but they are unambiguously Bootstrap Icons: every file carries the `class="bi bi-<name>"` marker and matches the upstream artwork. `structurizr/ui` confirms the provenance by shipping a `licenses/` directory containing `bootstrap-icons.txt`. They are inlined into the bundle at build time via Vite's `?raw` imports, so the SVG markup is embedded directly in the JavaScript.

**jQuery** — bundled because Structurizr's renderer reads `window.$` and `window.jQuery` rather than importing anything; `src/structurizr-globals.ts` supplies them. jQuery 3.6.3 includes Sizzle.js, covered by the same jQuery Foundation / OpenJS Foundation MIT grant, and its banner names it. This is the one component whose license header survives minification.

**JointJS** — the diagram geometry and rendering engine underneath Structurizr's renderer, again reached through `window.joint`. See finding 1.

**dagre / graphlib** — pulled in by `@joint/layout-directed-graph` for automatic layout. Nothing in `src/` imports them directly. The bundled versions (`1.0.4`, `2.1.13`) are the ones JointJS pins, not the ones `package.json` lists.

**highlight.js** — imported as `highlight.js/lib/core` plus eleven language grammars (bash, css, java, javascript, json, markdown, python, sql, typescript, xml, yaml). No highlight.js stylesheet ships: the syntax colors in `src/components/markdown-renderer.module.css` are written for this project and only reuse highlight.js's public `hljs-*` class names, which is interface, not copied theme code.

**markdown-it and its dependencies** — `entities`, `linkify-it`, `mdurl`, `punycode.js` and `uc.micro` are markdown-it's runtime dependencies and are bundled with it. `argparse`, markdown-it's sixth dependency, serves only its CLI and does **not** reach the bundle; the Rollup scan confirms this.

**history** — `history/hash` only. Its optional `@babel/runtime` dependency is not pulled into the bundle.

### Source availability for MPL-2.0 components

Required by MPL-2.0 section 3.2(b). This paragraph is reproduced verbatim in [`NOTICE`](NOTICE), under the JointJS entry, so that shipping `NOTICE` beside rendered output satisfies 3.2(b) on its own:

> This work includes JointJS (`@joint/core` and `@joint/layout-directed-graph`, version 4.1.3), Copyright 2013 client IO, in Executable Form. JointJS is licensed under the Mozilla Public License, Version 2.0. A copy of the license is available at <https://mozilla.org/MPL/2.0/>. The corresponding Source Code Form is available at no charge from <https://github.com/clientIO/joint> and from the npm registry at <https://www.npmjs.com/package/@joint/core> (version 4.1.3). JointJS is used unmodified.

---

## Build-time only

These run on the machine performing the build. None of their code appears in the rendered output, so none of them creates an attribution obligation for anyone distributing a Renderizr-generated page. They are listed because distributing this *repository* distributes the manifest that pulls them in.

| Component | Version | License | Copyright line |
| --- | --- | --- | --- |
| [Vite](https://github.com/vitejs/vite) | 5.3.1 | MIT | Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors |
| [TypeScript](https://github.com/microsoft/TypeScript) | 5.5.2 | Apache-2.0 | Microsoft Corporation |
| [Biome](https://github.com/biomejs/biome) | 1.8.2 | MIT OR Apache-2.0 | Copyright (c) 2023 Biome Developers and Contributors |
| [@commitlint/cli](https://github.com/conventional-changelog/commitlint) | 19.3.0 | MIT | Mario Nebl |
| [@commitlint/config-conventional](https://github.com/conventional-changelog/commitlint) | 19.2.2 | MIT | Mario Nebl |
| [czg](https://github.com/Zhengqbbb/cz-git) | 1.9.3 | MIT | Zhengqbbb |
| [husky](https://github.com/typicode/husky) | 9.0.11 | MIT | typicode |
| [lint-staged](https://github.com/lint-staged/lint-staged) | 15.2.7 | MIT | Andrey Okonetchnikov |
| [@types/jquery](https://github.com/DefinitelyTyped/DefinitelyTyped) | 3.5.30 | MIT | DefinitelyTyped contributors |
| [@types/markdown-it](https://github.com/DefinitelyTyped/DefinitelyTyped) | 14.1.1 | MIT | DefinitelyTyped contributors |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | 22.10.2 | MIT | DefinitelyTyped contributors |

Vite bundles Rollup, esbuild and PostCSS inside its own distribution; their licenses are reproduced in `node_modules/vite/LICENSE.md`, which Vite ships for exactly this purpose. TypeScript ships `node_modules/typescript/ThirdPartyNoticeText.txt` covering its own dependencies. Biome is dual-licensed and may be taken under either MIT or Apache-2.0; nothing here depends on the choice, since Biome only lints.

`submodules/structurizr` is a git submodule of the Apache-2.0 [structurizr/structurizr](https://github.com/structurizr/structurizr) repository. It is a development convenience — the source `pnpm sync:vendor` refreshes `vendor/` from — and is not required to build, not fetched by npm or pnpm for a git dependency, and not included in the published package. Only the handful of files copied into `vendor/` is distributed, and those are covered above.

---

## Not third-party, and not Renderizr's to license

**Your workspace.** The workspace JSON, its documentation, its decision records, and any theme, element icon or branding logo it references are embedded verbatim into the output. They belong to whoever wrote them. Renderizr claims nothing over them and applies no license to them.

**Your logo and font.** `--logo` embeds an image you supply. `--font` embeds a Google Fonts family; see finding 3.

**Project assets.** `public/favicon.png` and everything under `src/` and `scripts/` are original to this project and covered by `LICENSE`.

---

## Full license texts

### MIT License

Applies to jQuery, dagre, graphlib, history, markdown-it, markdown-it-shift-headings, linkify-it, mdurl, punycode.js, uc.micro, Bootstrap Icons, and the build-time components marked MIT above. The text is identical in each case; substitute the copyright line from the tables.

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

### BSD 3-Clause License — highlight.js

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

### BSD 2-Clause License — entities

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

### The Unlicense — markdown-it-anchor

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

### Apache License 2.0 — Structurizr, TypeScript

The full text is 11,357 bytes and is reproduced verbatim in this repository at [`vendor/structurizr/LICENSE`](vendor/structurizr/LICENSE), which is included in the published package. It is also available at
<https://www.apache.org/licenses/LICENSE-2.0>.

Modifications made to the Apache-2.0 licensed Structurizr files, as section 4(b) requires them to be stated, are described under [Details worth having](#details-worth-having) above.

### Mozilla Public License 2.0 — JointJS

The full text ships in this repository's dependency tree at `node_modules/@joint/core/LICENSE` and `node_modules/@joint/layout-directed-graph/LICENSE`, and is available at
<https://mozilla.org/MPL/2.0/>. The source-availability statement section
3.2(b) requires is in [Source availability for MPL-2.0 components](#source-availability-for-mpl-20-components) above.

The Exhibit A notice that MPL-2.0 attaches to Covered Software:

```
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.
```

### SIL Open Font License 1.1 / Apache-2.0 / Ubuntu Font License — fonts

Not reproduced here, because Renderizr cannot know which one applies to your build. See finding 3.
