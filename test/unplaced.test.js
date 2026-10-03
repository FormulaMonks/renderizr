/**
 * `src/engine/geometry/unplaced.ts`: where an unplaced element goes in a
 * stored layout (spec 7.2, ADR 10). Each one tries slots around the
 * elements it relates to, nearest their centroid first, and takes the first
 * that keeps clear of everything else.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { placeUnplaced, UNPLACED_GAP } = await importSrc(
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
    assert.deepEqual(placement, { id: "b", x: 0, y: H + SEPARATION });
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
    assert.deepEqual(placement, { id: "b", x: W + SEPARATION, y: 0 });
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
    );
    assert.deepEqual(placement, { id: "b", x: 0, y: -(H + SEPARATION) });
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
    assert.deepEqual(placement, { id: "b", x: 0, y: -(H + SEPARATION) });
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
    assert.deepEqual(placement, { id: "b", x: W + SEPARATION, y: 0 });
});

test("with no free slot, an element goes right of the view's bounding box", () => {
    const [placement] = placeUnplaced({
        placed: new Map([["a", box(0, 0)]]),
        unplaced: [element("b")],
        relationships: [],
        separation: SEPARATION,
        boundaries: () => new Map([["s", box(-100, -100, 1000, 800)]]),
    });
    assert.deepEqual(placement, { id: "b", x: 900 + SEPARATION, y: -100 });
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
    assert.equal(placements.length, 2);
    const [b, c] = placements.map((p) => box(p.x, p.y));
    assert.ok(!overlaps(b, c), "c was put on top of b");
    assert.deepEqual(placements[0], { id: "b", x: 0, y: H + SEPARATION });
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
    assert.deepEqual(seen, [["a"], ["a", "b"]]);
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
                clusters: [],
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
    assert.equal(placements, 30);
    assert.deepEqual(overlapping, [], "placements overlap placed elements");
});
