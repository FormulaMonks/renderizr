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
 * Each fixture is built once per font as a single file with the engine
 * report on, whose `renderizrExportView` hook hands out the toolbar's
 * export. Both sides fetch the font from Google Fonts through the shared
 * cache, so the test needs the network on a cold cache. The Node side runs
 * the CLI's own `runExport`.
 *
 * Not part of `pnpm test`: CI runs it with `pnpm test:parity` in the e2e
 * job. `test/export-parity.test.js` is another test: the toolbar export
 * against the island, inside the page. Skips with a reason when Chrome is
 * missing.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { NO_BRANDING_FLAGS } from "../scripts/branding.js";
import { REPO_ROOT, runCli } from "../scripts/__fixtures__/helpers.js";
import { runExport } from "../scripts/export.js";
import { exportFileName } from "../src/components/export-name.js";
import {
    BROWSERS,
    mapLimit,
    prepareWorkspace,
    viewKeys,
    viewUrl,
} from "./support/acceptance.js";
import { findChrome, openBrowser } from "./support/browser.js";

const CHROME = findChrome();
const NO_CHROME = CHROME
    ? false
    : "no Chrome or Chromium on this machine; set CHROME_PATH to run the browser tests";

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

/* --------------------------------------------------------------- sides */

/**
 * The toolbar's SVG of view `key` in `scheme` under `perspective` (none
 * when null), from the single file in `site`.
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
    return page.evaluate(`(async () => {
        await document.fonts.ready;
        return (await window.renderizrExportView("svg")).text();
    })()`);
}

/** Build `fixture` with `font` for Chrome, and export it in Node. */
async function bothSides(fixture, font, now) {
    const dir = join(SCRATCH, fixture, font);
    await mkdir(dir, { recursive: true });
    const workspace = prepareWorkspace({
        source: join(REPO_ROOT, `test/__fixtures__/${fixture}.json`),
    });
    const source = join(dir, "workspace.json");
    await writeFile(source, JSON.stringify(workspace));

    const built = await runCli(
        [source, "--out", join(dir, "site"), "--single-file", "--font", font],
        { env: { RENDERIZR_ENGINE_REPORT: "1" } },
    );
    if (built.code !== 0)
        throw new Error(`building ${fixture} failed:\n${built.stderr}`);

    const stderr = sink();
    const code = await runExport(
        {
            workspaces: [source],
            out: join(dir, "node"),
            formats: ["svg"],
            schemes: SCHEMES,
            perspectives: PERSPECTIVES[fixture] ?? [],
            branding: { ...NO_BRANDING_FLAGS, font },
        },
        { cwd: REPO_ROOT, stdout: sink(), stderr, now },
    );
    if (code !== 0)
        throw new Error(`exporting ${fixture} failed:\n${stderr.text}`);
    return { dir, workspace };
}

test("the CLI's SVG matches the toolbar's for every view kind, scheme, perspective and font", {
    skip: NO_CHROME,
}, async () => {
    const now = new Date();
    const cases = FIXTURES.flatMap((fixture) =>
        FONTS.map((font) => ({ fixture, font })),
    );
    // Every build first: a view whose page shares the machine with a
    // build can miss the wait for its canvas.
    const sides = await mapLimit(cases, BROWSERS, ({ fixture, font }) =>
        bothSides(fixture, font, now),
    );
    const results = await mapLimit(
        cases,
        BROWSERS,
        async ({ fixture, font }, at) => {
            const { dir, workspace } = sides[at];
            const browser = await openBrowser(CHROME, {
                extraFlags: [`--lang=${LOCALE}`],
            });
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
                            const node = await readFile(file, "utf8");
                            const site = join(dir, "site");
                            const toolbar = () =>
                                toolbarSvg(
                                    browser,
                                    site,
                                    key,
                                    scheme,
                                    perspective,
                                );
                            // A page that misses its wait gets one more try
                            // in a fresh tab.
                            const chrome = await toolbar().catch(toolbar);
                            compared++;
                            const difference = svgDifference(chrome, node);
                            if (difference)
                                failures.push(
                                    `${fixture} ${font} ${key} ${perspective ?? "-"} ${scheme}: ${difference}`,
                                );
                        }
                    }
                }
            } finally {
                await browser.close();
            }
            return { fixture, font, compared, failures };
        },
    );
    for (const { fixture, font, compared } of results)
        assert.ok(compared > 0, `${fixture} in ${font} compared no view`);
    assert.deepEqual(
        results.flatMap(({ failures }) => failures),
        [],
    );
});
