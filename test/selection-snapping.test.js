/**
 * Selection and snapping in edit mode (spec 10.2, 11): the order a click,
 * a modifier-click and a marquee leave the selection in, and where a moving
 * box comes to rest, with the alignment guides it draws.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { GUIDE_REACH, guideReach, snapBox } = await importSrc(
    "engine/geometry/snapping",
);
const { clickSelection, insideMarquee, marqueeSelection } = await importSrc(
    "engine/react-flow/selection",
);

const box = (x, y, width = 100, height = 50) => ({ x, y, width, height });

/* ---------------------------------------------------------------- snapping */

test("a box within reach of another's left edge snaps to it and draws a vertical guide", () => {
    const { offset, guides } = snapBox(box(203, 302), [box(200, 0)], 8);
    assert.deepEqual(offset, { x: -3, y: -2 });
    assert.deepEqual(guides, [
        { from: { x: 200, y: 0 }, to: { x: 200, y: 350 } },
    ]);
});

const ALIGNMENTS = [
    ["left to right", box(296, 300), 300, 4],
    ["center to center", box(233, 300, 40), 250, -3],
    ["right to left", box(95, 300), 200, 5],
    ["right to right", box(262, 300, 40), 300, -2],
];

for (const [name, moving, at, dx] of ALIGNMENTS)
    test(`a box snaps ${name} on the x axis`, () => {
        const { offset, guides } = snapBox(moving, [box(200, 0)], 8);
        assert.equal(offset.x, dx, `the box moved by ${offset.x}`);
        assert.equal(guides[0]?.from.x, at, "the guide is off the line");
    });

test("a box snaps top, middle or bottom on the y axis and draws a horizontal guide", () => {
    const { offset, guides } = snapBox(box(400, 123), [box(0, 100)], 8);
    // Its top (123) is 2 short of the other's middle (125).
    assert.deepEqual(offset, { x: 0, y: 2 });
    assert.deepEqual(guides, [
        { from: { x: 0, y: 125 }, to: { x: 500, y: 125 } },
    ]);
});

test("out of reach a box snaps to the 5-unit grid and draws no guide", () => {
    const { offset, guides } = snapBox(box(212, 318), [box(0, 0)], 8);
    assert.deepEqual(offset, { x: -2, y: 2 });
    assert.deepEqual(guides, []);
});

test("each axis snaps on its own: one to a guide, the other to the grid", () => {
    const { offset, guides } = snapBox(box(203, 512), [box(200, 0)], 8);
    assert.deepEqual(offset, { x: -3, y: -2 });
    assert.equal(guides.length, 1);
    assert.equal(guides[0].from.x, guides[0].to.x, "the guide isn't vertical");
});

test("the nearest line wins when several are within reach", () => {
    const { offset } = snapBox(box(205, 300), [box(199, 0), box(204, 600)], 8);
    assert.equal(offset.x, -1);
});

test("a guide spans every box aligned on its line", () => {
    const { guides } = snapBox(
        box(202, 300),
        [box(200, 0), box(200, 900, 40, 40)],
        8,
    );
    assert.deepEqual(guides, [
        { from: { x: 200, y: 0 }, to: { x: 200, y: 940 } },
    ]);
});

test("reach is 8 screen pixels in model units at the current zoom", () => {
    assert.equal(GUIDE_REACH, 8);
    assert.equal(guideReach(1), 8);
    assert.equal(guideReach(0.5), 16);
    assert.equal(guideReach(2), 4);
    // 10 units off is out of reach at zoom 1 and within it at zoom 0.5.
    assert.deepEqual(snapBox(box(210, 312), [box(200, 0)], 8).guides, []);
    assert.equal(
        snapBox(box(210, 312), [box(200, 0)], guideReach(0.5)).offset.x,
        -10,
    );
});

/* --------------------------------------------------------------- selection */

test("a click selects an element alone", () => {
    assert.deepEqual(clickSelection(["a", "b"], "c", false), ["c"]);
    assert.deepEqual(clickSelection([], "c", false), ["c"]);
});

test("a click on a selected element keeps the selection and its order", () => {
    const selection = ["a", "b"];
    assert.equal(clickSelection(selection, "b", false), selection);
});

test("a modifier-click adds an element at the end or takes it out", () => {
    assert.deepEqual(clickSelection(["a", "b"], "c", true), ["a", "b", "c"]);
    assert.deepEqual(clickSelection(["a", "b", "c"], "a", true), ["b", "c"]);
});

const ELEMENTS = [
    { id: "far", ...box(400, 400) },
    { id: "near", ...box(110, 120) },
    { id: "middle", ...box(250, 260) },
    { id: "outside", ...box(480, 100) },
];

test("a marquee takes the elements wholly inside it", () => {
    const rect = box(100, 100, 450, 400);
    assert.deepEqual(
        insideMarquee(ELEMENTS, rect)
            .map((e) => e.id)
            .sort(),
        ["far", "middle", "near"],
    );
});

test("after a marquee the element nearest its starting corner comes first", () => {
    const rect = box(100, 100, 450, 400);
    const corner = { x: 100, y: 100 };
    assert.deepEqual(marqueeSelection([], ELEMENTS, rect, corner), [
        "near",
        "middle",
        "far",
    ]);
    // Drawn from the bottom-right corner instead.
    assert.deepEqual(marqueeSelection([], ELEMENTS, rect, { x: 550, y: 500 }), [
        "far",
        "middle",
        "near",
    ]);
});

test("a marquee drawn with a modifier adds to the selection, keeping its reference element", () => {
    const rect = box(100, 100, 300, 300);
    assert.deepEqual(
        marqueeSelection(["outside", "middle"], ELEMENTS, rect, {
            x: 100,
            y: 100,
        }),
        ["outside", "middle", "near"],
    );
});
