/**
 * "Calculate layout" (spec 15): the automatic layout's branch of the
 * geometry, run once on a stored-layout view, turned into a calculated
 * layout the edit session stores as one change.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after } from "node:test";
import { importSrc, srcTest as test } from "./support/ts.js";

// The canvas is edit mode's, which builds compile out (ADR 15).
globalThis.__RENDERIZR_EDIT_MODE__ = true;
after(() => {
    globalThis.__RENDERIZR_EDIT_MODE__ = false;
});

const { WorkspaceModel, mergeLayouts, DEFAULT_AUTOMATIC_LAYOUT } =
    await importSrc("model/index");
const { buildGraph, calculatedGraph } = await importSrc(
    "engine/react-flow/graph",
);
const { calculatedChange } = await importSrc("engine/react-flow/commands");

const read = (name) =>
    JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}`, import.meta.url),
            "utf-8",
        ),
    );
const LABELS = { descriptions: true, technologies: true };
const OPTIONS = {
    rankDirection: "LeftRight",
    rankSeparation: 100,
    nodeSeparation: 50,
    edgeSeparation: 50,
    vertices: true,
};

/** Big Bank as stored, every view with coordinates and no automatic layout. */
const STORED = read("big-bank-plc-stored.json");

const graphOf = (workspace, key, edited) =>
    buildGraph(
        new WorkspaceModel(workspace),
        key,
        "light",
        LABELS,
        undefined,
        edited,
    );

/** Run "Calculate layout" with `options` on view `key` of `workspace`. */
const calculate = (workspace, key, options, edited) => {
    const model = new WorkspaceModel(workspace);
    const graph = graphOf(workspace, key, edited);
    const calculated = calculatedGraph(
        model,
        key,
        "light",
        LABELS,
        undefined,
        edited,
        options,
    );
    return { graph, change: calculatedChange(key, graph, calculated, options) };
};

test("Structurizr's defaults are the dialog's: left to right, 100, 50, 50, vertices on", () => {
    const { implementation: _, ...defaults } = DEFAULT_AUTOMATIC_LAYOUT;
    assert.deepEqual(defaults, OPTIONS);
});

test("a calculated layout places every element in whole units, off (0,0), and fits the canvas by Auto's rule", () => {
    const { graph, change } = calculate(STORED, "Containers", OPTIONS);
    assert.equal(change.view, "Containers");
    assert.equal(
        Object.keys(change.after.elements).length,
        graph.elements.length,
    );
    for (const { x, y } of Object.values(change.after.elements)) {
        assert.ok(Number.isInteger(x) && Number.isInteger(y));
        assert.ok(x !== 0 || y !== 0, "an element at (0,0) reads as unplaced");
    }
    const after = graphOf(STORED, "Containers", change.after);
    assert.deepEqual(change.after.dimensions, {
        width: Math.ceil(after.bounds.width) + 400,
        height: Math.ceil(after.bounds.height) + 400,
    });
    assert.ok(
        Math.abs(after.bounds.x - 200) <= 1 &&
            Math.abs(after.bounds.y - 200) <= 1,
        `the content starts at (${after.bounds.x}, ${after.bounds.y})`,
    );
    assert.deepEqual(change.before.dimensions, graph.canvas);
    for (const element of graph.elements)
        assert.deepEqual(change.before.elements[element.id], {
            x: element.x,
            y: element.y,
        });
});

test("with vertices on, every relationship takes Dagre's vertices; routing, position and jump stay", () => {
    const { graph, change } = calculate(STORED, "Containers", OPTIONS);
    const ids = new Set(graph.edges.map((e) => e.id));
    assert.deepEqual(new Set(Object.keys(change.after.relationships)), ids);
    for (const route of Object.values(change.after.relationships)) {
        assert.deepEqual(Object.keys(route), ["vertices"]);
        for (const { x, y } of route.vertices)
            assert.ok(Number.isInteger(x) && Number.isInteger(y));
    }
    assert.ok(
        Object.values(change.after.relationships).some(
            (route) => route.vertices.length > 0,
        ),
        "Dagre bent no edge in Containers",
    );
});

test("with vertices off, the run clears every relationship's vertices", () => {
    const workspace = structuredClone(STORED);
    const view = workspace.views.containerViews.find(
        (v) => v.key === "Containers",
    );
    view.relationships[0].vertices = [{ x: 10, y: 10 }];
    const { change } = calculate(workspace, "Containers", {
        ...OPTIONS,
        vertices: false,
    });
    for (const route of Object.values(change.after.relationships))
        assert.deepEqual(route, { vertices: [] });
    assert.deepEqual(
        change.before.relationships[view.relationships[0].id].vertices,
        [{ x: 10, y: 10 }],
    );
});

for (const vertices of [true, false]) {
    test(`with the same options a calculated layout matches the view drawn with autoLayout (vertices ${vertices ? "on" : "off"})`, () => {
        const options = {
            ...OPTIONS,
            rankDirection: "TopBottom",
            rankSeparation: 300,
            nodeSeparation: 300,
            vertices,
        };
        for (const key of ["Containers", "LiveDeployment", "SignIn"]) {
            const automatic = structuredClone(STORED);
            for (const views of Object.values(automatic.views))
                if (Array.isArray(views))
                    for (const v of views)
                        if (v.key === key) {
                            // Every element at (0,0) is what draws a view
                            // with Dagre.
                            v.elements = v.elements.map(({ id }) => ({ id }));
                            v.relationships = v.relationships.map(
                                ({ vertices: _, ...r }) => r,
                            );
                            v.automaticLayout = {
                                implementation: "Dagre",
                                ...options,
                            };
                        }
            const expected = graphOf(automatic, key);
            const { change } = calculate(STORED, key, options);
            const actual = graphOf(STORED, key, change.after);

            const [first] = expected.elements;
            const placed = actual.elements.find((e) => e.id === first.id);
            const shift = { x: placed.x - first.x, y: placed.y - first.y };
            const near = (a, b, what) =>
                assert.ok(
                    Math.abs(a.x - b.x - shift.x) <= 1 &&
                        Math.abs(a.y - b.y - shift.y) <= 1,
                    `${key}: ${what} is at (${a.x}, ${a.y}), expected (${b.x + shift.x}, ${b.y + shift.y})`,
                );
            for (const element of expected.elements)
                near(
                    actual.elements.find((e) => e.id === element.id),
                    element,
                    `element ${element.id}`,
                );
            for (const boundary of expected.boundaries)
                near(
                    actual.boundaries.find((b) => b.id === boundary.id),
                    boundary,
                    `boundary ${boundary.id}`,
                );
            for (const edge of expected.edges) {
                const drawn = actual.edges.find((e) => e.key === edge.key);
                assert.equal(
                    drawn.route.length,
                    edge.route.length,
                    `${key}: edge ${edge.key} has another number of points`,
                );
                edge.route.forEach((point, index) =>
                    near(
                        drawn.route[index],
                        point,
                        `edge ${edge.key} point ${index}`,
                    ),
                );
            }
        }
    });
}

test("a calculated layout undoes to what was drawn: before restores positions, vertices and dimensions", () => {
    const { graph, change } = calculate(STORED, "Containers", OPTIONS);
    const undone = graphOf(
        STORED,
        "Containers",
        mergeLayouts(change.after, change.before),
    );
    assert.deepEqual(
        undone.elements.map(({ id, x, y }) => ({ id, x, y })),
        graph.elements.map(({ id, x, y }) => ({ id, x, y })),
    );
    assert.deepEqual(undone.canvas, graph.canvas);
    assert.deepEqual(
        undone.edges.map((e) => e.route),
        graph.edges.map((e) => e.route),
    );
});
