/**
 * `src/engine/geometry/unplaced.ts`: where an unplaced element goes in a
 * stored layout (spec 7.2, ADR 10). Each one tries slots around the
 * elements it relates to, nearest their centroid first, and takes the first
 * that keeps clear of everything else.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { LABEL_CLEARANCE, placeUnplaced, UNPLACED_GAP } = await importSrc(
    "engine/geometry/unplaced",
);
const { layOut } = await importSrc("engine/layout/automatic");
const { WorkspaceModel, resolveView } = await importSrc("model/index");

const BIG_BANK = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/big-bank-plc.json", import.meta.url),
        "utf-8",
    ),
);

const W = 450;
const H = 300;
const SEPARATION = 300;

const box = (x, y, width = W, height = H) => ({ x, y, width, height });

const element = (id, ancestors = []) => ({
    id,
    width: W,
    height: H,
    ancestors,
});

/** Whether `a` and `b` share any area; touching is fine. */
const overlaps = (a, b) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

const NO_BOUNDARIES = () => new Map();

/* ------------------------------------------------------------------ slots */

test("an unplaced element takes the slot one separation below its only neighbor", () => {
    const [placement] = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b")],
        relationships: [["a", "b"]],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    assert.deepEqual(
        placement,
        { id: "b", x: 0, y: H + SEPARATION },
        "b is not one separation below a",
    );
});

test("slots nearest the neighbors' centroid win", () => {
    // a and c sit side by side, two steps apart: the slot right of a is
    // nearer their centroid than the one below either of them.
    const [placement] = placeUnplaced({
        placed: new Map([
            ["a", box(0, 0)],
            ["c", box(2 * (W + SEPARATION), 0)],
        ]),
        unplaced: [element("b")],
        relationships: [
            ["a", "b"],
            ["b", "c"],
        ],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    assert.deepEqual(
        placement,
        { id: "b", x: W + SEPARATION, y: 0 },
        "b is not between a and c",
    );
});

test("a slot closer than 60 to a placed element is skipped", () => {
    // Something sits just below a, so the slot above, as near, wins.
    const [placement] = placeUnplaced({
        placed: new Map([
            ["a", box(0, 0)],
            ["x", box(0, H + SEPARATION + H + UNPLACED_GAP - 1)],
        ]),
        unplaced: [element("b")],
        relationships: [["a", "b"]],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    assert.notDeepEqual(
        { x: placement.x, y: placement.y },
        { x: 0, y: H + SEPARATION },
        "b took the slot crowded by x",
    );
    assert.deepEqual(
        placement,
        { id: "b", x: 0, y: -(H + SEPARATION) },
        "b did not take the slot above a",
    );
});

test("a slot inside a boundary the element does not belong to is skipped", () => {
    const [placement] = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b")],
        relationships: [["a", "b"]],
        separation: SEPARATION,
        boundaries: () =>
            new Map([["other", box(-50, H + 100, W + 100, H + 400)]]),
    });
    assert.deepEqual(
        placement,
        { id: "b", x: 0, y: -(H + SEPARATION) },
        "b went into a boundary it does not belong to",
    );
});

test("slots inside the element's own boundary are preferred", () => {
    // Below a is nearest, but only the slot to its right is inside s.
    const [placement] = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b", ["s"])],
        relationships: [["a", "b"]],
        separation: SEPARATION,
        boundaries: () =>
            new Map([["s", box(-50, -50, 2 * W + SEPARATION + 100, H + 100)]]),
    });
    assert.deepEqual(
        placement,
        { id: "b", x: W + SEPARATION, y: 0 },
        "b did not take the slot inside its own boundary",
    );
});

test("with no free slot, an element goes right of the view's bounding box", () => {
    const [placement] = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b")],
        relationships: [],
        separation: SEPARATION,
        boundaries: () => new Map([["s", box(-100, -100, 1000, 800)]]),
    });
    assert.deepEqual(
        placement,
        { id: "b", x: 900 + SEPARATION, y: -100 },
        "b is not one separation right of the view, level with its top",
    );
});

test("each placement counts as placed for the next", () => {
    const placements = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b"), element("c")],
        relationships: [
            ["a", "b"],
            ["a", "c"],
            ["b", "c"],
        ],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    assert.equal(placements.length, 2, "not every element was placed");
    const [b, c] = placements.map((p) => box(p.x, p.y));
    assert.ok(!overlaps(b, c), "c was put on top of b");
    assert.deepEqual(
        placements[0],
        { id: "b", x: 0, y: H + SEPARATION },
        "b is not one separation below a",
    );
});

/* ----------------------------------------------------------------- labels */

test("a slot below a neighbor leaves room for the label between them", () => {
    const label = { width: 200, height: 400 };
    const [placement] = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b")],
        relationships: [["a", "b", label]],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    assert.deepEqual(
        placement,
        {
            id: "b",
            x: 0,
            y: H + label.height + 2 * LABEL_CLEARANCE,
        },
        "b should sit the label's height plus clearance below a",
    );
});

test("a slot beside a neighbor leaves room for the label's width", () => {
    // Unrelated elements fill the slots above and below a.
    const label = { width: 500, height: 40 };
    const [placement] = placeUnplaced({
        placed: new Map([
            ["a", box(0, 0)],
            ["above", box(0, -H - 100)],
            ["below", box(0, H + 100)],
        ]),
        unplaced: [element("b")],
        relationships: [["a", "b", label]],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    assert.deepEqual(
        placement,
        { id: "b", x: W + label.width + 2 * LABEL_CLEARANCE, y: 0 },
        "b should sit the label's width plus clearance right of a",
    );
});

test("a short label still keeps a slot one separation away", () => {
    const [placement] = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b")],
        relationships: [["a", "b", { width: 10, height: 10 }]],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    assert.deepEqual(
        placement,
        { id: "b", x: 0, y: H + SEPARATION },
        "b should still be one separation below a",
    );
});

test("a slot keeps label room from every related neighbor, not only the one it was found next to", () => {
    // The slot below a is 200 clear of c, which b relates to through a
    // 400-high label: too close, so b goes elsewhere.
    const label = { width: 200, height: 400 };
    const c = box(0, 2 * H + SEPARATION + 200);
    const [placement] = placeUnplaced({
        placed: new Map([
            ["a", box(0, 0)],
            ["c", c],
        ]),
        unplaced: [element("b")],
        relationships: [
            ["a", "b"],
            ["b", "c", label],
        ],
        separation: SEPARATION,
        boundaries: NO_BOUNDARIES,
    });
    const b = box(placement.x, placement.y);
    const room = label.height + 2 * LABEL_CLEARANCE;
    const sideBySide = b.x + b.width <= c.x || c.x + c.width <= b.x;
    assert.ok(
        sideBySide ||
            b.y + b.height + room <= c.y ||
            c.y + c.height + room <= b.y,
        `b at ${JSON.stringify(b)} leaves no room for its label to c`,
    );
});

test("boundaries are derived again from what has been placed so far", () => {
    const seen = [];
    placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b"), element("c")],
        relationships: [
            ["a", "b"],
            ["a", "c"],
        ],
        separation: SEPARATION,
        boundaries: (placed) => {
            seen.push([...placed.keys()].sort());
            return new Map();
        },
    });
    assert.deepEqual(
        seen,
        [["a"], ["a", "b"]],
        "boundaries were not derived again after b was placed",
    );
});

/* ---------------------------------------------- Big Bank plc, leave one out */

/**
 * #35's measurement: four Big Bank views laid out by Dagre (TopBottom,
 * 300/300, 450×300 boxes), then mirrored and jittered like a hand-edited
 * saved layout. Each element is taken out in turn and placed back as if new.
 */
const LEAVE_ONE_OUT = [
    { key: "SystemLandscape", elements: 7 },
    { key: "SystemContext", elements: 4 },
    { key: "Containers", elements: 8 },
    { key: "Components", elements: 11 },
];

/** The same seeded generator #35 used, so the jitter is reproducible. */
const random = (seed) => {
    let state = seed;
    return () => {
        state = (state * 16807) % 2147483647;
        return state / 2147483647;
    };
};

test("Big Bank plc leave-one-out: 30 placements, zero overlaps", () => {
    const model = new WorkspaceModel(BIG_BANK);
    const rnd = random(7);
    let placements = 0;
    const overlapping = [];
    for (const { key, elements } of LEAVE_ONE_OUT) {
        const view = resolveView(model, key);
        const ids = view.elements.map((e) => e.id);
        assert.equal(ids.length, elements, `${key} has ${elements} elements`);
        const relationships = view.relationships
            .map(({ relationship: r }) => [r.sourceId, r.destinationId])
            .filter(([s, t]) => ids.includes(s) && ids.includes(t));
        const { boxes } = layOut(
            {
                nodes: ids.map((id) => ({ id, width: W, height: H })),
                boundaries: [],
                edges: relationships.map(([source, target], i) => ({
                    id: String(i),
                    source,
                    target,
                })),
            },
            {
                rankDirection: "TopBottom",
                rankSeparation: SEPARATION,
                nodeSeparation: SEPARATION,
                edgeSeparation: 0,
                vertices: false,
            },
        );
        const saved = new Map(
            ids.map((id) => {
                const b = boxes.get(id);
                return [
                    id,
                    box(
                        Math.round(-b.x + (rnd() - 0.5) * 300),
                        Math.round(b.y + (rnd() - 0.5) * 200),
                    ),
                ];
            }),
        );
        for (const id of ids) {
            const placed = new Map([...saved].filter(([k]) => k !== id));
            const [placement] = placeUnplaced({
                placed,
                unplaced: [element(id)],
                relationships,
                separation: SEPARATION,
                boundaries: NO_BOUNDARIES,
            });
            placements++;
            const at = box(placement.x, placement.y);
            for (const [other, b] of placed)
                if (overlaps(at, b))
                    overlapping.push(`${key}: ${id} on ${other}`);
        }
    }
    assert.equal(placements, 30, "#35 measured 30 placements");
    assert.deepEqual(overlapping, [], "placements overlap placed elements");
});
