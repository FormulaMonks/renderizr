/**
 * Arranging a selection in edit mode (spec 13): align, distribute and
 * nudge as pure geometry, and the one layout change each makes, with the
 * vertices of relationships whose two ends move alike.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { ALIGN_MINIMUM, DISTRIBUTE_MINIMUM, align, distribute, nudge } =
    await importSrc("engine/geometry/arrange");
const { arrangeChange, moveChange } = await importSrc(
    "engine/react-flow/arrange",
);

const box = (id, x, y, width = 100, height = 50) => ({
    id,
    x,
    y,
    width,
    height,
});

/** The new top-left of each element `positions` moves, as a plain object. */
const moved = (positions) => Object.fromEntries(positions);

/* ------------------------------------------------------------------ align */

// The reference element first, then two others of other sizes.
const SELECTION = [
    box("ref", 100, 100, 100, 50),
    box("b", 300, 220, 80, 40),
    box("c", 50, 400, 120, 60),
];

const ALIGNMENTS = [
    // Left edges on the leftmost, c's, at x = 50.
    ["left", { ref: { x: 50, y: 100 }, b: { x: 50, y: 220 } }],
    // Centers on the reference's, at x = 150.
    ["center", { b: { x: 110, y: 220 }, c: { x: 90, y: 400 } }],
    // Right edges on the rightmost, b's, at x = 380.
    ["right", { ref: { x: 280, y: 100 }, c: { x: 260, y: 400 } }],
    // Top edges on the topmost, the reference's, at y = 100.
    ["top", { b: { x: 300, y: 100 }, c: { x: 50, y: 100 } }],
    // Middles on the reference's, at y = 125.
    ["middle", { b: { x: 300, y: 105 }, c: { x: 50, y: 95 } }],
    // Bottom edges on the bottommost, c's, at y = 460.
    ["bottom", { ref: { x: 100, y: 410 }, b: { x: 300, y: 420 } }],
];

for (const [edge, expected] of ALIGNMENTS)
    test(`align ${edge} lines the selection up as spec 13.1 asks`, () => {
        assert.deepEqual(moved(align(SELECTION, edge)), expected);
    });

test("align left, right, top and bottom go by the outermost element, whichever is the reference", () => {
    const reversed = [...SELECTION].reverse();
    for (const edge of ["left", "right", "top", "bottom"])
        assert.deepEqual(
            moved(align(reversed, edge)),
            moved(align(SELECTION, edge)),
            edge,
        );
});

test("align leaves the elements already in line where they are", () => {
    const positions = align(
        [box("ref", 100, 100), box("same", 100, 300), box("off", 140, 500)],
        "left",
    );
    assert.deepEqual(moved(positions), { off: { x: 100, y: 500 } });
});

test("align needs two or more elements", () => {
    assert.equal(ALIGN_MINIMUM, 2);
    assert.equal(align([box("ref", 10, 10)], "left").size, 0);
    assert.equal(align([], "top").size, 0);
});

test("align keeps whole units when a center falls between them", () => {
    const positions = align(
        [box("ref", 0, 0, 101, 51), box("b", 300, 300, 50, 20)],
        "center",
    );
    assert.deepEqual(moved(positions), { b: { x: 26, y: 300 } });
});

/* ------------------------------------------------------------- distribute */

test("distribute horizontally keeps the outermost two in place and equalizes the gaps edge to edge", () => {
    // Left to right: a (0-100), b (150-200), d (260-300), c (400-500). The
    // widths add up to 290 of the 500 spanned, so each of the 3 gaps is 70.
    const positions = distribute(
        [
            box("b", 150, 0, 50),
            box("a", 0, 40, 100),
            box("c", 400, 80, 100),
            box("d", 260, 120, 40),
        ],
        "horizontal",
    );
    assert.deepEqual(moved(positions), {
        b: { x: 170, y: 0 },
        d: { x: 290, y: 120 },
    });
});

test("distribute vertically equalizes the gaps from top to bottom", () => {
    const positions = distribute(
        [
            box("a", 0, 0, 100, 50),
            box("b", 50, 60, 100, 30),
            box("c", 100, 300, 100, 50),
        ],
        "vertical",
    );
    // 350 spanned, 130 tall in all: two gaps of 110.
    assert.deepEqual(moved(positions), { b: { x: 50, y: 160 } });
});

test("distribute puts elements on whole units", () => {
    const positions = distribute(
        [
            box("a", 0, 0, 10),
            box("b", 20, 0, 10),
            box("c", 25, 0, 10),
            box("d", 100, 0, 10),
        ],
        "horizontal",
    );
    // 110 spanned, 40 wide in all: gaps of 23.33.
    assert.deepEqual(moved(positions), {
        b: { x: 33, y: 0 },
        c: { x: 67, y: 0 },
    });
});

test("distribute needs three or more elements", () => {
    assert.equal(DISTRIBUTE_MINIMUM, 3);
    assert.equal(
        distribute([box("a", 0, 0), box("b", 500, 0)], "horizontal").size,
        0,
    );
});

test("distribute breaks a tie on position by selection order", () => {
    const positions = distribute(
        [box("a", 0, 0, 10), box("b", 0, 0, 10), box("c", 100, 0, 10)],
        "horizontal",
    );
    // a stays first, so b takes the middle: (110 - 30) / 2 = 40 apart.
    assert.deepEqual(moved(positions), { b: { x: 50, y: 0 } });
});

/* ------------------------------------------------------------------ nudge */

test("nudge moves every element of the selection by the step, with no snapping", () => {
    const positions = nudge([box("a", 3, 7), box("b", 100, 200)], {
        x: 5,
        y: 0,
    });
    assert.deepEqual(moved(positions), {
        a: { x: 8, y: 7 },
        b: { x: 105, y: 200 },
    });
});

/* ----------------------------------------------------- one layout change */

/** A graph as `moveChange` reads it: elements, edges and the canvas. */
const graph = (elements, edges = []) => ({
    layout: "stored",
    canvas: { width: 2000, height: 2000 },
    elements,
    edges,
});

const edge = (key, sourceId, targetId, vertices) => ({
    key,
    id: key.split("#")[0],
    sourceId,
    targetId,
    vertices,
});

/** An edited layout that places every element of `elements`. */
const placed = (elements) => ({
    elements: Object.fromEntries(
        elements.map(({ id, x, y }) => [id, { x, y }]),
    ),
});

test("a move takes along the vertices of relationships whose two ends move alike, and leaves the rest", () => {
    const elements = [box("a", 0, 0), box("b", 300, 0), box("c", 600, 0)];
    const edges = [
        edge("ab", "a", "b", [{ x: 200, y: 100 }]),
        edge("bc", "b", "c", [{ x: 450, y: 100 }]),
        edge("ca", "c", "a", []),
    ];
    const change = moveChange(
        "View",
        graph(elements, edges),
        placed(elements),
        new Map([
            ["a", { x: 10, y: 50 }],
            ["b", { x: 310, y: 50 }],
        ]),
    );
    assert.deepEqual(change, {
        view: "View",
        before: {
            elements: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } },
            relationships: { ab: { vertices: [{ x: 200, y: 100 }] } },
        },
        after: {
            elements: { a: { x: 10, y: 50 }, b: { x: 310, y: 50 } },
            relationships: { ab: { vertices: [{ x: 210, y: 150 }] } },
        },
    });
});

test("a move whose ends go different ways leaves the vertices where they are", () => {
    const elements = [box("a", 0, 0), box("b", 300, 0)];
    const change = moveChange(
        "View",
        graph(elements, [edge("ab", "a", "b", [{ x: 200, y: 100 }])]),
        placed(elements),
        new Map([
            ["a", { x: 0, y: 50 }],
            ["b", { x: 300, y: 60 }],
        ]),
    );
    assert.equal(change.after.relationships, undefined);
});

test("a move never lands an element on (0,0)", () => {
    const elements = [box("a", 5, 0), box("b", 300, 0)];
    const change = moveChange(
        "View",
        graph(elements),
        placed(elements),
        new Map([["a", { x: 0, y: 0 }]]),
    );
    // (5,0) is where it already was, so nothing moved.
    assert.equal(change, null);
});

test("the first move of a view carries every element and the canvas", () => {
    const elements = [box("a", 0, 0), box("b", 300, 0)];
    const change = moveChange(
        "View",
        graph(elements),
        undefined,
        new Map([["b", { x: 350, y: 0 }]]),
    );
    assert.deepEqual(Object.keys(change.after.elements).sort(), ["a", "b"]);
    assert.deepEqual(change.after.elements.a, { x: 5, y: 0 });
    assert.deepEqual(change.after.dimensions, { width: 2000, height: 2000 });
});

test("an arranging command measures the selection as drawn, the reference element first, and is one change", () => {
    const elements = [
        box("a", 100, 100),
        box("b", 300, 260),
        box("c", 40, 500),
    ];
    const view = graph(elements, [edge("bc", "b", "c", [{ x: 200, y: 400 }])]);
    const edited = placed(elements);

    const aligned = arrangeChange("View", view, edited, ["b", "a", "c"], {
        align: "center",
    });
    assert.deepEqual(aligned.after.elements, {
        a: { x: 300, y: 100 },
        c: { x: 300, y: 500 },
    });

    const nudged = arrangeChange("View", view, edited, ["b", "c"], {
        nudge: { x: 0, y: 50 },
    });
    assert.deepEqual(nudged.after, {
        elements: { b: { x: 300, y: 310 }, c: { x: 40, y: 550 } },
        relationships: { bc: { vertices: [{ x: 200, y: 450 }] } },
    });

    assert.equal(
        arrangeChange("View", view, edited, ["a"], { align: "top" }),
        null,
        "align moved a lone element",
    );
    assert.equal(
        arrangeChange("View", view, edited, ["a", "b"], {
            distribute: "horizontal",
        }),
        null,
        "distribute moved two elements",
    );
});

test("a move that changes nothing is no change", () => {
    const elements = [box("a", 10, 10), box("b", 300, 0)];
    assert.equal(
        moveChange("View", graph(elements), placed(elements), new Map()),
        null,
    );
});
