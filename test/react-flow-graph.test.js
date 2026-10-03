/**
 * `src/engine/react-flow/graph.ts`: the plain geometry the React Flow island
 * draws for a stored-layout view. The island itself is exercised in Chrome by
 * `test/e2e.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph, exitPoint, stepZoom, ZOOM_STEP, zoomLimits } =
    await importSrc("engine/react-flow/graph");
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

/* -------------------------------------------------------------- boundaries */

/** The fixture's container view with its container placed at (300, 300). */
const containers = (edit = () => {}) => {
    const json = structuredClone(FIXTURE);
    json.views.systemContextViews[1].elements.push({ id: "3", x: 300, y: 300 });
    edit(json);
    return new WorkspaceModel(json);
};

test("a software system with its containers in the view is a boundary derived around them, whatever coordinates it stores", () => {
    const graph = buildGraph(
        containers(),
        "FixtureContainers",
        "light",
        LABELS,
    );
    const [boundary] = graph.boundaries;

    assert.deepEqual(
        graph.elements.map((e) => e.id),
        ["3"],
    );
    assert.equal(boundary.id, "2");
    assert.equal(boundary.kind, "Element");
    assert.deepEqual(boundary.children, ["3"]);
    // The system stores (200, 200); the box comes from the container.
    assert.equal(boundary.x, 250);
    assert.equal(boundary.y, 250);
    assert.equal(boundary.width, 550);
    assert.equal(boundary.height, 400 + boundary.band.height);
    assert.deepEqual(boundary.name.lines, ["Fixture System"]);
    assert.deepEqual(boundary.metadata.lines, ["[Software System]"]);
    assert.deepEqual(graph.bounds, {
        x: 250,
        y: 250,
        width: 550,
        height: boundary.height,
    });
});

test("a boundary is filled with the canvas and keeps the element's stroke, in either scheme", () => {
    const light = buildGraph(
        containers(),
        "FixtureContainers",
        "light",
        LABELS,
    );
    const dark = buildGraph(containers(), "FixtureContainers", "dark", LABELS);
    const [onLight] = light.boundaries;
    const [onDark] = dark.boundaries;

    assert.equal(onLight.background, "#ffffff");
    assert.equal(onLight.stroke, "#0f5eaa");
    assert.equal(onLight.color, "#0f5eaa", "white text on white falls back");
    assert.equal(onLight.radius, 0);
    assert.equal(onDark.background, "#111111");
    assert.equal(onDark.color, "#ffffff");
});

test("a boundary styled as a rounded shape has 20 radius corners", () => {
    const model = containers((json) => {
        json.views.configuration.styles.elements.push({
            tag: "Software System",
            shape: "WebBrowser",
            border: "Dashed",
            opacity: 50,
        });
    });
    const [boundary] = buildGraph(
        model,
        "FixtureContainers",
        "light",
        LABELS,
    ).boundaries;

    assert.equal(boundary.radius, 20);
    assert.equal(boundary.border, "Dashed");
    assert.equal(boundary.opacity, 0.5);
});

test("the label band is measured with the text measure it is given", () => {
    const narrow = (text, fontSize) => text.length * fontSize * 0.1;
    // Wide regular text only, so the bold name leaves the width alone.
    const wide = (text, fontSize, bold) =>
        text.length * fontSize * (bold ? 0.1 : 3);
    const band = (measure) =>
        buildGraph(containers(), "FixtureContainers", "light", LABELS, measure)
            .boundaries[0];

    assert.deepEqual(band(narrow).metadata.lines, ["[Software System]"]);
    assert.ok(band(wide).metadata.lines.length > 1, "wide metadata wraps");
    assert.ok(band(wide).height > band(narrow).height, "and the band grows");
    assert.equal(band(wide).width, band(narrow).width);
});

test("boundaries are drawn outer before inner, each a level deeper", () => {
    const model = containers((json) => {
        json.model.softwareSystems[0].containers[0].group = "Web";
    });
    const graph = buildGraph(model, "FixtureContainers", "light", LABELS);

    assert.deepEqual(
        graph.boundaries.map((b) => [b.id, b.depth]),
        [
            ["2", 0],
            ["group:2:Web", 1],
        ],
    );
    const [system, group] = graph.boundaries;
    assert.equal(group.name.lines[0], "Web");
    assert.equal(group.border, "Dotted", "groups are dotted by default");
    assert.ok(group.x > system.x && group.y > system.y);
});

test("a deployment node with nothing inside is an element with its instance count", () => {
    const json = structuredClone(FIXTURE);
    json.model.deploymentNodes = [
        {
            id: "n",
            name: "Node",
            environment: "Live",
            instances: "3",
            tags: "Element,Deployment Node",
        },
    ];
    json.views.deploymentViews = [
        {
            key: "Live",
            environment: "Live",
            elements: [{ id: "n", x: 10, y: 20 }],
        },
    ];
    const graph = buildGraph(new WorkspaceModel(json), "Live", "light", LABELS);
    const [node] = graph.elements;

    assert.deepEqual(graph.boundaries, []);
    assert.deepEqual(
        [node.id, node.x, node.y, node.width, node.height, node.shape],
        ["n", 10, 20, 450, 300, "Box"],
    );
    assert.deepEqual(node.instances.lines, ["x3"]);
    assert.deepEqual(
        node.content,
        shapeGeometry("Box", 450, 300, 2).content,
        "the label keeps the shape's whole content area",
    );
    assert.ok(
        node.labelHeight < node.content.height,
        "but grows no taller than ends above the count",
    );
});

test("the enterprise boundary is labelled with the enterprise's name alone", () => {
    const json = structuredClone(FIXTURE);
    json.model.enterprise = { name: "Acme" };
    json.model.softwareSystems[0].location = "Internal";
    json.views.systemContextViews[0].enterpriseBoundaryVisible = true;
    const graph = buildGraph(
        new WorkspaceModel(json),
        "FixtureContext",
        "light",
        LABELS,
    );
    const [enterprise] = graph.boundaries;

    assert.equal(enterprise.kind, "Enterprise");
    assert.deepEqual(enterprise.name.lines, ["Acme"]);
    assert.equal(enterprise.metadata, undefined, "no [Enterprise] metadata");
    assert.deepEqual(enterprise.children, ["2"]);
});

test("an element that is not a deployment node gives its label its whole content area", () => {
    const [element] = buildGraph(
        model(),
        "FixtureContext",
        "light",
        LABELS,
    ).elements;
    assert.equal(element.labelHeight, element.content.height);
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

/* ------------------------------------------------------------------ layout */

const BIG_BANK = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/big-bank-plc.json", import.meta.url),
        "utf-8",
    ),
);

/** Every Big Bank view that draws elements: all of them automatic layouts. */
const BIG_BANK_VIEWS = [
    "SystemLandscape",
    "SystemContext",
    "Containers",
    "Components",
    "SignIn",
    "LiveDeployment",
    "DevelopmentDeployment",
];

/** Whether `a` and `b` share any area; touching is fine. */
const overlaps = (a, b) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

const contains = (outer, inner) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

/** Pairs of elements in `graph` that share area. */
const overlapping = (graph) => {
    const pairs = [];
    for (const [i, a] of graph.elements.entries())
        for (const b of graph.elements.slice(i + 1))
            if (overlaps(a, b)) pairs.push(`${a.id} and ${b.id}`);
    return pairs;
};

/** Each element id with the ids of every boundary drawn around it. */
const ancestorsIn = (graph) => {
    const parent = new Map();
    for (const boundary of graph.boundaries)
        for (const child of boundary.children) parent.set(child, boundary.id);
    const ancestors = new Map();
    for (const element of graph.elements) {
        const around = [];
        for (let p = parent.get(element.id); p; p = parent.get(p))
            around.push(p);
        ancestors.set(element.id, around);
    }
    return ancestors;
};

for (const key of BIG_BANK_VIEWS)
    test(`Big Bank's ${key} view is laid out with no overlapping elements, each inside its boundaries`, () => {
        const graph = buildGraph(
            new WorkspaceModel(BIG_BANK),
            key,
            "light",
            LABELS,
        );
        assert.ok(graph.elements.length > 1);
        assert.deepEqual(overlapping(graph), [], "elements overlap");
        const boxes = new Map(graph.boundaries.map((b) => [b.id, b]));
        for (const [id, around] of ancestorsIn(graph)) {
            const element = graph.elements.find((e) => e.id === id);
            for (const boundary of around)
                assert.ok(
                    contains(boxes.get(boundary), element),
                    `${id} is outside ${boundary}`,
                );
        }
        assert.deepEqual(graph.placements, [], "nothing was unplaced");
    });

test("an automatic layout follows the view's rank direction", () => {
    const rankedBy = (rankDirection) => {
        const json = structuredClone(BIG_BANK);
        json.views.systemContextViews[0].automaticLayout.rankDirection =
            rankDirection;
        const graph = buildGraph(
            new WorkspaceModel(json),
            "SystemContext",
            "light",
            LABELS,
        );
        const xs = graph.elements.map((e) => e.x);
        const ys = graph.elements.map((e) => e.y);
        return {
            wide: Math.max(...xs) - Math.min(...xs),
            tall: Math.max(...ys) - Math.min(...ys),
        };
    };
    const topBottom = rankedBy("TopBottom");
    const leftRight = rankedBy("LeftRight");
    assert.ok(topBottom.tall > topBottom.wide, "TopBottom should run down");
    assert.ok(leftRight.wide > leftRight.tall, "LeftRight should run across");
});

test("an automatic layout keeps Dagre's vertices only when the view asks for them", () => {
    const withVertices = (vertices) => {
        const json = structuredClone(BIG_BANK);
        json.views.containerViews[0].automaticLayout.vertices = vertices;
        return buildGraph(
            new WorkspaceModel(json),
            "Containers",
            "light",
            LABELS,
        );
    };
    assert.ok(
        withVertices(true).edges.some((e) => e.vertices.length > 0),
        "no edge kept a vertex",
    );
    assert.ok(
        withVertices(false).edges.every((e) => e.vertices.length === 0),
        "an edge kept a vertex",
    );
});

test("a relationship ending at a boundary stays out of the layout", () => {
    // Big Bank's Live deployment view has one, which is how today's renderer
    // loses the whole layout: Dagre throws on it.
    const model = new WorkspaceModel(BIG_BANK);
    const graph = buildGraph(model, "LiveDeployment", "light", LABELS);
    const boundaries = new Set(graph.boundaries.map((b) => b.id));
    const view = BIG_BANK.views.deploymentViews.find(
        (v) => v.key === "LiveDeployment",
    );
    const toBoundary = view.relationships.filter((r) => {
        const relationship = model.findRelationshipById(r.id);
        return (
            boundaries.has(relationship.sourceId) ||
            boundaries.has(relationship.destinationId)
        );
    });
    assert.ok(toBoundary.length > 0, "the view should have one");
    for (const { id } of toBoundary)
        assert.ok(!graph.edges.some((e) => e.id === id), `${id} was drawn`);
});

test("a stored layout with automaticLayout.applied keeps its coordinates", () => {
    const json = structuredClone(FIXTURE);
    json.views.systemContextViews[0].automaticLayout.applied = true;
    const graph = buildGraph(
        new WorkspaceModel(json),
        "FixtureContext",
        "light",
        LABELS,
    );
    assert.deepEqual(
        graph.elements.map(({ id, x, y }) => ({ id, x, y })),
        [
            { id: "1", x: 200, y: 200 },
            { id: "2", x: 200, y: 800 },
        ],
    );
    assert.deepEqual(graph.placements, []);
});

/* ------------------------------------------------------- unplaced elements */

test("an unplaced element goes next to its neighbor and the rest stay put", () => {
    const json = structuredClone(FIXTURE);
    json.views.systemContextViews[0].elements[0] = { id: "1", x: 0, y: 0 };
    const graph = buildGraph(
        new WorkspaceModel(json),
        "FixtureContext",
        "light",
        LABELS,
    );
    const person = graph.elements.find((e) => e.id === "1");
    const system = graph.elements.find((e) => e.id === "2");

    assert.deepEqual([system.x, system.y], [200, 800], "the system moved");
    // One separation (300) below the system, centered on it.
    assert.deepEqual(
        [person.x, person.y],
        [200 + (450 - 400) / 2, 800 + 300 + 300],
    );
    assert.deepEqual(graph.placements, [
        { id: "1", name: person.name, x: person.x, y: person.y },
    ]);
});

/**
 * Big Bank's views with their automatic layout saved as a stored one, each
 * element in turn sent back to (0,0) and placed again: with boundaries
 * derived around the rest, it lands on no element and inside no boundary it
 * does not belong to.
 */
test("Big Bank leave-one-out through buildGraph: no overlaps, no foreign boundaries", () => {
    const problems = [];
    let placements = 0;
    for (const key of BIG_BANK_VIEWS) {
        const laidOut = buildGraph(
            new WorkspaceModel(BIG_BANK),
            key,
            "light",
            LABELS,
        );
        const saved = new Map(laidOut.elements.map((e) => [e.id, e]));
        for (const { id } of laidOut.elements) {
            const json = structuredClone(BIG_BANK);
            const view = Object.values(json.views)
                .filter(Array.isArray)
                .flat()
                .find((v) => v.key === key);
            view.automaticLayout.applied = true;
            for (const placement of view.elements) {
                const box = saved.get(placement.id);
                const at = placement.id === id ? { x: 0, y: 0 } : box;
                if (!at) continue;
                placement.x = at.x;
                placement.y = at.y;
            }
            const graph = buildGraph(
                new WorkspaceModel(json),
                key,
                "light",
                LABELS,
            );
            placements += graph.placements.length;
            assert.deepEqual(
                graph.placements.map((p) => p.id),
                [id],
                `${key}: only ${id} should be placed`,
            );
            const element = graph.elements.find((e) => e.id === id);
            for (const other of graph.elements)
                if (other.id !== id && overlaps(element, other))
                    problems.push(`${key}: ${id} on ${other.id}`);
            const own = new Set(ancestorsIn(graph).get(id));
            for (const boundary of graph.boundaries)
                if (!own.has(boundary.id) && overlaps(element, boundary))
                    problems.push(`${key}: ${id} in ${boundary.id}`);
        }
    }
    assert.ok(placements >= 30, `only ${placements} placements`);
    assert.deepEqual(problems, []);
});
