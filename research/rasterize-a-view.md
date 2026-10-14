# Rasterize a view in the browser

How a page turns one drawn view into a PNG file and a standalone SVG file with only the browser's own APIs: no library and no network.

## Answer

- Build a standalone SVG string, load it into an `<img>` from a `data:` URL, draw it into a `<canvas>` element at 2×, call `toBlob("image/png")` and save the result through `<a download>` on a `blob:` URL. With a pure SVG, this path works in Chrome and Firefox (tested) and in Safari (by WebKit's source), and needs nothing beyond `img-src data:` in the host's CSP.
- Keep `<foreignObject>` out of the SVG. Safari taints the `<canvas>` element for any SVG image that holds one, whatever its URL, so `toBlob` throws. Chrome taints it when the SVG loads from `blob:`. Draw labels as SVG `<text>` and `<tspan>`, which the label boxes Renderizr already measures make possible.
- Drop the Screen Capture API. It asks for permission on every call, sees only what is on screen at the screen's resolution, and crops to one element in Chromium alone.
- Cap the PNG scale on iOS and iPadOS: Safari there allows 16,777,216 pixels per `<canvas>` element, and a 4000 × 3000 canvas at 2× needs 48,000,000.

## Screen Capture API

`getDisplayMedia()` captures a screen, window or tab as a video track. The spec requires transient activation and says "The user agent MUST NOT store a granted permission entry", so the reader picks a surface in a browser dialog on every export. The `display-capture` permissions policy defaults to `self`, so a page inside an iframe (the artifact build) needs the host to grant it with `allow="display-capture"`.

| Feature | Chrome | Firefox | Safari |
| --- | --- | --- | --- |
| `getDisplayMedia()` | 72 (desktop only) | 66 | 13 (iOS 27) |
| `preferCurrentTab` | 94 | no | no |
| Region Capture (`CropTarget`, `cropTo`) | 104 (desktop only) | no | no |
| Element Capture (`RestrictionTarget`, `restrictTo`) | 132 (desktop only) | no | no |

Region Capture crops the tab's video to an element's box, so whatever covers that box lands in the image, and only the part inside the viewport exists. Element Capture removes what covers the element, but the element must form a stacking context, and its video carries no alpha channel. Both capture at the screen's device pixel ratio, so a 2× PNG of a view larger than the window means scrolling and stitching. Both capture what the page shows, including hover, selection, controls and the viewport's zoom and pan, all of which an export leaves out.

Verdict: unfit for export.

## SVG drawn into a canvas element

The steps: serialize the view to an SVG string, set it as an `<img>` source, wait for `load` and `decode()`, call `drawImage` on a `<canvas>` element sized at the scale wanted, then call `toBlob`. An SVG loaded as an image runs in a restricted mode: no script, no external resources and no links, so everything it needs must be inside it.

The risk is origin tainting. A tainted `<canvas>` element makes `toBlob` and `toDataURL` throw a `SecurityError`. Engines treat `<foreignObject>` as able to leak cross-origin data (visited-link styles, spellcheck), so they taint for it in some cases.

| Engine | Plain SVG, `data:` | Plain SVG, `blob:` | `<foreignObject>`, `data:` | `<foreignObject>`, `blob:` |
| --- | --- | --- | --- | --- |
| Chrome 155 (tested) | works | works | works | taints |
| Firefox 158 (tested) | works | works | works | works |
| Safari (WebKit source) | works | works | taints | taints |

We ran Chrome and Firefox headless from `file://` against a test page. Chromium's `SVGImage::HasSingleSecurityOrigin` returns false for any `<foreignObject>`, and the `blob:` case taints in practice while the `data:` case does not.

Safari has a history. In January 2016, WebKit stopped tainting for SVG images except those holding a `<foreignObject>`; in January 2018 it exempted `data:` URLs from that too (r226599, WebKit bug 180301). In June 2023, WebKit 265142@main ("Fix ...videoFrame-construction.crossOriginSource.sub.html", WebKit bug 257749) moved the `data:` check after the `renderingTaintsOrigin` check in `HTMLImageElement::originClean`, and the commit message says so on purpose. Since then, any SVG image holding a `<foreignObject>` taints the `<canvas>` element in WebKit, `data:` included. The change landed in June 2023, so Safari 17 and later most likely carry it, and WebKit's `main` branch still reads that way. We could not run Safari headless, so the prototype must confirm it in a real Safari.

A pure SVG (shapes, paths, `<text>`, `<tspan>`, `<image>` with `data:` sources) taints in no engine, so the serializer must emit one. That also helps the SVG file itself: design tools and slide software import `<text>` and ignore or mangle `<foreignObject>`.

Prefer `data:` over `blob:` for the `<img>` source. It is the only URL that works for `<foreignObject>` in Chrome, should one ever slip in, and it takes the same CSP source as the PNG path's other needs.

## Fonts

An SVG loaded as an image fetches nothing, so a web font must sit inside it as a `data:` URL in an `@font-face` rule in the SVG's own `<style>`. The page's own faces do not reach the image's document.

Renderizr already has the faces in that form. With `--font`, `loadFont` in `scripts/assets.js` fetches the Google Fonts CSS at build time, keeps the wanted subsets and rewrites every `src` to `data:font/woff2;base64,...`, then the build puts those `@font-face` rules in the page. The export can copy the same rules into the SVG's `<style>`: either keep the CSS string at build time and hand it to the page, or read the rules from `document.styleSheets` at export time. `src/engine/react-flow/fonts.ts` measures labels with `canvasMeasure` in the same family string, so `<text>` lines can break where the HTML label breaks.

Timing: in Chrome 155 and Firefox 158, a `data:` face inside the SVG drew on the first `drawImage` after `load`, with or without `decode()`, both in `<text>` and in `<foreignObject>`. WebKit has a long record of SVG images painting before their embedded resources are ready (WebKit bugs 39059, 52593, 100269), and Mozilla saw a regression of the same kind (Mozilla bug 1430755). Await `decode()` and, in Safari, expect to need a check that the face drew, or a second draw after a short wait.

The cost is size: every embedded face goes into the SVG twice when the page also holds it, and the SVG file the reader saves carries the faces too. Subset to the weights the view uses (regular and bold).

## Constraints

**CSP.** Renderizr's output sets no CSP of its own; the host sets it, and the code keeps to what a strict one allows (no `eval`, no runtime `<style>`, no WebAssembly). For the export:

- `img-src` must allow `data:` (or `blob:` if the `<img>` uses a `blob:` URL). With `img-src 'self'`, Chrome and Firefox refuse to load the image at all.
- The page's `font-src` and `style-src` do not apply inside an SVG image. A page with `default-src 'none'; img-src data:` still drew the SVG's inline `<style>` and its `data:` face in Chrome and Firefox.
- `toBlob`, `URL.createObjectURL` and `<a download>` need no directive. CSP has no directive for saving files.

**Single file from `file://`.** Chrome reports the origin as `file://` and Firefox as `null`, and both loaded `data:` and `blob:` images and exported from an untainted `<canvas>` element there. `<a download>` works with `blob:` URLs in Chrome 14, Firefox 20, Safari 10.1 and iOS Safari 13 onward; Chrome drops the `download` attribute only for cross-origin URLs, and a `blob:` URL the page creates is same-origin. We did not try a save from `file://` in a real browser.

**Artifact build.** The artifact runs inside a sandboxed iframe on another origin. A sandboxed iframe blocks `<a download>` unless its `sandbox` list holds `allow-downloads` (Chrome 83, Firefox 82, Safari 17). Nothing public says whether claude.ai grants it, or what its CSP allows for `img-src`. If the host withholds `allow-downloads`, no file save works from inside the artifact, whatever the pipeline.

**No network.** The whole path stays in memory: a string, a `data:` URL, a bitmap and a `blob:` URL.

## Scale

| Browser | Largest side | Largest area |
| --- | --- | --- |
| Chrome 73+ (desktop) | 65,535 | 268,435,456 (16,384²) |
| Firefox 122+ (desktop) | 32,767 | 536,756,224 (23,168²) |
| Safari (macOS) | 4,194,303 wide, 8,388,607 high | 268,435,456 (16,384²) |
| Safari (iOS, iPadOS) | 4,194,303 wide, 8,388,607 high | 16,777,216 (4,096²) |

Figures come from the canvas-size project's test results. A `<canvas>` element over the limit fails without an error: drawing does nothing and `toBlob` hands back `null` or an empty image. iOS Safari also caps the total memory all `<canvas>` elements on a page use, so release the bitmap (set its size to 0) after each export.

A 4000 × 3000 canvas at 2× is 8000 × 6000, or 48,000,000 pixels: fine on desktop, almost three times the iOS limit. Chrome and Firefox both produced PNGs of a 300-element test view at 4000 × 3000 at 1×, 2× and 4× (16000 × 12000); Firefox took about 0.1 s, 0.3 s and 1.3 s. Pick the scale as the largest of 2, 1 or less that keeps the area under the browser's limit, and tell the reader when the PNG comes out below 2×.

## Alternatives considered

- Draw the PNG straight onto a `<canvas>` element with `Path2D` from each shape's outline path and `fillText` for labels, skipping the SVG image. It taints in no browser, needs no `img-src` at all and uses the page's loaded fonts through `document.fonts`. It means a second renderer beside the SVG serializer, so keep it as the fallback if Safari's font timing or the host's CSP defeats the SVG image.
- Load the SVG from a `blob:` URL. It needs `img-src blob:` and taints in Chrome as soon as a `<foreignObject>` appears, for no gain over `data:`.
- Use `OffscreenCanvas.convertToBlob` in a worker. A worker needs `worker-src`, which Renderizr's output avoids, and the main thread does the job fast enough.

## Sources

- W3C, [Screen Capture](https://w3c.github.io/mediacapture-screen-share/): transient activation, no stored grant, `display-capture` defaults to `self`.
- Chrome for Developers, [Element Capture](https://developer.chrome.com/docs/web-platform/element-capture) and [Region Capture](https://developer.chrome.com/docs/web-platform/region-capture).
- MDN browser-compat-data: [`MediaDevices.getDisplayMedia`](https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json), [`CropTarget`](https://github.com/mdn/browser-compat-data/blob/main/api/CropTarget.json), [`RestrictionTarget`](https://github.com/mdn/browser-compat-data/blob/main/api/RestrictionTarget.json), [`<iframe sandbox>`](https://github.com/mdn/browser-compat-data/blob/main/html/elements/iframe.json), [`<a download>`](https://github.com/mdn/browser-compat-data/blob/main/html/elements/a.json).
- MDN, [`<iframe>`: `allow-downloads`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).
- WebKit, [bug 180301](https://bugs.webkit.org/show_bug.cgi?id=180301) and [r226599](https://github.com/WebKit/WebKit/commit/a2cdc7b6a1eb5395fff11a92043023aed9283be9): `data:` exemption for `<foreignObject>`.
- WebKit, [265142@main](https://github.com/WebKit/WebKit/commit/e428405c2a7e87e904e09a8122b3ae9d223b59aa) (bug 257749): the `data:` check moves after the `<foreignObject>` check.
- WebKit source, [`HTMLImageElement::originClean`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLImageElement.cpp) and [`SVGImage::renderingTaintsOrigin`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/svg/graphics/SVGImage.cpp).
- Chromium source, [`SVGImage::HasSingleSecurityOrigin`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/svg/graphics/svg_image.cc) and [`ImageResource::IsCorsSameOrigin`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/loader/resource/image_resource.cc).
- Chromium, [issue 294129](https://crbug.com/294129): `<foreignObject>` taints the canvas.
- WebKit bugs [39059](https://bugs.webkit.org/show_bug.cgi?id=39059), [52593](https://bugs.webkit.org/show_bug.cgi?id=52593) and [100269](https://bugs.webkit.org/show_bug.cgi?id=100269); Mozilla [bug 1430755](https://bugzilla.mozilla.org/show_bug.cgi?id=1430755): resources inside SVG images not ready at first paint.
- canvas-size, [test results](https://github.com/jhildenbiddle/canvas-size/blob/master/docs/index.md#test-results).

## What the prototype must prove

1. A serializer turns one drawn view, labels included, into an SVG with no `<foreignObject>`, whose `<text>` lines break where the page's HTML labels break, in the current color scheme, step and label toggles.
2. That SVG, loaded from a `data:` URL, draws into a `<canvas>` element and `toBlob` returns a PNG in Chrome, Firefox and Safari (macOS and iOS), with no `SecurityError`.
3. The embedded `--font` face shows in the PNG on the first export in Safari, or a named, bounded wait makes it show.
4. `<a download>` on a `blob:` URL saves both files from the single-file build opened from `file://` in Chrome, Firefox and Safari.
5. The same works in the artifact build on claude.ai, or the prototype records which of `allow-downloads` and `img-src data:` the host withholds.
6. A 4000 × 3000 canvas saves at 2× on desktop and at a reduced scale on iOS, and the page tells the reader when it reduced the scale.
7. The serializer and the PNG step fit the bundle budget.
