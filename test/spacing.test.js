/**
 * `src/engine/geometry/spacing.ts`: the room an automatic layout makes for
 * its boundaries after Dagre (spec 7.1, 8). A boundary that comes closer
 * than the gap to a sibling boundary, or to an element it is not drawn
 * around, has everything past a line between them moved by the shortfall.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { spaceBoundaries } = await importSrc("engine/geometry/spacing");
const { boundsOf } = await importSrc("engine/geometry/bounds");

/** The padding the boundaries here keep round their children. */
const PADDING = 10;
const GAP = 50;

const box = (x, y, width = 100, height = 100) => ({ x, y, width, height });

/**
 * A `DeriveBoundaries` for `children` (boundary id → ids directly inside
 * it): the box round the children, `PADDING` out on every side, with no
 * label band.
 */
const deriveFrom = (children) => (placed) => {
    const derived = new Map();
    const derive = (id) => {
        if (derived.has(id)) return derived.get(id);
        const boxes = children[id]
            .map((child) =>
                child in children ? derive(child) : placed.get(child),
            )
            .filter(Boolean);
        const around = boundsOf(boxes);
        const result = around && {
            x: around.x - PADDING,
            y: around.y - PADDING,
            width: around.width + 2 * PADDING,
            height: around.height + 2 * PADDING,
        };
        derived.set(id, result);
        return result;
    };
    for (const id of Object.keys(children)) derive(id);
    return new Map([...derived].filter(([, b]) => b));
};

/** The parent of each child in `children`. */
const parentOf = (children) =>
    new Map(
        Object.entries(children).flatMap(([id, inside]) =>
            inside.map((child) => [child, id]),
        ),
    );

/** Run the pass over `elements` in the boundaries `children` describes. */
const space = (elements, children, extra = {}) =>
    spaceBoundaries({
        elements: new Map(Object.entries(elements)),
        parent: parentOf(children),
        boundaries: deriveFrom(children),
        vertices: new Map(),
        gap: GAP,
        rankAxis: "y",
        ...extra,
    });

const at = (spaced, id) => {
    const { x, y } = spaced.elements.get(id);
    return { x, y };
};

/* ---------------------------------------------------------------- no-op */

test("boundaries already the gap apart leave every element where it is", () => {
    // A ends at 110, B starts at 160: exactly the gap.
    const elements = { a: box(0, 0), b: box(170, 0) };
    const spaced = space(elements, { A: ["a"], B: ["b"] });
    assert.deepEqual(at(spaced, "a"), { x: 0, y: 0 }, "a moved");
    assert.deepEqual(at(spaced, "b"), { x: 170, y: 0 }, "b moved");
});

test("a view with no boundaries is left as it is, overlaps and all", () => {
    const spaced = space({ a: box(0, 0), b: box(50, 50) }, {});
    assert.deepEqual(at(spaced, "b"), { x: 50, y: 50 }, "b moved");
});

/* ---------------------------------------------------------------- moves */

test("a sibling boundary too close is moved away by the shortfall", () => {
    // A ends at 110 and B starts at 130: 30 short of the gap.
    const spaced = space(
        { a: box(0, 0), b: box(140, 0) },
        { A: ["a"], B: ["b"] },
    );
    assert.deepEqual(at(spaced, "a"), { x: 0, y: 0 }, "a moved");
    assert.deepEqual(
        at(spaced, "b"),
        { x: 170, y: 0 },
        "b did not move 30 right",
    );
});

test("two overlapping sibling boundaries end up the gap apart", () => {
    const spaced = space(
        { a: box(0, 0), b: box(105, 0) },
        { A: ["a"], B: ["b"] },
    );
    const boxes = deriveFrom({ A: ["a"], B: ["b"] })(spaced.elements);
    assert.equal(
        boxes.get("B").x - (boxes.get("A").x + boxes.get("A").width),
        GAP,
        "A and B are not the gap apart",
    );
});

test("a boundary too close to an element it is not drawn around moves it", () => {
    // The element sits 20 below the boundary's bottom edge at 110.
    const spaced = space({ a: box(0, 0), e: box(0, 130) }, { A: ["a"] });
    assert.deepEqual(
        at(spaced, "e"),
        { x: 0, y: 160 },
        "e did not move 30 down",
    );
});

test("everything wholly past the line moves, and nothing before it", () => {
    const spaced = space(
        {
            a: box(0, 0),
            b: box(140, 0),
            // Past the line, in no boundary: moves with b.
            far: box(140, 400),
            // Starts before the line: stays.
            near: box(0, 400),
        },
        { A: ["a"], B: ["b"] },
        {
            vertices: new Map([
                [
                    "e",
                    [
                        { x: 50, y: 200 },
                        { x: 200, y: 200 },
                    ],
                ],
            ]),
        },
    );
    assert.deepEqual(at(spaced, "far"), { x: 170, y: 400 }, "far did not move");
    assert.deepEqual(at(spaced, "near"), { x: 0, y: 400 }, "near moved");
    assert.deepEqual(
        spaced.vertices.get("e"),
        [
            { x: 50, y: 200 },
            { x: 230, y: 200 },
        ],
        "only the vertex past the line should move",
    );
});

test("the smaller move wins, whichever axis it is on", () => {
    // B is down and to the right of A: 20 short across, 40 short down.
    const spaced = space(
        { a: box(0, 0), b: box(140, 80) },
        { A: ["a"], B: ["b"] },
    );
    assert.deepEqual(
        at(spaced, "b"),
        { x: 170, y: 80 },
        "b did not move across",
    );
});

test("a tie goes to the rank axis", () => {
    const elements = { a: box(0, 0), b: box(140, 140) };
    const children = { A: ["a"], B: ["b"] };
    assert.deepEqual(
        at(space(elements, children, { rankAxis: "y" }), "b"),
        { x: 140, y: 170 },
        "a top-to-bottom view should move b down",
    );
    assert.deepEqual(
        at(space(elements, children, { rankAxis: "x" }), "b"),
        { x: 170, y: 140 },
        "a left-to-right view should move b across",
    );
});

/* -------------------------------------------------------------- nesting */

test("a boundary is never pushed away from the boundaries round it or inside it", () => {
    const spaced = space(
        { a: box(0, 0), b: box(120, 0) },
        { Outer: ["Inner", "b"], Inner: ["a"] },
    );
    // Inner ends at 110, 10 short of b: b moves 40 and Outer grows round
    // both, which never counts as crowding them.
    assert.deepEqual(at(spaced, "a"), { x: 0, y: 0 }, "a moved");
    assert.deepEqual(
        at(spaced, "b"),
        { x: 160, y: 0 },
        "b did not clear Inner",
    );
});

test("nested boundaries crowding across their parents are spaced at the outermost pair", () => {
    const children = {
        Left: ["L"],
        L: ["l"],
        Right: ["R"],
        R: ["r"],
    };
    const spaced = space({ l: box(0, 0), r: box(130, 0) }, children);
    const boxes = deriveFrom(children)(spaced.elements);
    const gap = (a, b) =>
        boxes.get(b).x - (boxes.get(a).x + boxes.get(a).width);
    assert.equal(gap("Left", "Right"), GAP, "the outer boundaries");
    assert.ok(gap("L", "R") >= GAP, "the inner boundaries crowd");
});

/* ---------------------------------------------------------- termination */

test("a pair no line separates is left as it is, and the pass ends", () => {
    // B's elements sit on either side of e along both axes.
    const spaced = space(
        { b1: box(0, 0), e: box(150, 150), b2: box(300, 300) },
        { B: ["b1", "b2"] },
    );
    assert.deepEqual(at(spaced, "e"), { x: 150, y: 150 }, "e moved");
    assert.deepEqual(at(spaced, "b2"), { x: 300, y: 300 }, "b2 moved");
});

test("a row of crowded boundaries is spaced in one move each, never bringing two elements closer", () => {
    const count = 40;
    const elements = {};
    const children = {};
    for (let i = 0; i < count; i++) {
        elements[`e${i}`] = box(i * 110, 0);
        children[`B${i}`] = [`e${i}`];
    }
    let derived = 0;
    const derive = deriveFrom(children);
    const spaced = space(elements, children, {
        boundaries: (placed) => {
            derived++;
            return derive(placed);
        },
    });
    // Each step leaves 10 between elements; the gap plus both paddings is 70.
    for (let i = 1; i < count; i++)
        assert.equal(
            spaced.elements.get(`e${i}`).x - spaced.elements.get(`e${i - 1}`).x,
            170,
            `e${i - 1} and e${i} are not spaced by the gap`,
        );
    assert.ok(derived <= count, `the pass derived ${derived} times`);
});
