# Research: where the CLI draws a view to export it

## Question

Where should the CLI draw a view to export it as SVG and PNG: in a headless browser that loads the built page, or in Node with no browser? What does each cost, and how close does each come to the toolbar export?

## Answer

Draw the export in Node. Build the `Graph` with `buildGraph`, serialize it with the same `exportSvg` the toolbar calls, measure text with fontkit from the font file, and rasterize the PNG with `@resvg/resvg-js`. Keep the headless browser over raw CDP as the fallback if the prototype fails, because it costs no dependency and matches the toolbar by construction, but it only works where a Chrome is installed.

- **Node already runs the whole pipeline.** `buildGraph`, `exportFrame`, `exportSvg` and `titleBlockText` bundle with esbuild into one 352 KB ESM file whose only package is `@dagrejs/dagre`, and they run in plain Node with no DOM. Only three things live in the browser: `canvasMeasure` (canvas `measureText`), the font's ascent and descent in `textSetting`, and the `<img>` to `<canvas>` raster in `rasterize`.
- **The SVG matches the toolbar's.** With fontkit measuring, the Node SVG for three views of `test/__fixtures__/export.json` breaks every label line where the toolbar export does. Under the fallback stack on macOS it is byte-identical; under `--font Inter` it differs only by a 0.04 px baseline shift, because Chrome rounds the ascent to whole pixels at 100 px.
- **fontkit measures like Chrome.** Across 24 labels at 16.8, 24 and 33.6 px, regular and bold, fontkit on the embedded Inter woff2 lands within 0.47 px (0.065%) of Chrome's `measureText`. harfbuzzjs lands within 2.8 px, and opentype.js throws on Inter's GSUB.
- **The fallback stack has no file to measure.** With no `--font`, the diagram draws in `Helvetica, Arial, sans-serif`. Node must find a file for it: macOS has `Helvetica.ttc`, which measures within 1.76 px of Chrome, and Linux and Windows resolve the stack to other fonts. The CLI needs a bundled fallback font, a system font lookup, or a rule that a CLI export takes `--font`.
- **resvg needs fonts handed to it, as static faces.** resvg ignores the SVG's `@font-face` rules and reads only fonts passed in `fontBuffers` or `fontFiles`. `fontBuffers` accepts the embedded woff2, but resvg-js 2.6.2 draws Inter's variable face at its default weight, so bold names come out regular. The CLI must pass static regular and bold faces.
- **The headless browser is exact but needs Chrome.** Raw CDP over `--remote-debugging-pipe`, as `test/support/browser.js` already does, adds no dependency and exported three views as SVG and PNG in 1.2 to 2.0 s, Chrome launch included. It fails where no Chrome is installed, such as slim Node containers, and Puppeteer's own download adds 596 MB.
- **Both ways keep the single serializer.** Both call `exportSvg`. Only the PNG rasterizer differs in Node, so a parity test compares the SVG's text lines and positions exactly and the PNG only by size and a pixel tolerance.

## Headless browser

The CLI builds the site, opens a view in headless Chrome and calls the engine's `exportView` in the page, which hands back the toolbar's own bytes.

**Running `export-file.ts` as is.** It works. A report build (`RENDERIZR_ENGINE_REPORT=1`) exposes `exportView` on `window.renderizrExportView`. A `Runtime.evaluate` that awaits it, reads the `Blob` as bytes and returns base64 gave valid SVG and PNG files for `AutoFrame`, `Containers` and `Request` (PNG 3350x3416 to 4570x3670). The CLI would need a build that exposes the hook, since a normal build does not.

**Measured cost (macOS arm64, Node 22.23, installed Chrome).**

| Way                                      | Added to `node_modules` | Downloads a browser on install                                                               | Launch, open about:blank, close (median of 6, after a first run) |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Raw CDP over a pipe, installed Chrome    | 0                       | No                                                                                           | 728 ms                                                           |
| chrome-launcher 1.2.3, installed Chrome  | 3.4 MB, 10 packages     | No                                                                                           | 573 ms (HTTP only, no CDP client)                                |
| puppeteer-core 25.18.1, installed Chrome | 33 MB, 23 packages      | No                                                                                           | 757 ms                                                           |
| puppeteer 25.18.1                        | 33 MB, 25 packages      | Yes: Chrome for Testing 380 MB plus chrome-headless-shell 216 MB                             | 712 ms (Chrome), 236 ms (headless shell)                         |
| playwright 1.65.1                        | 19 MB, 2 packages       | No; `playwright install chromium` fetches 386 MB plus 211 MB headless shell plus 3 MB ffmpeg | 2076 ms (installed Chrome), 209 ms (headless shell)              |

The first launch of a freshly downloaded binary took 2 to 7 s on macOS. The library matters less than the binary: the headless shell starts about three times faster than full Chrome.

**One export end to end.** With raw CDP and the installed Chrome, the three views as SVG and PNG took 2.0 s with Inter and 1.2 s without, launch included. The first view took 0.6 to 1.3 s to load and draw, later views 0.1 to 0.2 s. Each SVG took 3 to 13 ms and each PNG 73 to 95 ms. The Vite build before it took 0.5 to 1.1 s.

**What the browser brings along.** Headless Chrome followed the machine's dark scheme, so the CLI must set `prefers-color-scheme` with `Emulation.setEmulatedMedia`. The title block's date comes from the browser's locale. The fallback stack resolves to whatever sans-serif the machine has, so a Linux export of a view with no `--font` differs from a macOS one.

**Bare Linux CI (from docs, not measured).** GitHub's `ubuntu-latest` image ships Google Chrome, so raw CDP and puppeteer-core find it at `/usr/bin/google-chrome`. Slim Node images ship no Chrome, none of the shared libraries Chrome needs (libnss3 and others) and almost no fonts, so a downloaded Chrome also fails to start until the image installs them. Chrome there needs `--no-sandbox`, which `test/support/browser.js` already passes.

## Pure Node

**What moves out of the browser.** Three pieces, each small:

- A `MeasureText` backed by a font file, in place of `canvasMeasure`. Everything that takes a measure (`buildGraph`, boundary bands, edge labels, entity tables and the serializer's element label layout) is already pure and takes it as an argument.
- The font's ascent and descent, in place of the canvas `fontBoundingBox` read in `textSetting`. Chrome's values do not always equal the file's: Inter's `hhea` gives 0.969 and Chrome reports 0.97 (rounded at 100 px); Helvetica's `hhea` gives 0.77 and Chrome on macOS reports 0.92. The Node side must copy Chrome's rule, or both sides must read the same number.
- The PNG raster, in place of `<img>` and `<canvas>`. `pngSize` and its pixel cap are pure and carry over.

Fonts come with the build: `scripts/assets.js` fetches the `--font` family from Google Fonts as woff2 and embeds each face as a base64 `data:` URL, preferring one variable face that covers the weights. The CLI can hand the same bytes to the measurer and the rasterizer.

**Text measurement (measured against Chrome's canvas on the same strings).** 24 labels from the Big Bank fixture, at 16.8, 24 and 33.6 px, regular and bold, 144 widths per font:

| Measurer          | Font                                                  | Largest gap to Chrome         | Largest relative gap |
| ----------------- | ----------------------------------------------------- | ----------------------------- | -------------------- |
| fontkit 3.0.0     | Inter variable woff2, `wght` 400 and 700              | 0.47 px                       | 0.065%               |
| harfbuzzjs 1.6.4  | Inter, woff2 decompressed with wawoff2                | 2.79 px (bold)                | 0.22%                |
| opentype.js 2.0.0 | Inter TTF                                             | Throws on Inter's GSUB lookup | n/a                  |
| fontkit 3.0.0     | macOS `Helvetica.ttc` against Chrome's fallback stack | 1.76 px                       | 0.66%                |
| `estimateText`    | none                                                  | 416 px                        | 25.7%                |

`wrapLines` breaks a line when the measured width passes the limit, so a gap of 0.47 px only moves a break when a line ends within 0.47 px of its width. Over every whole label at every width from 100 to 1200 px, fontkit disagreed with Chrome on 20 of 158,544 fit decisions (0.013%) and the estimate on 8,026. In the full pipeline on three views, no line broke differently.

**The fallback font.** With no `--font`, `FALLBACK_FONT` is `Helvetica, Arial, sans-serif`, a system stack with no file in the build. The toolbar export has the same gap today: it measures with whatever the reader's machine draws. Choices for the CLI: bundle one metric-compatible face (Arimo or Liberation Sans, both open licensed and metric-compatible with Arial), look the stack up in the system's font folders, or require `--font` for a CLI export.

**PNG rasterizers (measured on `Containers`, 4471 px wide, against the toolbar's PNG).**

| Rasterizer              | Added to `node_modules` | Native binary                                           | Reads `@font-face` | Takes woff2                                                        | Variable bold                | `<image href="data:image/svg+xml">` | Time                              |
| ----------------------- | ----------------------- | ------------------------------------------------------- | ------------------ | ------------------------------------------------------------------ | ---------------------------- | ----------------------------------- | --------------------------------- |
| @resvg/resvg-js 2.6.2   | 3.5 MB                  | Yes, one per platform (about 4.4 MB each, 12 platforms) | No                 | Through `fontBuffers` only; `fontFiles` with a woff2 draws no text | No: draws the default weight | Yes                                 | 410 to 460 ms                     |
| @resvg/resvg-wasm 2.6.2 | 2.5 MB                  | No                                                      | No                 | Through `fontBuffers`                                              | No                           | Yes                                 | 2.3 s                             |
| @napi-rs/canvas 1.2.0   | 28.6 MB                 | Yes (Skia)                                              | No                 | Through `GlobalFonts.register`                                     | Yes                          | Yes                                 | 0.65 to 1.0 s                     |
| sharp 0.35.5 (librsvg)  | 29 MB                   | Yes (libvips)                                           | No                 | No: fonts come from fontconfig only                                | n/a                          | Yes                                 | 370 ms                            |
| skia-canvas 4.0.1       | 28 MB                   | Yes (Skia)                                              | Not tested         | `FontLibrary.use` accepts it                                       | Not tested                   | Not tested                          | Crashed (SIGSEGV) loading the SVG |

Every rasterizer ignores the SVG's `@font-face`, so the CLI always passes the font itself. With the right font, resvg-js and @napi-rs/canvas draw the same shapes, icons, indicator glyphs and text as the toolbar; pixel differences stay under 1%, mostly anti-aliasing. Pixel counts hide a wrong weight: resvg drawing bold as regular moved only 0.3% of pixels, so a test must not rely on them alone.

resvg-js needs static faces: either ask Google Fonts for static instances at build time, or instance the variable face in the CLI. @napi-rs/canvas handles the variable face as embedded but costs eight times the install size.

**Fonts on Linux CI.** The Node path reads only the files it is given, so a slim container with no fonts draws the same export as a laptop, as long as the CLI has a file for the fallback stack.

## Fidelity

- **The single serializer.** Both ways call `exportSvg`, as ADR 21 requires. The browser path calls it through the toolbar's `exportView`; the Node path calls it directly with a different `TextSetting`. Neither adds a second serializer.
- **Measured closeness.** The browser path gives the toolbar's bytes on the machine that runs it. The Node path gave the same SVG under the fallback stack on macOS, and the same text lines with a 0.04 px baseline shift under Inter. The PNG comes from another rasterizer in Node, so it matches in size and content, not in pixels.
- **What a parity test compares.** Build a versioned fixture with `--font` (Inter is enough), export each view through the report build's hook in Chrome and through the Node path, and compare: the SVG's `width`, `height` and `viewBox`; every `<text>` line's content in order; each line's `x` and `y` within 0.1 px; and everything outside `<text>` and `<style>` exactly. For the PNG, compare dimensions exactly and pixels within a tolerance, and compare one bold label's ink against a regular one so a lost weight fails. Fix the scheme, the labels shown, the build date and the locale on both sides. This mirrors `test/export-parity.test.js` and skips without Chrome the same way.
- **Inputs the CLI must choose.** The color scheme, which labels show (descriptions, technologies, collapsed entities), the perspective, the animation step and the title block's date and locale all come from the page today. The CLI must take them as options or fix them.

## What a prototype must prove

- The Node path exports every view kind the toolbar exports (C4 views, dynamic views with steps, Mermaid flowcharts, ER and sequence diagrams) with the same text lines as the toolbar, under a parity test like the one above.
- A Node ascent and descent rule that matches Chrome's `fontBoundingBox` for the `--font` faces, or a change that makes both sides read the font file's metrics.
- A fallback for builds with no `--font`: a bundled metric-compatible face, a system lookup, or a required `--font`, and what the toolbar export does in the same case.
- Static faces for resvg-js: whether Google Fonts serves static regular and bold instances the build can fetch with no extra request, or whether the CLI instances the variable face; or whether @napi-rs/canvas earns its 28.6 MB.
- The CLI runs on Linux and Windows CI with no Chrome and no system fonts, and the PNG installs from the right native package on each platform.

## Sources

- Puppeteer installation and browser downloads: https://pptr.dev/guides/installation
- Puppeteer troubleshooting on Linux (shared libraries, sandbox): https://pptr.dev/troubleshooting
- Playwright browsers and `playwright install`: https://playwright.dev/docs/browsers
- chrome-launcher: https://github.com/GoogleChrome/chrome-launcher
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- GitHub Actions Ubuntu runner image contents: https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md
- resvg-js: https://github.com/thx/resvg-js
- resvg: https://github.com/linebender/resvg
- fontkit: https://github.com/foliojs/fontkit
- harfbuzzjs: https://github.com/harfbuzz/harfbuzzjs
- opentype.js: https://github.com/opentypejs/opentype.js
- @napi-rs/canvas: https://github.com/Brooooooklyn/canvas
- skia-canvas: https://github.com/samizdatco/skia-canvas
- sharp: https://sharp.pixelplumbing.com/
- Google Fonts CSS API: https://developers.google.com/fonts/docs/css2
- Arimo: https://fonts.google.com/specimen/Arimo
