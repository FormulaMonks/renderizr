/**
 * `src/engine/react-flow/hover.ts`: which element is under the pointer, the
 * edges it highlights, and the order they draw in. The island draws the halo; the
 * engine itself is exercised in Chrome by `test/e2e.test.js`.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { elementAt, hoverEdges, touches } = await importSrc(
    "engine/react-flow/hover",
);

const edges = [
    { key: "1", sourceId: "a", targetId: "b" },
    { key: "2", sourceId: "b", targetId: "c" },
    { key: "3", sourceId: "c", targetId: "a" },
    { key: "4", sourceId: "c", targetId: "d" },
];

test("an edge touches the elements at both its ends and no other", () => {
    assert.ok(touches(edges[0], "a"), "its source");
    assert.ok(touches(edges[0], "b"), "its target");
    assert.ok(!touches(edges[0], "c"), "another element");
    assert.ok(!touches(edges[0], undefined), "nothing hovered");
});

test("a hovered element highlights its outgoing and incoming edges and draws them last", () => {
    const hovered = hoverEdges(edges, "a");
    assert.deepEqual(
        hovered.map(({ edge, highlighted }) => [edge.key, highlighted]),
        [
            ["2", false],
            ["4", false],
            ["1", true],
            ["3", true],
        ],
    );
});

test("with nothing hovered, every edge keeps its order and none is highlighted", () => {
    assert.deepEqual(
        hoverEdges(edges, undefined).map(({ edge, highlighted }) => [
            edge.key,
            highlighted,
        ]),
        edges.map((edge) => [edge.key, false]),
    );
});

test("a self-relationship highlights once", () => {
    const loop = [{ key: "5", sourceId: "a", targetId: "a" }];
    assert.deepEqual(
        hoverEdges(loop, "a").map(({ highlighted }) => highlighted),
        [true],
    );
});

test("the element under the pointer is the one whose box holds it, the topmost when boxes overlap", () => {
    const boxes = [
        { id: "back", x: 0, y: 0, width: 100, height: 100 },
        { id: "front", x: 50, y: 50, width: 100, height: 100 },
    ];
    assert.equal(elementAt(boxes, { x: 10, y: 10 }), "back");
    assert.equal(elementAt(boxes, { x: 75, y: 75 }), "front", "the overlap");
    assert.equal(elementAt(boxes, { x: 150, y: 150 }), "front", "an edge");
    assert.equal(elementAt(boxes, { x: 200, y: 10 }), undefined, "no box");
});
