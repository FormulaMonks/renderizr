/**
 * Editing edges (spec 12, ADR 19): where a double-click puts a vertex, where
 * a dragged label lands along its route, which side an edge-end drag picks
 * and the vertex that holds it, and the layout changes each gesture makes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    holdsSide,
    labelPositionAt,
    nearestSide,
    SIDE_OFFSET,
    sideVertex,
    vertexIndex,
} = await importSrc("engine/geometry/edge-editing");
const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { dragLayout, dropChange } = await importSrc("engine/react-flow/drag");
const { routeChange, sideChange, withVertex } = await importSrc(
    "engine/react-flow/edge-edits",
);

const read = (name) =>
    JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}`, import.meta.url),
            "utf-8",
        ),
    );
const STORED = read("big-bank-plc-stored.json");
const LABELS = { descriptions: true, technologies: true };

const graphOf = (workspace, key, edited) =>
    buildGraph(
        new WorkspaceModel(workspace),
        key,
        "light",
        LABELS,
        undefined,
        edited,
    );

/* ------------------------------------------------------------- vertices */

test("a double-click adds its vertex between the two points of the leg it splits", () => {
    // Source end, two vertices, target end: three legs.
    const route = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 200, y: 100 },
    ];
    const vertices = [route[1], route[2]];
    assert.equal(vertexIndex(route, vertices, { x: 40, y: 3 }), 0);
    assert.equal(vertexIndex(route, vertices, { x: 97, y: 60 }), 1);
    assert.equal(vertexIndex(route, vertices, { x: 150, y: 104 }), 2);
    assert.equal(vertexIndex(route, [], { x: 150, y: 104 }), 0);
});

test("a leg of an Orthogonal route still counts its own bends as one leg", () => {
    // One vertex at (100, 100); the router added a bend at (50, 0) and (50, 100).
    const route = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 200 },
    ];
    const vertices = [{ x: 100, y: 100 }];
    assert.equal(vertexIndex(route, vertices, { x: 52, y: 40 }), 0);
    assert.equal(vertexIndex(route, vertices, { x: 98, y: 150 }), 1);
});

/* --------------------------------------------------------------- labels */

test("a dragged label lands at the whole percent of the route's length from the source end", () => {
    const route = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ];
    assert.equal(labelPositionAt(route, { x: 50, y: 30 }), 25);
    assert.equal(labelPositionAt(route, { x: 140, y: 33.4 }), 67);
    assert.equal(labelPositionAt(route, { x: -80, y: 10 }), 0);
    assert.equal(labelPositionAt(route, { x: 100, y: 400 }), 100);
});

/* ---------------------------------------------------------------- sides */

const BOX = { x: 100, y: 100, width: 200, height: 100 };

test("an edge-end drag picks the side of its element nearest the pointer", () => {
    assert.equal(nearestSide(BOX, { x: 150, y: 60 }), "top");
    assert.equal(nearestSide(BOX, { x: 330, y: 190 }), "right");
    assert.equal(nearestSide(BOX, { x: 290, y: 240 }), "bottom");
    assert.equal(nearestSide(BOX, { x: 110, y: 120 }), "left");
});

test("the vertex that holds a side sits 20 units straight out, at the pointer's place along it on the grid", () => {
    assert.equal(SIDE_OFFSET, 20);
    assert.deepEqual(sideVertex(BOX, "top", { x: 152, y: 40 }, 8), {
        x: 150,
        y: 80,
    });
    assert.deepEqual(sideVertex(BOX, "right", { x: 380, y: 123 }, 8), {
        x: 320,
        y: 125,
    });
    assert.deepEqual(sideVertex(BOX, "bottom", { x: 263, y: 300 }, 8), {
        x: 265,
        y: 220,
    });
    assert.deepEqual(sideVertex(BOX, "left", { x: 0, y: 177 }, 8), {
        x: 80,
        y: 175,
    });
});

test("the vertex snaps to the side's middle within reach", () => {
    assert.deepEqual(sideVertex(BOX, "top", { x: 207, y: 40 }, 8), {
        x: 200,
        y: 80,
    });
    assert.deepEqual(sideVertex(BOX, "left", { x: 60, y: 146 }, 8), {
        x: 80,
        y: 150,
    });
    assert.deepEqual(sideVertex(BOX, "top", { x: 212, y: 40 }, 8), {
        x: 210,
        y: 80,
    });
});

test("the vertex stays out of the side's outer 10%, after snapping", () => {
    // 10% of a 200-wide side is 20; of a 100-high side, 10.
    assert.deepEqual(sideVertex(BOX, "top", { x: 90, y: 40 }, 8), {
        x: 120,
        y: 80,
    });
    assert.deepEqual(sideVertex(BOX, "top", { x: 299, y: 40 }, 8), {
        x: 280,
        y: 80,
    });
    const odd = { x: 3, y: 0, width: 101, height: 33 };
    const { y } = sideVertex(odd, "right", { x: 200, y: 31 }, 8);
    assert.ok(y <= 0.9 * 33, `${y} is in the outer 10%`);
});

test("a vertex holds a side while it sits exactly 20 units out from it, within its length", () => {
    assert.ok(holdsSide(BOX, { x: 150, y: 80 }));
    assert.ok(holdsSide(BOX, { x: 320, y: 125 }));
    assert.ok(holdsSide(BOX, { x: 265, y: 220 }));
    assert.ok(holdsSide(BOX, { x: 80, y: 175 }));
    assert.ok(!holdsSide(BOX, { x: 150, y: 79 }), "21 units out");
    assert.ok(!holdsSide(BOX, { x: 400, y: 80 }), "past the side's end");
});

/* -------------------------------------------------------------- changes */

/** The first edge of Big Bank's Containers view between two elements. */
const containers = (edited) => graphOf(STORED, "Containers", edited);

test("a route change carries the fields it sets, as drawn before, and every element on a view's first change", () => {
    const graph = containers();
    const edge = graph.edges[0];
    const change = routeChange("Containers", graph, undefined, edge.key, {
        routing: "Curved",
        position: 30,
    });
    assert.deepEqual(change.after.relationships, {
        [edge.key]: { routing: "Curved", position: 30 },
    });
    assert.deepEqual(change.before.relationships, {
        [edge.key]: { routing: edge.routing, position: edge.labelPosition },
    });
    assert.equal(
        Object.keys(change.after.elements).length,
        graph.elements.length,
        "the first change stores every element",
    );
    assert.deepEqual(change.after.dimensions, graph.canvas);

    const placed = {
        elements: Object.fromEntries(
            graph.elements.map(({ id, x, y }) => [id, { x, y }]),
        ),
    };
    const later = routeChange(
        "Containers",
        containers(placed),
        placed,
        edge.key,
        {
            routing: "Orthogonal",
        },
    );
    assert.deepEqual(later.after, {
        relationships: { [edge.key]: { routing: "Orthogonal" } },
    });
});

test("a route change that sets what is drawn already is no change", () => {
    const graph = containers();
    const edge = graph.edges[0];
    const placed = {
        elements: Object.fromEntries(
            graph.elements.map(({ id, x, y }) => [id, { x, y }]),
        ),
    };
    assert.equal(
        routeChange("Containers", graph, placed, edge.key, {
            position: edge.labelPosition,
        }),
        null,
    );
});

test("a vertex added on a leg goes into the edge's vertices at that leg, in whole units", () => {
    const graph = containers();
    const edge = graph.edges.find((e) => e.vertices.length === 0);
    const middle = {
        x: (edge.source.x + edge.target.x) / 2 + 0.4,
        y: (edge.source.y + edge.target.y) / 2,
    };
    assert.deepEqual(withVertex(edge, middle), [
        { x: Math.round(middle.x), y: Math.round(middle.y) },
    ]);
});

test("a side drop saves its vertex first, and a later drop replaces it while it still holds a side", () => {
    const graph = containers();
    const edge = graph.edges.find((e) => e.vertices.length === 0);
    const source = graph.elements.find((e) => e.id === edge.sourceId);
    const above = { x: source.x + source.width / 2, y: source.y - 100 };
    const first = sideChange(edge, source, "source", above, 8);
    assert.equal(first.length, 1);
    assert.equal(first[0].y, source.y - SIDE_OFFSET);

    const moved = { ...edge, vertices: first };
    const below = {
        x: source.x + source.width / 2,
        y: source.y + source.height + 100,
    };
    const replaced = sideChange(moved, source, "source", below, 8);
    assert.equal(replaced.length, 1, "the side vertex was not replaced");
    assert.equal(replaced[0].y, source.y + source.height + SIDE_OFFSET);

    const bent = { ...edge, vertices: [{ x: 5000, y: 5000 }] };
    const added = sideChange(bent, source, "source", below, 8);
    assert.equal(added.length, 2, "a vertex that holds no side was replaced");
    assert.deepEqual(added[1], { x: 5000, y: 5000 });
    const target = graph.elements.find((e) => e.id === edge.targetId);
    const last = sideChange(bent, target, "target", below, 8);
    assert.deepEqual(
        last[0],
        { x: 5000, y: 5000 },
        "the target end's vertex goes last",
    );
});

test("a relationship whose two ends move by the same amount takes its vertices along, and others stay", () => {
    const graph = containers();
    const edge = graph.edges.find((e) => e.sourceId !== e.targetId);
    const vertices = [{ x: 4000, y: 4000 }];
    const edited = { relationships: { [edge.key]: { vertices } } };
    const drawn = containers(edited);
    const at = (id) => drawn.elements.find((e) => e.id === id);
    const shift = (id) => ({ x: at(id).x + 50, y: at(id).y + 25 });
    const both = new Map([
        [edge.sourceId, shift(edge.sourceId)],
        [edge.targetId, shift(edge.targetId)],
    ]);
    assert.deepEqual(dragLayout(drawn, both).relationships, {
        [edge.key]: { vertices: [{ x: 4050, y: 4025 }] },
    });
    const change = dropChange("Containers", drawn, edited, both);
    assert.deepEqual(change.after.relationships, {
        [edge.key]: { vertices: [{ x: 4050, y: 4025 }] },
    });
    assert.deepEqual(change.before.relationships, {
        [edge.key]: { vertices },
    });

    const one = new Map([[edge.sourceId, shift(edge.sourceId)]]);
    assert.equal(dragLayout(drawn, one).relationships, undefined);
    assert.equal(
        dropChange("Containers", drawn, edited, one).after.relationships,
        undefined,
    );
});
