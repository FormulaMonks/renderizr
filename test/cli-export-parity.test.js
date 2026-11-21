/**
 * The CLI export parity test (spec #364, ADR 32): for every view kind, in the
 * light and dark schemes, in Arimo and Inter, the SVG `renderizr export`
 * writes in Node against the toolbar's own export of the same view, under
 * no perspective and under each perspective the fixture names, in
 * headless Chrome. Outside `<style>`, which holds the same faces in each
 * side's own serialization, the two match byte for byte, but for numbers
 * outside the text, which may differ by 0.1 px: fontkit's widths land a
 * few hundredths of a pixel from Chrome's `measureText`.
 *
 * The PNG resvg draws in Node against the toolbar's PNG of the same view:
 * the same size exactly, under 1% of the pixels apart, bold text drawn
 * bold inside the bold lines' boxes, and every color in the SVG one resvg
 * reads as Chrome does (resvg draws a color it cannot read black).
 *
 * Each fixture is built once per font as a single file with the engine
 * report on, whose `renderizrExportView` hook hands out the toolbar's
 * export. Both sides fetch the font from Google Fonts through the shared
 * cache, so the test needs the network on a cold cache. The Node side runs
 * the CLI's own `runExport`.
 *
 * Not part of `pnpm test`: CI runs it with `pnpm test:parity` in the e2e
 * job. `test/export-parity.test.js` is another test: the toolbar export
 * against the island, inside the page. Skips with a reason when Chrome is
 * missing, unless the `CI` environment variable is set: then a missing
 * Chrome fails the run, so CI never passes by skipping.
 *
 * With no font, the page draws in the fallback stack Chrome finds on the
 * machine and the CLI measures in Arimo; that case compares the SVG alone.
 * Two runs of the CLI over the same workspace write the same bytes, in
 * Inter and with no font.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { loadFont } from "../scripts/assets.js";
import { NO_BRANDING_FLAGS } from "../scripts/branding.js";
import { REPO_ROOT, runCli } from "../scripts/__fixtures__/helpers.js";
import { exportFont, runExport } from "../scripts/export/index.js";
import { rasterize } from "../scripts/export/raster.js";
import { exportFileName } from "../src/components/export-name.js";
import {
    BROWSERS,
    mapLimit,
    prepareWorkspace,
    viewKeys,
    viewUrl,
} from "./support/acceptance.js";
import { findChrome, openBrowser } from "./support/browser.js";

/**
 * Why a test that needs Chrome skips, or false when it runs: with no
 * Chrome on the machine it skips, unless `env` sets `CI`, where it runs and
 * fails on the missing Chrome.
 */
const chromeSkip = (chrome, env) =>
    chrome || env.CI
        ? false
        : "no Chrome or Chromium on this machine; set CHROME_PATH to run the browser tests";

const CHROME = findChrome();
const NO_CHROME = chromeSkip(CHROME, process.env);

/** Fail a test that needs Chrome when there is none (CI set). */
function requireChrome() {
    if (!CHROME)
        throw new Error(
            "CI is set and no Chrome or Chromium is on this machine; install one or set CHROME_PATH",
        );
}

test("a missing Chrome skips the browser tests, except under CI, where it fails them", () => {
    assert.equal(chromeSkip("/usr/bin/chromium", {}), false);
    assert.equal(chromeSkip("/usr/bin/chromium", { CI: "true" }), false);
    assert.match(chromeSkip(null, {}), /no Chrome/);
    assert.equal(chromeSkip(null, { CI: "true" }), false);
});

/** One fixture per view kind the export draws. */
const FIXTURES = [
    // C4 views and a dynamic view.
    "export",
    // Filtered and custom views, and image views, which have no export.
    "view-types",
    // Dynamic views with steps, which the export leaves out.
    "animation",
    "mermaid-flowchart",
    "mermaid-erd",
    "mermaid-sequence",
    // Views under a perspective, and one that carries none of it.
    "perspectives",
];
/** The perspectives each fixture also exports under, beside none. */
const PERSPECTIVES = { perspectives: ["Security", "Ownership"] };
const FONTS = ["Arimo", "Inter"];
const SCHEMES = ["light", "dark"];

/** How far apart a number outside the text may be, in px. */
const TOLERANCE = 0.1;

/**
 * Views whose toolbar export differs between Chrome on macOS and on Linux,
 * by `fixture font key`, skipped on macOS only. CI's Linux is the baseline.
 * Chrome measures a variable font through CoreText on macOS and HarfBuzz on
 * Linux, about 0.01 px apart ("Send reminder" in Inter bold at 23.75 px is
 * 169.9973 on macOS and 170.0051 on Linux). The Mermaid node size rounds
 * its measured width up, so the two toolbar exports end up 1 px apart, and
 * no single measure in Node can match both.
 */
const MACOS_DIFFERENCES = new Set(
    process.platform === "darwin" ? ["mermaid-flowchart Inter signup"] : [],
);

/** The page's locale, pinned to Node's so both date the title block alike. */
const LOCALE = Intl.DateTimeFormat().resolvedOptions().locale;

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-parity-"));
after(() => rm(SCRATCH, { recursive: true, force: true }));

/** A stream that keeps what is written to it. */
const sink = () => {
    const stream = { text: "", write: (chunk) => (stream.text += chunk) };
    return stream;
};

/* ------------------------------------------------------------- compare */

const withoutStyle = (svg) => svg.replace(/<style>[\s\S]*?<\/style>/, "");

/** Each `<text>`'s content, and the SVG with every content taken out. */
function splitText(svg) {
    const texts = [];
    const rest = svg.replace(
        /(<text[^>]*>)([^<]*)(<\/text>)/g,
        (_, a, t, b) => {
            texts.push(t);
            return `${a}${b}`;
        },
    );
    return { texts, rest };
}

const NUMBER = /(-?\d+(?:\.\d+)?)/;

/**
 * Why `node` is not the toolbar's `chrome`, or null when it matches:
 * the same bytes outside `<style>`, but for numbers outside the text that
 * differ by `TOLERANCE` at most.
 */
function svgDifference(chrome, node) {
    const a = withoutStyle(chrome);
    const b = withoutStyle(node);
    if (a === b) return null;
    const left = splitText(a);
    const right = splitText(b);
    if (left.texts.length !== right.texts.length)
        return `${left.texts.length} text lines in Chrome, ${right.texts.length} in Node`;
    for (const [i, text] of left.texts.entries()) {
        if (text !== right.texts[i])
            return `text line ${i}: "${text}" in Chrome, "${right.texts[i]}" in Node`;
    }
    const ta = left.rest.split(NUMBER);
    const tb = right.rest.split(NUMBER);
    if (ta.length !== tb.length) return "the markup differs in shape";
    for (let i = 0; i < ta.length; i++) {
        const context = () => ta.slice(Math.max(0, i - 4), i + 2).join("");
        if (i % 2 === 0) {
            if (ta[i] !== tb[i])
                return `markup "${ta[i].slice(0, 80)}" in Chrome, "${tb[i].slice(0, 80)}" in Node, after ${context()}`;
        } else if (Math.abs(Number(ta[i]) - Number(tb[i])) > TOLERANCE) {
            return `${ta[i]} in Chrome, ${tb[i]} in Node, at ${context()}`;
        }
    }
    return null;
}

test("the comparison allows 0.1 px outside the text and nothing else", () => {
    const svg = (x, label) =>
        `<svg><style>a</style><rect x="${x}"/><text x="1">${label}</text></svg>`;
    assert.equal(svgDifference(svg(10, "A"), svg(10, "A")), null);
    assert.equal(
        svgDifference(svg(10, "A"), svg(10.08, "A").replace("a", "b")),
        null,
    );
    assert.match(svgDifference(svg(10, "A"), svg(10.2, "A")), /10 in Chrome/);
    assert.match(svgDifference(svg(10, "1.0"), svg(10, "1.05")), /text line/);
});

/* ----------------------------------------------------------------- PNG */

/** The most pixels two PNGs of one view may have apart. */
const PIXELS_APART = 0.01;

/**
 * The share of pixels, inside `mask` when given, whose colors differ by
 * more than a little, each composited over white so translucent edges
 * compare as drawn. Null when the sizes differ.
 */
function pixelsApart(a, b, mask) {
    if (a.width !== b.width || a.height !== b.height) return null;
    let apart = 0;
    let total = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if (mask && !mask[i / 4]) continue;
        total++;
        let difference = 0;
        for (let c = 0; c < 3; c++) {
            const over = (png) =>
                (png.data[i + c] * png.data[i + 3]) / 255 +
                255 -
                png.data[i + 3];
            difference += Math.abs(over(a) - over(b));
        }
        if (difference > 48) apart++;
    }
    return total ? apart / total : 0;
}

/** Each `<text>` drawn bold in `svg`, with where it stands. */
const boldLines = (svg) =>
    [...withoutStyle(svg).matchAll(/<text([^>]*)>([^<]*)<\/text>/g)]
        .filter(([, attributes]) => /font-weight="bold"/.test(attributes))
        .map(([, attributes, content]) => {
            const read = (name) =>
                new RegExp(` ${name}="([^"]*)"`).exec(attributes)?.[1];
            return {
                x: Number(read("x")),
                y: Number(read("y")),
                size: Number(read("font-size")),
                anchor: read("text-anchor") ?? "start",
                content,
            };
        });

/**
 * The PNG pixels the bold lines of `svg` cover, drawn at `size`, or null
 * when it has none. Each line's box is a little wider than any face draws
 * it, as the test measures no text.
 */
function boldMask(svg, size) {
    const lines = boldLines(svg);
    if (!lines.length) return null;
    const [vx, vy, vw, vh] = /viewBox="([^"]+)"/
        .exec(svg)[1]
        .split(" ")
        .map(Number);
    const sx = size.width / vw;
    const sy = size.height / vh;
    const mask = new Uint8Array(size.width * size.height);
    for (const line of lines) {
        const width = line.content.length * line.size * 0.65;
        const left =
            line.anchor === "middle"
                ? line.x - width / 2
                : line.anchor === "end"
                  ? line.x - width
                  : line.x;
        const x0 = Math.max(0, Math.floor((left - vx) * sx));
        const x1 = Math.min(size.width, Math.ceil((left + width - vx) * sx));
        const y0 = Math.max(0, Math.floor((line.y - line.size - vy) * sy));
        const y1 = Math.min(
            size.height,
            Math.ceil((line.y + line.size * 0.3 - vy) * sy),
        );
        for (let y = y0; y < y1; y++)
            mask.fill(1, y * size.width + x0, y * size.width + x1);
    }
    return mask;
}

/** `svg` with every bold line drawn at the regular weight. */
const unbold = (svg) =>
    svg.replace(/ font-weight="bold"/g, ' font-weight="400"');

/** The attributes and style properties that hold a color. */
const COLOR_ATTRIBUTE =
    /(?:^|[\s;"])(fill|stroke|stop-color|flood-color|lighting-color|color)(?:="([^"]*)"|:\s*([^;"]+))/g;

/** What a color attribute may hold that is no color to read. */
const NOT_A_COLOR = /^(?:none|currentcolor|inherit|url\(.*\))$/i;

/**
 * Every distinct color `svg` draws with, the SVGs inside its `data:` URLs
 * included, which resvg reads with the same parser.
 */
function colorsOf(svg) {
    const colors = new Set();
    const scan = (text) => {
        for (const [, , attribute, property] of text.matchAll(
            COLOR_ATTRIBUTE,
        )) {
            const value = (attribute ?? property).trim();
            if (value && !NOT_A_COLOR.test(value)) colors.add(value);
        }
        for (const [, data] of text.matchAll(
            /href="data:image\/svg\+xml,([^"]*)"/g,
        ))
            scan(decodeURIComponent(data));
        for (const [, data] of text.matchAll(
            /href="data:image\/svg\+xml;base64,([^"]*)"/g,
        ))
            scan(Buffer.from(data, "base64").toString("utf8"));
    };
    scan(withoutStyle(svg).replace(/&quot;/g, '"'));
    return [...colors].sort();
}

/** Each of `colors` as resvg draws it, `[r, g, b]` over white. */
function resvgColors(colors) {
    const rects = colors
        .map(
            (color, x) =>
                `<rect x="${x}" width="1" height="1" fill="${color.replace(/"/g, "&quot;")}"/>`,
        )
        .join("");
    const { pixels } = new Resvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${colors.length}" height="1">${rects}</svg>`,
    ).render();
    // resvg's pixels are premultiplied.
    return colors.map((_, x) => {
        const [r, g, b, a] = pixels.subarray(x * 4, x * 4 + 4);
        return [r, g, b].map((c) => c + 255 - a);
    });
}

/** Each of `colors` as Chrome reads it, `[r, g, b]` over white, null for one it cannot. */
const chromeColors = (page, colors) =>
    page.evaluate(`(() => {
        const context = document.createElement("canvas").getContext("2d");
        return ${JSON.stringify(colors)}.map((color) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = "#010203";
            context.fillStyle = color;
            if (context.fillStyle === "#010203" && !/^#010203$/i.test(color)) return null;
            context.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
            return [r, g, b].map((c) => Math.round((c * a) / 255 + 255 - a));
        });
    })()`);

/** The colors of `colors` resvg draws other than Chrome, each with both readings. */
async function unreadColors(page, colors) {
    if (!colors.length) return [];
    const chrome = await chromeColors(page, colors);
    const resvg = resvgColors(colors);
    return colors
        .map((color, i) => ({ color, chrome: chrome[i], resvg: resvg[i] }))
        .filter(
            ({ chrome, resvg }) =>
                chrome && resvg.some((c, at) => Math.abs(c - chrome[at]) > 3),
        )
        .map(
            ({ color, chrome, resvg }) =>
                `${color} reads rgb(${resvg}) in resvg, rgb(${chrome}) in Chrome`,
        );
}

test("the PNG comparison counts the pixels apart, inside a mask when given", () => {
    const png = (pixels) => ({
        width: pixels.length,
        height: 1,
        data: Buffer.from(pixels.flat()),
    });
    const white = [255, 255, 255, 255];
    const black = [0, 0, 0, 255];
    const clear = [0, 0, 0, 0];
    assert.equal(pixelsApart(png([white, black]), png([white, black])), 0);
    assert.equal(pixelsApart(png([white, black]), png([white, white])), 0.5);
    assert.equal(pixelsApart(png([white, clear]), png([white, white])), 0);
    assert.equal(
        pixelsApart(png([white, black]), png([white, white]), [1, 0]),
        0,
    );
    assert.equal(pixelsApart(png([white]), png([white, white])), null);
});

test("the color check finds every color in the SVG and reads it as resvg does", () => {
    const glyph = encodeURIComponent('<svg><path fill="#00ff00"/></svg>');
    assert.deepEqual(
        colorsOf(
            `<svg><style>.a{fill:hsl(1.5, 50%, 50%)}</style><rect fill="#ff0000" stroke="none"/><path style="stroke: rgb(0 0 255)" fill="url(#g)"/><image href="data:image/svg+xml,${glyph}"/></svg>`,
        ),
        ["#00ff00", "#ff0000", "rgb(0 0 255)"],
    );
    assert.deepEqual(resvgColors(["#ff0000", "rgba(0, 0, 0, 0.5)"]), [
        [255, 0, 0],
        [128, 128, 128],
    ]);
    // A color resvg cannot read draws black.
    assert.deepEqual(resvgColors(["oklch(1 0 0)"]), [[0, 0, 0]]);
});

test("the bold mask covers each bold line and nothing when there is none", () => {
    const svg = `<svg viewBox="0 0 100 50"><text x="50" y="30" font-size="10" text-anchor="middle" font-weight="bold">AB</text></svg>`;
    const mask = boldMask(svg, { width: 200, height: 100 });
    // Twice the size: the line's box spans 87 to 113 across, 40 to 66 down.
    assert.equal(mask[50 * 200 + 100], 1);
    assert.equal(mask[50 * 200 + 10], 0);
    assert.equal(mask[90 * 200 + 100], 0);
    assert.equal(boldMask(unbold(svg), { width: 200, height: 100 }), null);
});

/* --------------------------------------------------------------- sides */

/**
 * The toolbar's SVG and PNG of view `key` in `scheme` under `perspective`
 * (none when null), from the single file in `site`, the PNG decoded.
 */
async function toolbarSvg(browser, site, key, scheme, perspective) {
    const page = await browser.open(
        perspective
            ? `${viewUrl(site, key)}&perspective=${encodeURIComponent(perspective)}`
            : viewUrl(site, key),
    );
    await page.waitFor(
        `location.protocol === "file:" && document.readyState === "complete"`,
    );
    // The OS's own scheme reaches headless Chrome: pin it either way, and
    // show everything the export shows.
    await page.evaluate(`
        localStorage.setItem("renderizr:theme", "${scheme}");
        localStorage.setItem("renderizr:diagram-labels", JSON.stringify({ descriptions: true, technologies: true, entitiesCollapsed: false }));
        location.reload();
    `);
    await new Promise((done) => setTimeout(done, 500));
    await page.waitFor(
        `document.documentElement.dataset.theme === "${scheme}" && document.querySelector('[data-ready="true"][data-view-key=${JSON.stringify(key)}]') && typeof window.renderizrExportView === "function"`,
    );
    await page.settle();
    const { svg, png } = await page.evaluate(`(async () => {
        await document.fonts.ready;
        const svg = await (await window.renderizrExportView("svg")).text();
        const png = await window.renderizrExportView("png");
        const bytes = new Uint8Array(await png.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { svg, png: btoa(binary) };
    })()`);
    return { svg, png: PNG.sync.read(Buffer.from(png, "base64")) };
}

/**
 * Build `fixture` with `font` for Chrome, and export it in Node. With no
 * `font` (null), the site sets none and Arimo stands in for the CLI.
 */
async function bothSides(fixture, font, now) {
    const dir = join(SCRATCH, fixture, font ?? "no-font");
    await mkdir(dir, { recursive: true });
    const workspace = prepareWorkspace({
        source: join(REPO_ROOT, `test/__fixtures__/${fixture}.json`),
    });
    const source = join(dir, "workspace.json");
    await writeFile(source, JSON.stringify(workspace));

    const built = await runCli(
        [
            source,
            "--out",
            join(dir, "site"),
            "--single-file",
            ...(font ? ["--font", font] : []),
        ],
        { env: { RENDERIZR_ENGINE_REPORT: "1" } },
    );
    if (built.code !== 0)
        throw new Error(`building ${fixture} failed:\n${built.stderr}`);

    const stderr = sink();
    const code = await runExport(
        {
            workspaces: [source],
            out: join(dir, "node"),
            formats: ["svg", "png"],
            schemes: SCHEMES,
            perspectives: PERSPECTIVES[fixture] ?? [],
            branding: { ...NO_BRANDING_FLAGS, font: font ?? null },
        },
        { cwd: REPO_ROOT, stdout: sink(), stderr, now },
    );
    if (code !== 0)
        throw new Error(`exporting ${fixture} failed:\n${stderr.text}`);
    return { dir, workspace };
}

/** The family and TTF files the run draws `font`'s PNGs with. */
async function rasterFont(font) {
    const chosen = exportFont({
        flags: { ...NO_BRANDING_FLAGS, font },
        workspace: {},
        source: null,
        cwd: REPO_ROOT,
    });
    const loaded = await loadFont(chosen.font, {
        cwd: REPO_ROOT,
        announce: false,
    });
    return {
        family: loaded.family,
        files: loaded.faces.map((face) => face.file),
    };
}

/**
 * Why the PNG Node drew from `svg` is not the toolbar's `chrome`, each
 * reason one line: a size apart, too many pixels apart, bold text drawn
 * regular, or a color resvg reads other than Chrome.
 */
async function pngDifferences({ chrome, svg, png, raster, colorPage }) {
    const differences = [];
    if (png.width !== chrome.width || png.height !== chrome.height) {
        differences.push(
            `PNG ${png.width}x${png.height} in Node, ${chrome.width}x${chrome.height} in Chrome`,
        );
        return differences;
    }
    const apart = pixelsApart(chrome, png);
    if (apart > PIXELS_APART)
        differences.push(
            `${(apart * 100).toFixed(2)}% of the PNG's pixels apart`,
        );
    const mask = boldMask(svg, png);
    if (mask) {
        const bold = pixelsApart(chrome, png, mask);
        const regular = pixelsApart(
            chrome,
            PNG.sync.read(await rasterize(unbold(svg), png, raster)),
            mask,
        );
        // Drawn bold, the bold lines sit well nearer Chrome's than drawn
        // regular, about half as far apart: a variable face drawn at its
        // default weight would sit as far apart either way.
        if (!(bold < (regular * 2) / 3))
            differences.push(
                `bold text drawn regular: ${(bold * 100).toFixed(1)}% apart bold, ${(regular * 100).toFixed(1)}% regular`,
            );
    }
    differences.push(...(await unreadColors(colorPage, colorsOf(svg))));
    return differences;
}

/**
 * Compare every view of each of `cases` (`{ fixture, font }`, font null for
 * none) the CLI exported against the toolbar's, and resolve with each
 * case's number of views compared and failures. `png` adds the PNG checks.
 */
async function compareCases(cases, now, { png }) {
    // Every build first: a view whose page shares the machine with a
    // build can miss the wait for its canvas.
    const sides = await mapLimit(cases, BROWSERS, ({ fixture, font }) =>
        bothSides(fixture, font, now),
    );
    const fonts = [...new Set(cases.map(({ font }) => font))];
    const rasters = new Map(
        await Promise.all(
            fonts.map(async (font) => [font, await rasterFont(font)]),
        ),
    );
    return mapLimit(cases, BROWSERS, async ({ fixture, font }, at) => {
        const { dir, workspace } = sides[at];
        const browser = await openBrowser(CHROME, {
            extraFlags: [`--lang=${LOCALE}`],
        });
        const colorPage = await browser.open("about:blank");
        const failures = [];
        let compared = 0;
        try {
            const perspectives = [null, ...(PERSPECTIVES[fixture] ?? [])];
            for (const key of viewKeys(workspace)) {
                for (const perspective of perspectives) {
                    for (const scheme of SCHEMES) {
                        const name = exportFileName({
                            workspace: workspace.name,
                            view: key,
                            perspective,
                            step: null,
                            scheme,
                            format: "svg",
                        });
                        const file = join(dir, "node", name);
                        // The export skips image views, and views that
                        // carry none of the perspective.
                        if (!existsSync(file)) continue;
                        if (MACOS_DIFFERENCES.has(`${fixture} ${font} ${key}`))
                            continue;
                        const node = await readFile(file, "utf8");
                        const site = join(dir, "site");
                        const toolbar = () =>
                            toolbarSvg(browser, site, key, scheme, perspective);
                        // A page that misses its wait gets one more try in
                        // a fresh tab.
                        const chrome = await toolbar().catch(toolbar);
                        compared++;
                        const where = `${fixture} ${font ?? "no font"} ${key} ${perspective ?? "-"} ${scheme}`;
                        const difference = svgDifference(chrome.svg, node);
                        if (difference)
                            failures.push(`${where}: ${difference}`);
                        if (!png) continue;
                        for (const reason of await pngDifferences({
                            chrome: chrome.png,
                            svg: node,
                            png: PNG.sync.read(
                                await readFile(file.replace(/\.svg$/, ".png")),
                            ),
                            raster: rasters.get(font),
                            colorPage,
                        }))
                            failures.push(`${where}: ${reason}`);
                    }
                }
            }
        } finally {
            await browser.close();
        }
        return { fixture, font, compared, failures };
    });
}

test("the CLI's SVG and PNG match the toolbar's for every view kind, scheme, perspective and font", {
    skip: NO_CHROME,
}, async () => {
    requireChrome();
    const cases = FIXTURES.flatMap((fixture) =>
        FONTS.map((font) => ({ fixture, font })),
    );
    const results = await compareCases(cases, new Date(), { png: true });
    for (const { fixture, font, compared } of results)
        assert.ok(compared > 0, `${fixture} in ${font} compared no view`);
    assert.deepEqual(
        results.flatMap(({ failures }) => failures),
        [],
    );
});

test("with no font, the CLI's SVG in Arimo matches the toolbar's in the fallback stack", {
    skip: NO_CHROME,
}, async () => {
    requireChrome();
    const cases = FIXTURES.map((fixture) => ({ fixture, font: null }));
    const results = await compareCases(cases, new Date(), { png: false });
    for (const { fixture, compared } of results)
        assert.ok(compared > 0, `${fixture} with no font compared no view`);
    assert.deepEqual(
        results.flatMap(({ failures }) => failures),
        [],
    );
});

/* --------------------------------------------------------- determinism */

/** Every file in `dir`, by name, with its bytes. */
const filesIn = async (dir) =>
    Object.fromEntries(
        await Promise.all(
            (await readdir(dir))
                .sort()
                .map(async (name) => [name, await readFile(join(dir, name))]),
        ),
    );

test("two runs over the same workspace write the same bytes, in Inter and with no font", async () => {
    const now = new Date();
    const source = join(REPO_ROOT, "test/__fixtures__/export.json");
    for (const font of ["Inter", null]) {
        const runs = [];
        for (const run of ["first", "second"]) {
            const out = join(SCRATCH, "determinism", font ?? "no-font", run);
            const stderr = sink();
            const code = await runExport(
                {
                    workspaces: [source],
                    out,
                    formats: ["svg", "png"],
                    schemes: SCHEMES,
                    perspectives: [],
                    branding: { ...NO_BRANDING_FLAGS, font },
                },
                { cwd: REPO_ROOT, stdout: sink(), stderr, now },
            );
            assert.equal(code, 0, `the ${run} run failed:\n${stderr.text}`);
            runs.push(await filesIn(out));
        }
        const [first, second] = runs;
        assert.ok(
            Object.keys(first).length > 0,
            `${font ?? "no font"} wrote no file`,
        );
        assert.deepEqual(
            Object.keys(second),
            Object.keys(first),
            `${font ?? "no font"}: the runs wrote different files`,
        );
        for (const [name, bytes] of Object.entries(first))
            assert.ok(
                bytes.equals(second[name]),
                `${font ?? "no font"}: ${name} differs between runs`,
            );
    }
});
