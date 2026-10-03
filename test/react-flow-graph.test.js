/**
 * `src/engine/react-flow/graph.ts`: the plain geometry the React Flow island
 * draws for a stored-layout view. The island itself is exercised in Chrome by
 * `test/e2e.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const {
    buildGraph,
    exitPoint,
    FIT_CEILING,
    fitViewport,
    stepZoom,
    ZOOM_STEP,
    zoomLimits,
} = await importSrc("engine/react-flow/graph");
const { shapeGeometry } = await importSrc("engine/geometry/shapes/index");

const FIXTURE = JSON.parse(
    readFileSync(
        new URL("../scripts/__fixtures__/workspace.json", import.meta.url),
        "utf-8",
    ),
);

const LABELS = { descriptions: true, technologies: true };
const model = () => new WorkspaceModel(FIXTURE);

test("elements sit at their stored top-left, at their style's size", () => {
    const graph = buildGraph(model(), "FixtureContext", "light", LABELS);

    assert.deepEqual(
        graph.elements.map(({ id, x, y, width, height, shape }) => ({
            id,
            x,
            y,
            width,
            height,
            shape,
        })),
        [
            // A Person keeps the 400×400 Structurizr gives it by default.
            {
                id: "1",
                x: 200,
                y: 200,
                width: 400,
                height: 400,
                shape: "Person",
            },
            { id: "2", x: 200, y: 800, width: 450, height: 300, shape: "Box" },
        ],
    );
    assert.deepEqual(graph.bounds, { x: 200, y: 200, width: 450, height: 900 });
});

test("an element carries its name, metadata and description, styled for the scheme", () => {
    const light = buildGraph(model(), "FixtureContext", "light", LABELS);
    const dark = buildGraph(model(), "FixtureContext", "dark", LABELS);
    const system = light.elements.find((e) => e.id === "2");

    assert.equal(system.name, "Fixture System");
    assert.equal(system.metadata, "[Software System]");
    assert.equal(system.description, "The system under test");
    assert.equal(system.background, "#1168bd");
    assert.equal(system.color, "#ffffff");
    assert.equal(light.background, "#ffffff");
    assert.equal(dark.background, "#111111");
});

test("an element's label fills its whole box and carries its style's icon", () => {
    const json = structuredClone(FIXTURE);
    json.views.configuration.styles.elements.push({
        tag: "Software System",
        icon: "data:image/png;base64,AAAA",
        iconPosition: "Left",
        opacity: 40,
        border: "Dotted",
    });
    const graph = buildGraph(
        new WorkspaceModel(json),
        "FixtureContext",
        "light",
        LABELS,
    );
    const [person, system] = graph.elements;

    assert.deepEqual(system.content, { x: 0, y: 0, width: 450, height: 300 });
    assert.equal(system.icon, "data:image/png;base64,AAAA");
    assert.equal(system.iconPosition, "Left");
    assert.equal(system.opacity, 0.4);
    assert.equal(system.border, "Dotted");
    assert.equal(person.icon, undefined, "the Person has no icon");
    assert.equal(person.iconPosition, "Bottom", "Bottom is the default");
});

/* ------------------------------------------------------------------ shapes */

/**
 * The fixture's context view plus one software system per `shape`, each
 * tagged so a style of its own gives it that shape at 450×300.
 */
const withShapes = (shapes) => {
    const json = structuredClone(FIXTURE);
    const [context] = json.views.systemContextViews;
    for (const [index, shape] of shapes.entries()) {
        const id = String(100 + index);
        const tag = `Shape ${shape}`;
        json.model.softwareSystems.push({
            id,
            name: `${shape} System`,
            tags: `Element,Software System,${tag}`,
        });
        json.views.configuration.styles.elements.push({
            tag,
            shape,
            width: 450,
            height: 300,
        });
        context.elements.push({ id, x: 1000 + 600 * index, y: 200 });
    }
    return buildGraph(
        new WorkspaceModel(json),
        "FixtureContext",
        "light",
        LABELS,
    );
};

test("an element names the shape it draws, and an unknown shape draws as a Box", () => {
    const graph = withShapes(["Cylinder", "Hexagon", "Blob", "WebBrowser"]);

    assert.deepEqual(
        graph.elements.map((e) => e.shape),
        ["Person", "Box", "Cylinder", "Hexagon", "Box", "WebBrowser"],
    );
});

test("Circle, Diamond, Person and Robot are as tall as they are wide, as in Structurizr", () => {
    const cases = [
        ["Circle", 450, 450],
        ["Diamond", 450, 450],
        ["Person", 450, 450],
        ["Robot", 450, 450],
        ["Hexagon", 450, Math.floor((450 * Math.sqrt(3)) / 2)],
        ["Ellipse", 450, 300],
        ["Box", 450, 300],
    ];
    const graph = withShapes(cases.map(([shape]) => shape));

    for (const [index, [shape, width, height]] of cases.entries()) {
        const element = graph.elements[2 + index];
        assert.deepEqual(
            [element.width, element.height],
            [width, height],
            `a ${shape} styled 450×300 should be drawn ${width}×${height}`,
        );
    }
});

test("an element's label fills its shape's content area and it draws the shape's parts", () => {
    const graph = withShapes(["Cylinder", "Circle", "Blob"]);
    const [cylinder, circle, blob] = graph.elements.slice(2);

    assert.deepEqual(cylinder.content, {
        x: 0,
        y: 30,
        width: 450,
        height: 270,
    });
    assert.deepEqual(circle.content, shapeGeometry("Circle", 450, 450).content);
    assert.deepEqual(circle.parts, shapeGeometry("Circle", 450, 450).parts);
    assert.deepEqual(blob.parts, shapeGeometry("Box", 450, 300).parts);
});

test("an edge ends on the drawn outline of a shape, not on its box", () => {
    const json = structuredClone(FIXTURE);
    json.views.configuration.styles.elements.push({
        tag: "Software System",
        shape: "Circle",
    });
    const graph = buildGraph(
        new WorkspaceModel(json),
        "FixtureContext",
        "light",
        LABELS,
    );
    const [, circle] = graph.elements;
    const [edge] = graph.edges;
    const radius = Math.hypot(
        edge.target.x - (circle.x + circle.width / 2),
        edge.target.y - (circle.y + circle.height / 2),
    );

    assert.ok(
        Math.abs(radius - circle.width / 2) < 1e-6,
        `the arrowhead should touch the circle, not ${radius} from its center`,
    );
});

test("labels hide descriptions and technologies", () => {
    const graph = buildGraph(model(), "FixtureContext", "light", {
        descriptions: false,
        technologies: false,
    });

    assert.equal(graph.elements[1].description, "");
    assert.equal(graph.edges[0].label, "");
    assert.equal(
        buildGraph(model(), "FixtureContext", "light", LABELS).edges[0].label,
        "Browses\n[HTTPS]",
    );
});

test("an edge joins the two elements on the line between their centers", () => {
    const [edge] = buildGraph(model(), "FixtureContext", "light", LABELS).edges;

    assert.equal(edge.id, "10");
    assert.equal(edge.sourceId, "1");
    assert.equal(edge.targetId, "2");
    // Leaves the Person through its bottom, enters the system through its top.
    assert.equal(edge.source.y, 600);
    assert.equal(edge.target.y, 800);
    assert.equal(edge.color, "#707070");
    assert.equal(edge.style, "Dashed");
});

test("boundaries are left out until they are derived from their children", () => {
    const json = structuredClone(FIXTURE);
    json.views.systemContextViews[1].elements.push({ id: "3", x: 300, y: 300 });
    const graph = buildGraph(
        new WorkspaceModel(json),
        "FixtureContainers",
        "light",
        LABELS,
    );

    assert.deepEqual(
        graph.elements.map((e) => e.id),
        ["3"],
    );
});

test("an unknown view key draws nothing", () => {
    assert.equal(buildGraph(model(), "Nope", "light", LABELS), undefined);
});

test("exitPoint stops at the box's edge, on the line to the other center", () => {
    const at = { x: 0, y: 0 };
    const box = shapeGeometry("Box", 100, 50);
    assert.deepEqual(exitPoint(at, box, { x: 50, y: 500 }), { x: 50, y: 50 });
    assert.deepEqual(exitPoint(at, box, { x: 500, y: 25 }), {
        x: 100,
        y: 25,
    });
});

test("exitPoint stops at a Diamond's slanted side, inside its box", () => {
    const diamond = shapeGeometry("Diamond", 100, 100);
    const end = exitPoint({ x: 0, y: 0 }, diamond, { x: 500, y: 500 });
    assert.ok(
        Math.abs(end.x - 75) < 1e-6 && Math.abs(end.y - 75) < 1e-6,
        `the end should be on the side, at (75, 75), not ${JSON.stringify(end)}`,
    );
});

test("zooming steps by 1.2 and never past the scale that shows the whole view", () => {
    assert.equal(ZOOM_STEP, 1.2);
    assert.equal(stepZoom(1, "in", 0.5), 1.2);
    assert.equal(stepZoom(1.2, "out", 0.5), 1);
    assert.equal(stepZoom(0.55, "out", 0.5), 0.5);
    assert.equal(stepZoom(3.9, "in", 0.5, 4), 4);
});

test("zoom limits follow the fitted scale until the reader moves", () => {
    assert.deepEqual(zoomLimits(0.5, 0.5, false), { floor: 0.5, ceiling: 4 });
    assert.deepEqual(zoomLimits(2, 2, false), { floor: 2, ceiling: 8 });
    assert.deepEqual(zoomLimits(null, 1, false), { floor: 0.05, ceiling: 4 });
});

test("a view smaller than the canvas is fitted at its own size, centered, not enlarged", () => {
    const fitted = fitViewport(
        { x: 100, y: 50, width: 400, height: 200 },
        { width: 1000, height: 800 },
    );
    assert.equal(
        fitted.zoom,
        FIT_CEILING,
        `a small view was fitted at ${fitted.zoom}, not at its own size`,
    );
    assert.deepEqual(
        { x: fitted.x, y: fitted.y },
        { x: 1000 / 2 - 300, y: 800 / 2 - 150 },
        "a small view fitted at its own size is not centered in the canvas",
    );
});

test("a view larger than the canvas is shrunk until it fits, with room around it", () => {
    const bounds = { x: 0, y: 0, width: 2000, height: 1000 };
    const fitted = fitViewport(bounds, { width: 1000, height: 800 });
    assert.ok(
        fitted.zoom < 0.5,
        `a 2000-wide view in a 1000-wide canvas was fitted at ${fitted.zoom}, leaving no room around it`,
    );
    assert.ok(
        fitted.zoom > 0.45,
        `a 2000-wide view in a 1000-wide canvas was shrunk further than it needs, to ${fitted.zoom}`,
    );
    assert.ok(
        Math.abs(fitted.x + (bounds.width / 2) * fitted.zoom - 500) < 1e-9,
        "a shrunk view is not centered across the canvas",
    );
});

test("a resize never clamps the zoom of a reader who has moved", () => {
    // Zoomed to 0.6, then the window grows and the fitted scale rises to 0.9.
    assert.deepEqual(zoomLimits(0.9, 0.6, true), { floor: 0.6, ceiling: 4 });
    // Zoomed to 3.5, then the window shrinks and the fitted scale drops.
    assert.equal(zoomLimits(0.2, 3.5, true).ceiling, 4);
    assert.equal(zoomLimits(0.2, 6, true).ceiling, 6);
    // Zooming out still stops at the fitted scale.
    assert.equal(zoomLimits(0.5, 1.2, true).floor, 0.5);
});

test("a relationship a dynamic view draws twice gets two distinct edge keys", () => {
    const workspace = structuredClone(FIXTURE);
    const [context] = workspace.views.systemContextViews;
    workspace.views.dynamicViews = [
        {
            key: "FixtureDynamic",
            elements: context.elements,
            relationships: [
                { id: "10", order: "1", description: "Request" },
                {
                    id: "10",
                    order: "2",
                    description: "Response",
                    response: true,
                },
            ],
        },
    ];
    const graph = buildGraph(
        new WorkspaceModel(workspace),
        "FixtureDynamic",
        "light",
        LABELS,
    );
    const keys = graph.edges.map((edge) => edge.key);
    assert.equal(keys.length, 2);
    assert.equal(new Set(keys).size, 2);
    assert.deepEqual(
        graph.edges.map((edge) => edge.id),
        ["10", "10"],
    );
});
