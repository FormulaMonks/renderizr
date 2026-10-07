/**
 * The canvas (spec 14): the frame a view's `dimensions` set, the three
 * commands that resize it, and "Bring elements back onto the diagram"
 * (spec 15), as pure functions over a built graph.
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

const { WorkspaceModel, canvasOf, mergeLayouts, PAPER_SIZES } =
    await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { canvasChange, bringBackChange } = await importSrc(
    "engine/react-flow/commands",
);
const { resizedCanvas, centeringShift } = await importSrc(
    "engine/geometry/canvas",
);

const read = (name) =>
    JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}`, import.meta.url),
            "utf-8",
        ),
    );
const LABELS = { descriptions: true, technologies: true };
const KEY = "Containers";

/**
 * Big Bank's stored Containers view without its canvas, with whatever `extra`
 * sets on it.
 */
const stored = (extra = {}) => {
    const workspace = read("big-bank-plc-stored.json");
    const view = workspace.views.containerViews.find((v) => v.key === KEY);
    Reflect.deleteProperty(view, "dimensions");
    Reflect.deleteProperty(view, "paperSize");
    Object.assign(view, extra);
    return workspace;
};

const graphOf = (workspace, edited) =>
    buildGraph(
        new WorkspaceModel(workspace),
        KEY,
        "light",
        LABELS,
        undefined,
        edited,
    );

/** An edited layout that places every element where `graph` draws it. */
const everyElement = (graph) => ({
    elements: Object.fromEntries(
        graph.elements.map(({ id, x, y }) => [id, { x, y }]),
    ),
});

const view = (extra = {}) => ({
    key: "V",
    type: "Container",
    description: "",
    elements: [],
    relationships: [],
    ...extra,
});

/* ------------------------------------------------------------------ canvas */

test("the canvas is the view's dimensions, else its paper size, else 2000 × 2000", () => {
    assert.deepEqual(
        canvasOf(view({ dimensions: { width: 3000, height: 1200 } })),
        {
            width: 3000,
            height: 1200,
        },
    );
    assert.deepEqual(canvasOf(view({ paperSize: "A4_Landscape" })), {
        width: 3508,
        height: 2480,
    });
    assert.deepEqual(PAPER_SIZES.A5_Portrait, { width: 1748, height: 2480 });
    assert.deepEqual(canvasOf(view()), { width: 2000, height: 2000 });
    assert.deepEqual(
        canvasOf(
            view({
                dimensions: { width: 3000, height: 1200 },
                paperSize: "A4_Landscape",
            }),
        ),
        { width: 3000, height: 1200 },
        "dimensions win over a paper size",
    );
});

test("a canvas side under 500 shows as 2000", () => {
    assert.deepEqual(
        canvasOf(view({ dimensions: { width: 499, height: 800 } })),
        {
            width: 2000,
            height: 800,
        },
    );
    assert.deepEqual(canvasOf(view({ dimensions: { width: 0, height: 0 } })), {
        width: 2000,
        height: 2000,
    });
});

test("an edited layout's dimensions and deleted paper size win over the stored ones", () => {
    const paper = view({ paperSize: "A4_Landscape" });
    assert.deepEqual(canvasOf(paper, { paperSize: null }), {
        width: 2000,
        height: 2000,
    });
    assert.deepEqual(
        canvasOf(paper, { dimensions: { width: 900, height: 700 } }),
        { width: 900, height: 700 },
    );
});

test("the graph carries the canvas it would draw", () => {
    assert.deepEqual(graphOf(stored()).canvas, { width: 2000, height: 2000 });
    assert.deepEqual(
        graphOf(stored({ dimensions: { width: 4000, height: 3000 } })).canvas,
        { width: 4000, height: 3000 },
    );
});

test("merging layouts takes the later dimensions, paper size and vertices", () => {
    assert.deepEqual(
        mergeLayouts(
            {
                elements: { 1: { x: 1, y: 2 } },
                relationships: { 7: { vertices: [{ x: 1, y: 1 }] } },
                dimensions: { width: 1000, height: 1000 },
                paperSize: "A4_Portrait",
            },
            {
                relationships: { 8: { vertices: [] } },
                dimensions: { width: 1100, height: 1100 },
                paperSize: null,
            },
        ),
        {
            elements: { 1: { x: 1, y: 2 } },
            relationships: {
                7: { vertices: [{ x: 1, y: 1 }] },
                8: { vertices: [] },
            },
            dimensions: { width: 1100, height: 1100 },
            paperSize: null,
        },
    );
});

/* ---------------------------------------------------------------- resizing */

test("Decrease and Increase move each side by 100, and Auto fits the content plus 400", () => {
    const canvas = { width: 2000, height: 1500 };
    const content = { x: 10, y: 20, width: 1234.4, height: 567.2 };
    assert.deepEqual(resizedCanvas("decrease", canvas, content), {
        width: 1900,
        height: 1400,
    });
    assert.deepEqual(resizedCanvas("increase", canvas, content), {
        width: 2100,
        height: 1600,
    });
    assert.deepEqual(resizedCanvas("auto", canvas, content), {
        width: 1635,
        height: 968,
    });
});

test("Decrease stops at 500, so the canvas never shows as 2000 again", () => {
    assert.deepEqual(
        resizedCanvas(
            "decrease",
            { width: 550, height: 900 },
            { x: 0, y: 0, width: 10, height: 10 },
        ),
        { width: 500, height: 800 },
    );
});

test("re-centering shifts the content's box to the middle of the canvas, in whole units", () => {
    assert.deepEqual(
        centeringShift(
            { width: 1000, height: 800 },
            { x: 50, y: -20, width: 401, height: 200 },
        ),
        { x: 250, y: 320 },
    );
});

/** The middle of `bounds`. */
const middle = ({ x, y, width, height }) => ({
    x: x + width / 2,
    y: y + height / 2,
});

for (const command of ["decrease", "increase"]) {
    test(`${command} sets dimensions, deletes paperSize and re-centers every element`, () => {
        const workspace = stored({ paperSize: "A3_Landscape" });
        const graph = graphOf(workspace);
        const edited = everyElement(graph);
        const drawn = graphOf(workspace, edited);
        const change = canvasChange(KEY, drawn, edited, command, true);
        const step = command === "increase" ? 100 : -100;
        assert.deepEqual(change.after.dimensions, {
            width: 4961 + step,
            height: 3508 + step,
        });
        assert.equal(change.after.paperSize, null);
        assert.equal(change.before.paperSize, "A3_Landscape");
        assert.deepEqual(change.before.dimensions, drawn.canvas);
        assert.equal(
            Object.keys(change.after.elements).length,
            graph.elements.length,
            "re-centering writes every element",
        );

        const after = graphOf(workspace, mergeLayouts(edited, change.after));
        const centered = middle(after.bounds);
        assert.ok(
            Math.abs(centered.x - change.after.dimensions.width / 2) <= 1 &&
                Math.abs(centered.y - change.after.dimensions.height / 2) <= 1,
            `the content's middle sits at ${JSON.stringify(centered)}`,
        );
    });
}

test("with Alt held a canvas command changes the canvas alone", () => {
    const workspace = stored({ paperSize: "A3_Landscape" });
    const edited = everyElement(graphOf(workspace));
    const drawn = graphOf(workspace, edited);
    const change = canvasChange(KEY, drawn, edited, "increase", false);
    assert.deepEqual(change.after, {
        dimensions: { width: 5061, height: 3608 },
        paperSize: null,
    });
});

test("Auto fits the content plus 400, keeps paperSize and re-centers", () => {
    const workspace = stored({ paperSize: "A3_Landscape" });
    const edited = everyElement(graphOf(workspace));
    const drawn = graphOf(workspace, edited);
    const change = canvasChange(KEY, drawn, edited, "auto", true);
    assert.equal("paperSize" in change.after, false);
    assert.deepEqual(change.after.dimensions, {
        width: Math.ceil(drawn.bounds.width) + 400,
        height: Math.ceil(drawn.bounds.height) + 400,
    });
    const after = graphOf(workspace, mergeLayouts(edited, change.after));
    assert.ok(
        Math.abs(after.bounds.x - 200) <= 1 &&
            Math.abs(after.bounds.y - 200) <= 1,
        `the content starts at (${after.bounds.x}, ${after.bounds.y})`,
    );
});

test("re-centering takes stored vertices along with the elements", () => {
    const workspace = stored();
    const target = workspace.views.containerViews.find((v) => v.key === KEY)
        .relationships[0];
    target.vertices = [{ x: 1000, y: 1000 }];
    const edited = everyElement(graphOf(workspace));
    const drawn = graphOf(workspace, edited);
    const change = canvasChange(KEY, drawn, edited, "auto", true);
    const [element] = drawn.elements;
    const shift = {
        x: change.after.elements[element.id].x - element.x,
        y: change.after.elements[element.id].y - element.y,
    };
    assert.deepEqual(change.before.relationships[target.id].vertices, [
        { x: 1000, y: 1000 },
    ]);
    assert.deepEqual(change.after.relationships[target.id].vertices, [
        { x: 1000 + shift.x, y: 1000 + shift.y },
    ]);
});

test("the first change to a view carries its canvas, so the first save writes it", () => {
    const workspace = stored();
    const graph = graphOf(workspace);
    const change = canvasChange(KEY, graph, undefined, "increase", false);
    assert.deepEqual(change.after.dimensions, { width: 2100, height: 2100 });
    assert.equal(
        Object.keys(change.after.elements).length,
        graph.elements.length,
        "the first change carries every element",
    );
    assert.equal(
        "paperSize" in change.before,
        false,
        "a view without a paper size has none to restore",
    );
});

test("a canvas command that changes nothing makes no change", () => {
    const workspace = stored({ dimensions: { width: 500, height: 500 } });
    const edited = {
        ...everyElement(graphOf(workspace)),
        dimensions: { width: 500, height: 500 },
    };
    const drawn = graphOf(workspace, edited);
    assert.equal(canvasChange(KEY, drawn, edited, "decrease", false), null);
});

/* -------------------------------------------------------------- bring back */

test("Bring elements back clamps x, y and vertices into the canvas as one change", () => {
    const workspace = stored({ dimensions: { width: 3000, height: 2000 } });
    const relationship = workspace.views.containerViews.find(
        (v) => v.key === KEY,
    ).relationships[0];
    relationship.vertices = [
        { x: -50, y: 900 },
        { x: 3500, y: 2500 },
    ];
    const graph = graphOf(workspace);
    const [far, near, inside] = graph.elements;
    const edited = {
        ...everyElement(graph),
        dimensions: { width: 3000, height: 2000 },
    };
    edited.elements[far.id] = { x: 5000, y: -300 };
    edited.elements[near.id] = { x: -40, y: 1990 };
    edited.elements[inside.id] = { x: 100, y: 100 };
    const drawn = graphOf(workspace, edited);
    const change = bringBackChange(KEY, drawn, edited);

    assert.deepEqual(change.after.elements[far.id], {
        x: 3000 - far.width,
        y: 0,
    });
    assert.deepEqual(change.after.elements[near.id], {
        x: 0,
        y: 2000 - near.height,
    });
    assert.equal(change.after.elements[inside.id], undefined);
    assert.deepEqual(change.before.elements[far.id], { x: 5000, y: -300 });
    assert.deepEqual(change.after.relationships[relationship.id].vertices, [
        { x: 0, y: 900 },
        { x: 3000, y: 2000 },
    ]);
});

test("Bring elements back never leaves an element at (0,0)", () => {
    const workspace = stored();
    const graph = graphOf(workspace);
    const [first] = graph.elements;
    const edited = everyElement(graph);
    edited.elements[first.id] = { x: -100, y: -100 };
    const change = bringBackChange(KEY, graphOf(workspace, edited), edited);
    assert.deepEqual(change.after.elements[first.id], { x: 5, y: 0 });
});

test("Bring elements back with everything inside makes no change", () => {
    const workspace = stored({ dimensions: { width: 20000, height: 20000 } });
    const edited = everyElement(graphOf(workspace));
    assert.equal(
        bringBackChange(KEY, graphOf(workspace, edited), edited),
        null,
    );
});
