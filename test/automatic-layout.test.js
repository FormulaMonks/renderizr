/**
 * `src/engine/layout/automatic.ts`: Dagre in compound mode behind one
 * function from a compound graph and settings to boxes and edges (spec 7.1,
 * ADR 4).
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { layOut, simplify } = await importSrc("engine/layout/automatic");

const SETTINGS = {
    rankDirection: "TopBottom",
    rankSeparation: 300,
    nodeSeparation: 300,
    edgeSeparation: 0,
    vertices: true,
};

const node = (id, parent) => ({
    id,
    width: 450,
    height: 300,
    ...(parent && { parent }),
});

const center = (box) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
});

const overlaps = (a, b) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

/* ------------------------------------------------------------ rank direction */

const DIRECTIONS = [
    // [rankDirection, which axis the ranks advance along, and which way]
    ["TopBottom", "y", 1],
    ["BottomTop", "y", -1],
    ["LeftRight", "x", 1],
    ["RightLeft", "x", -1],
];

for (const [rankDirection, axis, sign] of DIRECTIONS) {
    test(`rankDirection ${rankDirection} puts a target one rank along ${sign > 0 ? "+" : "-"}${axis}`, () => {
        const { boxes } = layOut(
            {
                nodes: [node("a"), node("b")],
                clusters: [],
                edges: [{ id: "ab", source: "a", target: "b" }],
            },
            { ...SETTINGS, rankDirection },
        );
        const a = center(boxes.get("a"));
        const b = center(boxes.get("b"));
        assert.ok(
            sign * (b[axis] - a[axis]) > 0,
            `b should follow a along ${axis}: ${JSON.stringify({ a, b })}`,
        );
    });
}

/* ---------------------------------------------------------------- separations */

test("rankSeparation is the gap between two ranks", () => {
    for (const rankSeparation of [100, 400]) {
        const { boxes } = layOut(
            {
                nodes: [node("a"), node("b")],
                clusters: [],
                edges: [{ id: "ab", source: "a", target: "b" }],
            },
            { ...SETTINGS, rankSeparation },
        );
        const a = boxes.get("a");
        const b = boxes.get("b");
        assert.equal(b.y - (a.y + a.height), rankSeparation);
    }
});

test("nodeSeparation is the gap between two elements of one rank", () => {
    for (const nodeSeparation of [50, 250]) {
        const { boxes } = layOut(
            {
                nodes: [node("a"), node("b")],
                clusters: [],
                edges: [],
            },
            { ...SETTINGS, nodeSeparation },
        );
        const [left, right] = [boxes.get("a"), boxes.get("b")].sort(
            (p, q) => p.x - q.x,
        );
        assert.equal(right.x - (left.x + left.width), nodeSeparation);
    }
});

test("edgeSeparation reaches Dagre as edgesep", () => {
    // Two long edges side by side: their dummy nodes sit edgesep apart, so a
    // wider edgesep spreads their vertices further.
    const graph = {
        nodes: [node("a"), node("b"), node("c"), node("d"), node("e")],
        clusters: [],
        edges: [
            { id: "ab", source: "a", target: "b" },
            { id: "bc", source: "b", target: "c" },
            { id: "ac", source: "a", target: "c" },
            { id: "ad", source: "a", target: "d" },
            { id: "dc", source: "d", target: "c" },
            { id: "ae", source: "a", target: "e" },
            { id: "ec", source: "e", target: "c" },
        ],
    };
    const spread = (edgeSeparation) => {
        const { boxes } = layOut(graph, {
            ...SETTINGS,
            nodeSeparation: 0,
            edgeSeparation,
        });
        const xs = [...boxes.values()].map((b) => b.x);
        return Math.max(...xs) - Math.min(...xs);
    };
    assert.ok(
        spread(400) > spread(0),
        "a wider edgeSeparation should spread the layout",
    );
});

/* ------------------------------------------------------------------- boxes */

test("boxes are top-left corners at each element's own size", () => {
    const { boxes } = layOut(
        {
            nodes: [
                { id: "a", width: 400, height: 400 },
                { id: "b", width: 450, height: 300 },
            ],
            clusters: [],
            edges: [{ id: "ab", source: "a", target: "b" }],
        },
        SETTINGS,
    );
    assert.deepEqual(boxes.get("a"), { x: 25, y: 0, width: 400, height: 400 });
    assert.deepEqual(boxes.get("b"), {
        x: 0,
        y: 700,
        width: 450,
        height: 300,
    });
});

test("only elements get boxes; a cluster's box is Dagre's to discard", () => {
    const { boxes } = layOut(
        {
            nodes: [node("a", "s"), node("b", "s"), node("c")],
            clusters: [{ id: "s" }],
            edges: [
                { id: "ab", source: "a", target: "b" },
                { id: "cb", source: "c", target: "b" },
            ],
        },
        SETTINGS,
    );
    assert.deepEqual([...boxes.keys()].sort(), ["a", "b", "c"]);
});

test("elements of one cluster are kept together, apart from the rest", () => {
    // c sits between a and b by rank, but belongs outside their cluster.
    const { boxes } = layOut(
        {
            nodes: [node("a", "inner"), node("b", "inner"), node("c")],
            clusters: [{ id: "outer" }, { id: "inner", parent: "outer" }],
            edges: [
                { id: "ac", source: "a", target: "c" },
                { id: "cb", source: "c", target: "b" },
            ],
        },
        SETTINGS,
    );
    for (const [p, q] of [
        ["a", "b"],
        ["a", "c"],
        ["b", "c"],
    ])
        assert.ok(
            !overlaps(boxes.get(p), boxes.get(q)),
            `${p} and ${q} overlap`,
        );
    const around = (ids) => {
        const bs = ids.map((id) => boxes.get(id));
        return {
            left: Math.min(...bs.map((b) => b.x)),
            right: Math.max(...bs.map((b) => b.x + b.width)),
            top: Math.min(...bs.map((b) => b.y)),
            bottom: Math.max(...bs.map((b) => b.y + b.height)),
        };
    };
    const cluster = around(["a", "b"]);
    const c = boxes.get("c");
    const inside =
        c.x >= cluster.left &&
        c.x + c.width <= cluster.right &&
        c.y >= cluster.top &&
        c.y + c.height <= cluster.bottom;
    assert.ok(!inside, "c was laid out inside a and b's cluster");
});

/* ------------------------------------------------------------------- edges */

test("an edge that ends at a cluster is left out instead of breaking Dagre", () => {
    const { boxes, edges } = layOut(
        {
            nodes: [node("a", "s"), node("b")],
            clusters: [{ id: "s" }],
            edges: [
                { id: "sb", source: "s", target: "b" },
                { id: "ab", source: "a", target: "b" },
            ],
        },
        SETTINGS,
    );
    assert.equal(boxes.size, 2);
    assert.deepEqual([...edges.keys()], ["ab"]);
});

test("vertices: true keeps Dagre's bends, without the end points", () => {
    // a → c skips a rank, so Dagre bends it around b.
    const graph = {
        nodes: [node("a"), node("b"), node("c")],
        clusters: [],
        edges: [
            { id: "ab", source: "a", target: "b" },
            { id: "bc", source: "b", target: "c" },
            { id: "ac", source: "a", target: "c" },
        ],
    };
    const kept = layOut(graph, { ...SETTINGS, vertices: true });
    const dropped = layOut(graph, { ...SETTINGS, vertices: false });

    assert.ok(
        kept.edges.get("ac").length > 0,
        "the long edge should keep a bend",
    );
    for (const point of kept.edges.get("ac")) {
        const a = kept.boxes.get("a");
        const c = kept.boxes.get("c");
        assert.ok(
            point.y > a.y + a.height && point.y < c.y,
            `vertex ${JSON.stringify(point)} is not between the ends`,
        );
    }
    const straight = layOut(
        {
            nodes: [node("a"), node("b")],
            clusters: [],
            edges: [{ id: "ab", source: "a", target: "b" }],
        },
        SETTINGS,
    );
    assert.deepEqual(
        straight.edges.get("ab"),
        [],
        "a straight edge keeps Dagre's midpoint as a bend",
    );
    for (const [id, vertices] of dropped.edges)
        assert.deepEqual(vertices, [], `${id} kept vertices`);
});

test("edges in a multigraph keep one entry each", () => {
    const { edges } = layOut(
        {
            nodes: [node("a"), node("b")],
            clusters: [],
            edges: [
                { id: "1", source: "a", target: "b" },
                { id: "2", source: "a", target: "b" },
                { id: "3", source: "b", target: "a" },
            ],
        },
        SETTINGS,
    );
    assert.deepEqual([...edges.keys()], ["1", "2", "3"]);
});

/* ---------------------------------------------------------------- simplify */

const SIMPLIFY = [
    {
        name: "a point on the line between its neighbors is dropped",
        points: [
            { x: 0, y: 0 },
            { x: 5, y: 5 },
            { x: 10, y: 10 },
        ],
        expected: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
        ],
    },
    {
        name: "a point off the line by more than 0.001 stays",
        points: [
            { x: 0, y: 0 },
            { x: 5, y: 0.01 },
            { x: 10, y: 0 },
        ],
        expected: [
            { x: 0, y: 0 },
            { x: 5, y: 0.01 },
            { x: 10, y: 0 },
        ],
    },
    {
        name: "two points stay as they are",
        points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ],
        expected: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ],
    },
];

for (const { name, points, expected } of SIMPLIFY)
    test(`simplify: ${name}`, () => {
        assert.deepEqual(simplify(points, 0.001), expected);
    });
