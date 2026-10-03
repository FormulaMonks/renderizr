/**
 * `src/engine/geometry/edge-label.ts` and `line.ts`: what an edge's label
 * says, how big it is, where along its route it sits, and how its line and
 * arrowhead are drawn (spec 10.8, 10.10). Pure geometry, so every check is
 * arithmetic; the island renders what these return.
 */

import assert from "node:assert/strict";
import { describe } from "node:test";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    EDGE_LABEL_PADDING,
    edgeLabelSize,
    edgeLabelText,
    labelPositions,
    placeEdgeLabels,
    TECHNOLOGY_GAP,
} = await importSrc("engine/geometry/edge-label");
const { arrowheadPath, arrowheadSize, endShort, lineDashes } = await importSrc(
    "engine/geometry/line",
);
const { LINE_HEIGHT, METADATA_SCALE } = await importSrc(
    "engine/geometry/label",
);

/** Every glyph half as wide as the font is tall, so widths are predictable. */
const measure = (text, fontSize) => text.length * fontSize * 0.5;

describe("edge labels (edge-label.ts)", () => {
    /* ---------------- content */

    test("a label says the description, then the technology", () => {
        assert.deepEqual(
            edgeLabelText({ description: "Reads from", technology: "[JDBC]" }),
            { description: "Reads from", technology: "[JDBC]" },
        );
    });

    test("in a dynamic view the description is prefixed with the order", () => {
        const cases = [
            [{ description: "Signs in", order: "1" }, "1: Signs in"],
            // Descriptions toggled off, or none: the order still shows.
            [{ description: "", order: "2" }, "2"],
            [{ description: "Static", order: undefined }, "Static"],
        ];
        for (const [input, expected] of cases) {
            assert.equal(
                edgeLabelText({ technology: "", ...input }).description,
                expected,
                `edgeLabelText(${JSON.stringify(input)})`,
            );
        }
    });

    /* ---------------- size */

    test("a label is as wide as its widest line plus padding, and wraps at the style's width", () => {
        // 24 / 2 = 12 per glyph: "Reads from the database" is 23 glyphs, 276
        // wide, so it wraps at 200 into "Reads from the" and "database".
        const size = edgeLabelSize(
            { description: "Reads from the database", technology: "" },
            24,
            200,
            measure,
        );
        assert.deepEqual(size, {
            width: 14 * 12 + 2 * EDGE_LABEL_PADDING,
            height: 2 * 24 * LINE_HEIGHT + 2 * EDGE_LABEL_PADDING,
        });
    });

    test("the technology sits below the description at the metadata size", () => {
        const size = edgeLabelSize(
            { description: "Uses", technology: "[HTTPS]" },
            20,
            200,
            measure,
        );
        assert.equal(
            size.height,
            20 * LINE_HEIGHT +
                TECHNOLOGY_GAP +
                20 * METADATA_SCALE * LINE_HEIGHT +
                2 * EDGE_LABEL_PADDING,
        );
        // "[HTTPS]" at 14 is 49 wide, wider than "Uses" at 20.
        assert.equal(size.width, 7 * 7 + 2 * EDGE_LABEL_PADDING);
    });

    test("descriptions break at a real newline and at the literal \\n, technology never does", () => {
        const size = edgeLabelSize(
            { description: "One\\nTwo\nThree", technology: "[A\\nB]" },
            10,
            1000,
            measure,
        );
        const technologyHeight = 10 * METADATA_SCALE * LINE_HEIGHT;
        assert.equal(
            size.height,
            3 * 10 * LINE_HEIGHT +
                TECHNOLOGY_GAP +
                technologyHeight +
                2 * EDGE_LABEL_PADDING,
            "three description lines and one technology line",
        );
    });

    test("a label with nothing to say has no size", () => {
        assert.equal(
            edgeLabelSize(
                { description: "", technology: "" },
                24,
                200,
                measure,
            ),
            undefined,
        );
    });

    /* ---------------- placement */

    test("label positions step by 5 from the start, alternately later and earlier, within 10 to 90", () => {
        assert.deepEqual(
            labelPositions(50).slice(0, 7),
            [50, 55, 45, 60, 40, 65, 35],
        );
        assert.deepEqual(
            labelPositions(80),
            [
                80, 85, 75, 90, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15,
                10,
            ],
        );
        assert.equal(labelPositions(50).length, 17);
        assert.equal(labelPositions(5)[0], 10, "a start below 10 is clamped");
    });

    /** A straight route from (0,0) to (1000,0): position p sits at x = 10p. */
    const ROUTE = [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
    ];
    const SIZE = { width: 60, height: 20 };

    test("a label is centered on its route at its position", () => {
        const [placed] = placeEdgeLabels(
            [{ route: ROUTE, size: SIZE, position: 50, stored: false }],
            [],
        );
        assert.equal(placed.position, 50);
        assert.deepEqual(placed.box, { x: 470, y: -10, width: 60, height: 20 });
    });

    test("a label moves off an element in its way, trying later then earlier", () => {
        // An element over 450 to 560 rules out 50 and 55 (the label reaches
        // 30 either side); 45 is still on it, and 60 is clear.
        const element = { x: 450, y: -50, width: 110, height: 100 };
        const [placed] = placeEdgeLabels(
            [{ route: ROUTE, size: SIZE, position: 50, stored: false }],
            [element],
        );
        assert.equal(placed.position, 60);
    });

    test("a stored position is never nudged", () => {
        const element = { x: 450, y: -50, width: 110, height: 100 };
        const [placed] = placeEdgeLabels(
            [{ route: ROUTE, size: SIZE, position: 50, stored: true }],
            [element],
        );
        assert.equal(placed.position, 50);
    });

    test("labels are placed in view order, each avoiding those before it", () => {
        const [first, second] = placeEdgeLabels(
            [
                { route: ROUTE, size: SIZE, position: 50, stored: false },
                { route: ROUTE, size: SIZE, position: 50, stored: false },
            ],
            [],
        );
        assert.equal(first.position, 50);
        assert.equal(second.position, 60, "55 still overlaps the first label");
    });

    test("a stored label is still avoided by the labels after it", () => {
        const [, second] = placeEdgeLabels(
            [
                { route: ROUTE, size: SIZE, position: 50, stored: true },
                { route: ROUTE, size: SIZE, position: 50, stored: false },
            ],
            [],
        );
        assert.notEqual(second.position, 50);
    });

    test("with no clear spot, a label stays at its starting position", () => {
        const everything = { x: -100, y: -100, width: 1200, height: 200 };
        const [placed] = placeEdgeLabels(
            [{ route: ROUTE, size: SIZE, position: 30, stored: false }],
            [everything],
        );
        assert.equal(placed.position, 30);
    });

    test("an edge with no label places nothing", () => {
        assert.deepEqual(
            placeEdgeLabels(
                [
                    {
                        route: ROUTE,
                        size: undefined,
                        position: 50,
                        stored: false,
                    },
                ],
                [],
            ),
            [undefined],
        );
    });
});

describe("line styling (line.ts)", () => {
    test("dashes are 4t 4t and dots t 2t; a solid line has none", () => {
        const cases = [
            ["Dashed", 2, "8 8"],
            ["Dotted", 3, "3 6"],
            ["Solid", 2, undefined],
        ];
        for (const [style, thickness, expected] of cases) {
            assert.equal(
                lineDashes(style, thickness),
                expected,
                `lineDashes(${style}, ${thickness})`,
            );
        }
    });

    test("the arrowhead is ten times the thickness, at most 50", () => {
        assert.equal(arrowheadSize(2), 20);
        assert.equal(arrowheadSize(10), 50);
    });

    test("the arrowhead's tip is the route's last point, pointing along its last segment", () => {
        const path = arrowheadPath(
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            2,
        );
        // Tip at (100, 0), base 20 back at x = 80, 20 wide.
        assert.equal(path, "M 100 0 L 80 10 L 80 -10 Z");
    });

    test("the arrowhead follows a vertical last segment", () => {
        const path = arrowheadPath(
            [
                { x: 0, y: 0 },
                { x: 0, y: 50 },
                { x: 0, y: 100 },
            ],
            1,
        );
        assert.equal(path, "M 0 100 L -5 90 L 5 90 Z");
    });

    test("the line ends short of the tip so its width stays inside the arrowhead", () => {
        const cases = [
            [
                "M 0 0 L 100 0",
                [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                ],
                "M 0 0 L 98 0",
            ],
            [
                "M 0 0 C 0 50 100 50 100 100",
                [
                    { x: 0, y: 0 },
                    { x: 100, y: 98 },
                    { x: 100, y: 100 },
                ],
                "M 0 0 C 0 50 100 50 100 98",
            ],
        ];
        for (const [path, route, expected] of cases) {
            assert.equal(endShort(path, route, 2), expected, path);
        }
    });
});
