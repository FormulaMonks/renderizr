/**
 * `test/support/engine-checks.js`: the geometry rules the acceptance harness
 * holds every engine report to (spec 15.1, 15.2). Each check is fed a report
 * that breaks exactly one rule, so a check that always passes cannot hide
 * here. `test/acceptance.test.js` runs them against real builds.
 */

import assert from "node:assert/strict";
import { readJsonFixture } from "../scripts/__fixtures__/helpers.js";
import {
    avoidsElements,
    distanceToOutline,
    edgeEndsOnOutlines,
    elementOutline,
    elementsInsideBoundaries,
    expectedDrawing,
    isAutomatic,
    noOverlappingElements,
    readyInTime,
    sameBoundariesAsResolved,
    sameElementsAndEdgesAsResolved,
    storedElementsInPlace,
    unexpectedLogs,
} from "./support/engine-checks.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");

const FIXTURE = readJsonFixture("workspace.json");

/** An element as the engine reports it: a shape and a box, nothing more. */
const box = (id, x, y, width = 100, height = 100) => ({
    id,
    shape: "Box",
    x,
    y,
    width,
    height,
});

const edge = (id, sourceId, targetId, route, routedByAuthor = false) => ({
    key: id,
    id,
    sourceId,
    targetId,
    routedByAuthor,
    route,
});

const report = (parts) => ({
    view: "V",
    elements: [],
    boundaries: [],
    edges: [],
    ...parts,
});

/* -------------------------------------------------- what resolveView says */

test("the expected drawing of a stored view lists its elements at their stored boxes", () => {
    const expected = expectedDrawing(
        new WorkspaceModel(FIXTURE),
        "FixtureContext",
    );

    assert.equal(expected.layout, "stored", "the view is not a stored layout");
    assert.deepEqual(
        expected.elements,
        [
            { id: "1", x: 200, y: 200, width: 400, height: 400, placed: true },
            { id: "2", x: 200, y: 800, width: 450, height: 300, placed: true },
        ],
        "the expected elements are not the stored boxes",
    );
    assert.deepEqual(expected.boundaries, [], "a boundary was expected");
    assert.deepEqual(
        expected.edges,
        ["10"],
        "the expected edges are not the view's relationships",
    );
});

test("a boundary is expected as a boundary, not an element", () => {
    const json = structuredClone(FIXTURE);
    json.views.systemContextViews[1].elements.push({ id: "3", x: 300, y: 300 });
    const expected = expectedDrawing(
        new WorkspaceModel(json),
        "FixtureContainers",
    );

    assert.deepEqual(
        expected.elements.map((element) => element.id),
        ["3"],
        "the boundary is expected as an element",
    );
    assert.deepEqual(
        expected.boundaries,
        ["2"],
        "the boundary is not expected",
    );
    assert.deepEqual(
        expected.nesting,
        { 2: ["3"] },
        "the container is not expected inside the system",
    );
});

test("groups and the boundaries a view does not list are expected too", () => {
    const json = structuredClone(FIXTURE);
    json.model.softwareSystems[0].containers[0].group = "Web";
    json.views.systemContextViews[1].elements = [{ id: "3", x: 300, y: 300 }];
    const expected = expectedDrawing(
        new WorkspaceModel(json),
        "FixtureContainers",
    );

    assert.deepEqual(expected.boundaries, ["2", "group:2:Web"]);
    assert.deepEqual(expected.nesting, {
        2: ["group:2:Web"],
        "group:2:Web": ["3"],
    });
});

test("a relationship ending at a boundary is not expected as an edge", () => {
    // Spec 10.6: it is skipped with a warning.
    const json = structuredClone(FIXTURE);
    const containers = json.views.systemContextViews[1];
    containers.elements.push({ id: "1", x: 900, y: 300 });
    containers.elements.push({ id: "3", x: 300, y: 300 });
    containers.relationships = [{ id: "10" }];
    const expected = expectedDrawing(
        new WorkspaceModel(json),
        "FixtureContainers",
    );

    assert.deepEqual(
        expected.edges,
        [],
        "a relationship ending at a boundary is expected as an edge",
    );
});

test("a view the workspace does not have is an error, not an empty drawing", () => {
    assert.throws(
        () => expectedDrawing(new WorkspaceModel(FIXTURE), "Nope"),
        /Nope/,
        "an unknown view key was expected as an empty drawing",
    );
});

test("only an automatic layout counts as automatic", () => {
    const cases = [
        ["automatic", true],
        ["stored", false],
        ["unplaced", false],
    ];
    for (const [layout, automatic] of cases) {
        assert.equal(
            isAutomatic({ layout }),
            automatic,
            `a layout of "${layout}" is misjudged`,
        );
    }
});

/* --------------------------------------------------------------- the same ids */

const RESOLVED = {
    layout: "stored",
    elements: [
        { id: "1", x: 0, y: 0, width: 100, height: 100, placed: true },
        { id: "2", x: 300, y: 0, width: 100, height: 100, placed: true },
    ],
    boundaries: [],
    edges: ["10"],
};

test("drawing exactly the elements and edges resolveView says passes", () => {
    const drawn = report({
        elements: [box("1", 0, 0), box("2", 300, 0)],
        edges: [
            edge("10", "1", "2", [
                { x: 100, y: 50 },
                { x: 300, y: 50 },
            ]),
        ],
    });
    const problems = sameElementsAndEdgesAsResolved(drawn, RESOLVED);
    assert.deepEqual(problems, [], problems.join("\n"));
});

test("a missing element and an extra edge are each named", () => {
    const drawn = report({
        elements: [box("1", 0, 0)],
        edges: [edge("10", "1", "2", []), edge("11", "1", "2", [])],
    });
    const problems = sameElementsAndEdgesAsResolved(drawn, RESOLVED);

    assert.equal(problems.length, 2, problems.join("\n"));
    assert.match(
        problems.join("\n"),
        /element.*2/,
        "the missing element is not named",
    );
    assert.match(
        problems.join("\n"),
        /edge.*11/,
        "the extra edge is not named",
    );
});

test("a missing boundary does not fail the element and edge check", () => {
    // Boundary ids are checked on their own, so a view's elements and edges
    // are judged apart from its boundaries.
    const drawn = report({
        elements: [box("1", 0, 0), box("2", 300, 0)],
        edges: [edge("10", "1", "2", [])],
    });
    const withBoundary = { ...RESOLVED, boundaries: ["7"] };

    const problems = sameElementsAndEdgesAsResolved(drawn, withBoundary);
    assert.deepEqual(problems, [], problems.join("\n"));
    const [missing, ...rest] = sameBoundariesAsResolved(drawn, withBoundary);
    assert.match(missing, /boundary 7/, "the missing boundary is not named");
    assert.deepEqual(rest, [], rest.join("\n"));
});

test("an extra boundary is named", () => {
    const drawn = report({
        boundaries: [
            { id: "8", x: 0, y: 0, width: 10, height: 10, children: [] },
        ],
    });
    const problems = sameBoundariesAsResolved(drawn, RESOLVED);
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /boundary 8/, "the extra boundary is not named");
});

test("a dynamic view's repeated relationship has to be drawn as often as it is listed", () => {
    const problems = sameElementsAndEdgesAsResolved(
        report({
            elements: [box("1", 0, 0), box("2", 300, 0)],
            edges: [edge("10", "1", "2", [])],
        }),
        { ...RESOLVED, edges: ["10", "10"] },
    );
    assert.equal(problems.length, 1, problems.join("\n"));
});

/* ------------------------------------------------------------ stored layout */

test("a stored element drawn elsewhere or at another size is named", () => {
    const problems = storedElementsInPlace(
        report({ elements: [box("1", 0, 1), box("2", 300, 0, 120)] }),
        RESOLVED,
    );
    assert.equal(problems.length, 2, problems.join("\n"));
    assert.match(problems[0], /1/, "the moved element is not named");
    assert.match(problems[1], /2/, "the resized element is not named");
});

test("an unplaced element may go anywhere; the placed ones may not move", () => {
    const resolved = {
        ...RESOLVED,
        layout: "unplaced",
        elements: [
            RESOLVED.elements[0],
            { ...RESOLVED.elements[1], x: 0, y: 0, placed: false },
        ],
    };
    const problems = storedElementsInPlace(
        report({ elements: [box("1", 0, 0), box("2", 500, 500)] }),
        resolved,
    );
    assert.deepEqual(problems, [], problems.join("\n"));
});

test("an automatic layout has no stored positions to keep", () => {
    const problems = storedElementsInPlace(
        report({ elements: [box("1", 50, 50)] }),
        { ...RESOLVED, layout: "automatic" },
    );
    assert.deepEqual(problems, [], problems.join("\n"));
});

/* ---------------------------------------------------------------- overlaps */

const AUTOMATIC = { ...RESOLVED, layout: "automatic" };

test("overlapping elements in an automatic layout are named; touching ones are fine", () => {
    const touching = noOverlappingElements(
        report({ elements: [box("1", 0, 0), box("2", 100, 0)] }),
        AUTOMATIC,
    );
    assert.deepEqual(touching, [], touching.join("\n"));
    const problems = noOverlappingElements(
        report({ elements: [box("1", 0, 0), box("2", 99, 0)] }),
        AUTOMATIC,
    );
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /1.*2/, "the overlapping pair is not named");
});

test("a stored layout may overlap elements where its author put them", () => {
    const problems = noOverlappingElements(
        report({ elements: [box("1", 0, 0), box("2", 50, 0)] }),
        RESOLVED,
    );
    assert.deepEqual(problems, [], problems.join("\n"));
});

/* --------------------------------------------------------------- boundaries */

test("an element poking out of its boundary is named", () => {
    const boundary = (children) => ({
        id: "9",
        x: 0,
        y: 0,
        width: 300,
        height: 300,
        children,
    });
    const inside = elementsInsideBoundaries(
        report({
            elements: [box("1", 50, 50)],
            boundaries: [boundary(["1"])],
        }),
    );
    assert.deepEqual(inside, [], inside.join("\n"));
    const problems = elementsInsideBoundaries(
        report({
            elements: [box("1", 250, 50)],
            boundaries: [boundary(["1"])],
        }),
    );
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /1.*9/, "the escaping element is not named");
});

test("where elements belong comes from resolveView, not from what the engine says it put inside", () => {
    const drawn = report({
        elements: [box("1", 250, 50)],
        boundaries: [
            { id: "9", x: 0, y: 0, width: 300, height: 300, children: [] },
        ],
    });
    const problems = elementsInsideBoundaries(drawn, {
        ...RESOLVED,
        nesting: { 9: ["1"] },
    });
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /1.*9/, "the escaping element is not named");
});

test("an element has to sit inside every boundary around it, not only the nearest", () => {
    const drawn = report({
        elements: [box("1", 450, 50)],
        boundaries: [
            { id: "9", x: 0, y: 0, width: 300, height: 300, children: ["8"] },
            { id: "8", x: 400, y: 0, width: 300, height: 300, children: ["1"] },
        ],
    });
    const problems = elementsInsideBoundaries(drawn, {
        ...RESOLVED,
        nesting: { 9: ["8"], 8: ["1"] },
    });
    assert.deepEqual(
        problems,
        ["8 pokes out of boundary 9", "1 pokes out of boundary 9"],
        problems.join("\n"),
    );
});

/* --------------------------------------------------------------- edge ends */

test("an element's outline is worked out from its shape and box", () => {
    // Every shape is held to its box until #43 draws the shapes.
    assert.deepEqual(
        elementOutline({
            shape: "Person",
            x: 10,
            y: 20,
            width: 100,
            height: 50,
        }),
        [
            { x: 10, y: 20 },
            { x: 110, y: 20 },
            { x: 110, y: 70 },
            { x: 10, y: 70 },
        ],
        "the outline is not the box's four corners, clockwise from the top-left",
    );
});

test("distanceToOutline measures to the nearest side, inside or out", () => {
    const square = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
    ];
    const cases = [
        [{ x: 50, y: 0 }, 0],
        [{ x: 50, y: -3 }, 3],
        [{ x: 50, y: 10 }, 10],
        [{ x: 103, y: 104 }, 5],
    ];
    for (const [point, distance] of cases) {
        assert.equal(
            distanceToOutline(point, square),
            distance,
            `(${point.x}, ${point.y}) is measured wrongly`,
        );
    }
});

test("edge ends within 1 unit of their elements' outlines pass", () => {
    const drawn = report({
        elements: [box("1", 0, 0), box("2", 300, 0)],
        edges: [
            edge("10", "1", "2", [
                { x: 100.5, y: 50 },
                { x: 299.2, y: 50 },
            ]),
        ],
    });
    const problems = edgeEndsOnOutlines(drawn);
    assert.deepEqual(problems, [], problems.join("\n"));
});

test("an edge end off its element's outline is named, end by end", () => {
    const drawn = report({
        elements: [box("1", 0, 0), box("2", 300, 0)],
        edges: [
            edge("10", "1", "2", [
                { x: 50, y: 50 },
                { x: 350, y: 50 },
            ]),
        ],
    });
    const problems = edgeEndsOnOutlines(drawn);
    assert.equal(problems.length, 2, problems.join("\n"));
    assert.match(problems[0], /10.*source/, "the source end is not named");
    assert.match(problems[1], /10.*target/, "the target end is not named");
});

test("an edge end inside a shaped element's box passes; outside it, it is named", () => {
    // A Person's head is narrower than its box, so an edge from the side
    // meets it inside the box. The harness has no outline per shape yet.
    const person = { ...box("1", 0, 0), shape: "Person" };
    const inside = report({
        elements: [person, box("2", 300, 0)],
        edges: [
            edge("10", "1", "2", [
                { x: 70, y: 20 },
                { x: 300, y: 50 },
            ]),
        ],
    });
    const outside = report({
        elements: [person, box("2", 300, 0)],
        edges: [
            edge("10", "1", "2", [
                { x: 120, y: 20 },
                { x: 300, y: 50 },
            ]),
        ],
    });
    assert.deepEqual(edgeEndsOnOutlines(inside), []);
    assert.equal(edgeEndsOnOutlines(outside).length, 1);
});

/* ---------------------------------------------------------------- avoidance */

const THREE_IN_A_ROW = [box("1", 0, 0), box("2", 300, 0), box("3", 600, 0)];

test("an edge without vertices crossing another element is named", () => {
    const problems = avoidsElements(
        report({
            elements: THREE_IN_A_ROW,
            edges: [
                edge("13", "1", "3", [
                    { x: 100, y: 50 },
                    { x: 600, y: 50 },
                ]),
            ],
        }),
    );
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /13.*2/, "the crossing is not named");
});

test("a route around the element, or along its side, avoids it", () => {
    const around = edge("13", "1", "3", [
        { x: 50, y: 100 },
        { x: 50, y: 150 },
        { x: 650, y: 150 },
        { x: 650, y: 100 },
    ]);
    const grazing = edge("12", "1", "3", [
        { x: 100, y: 100 },
        { x: 600, y: 100 },
    ]);
    const problems = avoidsElements(
        report({ elements: THREE_IN_A_ROW, edges: [around, grazing] }),
    );
    assert.deepEqual(problems, [], problems.join("\n"));
});

test("an edge the author routed through vertices is not held to avoidance", () => {
    const authored = edge(
        "13",
        "1",
        "3",
        [
            { x: 100, y: 50 },
            { x: 600, y: 50 },
        ],
        true,
    );
    const problems = avoidsElements(
        report({ elements: THREE_IN_A_ROW, edges: [authored] }),
    );
    assert.deepEqual(problems, [], problems.join("\n"));
});

/* -------------------------------------------------------------- the console */

test("console lines matching a known warning are allowed; anything else is named", () => {
    const known = [/^Relationship ".*" ends at a boundary/];
    assert.deepEqual(
        unexpectedLogs(
            ['Relationship "A → B" ends at a boundary; skipped'],
            known,
        ),
        [],
        "a known warning was reported",
    );
    assert.deepEqual(
        unexpectedLogs(["Uncaught TypeError: x is undefined"], known),
        ["Uncaught TypeError: x is undefined"],
        "an uncaught error went unreported",
    );
});

/* ------------------------------------------------------------------- timing */

test("a view ready within the limit passes; a slow one says how slow", () => {
    assert.deepEqual(
        readyInTime(1999, 2000),
        [],
        "a view ready in time was reported",
    );
    const [problem] = readyInTime(2400, 2000);
    assert.match(problem, /2400.*2000/, "the slow view is not reported");
});
