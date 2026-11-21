# 32. Export views from the CLI in Node

Date: 2026-11-21

## Status

Accepted

References [21. Build exports from the view's geometry as a pure SVG](0021-build-exports-from-the-views-geometry-as-a-pure-svg.md): the CLI and the toolbar share its serializer.

References [22. Read branding from renderizr workspace properties](0022-read-branding-from-renderizr-workspace-properties.md): Arimo stands in only when neither `renderizr.font` nor `--font` sets a font.

## Context

Authors want an export of every view without opening the page and pressing the toolbar's export once per view: to commit images next to the workspace, to publish them from CI, or to feed a docs pipeline that never opens a browser. The toolbar export saves one view at a time, by hand.

[21. Build exports from the view's geometry as a pure SVG](0021-build-exports-from-the-views-geometry-as-a-pure-svg.md) builds the SVG from the view's geometry with a serializer that runs in plain Node with no DOM. Three steps live in the browser: measuring text, reading the font's ascent and descent in `textSetting`, and drawing the PNG through an `<img>` onto a `<canvas>`. Node has no canvas for any of them.

fontkit measures text on the same faces the SVG embeds, and on Inter it lands within half a pixel of Chrome's `measureText`. resvg draws an SVG to a PNG with the faces it receives as files, reads TTF and OTF only, and draws a variable face at its default weight, so bold text drawn from a variable woff2 comes out regular. Google Fonts serves most families as variable woff2.

## Decision

Export views from a `renderizr export` subcommand in Node, with no browser.

- **Draw with the toolbar's own serializer.** Build each view's `Graph` with `buildGraph` and serialize it with `exportSvg`, so both exports share one serializer. The CLI supplies Node versions of the three browser steps, and the serializer gains no branch for the CLI.
- **Add four dependencies to the build side.** fontkit measures text, `@resvg/resvg-js` rasterizes the PNG, and wawoff2 with harfbuzzjs decompress the fetched woff2 and pin `wght` at each weight the export needs, so resvg receives static faces. fontkit is pure JavaScript, `@resvg/resvg-js` installs one native binary per platform, and wawoff2 and harfbuzzjs are pure wasm, together a little smaller than resvg's binary. Only the Node CLI loads them, lazily from the subcommand, and none reaches the page.
- **Let Arimo stand in when no font is set.** When the run gives no `--font` and the workspace sets no `renderizr.font`, Arimo measures the text and draws the PNG. Arimo shares Arial's widths, and Arial shares Helvetica's, so it measures the page's fallback stack the same way on every machine. The SVG still names `Helvetica, Arial, sans-serif` and embeds no font, as the toolbar's does.
- **Read ascent and descent from `hhea`.** Take them unrounded from the face's `hhea` table, in the CLI and on the page whenever `--font` is set. Without `--font`, the page keeps `measureText`.

## Consequences

- The toolbar and the CLI write the same SVG outside `<style>` for the same view, scheme and font, and a change to the serializer reaches both.
- `exportSvg` writes every color as hex or `rgb()`, because resvg draws an `hsl()` color with a fractional hue as black. The toolbar's SVG draws the same as before.
- The page's text moves by about a tenth of a pixel when `--font` is set, since `hhea` replaces the rounded `fontBoundingBoxAscent` and `fontBoundingBoxDescent`.
- The CLI's output is the same on every machine: a Mermaid source that names a system family the CLI cannot load falls back to the run's font, where the page measures that family in the installed font.
- The install grows by resvg's native binary and the wasm packages, for every user of the build, including those who never export.
- A cold font cache with no network fails the run, since Arimo and `--font` come from Google Fonts.
- [21. Build exports from the view's geometry as a pure SVG](0021-build-exports-from-the-views-geometry-as-a-pure-svg.md) keeps holding for the in-page export: the page adds no dependency and still draws its PNG through an `<img>` onto a `<canvas>`.

## Alternatives considered

- Headless Chrome over raw CDP. It draws exactly what the toolbar draws and adds no dependency, but it needs an installed Chrome on every machine and in CI.
- Puppeteer or Playwright. Each downloads a large browser and gains nothing over raw CDP.
- resvg's `fontBuffers` with the variable woff2. It draws bold text at the regular weight, and the native resvg-js ignores `fontBuffers` anyway.
- Requiring `--font`. It adds a flag to every run for authors who set no font.
- Looking up system fonts. The output would depend on the machine that runs the export.

## Reference links

- [fontkit](https://github.com/foliojs/fontkit)
- [resvg-js](https://github.com/thx/resvg-js)
- [wawoff2](https://github.com/fontello/wawoff2)
- [harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs)
- [Arimo on Google Fonts](https://fonts.google.com/specimen/Arimo)
