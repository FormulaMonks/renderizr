/**
 * Edited layouts (spec 9, 10.1, ADR 18): the model lays a view's edited
 * layout over its stored one, the geometry draws it with boundaries and
 * routes worked out again, and a drag turns into one layout change.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLayout } from "../scripts/workspace-writer.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, resolveView, mergeLayouts } =
    await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { dragLayout, dropChange } = await importSrc("engine/react-flow/drag");
const { snapToGrid, offOrigin, GRID } = await importSrc(
    "engine/geometry/snapping",
);

const read = (name) =>
    JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}`, import.meta.url),
            "utf-8",
        ),
    );
const STORED = read("big-bank-plc-stored.json");
const UNPLACED = read("unplaced-elements.json");
const LABELS = { descriptions: true, technologies: true };

/** Big Bank with its automatic layouts taken out: views without coordinates. */
const withoutCoordinates = () => {
    const workspace = read("big-bank-plc.json");
    for (const views of Object.values(workspace.views))
        if (Array.isArray(views))
            for (const view of views) view.automaticLayout = undefined;
    return workspace;
};

const graphOf = (workspace, key, edited) =>
    buildGraph(
        new WorkspaceModel(workspace),
        key,
        "light",
        LABELS,
        undefined,
        edited,
    );
const at = (graph, id) => {
    const { x, y } = graph.elements.find((e) => e.id === id);
    return { x, y };
};

/* ------------------------------------------------------------------- model */

test("a view resolves with its edited layout laid over its stored one", () => {
    const model = new WorkspaceModel(STORED);
    const plain = resolveView(model, "Containers");
    const [first, second] = plain.elements;
    const view = resolveView(model, "Containers", {
        elements: { [first.id]: { x: 1234, y: 567 } },
    });
    assert.deepEqual(
        view.elements.map(({ id, x, y }) => ({ id, x, y })).slice(0, 2),
        [
            { id: first.id, x: 1234, y: 567 },
            { id: second.id, x: second.x, y: second.y },
        ],
    );
    assert.equal(view.layout, "stored");
});

test("a view without coordinates draws as stored once its edited layout places every element", () => {
    const workspace = withoutCoordinates();
    const model = new WorkspaceModel(workspace);
    assert.equal(resolveView(model, "Containers").layout, "automatic");
    const elements = Object.fromEntries(
        resolveView(model, "Containers").elements.map((e, i) => [
            e.id,
            { x: 100 + i * 10, y: 50 },
        ]),
    );
    assert.equal(
        resolveView(model, "Containers", { elements }).layout,
        "stored",
    );
});

test("merging layouts keeps every element and takes the later position", () => {
    assert.deepEqual(
        mergeLayouts(
            { elements: { 1: { x: 1, y: 2 }, 2: { x: 3, y: 4 } } },
            { elements: { 2: { x: 5, y: 6 } } },
        ),
        { elements: { 1: { x: 1, y: 2 }, 2: { x: 5, y: 6 } } },
    );
    assert.deepEqual(mergeLayouts(undefined, { elements: {} }), {
        elements: {},
    });
});

/* ------------------------------------------------------- relationship keys */

/** A dynamic view listing `relationships` between two people. */
const dynamicWorkspace = (relationships) => ({
    model: {
        people: [
            {
                id: "1",
                name: "A",
                relationships: [{ id: "3", sourceId: "1", destinationId: "2" }],
            },
            { id: "2", name: "B" },
        ],
    },
    views: {
        dynamicViews: [
            {
                key: "Dynamic",
                elements: [
                    { id: "1", x: 100, y: 100 },
                    { id: "2", x: 600, y: 100 },
                ],
                relationships,
            },
        ],
    },
});

/**
 * The vertices each listing of view "Dynamic" in `workspace` ends up with,
 * by its order, once `relationships` (key to vertices) is laid over it: by
 * the page, which draws them, and by the writer, which saves them.
 */
function routesByOrder(workspace, relationships) {
    const layout = {
        relationships: Object.fromEntries(
            Object.entries(relationships).map(([key, vertices]) => [
                key,
                { vertices },
            ]),
        ),
    };
    const drawn = resolveView(
        new WorkspaceModel(structuredClone(workspace)),
        "Dynamic",
        layout,
    );
    const page = Object.fromEntries(
        drawn.relationships.map((r) => [Number(r.order), r.vertices]),
    );
    const saved = structuredClone(workspace);
    applyLayout(saved, { Dynamic: layout });
    const writer = {};
    for (const r of saved.views.dynamicViews[0].relationships)
        if (r.vertices && r.id === "3") writer[Number(r.order)] = r.vertices;
    return { page, writer };
}

test("the page and the writer key a dynamic view's repeats alike when orders read as one integer", () => {
    const { page, writer } = routesByOrder(
        dynamicWorkspace([
            { id: "3", order: "1" },
            // "01" is order 1 again: the same edge, with no key of its own.
            { id: "3", order: "01" },
            { id: "3", order: "2" },
        ]),
        { 3: [{ x: 1, y: 1 }], "3#1": [{ x: 2, y: 2 }] },
    );
    assert.deepEqual(page, { 1: [{ x: 1, y: 1 }], 2: [{ x: 2, y: 2 }] });
    assert.deepEqual(writer, page);
});

test("the page and the writer key a dynamic view's repeats alike past a listing whose relationship is missing", () => {
    const { page, writer } = routesByOrder(
        dynamicWorkspace([
            { id: "9", order: "1" },
            { id: "3", order: "1" },
            { id: "9", order: "2" },
            { id: "3", order: "2" },
        ]),
        { 3: [{ x: 1, y: 1 }], "3#1": [{ x: 2, y: 2 }] },
    );
    assert.deepEqual(page, { 1: [{ x: 1, y: 1 }], 2: [{ x: 2, y: 2 }] });
    assert.deepEqual(writer, page);
});

/* ---------------------------------------------------------------- geometry */

test("an edited position moves the element, and its boundary and edges follow", () => {
    const plain = graphOf(STORED, "Containers");
    const [inside] = resolveView(
        new WorkspaceModel(STORED),
        "Containers",
    ).boundaries;
    const element = plain.elements.find((e) => inside.children.includes(e.id));
    const boundary = plain.boundaries.find((b) => b.id === inside.id);
    const moved = graphOf(STORED, "Containers", {
        elements: {
            [element.id]: { x: element.x - 2000, y: element.y + 1500 },
        },
    });
    assert.deepEqual(at(moved, element.id), {
        x: element.x - 2000,
        y: element.y + 1500,
    });
    const grown = moved.boundaries.find((b) => b.id === boundary.id);
    assert.notDeepEqual(
        { x: grown.x, y: grown.y, width: grown.width, height: grown.height },
        {
            x: boundary.x,
            y: boundary.y,
            width: boundary.width,
            height: boundary.height,
        },
        "the boundary kept its box",
    );
    const touching = (graph) =>
        graph.edges
            .filter(
                (e) => e.sourceId === element.id || e.targetId === element.id,
            )
            .map((e) => e.route);
    assert.ok(touching(plain).length > 0, "the element has no edges to check");
    assert.notDeepEqual(touching(moved), touching(plain), "no edge re-routed");
});

/* -------------------------------------------------------------------- drag */

test("a drag snaps to the 5-unit grid", () => {
    assert.equal(GRID, 5);
    assert.deepEqual(snapToGrid({ x: 12.4, y: -13 }), { x: 10, y: -15 });
    assert.deepEqual(snapToGrid({ x: 2.5, y: 7.5 }), { x: 5, y: 10 });
});

test("an element landing on exactly (0,0) goes to (5,0)", () => {
    assert.deepEqual(offOrigin({ x: 0, y: 0 }), { x: 5, y: 0 });
    assert.deepEqual(offOrigin({ x: 0, y: 5 }), { x: 0, y: 5 });
});

test("during a drag the frame lays every drawn element out, the dragged one where it is", () => {
    const workspace = withoutCoordinates();
    const graph = graphOf(workspace, "Containers");
    const [dragged, other] = graph.elements;
    const frame = dragLayout(graph, new Map([[dragged.id, { x: 40, y: 45 }]]));
    assert.deepEqual(frame.elements[dragged.id], { x: 40, y: 45 });
    assert.deepEqual(frame.elements[other.id], at(graph, other.id));
    assert.equal(Object.keys(frame.elements).length, graph.elements.length);

    const framed = graphOf(workspace, "Containers", frame);
    assert.deepEqual(at(framed, dragged.id), { x: 40, y: 45 });
    assert.deepEqual(at(framed, other.id), at(graph, other.id));
});

test("the first drop on a view carries x and y for every element, Dagre's and placed ones included", () => {
    const workspace = withoutCoordinates();
    const graph = graphOf(workspace, "Containers");
    const [dragged] = graph.elements;
    const change = dropChange(
        "Containers",
        graph,
        undefined,
        new Map([[dragged.id, { x: 300, y: 400 }]]),
    );
    assert.equal(change.view, "Containers");
    assert.equal(
        Object.keys(change.before.elements).length,
        graph.elements.length,
    );
    assert.equal(
        Object.keys(change.after.elements).length,
        graph.elements.length,
    );
    for (const element of graph.elements) {
        assert.deepEqual(change.before.elements[element.id], {
            x: element.x,
            y: element.y,
        });
    }
    assert.deepEqual(change.after.elements[dragged.id], { x: 300, y: 400 });
    for (const { x, y } of Object.values(change.after.elements)) {
        assert.ok(
            Number.isInteger(x) && Number.isInteger(y),
            "a fraction would be truncated on save",
        );
        assert.ok(x !== 0 || y !== 0, "an element at (0,0) reads as unplaced");
    }

    const unplaced = graphOf(UNPLACED, "PartlyUnplaced");
    const placed = unplaced.placements[0];
    const first = dropChange(
        "PartlyUnplaced",
        unplaced,
        undefined,
        new Map([[unplaced.elements[0].id, { x: 5, y: 5 }]]),
    );
    assert.deepEqual(first.after.elements[placed.id], {
        x: Math.round(placed.x),
        y: Math.round(placed.y),
    });
});

test("a later drop carries only what moved", () => {
    const graph = graphOf(STORED, "Containers");
    const [dragged] = graph.elements;
    const edited = {
        elements: Object.fromEntries(
            graph.elements.map(({ id, x, y }) => [id, { x, y }]),
        ),
    };
    const change = dropChange(
        "Containers",
        graph,
        edited,
        new Map([[dragged.id, { x: dragged.x + 50, y: dragged.y }]]),
    );
    assert.deepEqual(change, {
        view: "Containers",
        before: { elements: { [dragged.id]: { x: dragged.x, y: dragged.y } } },
        after: {
            elements: { [dragged.id]: { x: dragged.x + 50, y: dragged.y } },
        },
    });
});

test("a drop on exactly (0,0) lands at (5,0), and a drop where it started is no change", () => {
    const graph = graphOf(STORED, "Containers");
    const [dragged] = graph.elements;
    const edited = {
        elements: { [dragged.id]: { x: dragged.x, y: dragged.y } },
    };
    const change = dropChange(
        "Containers",
        graph,
        edited,
        new Map([[dragged.id, { x: 0, y: 0 }]]),
    );
    assert.deepEqual(change.after.elements[dragged.id], { x: 5, y: 0 });
    assert.equal(
        dropChange(
            "Containers",
            graph,
            edited,
            new Map([[dragged.id, { x: dragged.x, y: dragged.y }]]),
        ),
        null,
    );
});
