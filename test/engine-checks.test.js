/**
 * `test/support/engine-checks.js`: the geometry rules the acceptance harness
 * holds every engine report to (spec 15.1, 15.2). Each check is fed a report
 * that breaks exactly one rule, so a check that always passes cannot hide
 * here. `test/acceptance.test.js` runs them against real builds.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    avoidsElements,
    distanceToOutline,
    edgeEndsOnOutlines,
    elementsInsideBoundaries,
    expectedDrawing,
    noOverlappingElements,
    readyInTime,
    sameIdsAsResolved,
    storedElementsInPlace,
    unexpectedLogs,
} from "./support/engine-checks.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");

const FIXTURE = JSON.parse(
    readFileSync(
        new URL("../scripts/__fixtures__/workspace.json", import.meta.url),
        "utf-8",
    ),
);

const box = (id, x, y, width = 100, height = 100) => ({
    id,
    shape: "Box",
    x,
    y,
    width,
    height,
    outline: [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
    ],
});

const edge = (id, sourceId, targetId, path, vertices = false) => ({
    key: id,
    id,
    sourceId,
    targetId,
    vertices,
    path,
});

const report = (parts) => ({
    view: "V",
    readyAt: 100,
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

    assert.equal(expected.layout, "stored");
    assert.deepEqual(expected.elements, [
        { id: "1", x: 200, y: 200, width: 400, height: 400, placed: true },
        { id: "2", x: 200, y: 800, width: 450, height: 300, placed: true },
    ]);
    assert.deepEqual(expected.boundaries, []);
    assert.deepEqual(expected.edges, ["10"]);
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
    );
    assert.deepEqual(expected.boundaries, ["2"]);
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

    assert.deepEqual(expected.edges, []);
});

test("a view the workspace does not have is an error, not an empty drawing", () => {
    assert.throws(
        () => expectedDrawing(new WorkspaceModel(FIXTURE), "Nope"),
        /Nope/,
    );
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

test("drawing exactly what resolveView says passes", () => {
    const drawn = report({
        elements: [box("1", 0, 0), box("2", 300, 0)],
        edges: [
            edge("10", "1", "2", [
                { x: 100, y: 50 },
                { x: 300, y: 50 },
            ]),
        ],
    });
    assert.deepEqual(sameIdsAsResolved(drawn, RESOLVED), []);
});

test("a missing element, an extra edge and a missing boundary are each named", () => {
    const drawn = report({
        elements: [box("1", 0, 0)],
        edges: [edge("10", "1", "2", []), edge("11", "1", "2", [])],
    });
    const problems = sameIdsAsResolved(drawn, {
        ...RESOLVED,
        boundaries: ["7"],
    });

    assert.equal(problems.length, 3, problems.join("\n"));
    assert.match(problems.join("\n"), /element.*2/);
    assert.match(problems.join("\n"), /boundar.*7/);
    assert.match(problems.join("\n"), /edge.*11/);
});

test("a dynamic view's repeated relationship has to be drawn as often as it is listed", () => {
    const problems = sameIdsAsResolved(
        report({
            elements: [box("1", 0, 0), box("2", 300, 0)],
            edges: [edge("10", "1", "2", [])],
        }),
        { ...RESOLVED, edges: ["10", "10"] },
    );
    assert.equal(problems.length, 1);
});

/* ------------------------------------------------------------ stored layout */

test("a stored element drawn elsewhere or at another size is named", () => {
    const problems = storedElementsInPlace(
        report({ elements: [box("1", 0, 1), box("2", 300, 0, 120)] }),
        RESOLVED,
    );
    assert.equal(problems.length, 2, problems.join("\n"));
    assert.match(problems[0], /1/);
    assert.match(problems[1], /2/);
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
    assert.deepEqual(
        storedElementsInPlace(
            report({ elements: [box("1", 0, 0), box("2", 500, 500)] }),
            resolved,
        ),
        [],
    );
});

test("an automatic layout has no stored positions to keep", () => {
    assert.deepEqual(
        storedElementsInPlace(report({ elements: [box("1", 50, 50)] }), {
            ...RESOLVED,
            layout: "automatic",
        }),
        [],
    );
});

/* ---------------------------------------------------------------- overlaps */

test("overlapping elements are named; touching ones are fine", () => {
    assert.deepEqual(
        noOverlappingElements(
            report({ elements: [box("1", 0, 0), box("2", 100, 0)] }),
        ),
        [],
    );
    const problems = noOverlappingElements(
        report({ elements: [box("1", 0, 0), box("2", 99, 0)] }),
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /1.*2/);
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
    assert.deepEqual(
        elementsInsideBoundaries(
            report({
                elements: [box("1", 50, 50)],
                boundaries: [boundary(["1"])],
            }),
        ),
        [],
    );
    const problems = elementsInsideBoundaries(
        report({
            elements: [box("1", 250, 50)],
            boundaries: [boundary(["1"])],
        }),
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /1.*9/);
});

/* --------------------------------------------------------------- edge ends */

test("distanceToOutline measures to the nearest side, inside or out", () => {
    const outline = box("1", 0, 0).outline;
    assert.equal(distanceToOutline({ x: 50, y: 0 }, outline), 0);
    assert.equal(distanceToOutline({ x: 50, y: -3 }, outline), 3);
    assert.equal(distanceToOutline({ x: 50, y: 10 }, outline), 10);
    assert.equal(distanceToOutline({ x: 103, y: 104 }, outline), 5);
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
    assert.deepEqual(edgeEndsOnOutlines(drawn), []);
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
    assert.match(problems[0], /10.*source/);
    assert.match(problems[1], /10.*target/);
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
    assert.equal(problems.length, 1);
    assert.match(problems[0], /13.*2/);
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
    assert.deepEqual(
        avoidsElements(
            report({ elements: THREE_IN_A_ROW, edges: [around, grazing] }),
        ),
        [],
    );
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
    assert.deepEqual(
        avoidsElements(report({ elements: THREE_IN_A_ROW, edges: [authored] })),
        [],
    );
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
    );
    assert.deepEqual(
        unexpectedLogs(["Uncaught TypeError: x is undefined"], known),
        ["Uncaught TypeError: x is undefined"],
    );
});

/* ------------------------------------------------------------------- timing */

test("a view ready within the limit passes; a slow one says how slow", () => {
    assert.deepEqual(readyInTime(report({ readyAt: 1999 }), 2000), []);
    const [problem] = readyInTime(report({ readyAt: 2400 }), 2000);
    assert.match(problem, /2400.*2000/);
});
