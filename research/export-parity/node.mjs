// The Node side: export every case the Chrome side saved, with the faces
// `loadFont` fetches instanced to static TTFs, fontkit to measure and resvg
// to rasterize, then compare each export with the toolbar's.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { PNG } from "pngjs";
import * as fontkit from "fontkit";
import { loadFont } from "../../scripts/assets.js";
import { exportView } from "./driver.mjs";
import { instanceAt } from "./instance.mjs";
import { OUT } from "./cases.mjs";

const { Resvg } = createRequire(import.meta.url)("@resvg/resvg-js");
const manifest = JSON.parse(
    readFileSync(join(OUT, "chrome", "manifest.json"), "utf8"),
).filter(
    (c) => !process.env.ONLY || process.env.ONLY.split(",").includes(c.fixture),
);
const version = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;
/** Which ascent and descent each run uses: copied from Chrome, or read from the font file. */
const RULE = process.env.RULE ?? "file";

/* ------------------------------------------------------------- faces */

const faces = new Map();
async function facesOf(family) {
    if (faces.has(family)) return faces.get(family);
    const dir = join(OUT, "faces", family);
    mkdirSync(dir, { recursive: true });
    const font = await loadFont({
        family,
        weights: ["400", "700"],
        subsets: ["latin"],
        italic: false,
    });
    const css = font.css.replace(/:root\{.*$/, "");
    const urls = [
        ...css.matchAll(/url\(data:font\/woff2;base64,([^)]+)\)/g),
    ].map((m) => Buffer.from(m[1], "base64"));
    if (urls.length !== 1)
        throw new Error(
            `${family}: expected one variable face, got ${urls.length}`,
        );
    const files = {};
    for (const weight of [400, 700]) {
        const file = join(dir, `${weight}.ttf`);
        writeFileSync(file, await instanceAt(urls[0], weight));
        files[weight] = file;
    }
    const regular = fontkit.openSync(files[400]);
    const bold = fontkit.openSync(files[700]);
    const upm = regular.unitsPerEm;
    const os2 = regular["OS/2"];
    const result = {
        family,
        css,
        files: [files[400], files[700]],
        measure: (text, size, isBold) =>
            ((isBold ? bold : regular).layout(text).advanceWidth / upm) * size,
        metrics: {
            hhea: {
                ascent: regular.hhea.ascent / upm,
                descent: -regular.hhea.descent / upm,
            },
            typo: {
                ascent: os2.typoAscender / upm,
                descent: -os2.typoDescender / upm,
            },
            win: { ascent: os2.winAscent / upm, descent: os2.winDescent / upm },
            useTypo: !!(os2.fsSelection & 0x80),
        },
    };
    faces.set(family, result);
    return result;
}

/* ------------------------------------------------------------- PNG */

const MAX_PIXELS = 16_777_216;
function pngSize(width, height) {
    const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (width * height)));
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
    };
}
/** Like the page's canvas, stretch the export to exactly the PNG's size. */
const sized = (svg, size) =>
    svg.replace(
        /^<svg([^>]*?) width="[^"]+" height="[^"]+"/,
        `<svg$1 width="${size.width}" height="${size.height}" preserveAspectRatio="none"`,
    );
const rasterize = (svg, size, face) =>
    new Resvg(sized(svg, size), {
        font: {
            fontFiles: face.files,
            loadSystemFonts: false,
            defaultFontFamily: face.family,
        },
    })
        .render()
        .asPng();

/** The share of pixels, inside `mask` when given, whose colors differ by more than a little. */
function pixelDiff(a, b, mask) {
    const A = PNG.sync.read(a),
        B = PNG.sync.read(b);
    if (A.width !== B.width || A.height !== B.height) return null;
    let diff = 0,
        total = 0;
    for (let i = 0; i < A.data.length; i += 4) {
        if (mask && !mask[i / 4]) continue;
        total++;
        // Composite both over white so transparent edges compare as drawn.
        let d = 0;
        for (let c = 0; c < 3; c++) {
            const ac =
                (A.data[i + c] * A.data[i + 3]) / 255 + 255 - A.data[i + 3];
            const bc =
                (B.data[i + c] * B.data[i + 3]) / 255 + 255 - B.data[i + 3];
            d += Math.abs(ac - bc);
        }
        if (d > 48) diff++;
    }
    return total ? diff / total : null;
}

/* ------------------------------------------------------------- SVG */

const strip = (svg) => svg.replace(/<style>[\s\S]*?<\/style>/, "");
const texts = (svg) =>
    [...strip(svg).matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].map(
        ([, attrs, content]) => {
            const a = Object.fromEntries(
                [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [
                    k,
                    v,
                ]),
            );
            return {
                x: Number(a.x),
                y: Number(a.y),
                size: a["font-size"],
                bold: a["font-weight"] === "bold",
                content,
            };
        },
    );
const withoutText = (svg) =>
    strip(svg).replace(/<text[^>]*>[^<]*<\/text>/g, "");
/** The PNG pixels the export's bold lines cover. */
function boldMask(svg, size, measure) {
    const [vx, vy, vw, vh] = svg
        .match(/viewBox="([^"]+)"/)[1]
        .split(" ")
        .map(Number);
    const sx = size.width / vw,
        sy = size.height / vh;
    const mask = new Uint8Array(size.width * size.height);
    for (const t of texts(svg).filter((t) => t.bold)) {
        const fs = Number(t.size),
            w = measure(t.content, fs, true);
        const anchor =
            (strip(svg).match(
                new RegExp(
                    `<text x="${t.x}" y="${t.y}"[^>]*text-anchor="(\\w+)"`,
                ),
            ) ?? [])[1] ?? "start";
        const left =
            anchor === "middle"
                ? t.x - w / 2
                : anchor === "end"
                  ? t.x - w
                  : t.x;
        const x0 = Math.floor((left - vx) * sx),
            x1 = Math.ceil((left + w - vx) * sx);
        const y0 = Math.floor((t.y - fs - vy) * sy),
            y1 = Math.ceil((t.y + fs * 0.3 - vy) * sy);
        for (let y = Math.max(0, y0); y < Math.min(size.height, y1); y++)
            for (let x = Math.max(0, x0); x < Math.min(size.width, x1); x++)
                mask[y * size.width + x] = 1;
    }
    return mask;
}
const unbold = (svg) =>
    svg.replace(/ font-weight="bold"/g, ' font-weight="400"');

function compareSvg(chrome, node) {
    const a = texts(chrome),
        b = texts(node);
    const lines = {
        chrome: a.length,
        node: b.length,
        content: 0,
        dx: 0,
        dy: 0,
        examples: [],
    };
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (
            a[i]?.content !== b[i]?.content ||
            a[i]?.bold !== b[i]?.bold ||
            a[i]?.size !== b[i]?.size
        ) {
            lines.content++;
            if (lines.examples.length < 3)
                lines.examples.push([a[i]?.content, b[i]?.content]);
            continue;
        }
        lines.dx = Math.max(lines.dx, Math.abs(a[i].x - b[i].x));
        lines.dy = Math.max(lines.dy, Math.abs(a[i].y - b[i].y));
    }
    // Shapes that moved: the largest change in any number outside the text.
    const tokens = (svg) => withoutText(svg).split(/(-?\d+(?:\.\d+)?)/);
    const ta = tokens(chrome),
        tb = tokens(node);
    let shapeDelta = ta.length === tb.length ? 0 : Infinity;
    for (let i = 0; shapeDelta !== Infinity && i < ta.length; i++)
        if (i % 2 ? true : ta[i] === tb[i]) {
            if (i % 2)
                shapeDelta = Math.max(
                    shapeDelta,
                    Math.abs(Number(ta[i]) - Number(tb[i])),
                );
        } else shapeDelta = Infinity;
    return {
        identical: strip(chrome) === strip(node),
        shapeDelta,
        shapes: withoutText(chrome) === withoutText(node),
        size: chrome
            .match(/<svg[^>]*?width="([^"]+)" height="([^"]+)"/)
            .slice(1)
            .join("x"),
        nodeSize: node
            .match(/<svg[^>]*?width="([^"]+)" height="([^"]+)"/)
            .slice(1)
            .join("x"),
        lines,
        bold: a.some((t) => t.bold),
    };
}

/* ------------------------------------------------------------- run */

const results = [];
for (const c of manifest) {
    const dir = join(OUT, "chrome", c.fixture, c.font);
    const workspace = JSON.parse(
        readFileSync(join(dir, "workspace.json"), "utf8"),
    );
    const face = await facesOf(c.font);
    const { ascent, descent } =
        RULE === "chrome" ? c.metrics : face.metrics.hhea;
    const chromeSvg = readFileSync(join(dir, `${c.name}.svg`), "utf8");
    // The build date the page fell back to: read it back off the toolbar's title block.
    const modified = texts(chromeSvg)
        .map(
            (t) =>
                t.content.match(
                    /^Last updated: (\d{1,2}\/\d{1,2}\/\d{4})$/,
                )?.[1],
        )
        .find(Boolean);
    const options = {
        scheme: c.scheme,
        step: c.step,
        font: c.font,
        measure: face.measure,
        ascent,
        descent,
        fontFaces: face.css,
        built: modified,
        version,
    };
    const t0 = performance.now();
    const first = exportView(workspace, c.key, options);
    const size = pngSize(first.width, first.height);
    const png = rasterize(first.svg, size, face);
    const ms = performance.now() - t0;
    const second = exportView(workspace, c.key, options);
    const again = rasterize(second.svg, size, face);
    const nodeDir = join(OUT, "node", RULE, c.fixture, c.font);
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(join(nodeDir, `${c.name}.svg`), first.svg);
    writeFileSync(join(nodeDir, `${c.name}.png`), png);

    const chromePng = readFileSync(join(dir, `${c.name}.png`));
    const chromeSize = PNG.sync.read(chromePng);
    const nodeSize = PNG.sync.read(png);
    const svg = compareSvg(chromeSvg, first.svg);
    const pixels = pixelDiff(chromePng, png);
    const mask = svg.bold ? boldMask(first.svg, size, face.measure) : null;
    const boldPixels = svg.bold ? pixelDiff(chromePng, png, mask) : null;
    const unbolded = svg.bold
        ? pixelDiff(chromePng, rasterize(unbold(first.svg), size, face), mask)
        : null;
    results.push({
        ...c,
        ms: Math.round(ms),
        svg,
        png: {
            chrome: `${chromeSize.width}x${chromeSize.height}`,
            node: `${nodeSize.width}x${nodeSize.height}`,
            pixels,
            boldPixels,
            unbolded,
        },
        deterministic: {
            svg: first.svg === second.svg,
            png: Buffer.compare(png, again) === 0,
        },
    });
    const r = results.at(-1);
    console.log(
        [
            `${c.fixture}/${c.font}/${c.name}`.padEnd(44),
            r.svg.identical
                ? "svg="
                : `svg≠ lines ${r.svg.lines.content}/${r.svg.lines.chrome} dy ${r.svg.lines.dy.toFixed(2)} dx ${r.svg.lines.dx.toFixed(2)}${r.svg.shapes ? "" : ` shapes Δ${r.svg.shapeDelta.toFixed(2)}`}`,
            `png ${r.png.chrome === r.png.node ? "size=" : `${r.png.chrome}≠${r.png.node}`} ${pixels === null ? "-" : `${(pixels * 100).toFixed(2)}%`}${unbolded === null ? "" : `, bold lines ${(boldPixels * 100).toFixed(1)}% vs unbolded ${(unbolded * 100).toFixed(1)}%`}`,
            r.deterministic.svg && r.deterministic.png ? "det" : "NONDET",
            `${r.ms} ms`,
        ].join("  "),
    );
}
writeFileSync(
    join(
        OUT,
        `results-${RULE}${process.env.ONLY ? `-${process.env.ONLY}` : ""}.json`,
    ),
    JSON.stringify(
        {
            faces: Object.fromEntries(
                [...faces].map(([k, v]) => [k, v.metrics]),
            ),
            results,
        },
        null,
        2,
    ),
);
