/**
 * The export (ADR 21): `src/engine/react-flow/export-svg.ts`, which
 * serializes a drawn graph and its title block as a standalone SVG, and the
 * title block's text from `src/engine/react-flow/export-file.ts`. Built from
 * `test/__fixtures__/export.json`. `test/export-parity.test.js` checks the
 * element labels against the island in Chrome.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe } from "node:test";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { stepStateOf } = await importSrc("engine/react-flow/animation");
const { estimateText } = await importSrc("engine/geometry/boundary");
const { exportFrame } = await importSrc("engine/geometry/canvas");
const { exportSvg, TITLE_BLOCK_DESCRIPTION_LINES, TITLE_BLOCK_FONT_SIZE } =
    await importSrc("engine/react-flow/export-svg");
const { MAX_PIXELS, declaresFamily, modifiedDate, pngSize, titleBlockText } =
    await importSrc("engine/react-flow/export-file");

const WORKSPACE = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/export.json", import.meta.url),
        "utf-8",
    ),
);
/** When the title block's tests say the site was built. */
const BUILT = "2026-10-16T09:00:00Z";
const LABELS = { descriptions: true, technologies: true };
const TEXT = {
    measure: estimateText,
    ascent: 0.9,
    descent: 0.22,
    family: "Helvetica, Arial, sans-serif",
    fontFaces: "",
};
const TITLE_BLOCK = {
    view: "Export in context",
    description: "A short description",
    user: "ada@example.com",
    modified: "10/1/2026",
};

/** Export view `key` of the fixture with `options` laid over the defaults. */
function exported(key, options = {}) {
    const { scheme = "light", step, titleBlock = TITLE_BLOCK } = options;
    const graph = buildGraph(
        new WorkspaceModel(WORKSPACE),
        key,
        scheme,
        LABELS,
        estimateText,
    );
    const frame = options.frame ?? exportFrame(undefined, graph.bounds);
    return {
        graph,
        frame,
        ...exportSvg({
            graph,
            step: step && stepStateOf(graph, step),
            frame,
            titleBlock,
            text: TEXT,
        }),
    };
}

/** The text of every `<text>` in `svg`, tspans joined with a space. */
const texts = (svg) =>
    [...svg.matchAll(/<text [^>]*>(.*?)<\/text>/g)].map(([, inner]) =>
        inner
            .split(/<[^>]*>/)
            .filter(Boolean)
            .join(" "),
    );

/** The title block's group in `svg`. */
const titleBlockOf = (svg) =>
    svg.match(/<g data-title-block="">.*?<\/g><\/svg>$/)?.[0] ?? "";

describe("export-svg", () => {
    /* -------------------------------------------------------- the document */

    test("the SVG carries a <title> with the view's title and no <foreignObject>, <desc> or role", () => {
        const { svg } = exported("AutoFrame");
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
        assert.match(svg, /<title>Export in context<\/title>/);
        assert.doesNotMatch(svg, /<foreignObject/, "labels are <text>");
        assert.doesNotMatch(svg, /<desc/);
        assert.doesNotMatch(svg, /\srole=/);
    });

    test("every element label is real <text>, broken where the name breaks", () => {
        const { svg } = exported("AutoFrame");
        const system = svg.match(/<g data-element-id="2">.*?<\/g><\/g>/)?.[0];
        assert.ok(system, "the system should be drawn");
        const name = system.match(/<g data-label="name">(.*?)<\/g>/)?.[1];
        assert.deepEqual(texts(name ?? ""), ["Export", "System"]);
        assert.ok(texts(svg).includes("[HTTPS]"), "an edge label is text too");
    });

    test("the SVG is the frame wide and the frame plus the title block tall", () => {
        const { svg, frame, width, height } = exported("AutoFrame");
        assert.equal(width, frame.width);
        assert.ok(height > frame.height, "the title block adds height");
        assert.match(svg, new RegExp(`width="${width}" height="${height}"`));
        assert.ok(
            svg.includes(`viewBox="${frame.x} ${frame.y} ${width} ${height}"`),
        );
    });

    test("indicators are <image>s from data: URLs", () => {
        const { svg } = exported("AutoFrame");
        const images = [...svg.matchAll(/<image href="([^"]+)"/g)].map(
            ([, href]) => href,
        );
        const glyphs = images.filter((href) =>
            href.startsWith("data:image/svg+xml,"),
        );
        assert.ok(glyphs.length >= 2, "the system's link and view glyphs");
        for (const href of images) {
            assert.match(href, /^data:/, "an export fetches nothing");
        }
    });

    test("a dark export draws its canvas and title block in the dark scheme", () => {
        const light = exported("AutoFrame");
        const dark = exported("AutoFrame", { scheme: "dark" });
        assert.notEqual(light.graph.background, dark.graph.background);
        for (const { svg, graph } of [light, dark]) {
            assert.match(
                svg,
                new RegExp(`<rect [^>]*fill="${graph.background}"/>`),
                "the canvas color fills the frame and the band",
            );
            const band = titleBlockOf(svg);
            assert.ok(band, "the title block is drawn");
            for (const [, fill] of band.matchAll(/fill="([^"]+)"/g)) {
                assert.equal(fill, graph.color, "its text is the scheme's");
            }
        }
    });

    /* ---------------------------------------------------------- animation */

    test("a step's faded items draw at 0.2 and its hidden items are left out", () => {
        const full = exported("Request");
        const first = exported("Request", { step: 1 });
        assert.doesNotMatch(full.svg, /opacity="0\.2"/);
        assert.match(
            first.svg,
            /<g opacity="0\.2"><g data-element-id="4">/,
            "step 1 fades the store",
        );

        const { graph, frame } = full;
        const hidden = stepStateOf(graph, null);
        hidden.elements["4"] = "hidden";
        const { svg } = exportSvg({
            graph,
            step: hidden,
            frame,
            titleBlock: TITLE_BLOCK,
            text: TEXT,
        });
        assert.doesNotMatch(svg, /data-element-id="4"/);
        assert.match(svg, /data-element-id="3"/);
    });

    /* -------------------------------------------------------- title block */

    test("the title block gives the view, the description, the user and the date", () => {
        const band = titleBlockOf(exported("AutoFrame").svg);
        assert.match(
            band,
            /<text [^>]*font-weight="bold"[^>]*>Export in context<\/text>/,
            "the view's title is bold",
        );
        assert.doesNotMatch(band, /Export Workspace/, "no workspace name");
        assert.deepEqual(texts(band), [
            "Export in context",
            "A short description",
            "Author: ada@example.com",
            "Last updated: 10/1/2026",
        ]);
    });

    test("the title block sets the author and date apart from the description", () => {
        const band = titleBlockOf(exported("AutoFrame").svg);
        const ys = [...band.matchAll(/<text [^>]*\by="([\d.]+)"/g)].map(
            ([, y]) => Number(y),
        );
        const [, description, author, date] = ys;
        const step = date - author;
        assert.ok(
            author - description >= 2 * step - 0.01,
            "a gap of at least a line opens before the author",
        );
    });

    test("the title block leaves out each line that has no value", () => {
        const cases = [
            { field: "description", gone: "A short description" },
            { field: "user", gone: "Author: ada@example.com" },
            { field: "modified", gone: "Last updated: 10/1/2026" },
        ];
        const full = exported("AutoFrame");
        for (const { field, gone } of cases) {
            const { svg, height } = exported("AutoFrame", {
                titleBlock: { ...TITLE_BLOCK, [field]: "  " },
            });
            const lines = texts(titleBlockOf(svg));
            assert.ok(!lines.includes(gone), `${field} is left out`);
            assert.equal(lines.length, 3, `${field}: the other lines stay`);
            assert.ok(height < full.height, `${field}: the band shrinks`);
        }
    });

    test("the title block ends with the credit, smaller, lighter and a line apart", () => {
        const credit = "Created with Renderizr v2.4.0";
        const plain = exported("AutoFrame");
        const { svg, height } = exported("AutoFrame", {
            titleBlock: { ...TITLE_BLOCK, credit },
        });
        const band = titleBlockOf(svg);
        assert.equal(texts(band).at(-1), credit, "the credit comes last");
        const tag = band.match(
            /<text [^>]*>[^<]*Created with[^<]*<\/text>/,
        )?.[0];
        const size = Number(tag?.match(/font-size="([\d.]+)"/)?.[1]);
        assert.ok(size < TITLE_BLOCK_FONT_SIZE, "smaller than the other lines");
        assert.match(
            band,
            /<g opacity="0\.\d+">(?:(?!<\/g>).)*Created with/,
            "lighter: drawn at an opacity under 1",
        );
        assert.ok(height > plain.height, "the band grows by the credit");
    });

    test("the title block wraps the description to the canvas and clamps it after 4 lines", () => {
        const description = WORKSPACE.views.systemContextViews[0].description;
        const { svg, frame } = exported("AutoFrame", {
            titleBlock: { ...TITLE_BLOCK, description },
        });
        const lines = texts(titleBlockOf(svg)).slice(1, -2);
        assert.equal(lines.length, TITLE_BLOCK_DESCRIPTION_LINES);
        assert.match(lines.at(-1), /…$/, "the last line ends in an ellipsis");
        for (const line of lines) {
            assert.ok(
                estimateText(line, TITLE_BLOCK_FONT_SIZE, false) <=
                    frame.width - 80,
                `"${line}" fits the band`,
            );
        }
    });

    test("the title block's text is escaped", () => {
        const { svg } = exported("AutoFrame", {
            titleBlock: { ...TITLE_BLOCK, view: "R&D <labs>" },
        });
        assert.match(titleBlockOf(svg), /R&amp;D &lt;labs&gt;/);
    });
});

describe("export-file", () => {
    test("an @font-face rule embeds only for the family its font-family names, quoted or not", () => {
        const cases = [
            { declared: "Inter", family: "Inter", embeds: true },
            { declared: '"Inter"', family: "Inter", embeds: true },
            { declared: "'Inter'", family: "Inter", embeds: true },
            { declared: ' "Inter" ', family: "Inter", embeds: true },
            { declared: '"Inter Tight"', family: "Inter", embeds: false },
            { declared: "Inter Tight", family: "Inter", embeds: false },
            { declared: '"Inter"', family: "Inter Tight", embeds: false },
            { declared: "", family: "Inter", embeds: false },
        ];
        for (const { declared, family, embeds } of cases) {
            assert.equal(
                declaresFamily(declared, family),
                embeds,
                `font-family: ${declared} for ${family}`,
            );
        }
    });

    test("the date last modified is formatted in the reader's locale, and missing or broken dates give none", () => {
        const cases = [
            {
                value: "2026-10-01T12:00:00Z",
                locale: "en-US",
                date: "10/1/2026",
            },
            {
                value: "2026-10-01T12:00:00Z",
                locale: "de-DE",
                date: "1.10.2026",
            },
            { value: undefined, locale: "en-US", date: "" },
            { value: "", locale: "en-US", date: "" },
            { value: "yesterday", locale: "en-US", date: "" },
            { value: 42, locale: "en-US", date: "" },
        ];
        for (const { value, locale, date } of cases) {
            assert.equal(modifiedDate(value, locale), date, String(value));
        }
    });

    test("the title block reads the user and date from the workspace and the view's description as the page shows it", () => {
        const text = titleBlockText(
            WORKSPACE,
            "Export in context",
            "About the view\nAuthor: Ada <ada@example.com>",
            BUILT,
        );
        assert.equal("workspace" in text, false, "no workspace name");
        assert.equal(text.view, "Export in context");
        assert.equal(
            text.description,
            "About the view",
            "the author the page shows apart stays out of the description",
        );
        assert.equal(text.user, "ada@example.com");
        assert.equal(text.modified, modifiedDate(WORKSPACE.lastModifiedDate));
    });

    test("the title block credits Renderizr, with its version when the build knows it", () => {
        assert.equal(
            titleBlockText(WORKSPACE, "View", "", BUILT, "2.4.0").credit,
            "Created with Renderizr v2.4.0",
        );
        assert.equal(
            titleBlockText(WORKSPACE, "View", "", BUILT, "").credit,
            "Created with Renderizr",
        );
    });

    test("the title block's author falls back to the agent, then to Unknown", () => {
        const author = (workspace) =>
            titleBlockText(workspace, "View", "", BUILT).user;
        assert.equal(
            author({
                lastModifiedUser: "ada@example.com",
                lastModifiedAgent: "structurizr-ui",
            }),
            "ada@example.com",
            "the user comes before the agent",
        );
        assert.equal(
            author({ lastModifiedAgent: "structurizr-ui" }),
            "structurizr-ui",
            "a workspace without a user gives its agent",
        );
        assert.equal(
            author({
                lastModifiedUser: " ",
                lastModifiedAgent: "renderizr/2.4.0",
            }),
            "renderizr/2.4.0",
            "a blank user counts as none",
        );
        assert.equal(author({ name: "Bare" }), "Unknown");
        assert.equal(
            author({ lastModifiedUser: "", lastModifiedAgent: 42 }),
            "Unknown",
        );
    });

    test("the title block's date falls back to the date of the build, then to Unknown", () => {
        const date = (workspace, built = BUILT) =>
            titleBlockText(workspace, "View", "", built).modified;
        assert.equal(
            date({ lastModifiedDate: WORKSPACE.lastModifiedDate }),
            modifiedDate(WORKSPACE.lastModifiedDate),
        );
        assert.equal(
            date({ name: "Bare" }),
            modifiedDate(BUILT),
            "a workspace without a date gives the date of the build",
        );
        assert.equal(
            date({ lastModifiedDate: "yesterday" }),
            modifiedDate(BUILT),
            "a date that does not parse counts as none",
        );
        assert.equal(date({ name: "Bare" }, ""), "Unknown");
        assert.equal(date({ name: "Bare" }, null), "Unknown");
    });

    /* ---------------- the PNG's size */

    test("a PNG is twice the export's size while that stays under the cap", () => {
        assert.deepEqual(pngSize(1200, 900), { width: 2400, height: 1800 });
        assert.deepEqual(pngSize(2048, 2048), { width: 4096, height: 4096 });
    });

    test("a PNG lowers its scale to hold at most 16,777,216 pixels", () => {
        assert.equal(MAX_PIXELS, 16_777_216);
        const sizes = [
            [2049, 2048],
            [4000, 3000],
            [8193, 8191],
            [30_000, 700],
            [12_345, 6789],
            [16_777_217, 1],
        ];
        for (const [width, height] of sizes) {
            const png = pngSize(width, height);
            const label = `${width}x${height}`;
            assert.ok(png.width * png.height <= MAX_PIXELS, label);
            assert.ok(
                png.width * png.height > MAX_PIXELS * 0.99,
                `${label} should lose no more than it has to`,
            );
            assert.ok(
                Math.abs(png.width / png.height - width / height) <
                    (width / height) * 0.01,
                `${label} should keep its shape`,
            );
        }
    });

    test("a PNG is at least one pixel each way", () => {
        const png = pngSize(100_000_000, 1);
        assert.ok(png.width >= 1 && png.height >= 1);
        assert.ok(png.width * png.height <= MAX_PIXELS);
    });
});
