/**
 * `src/engine/react-flow/report.ts`: the engine report the acceptance harness
 * reads back from a built page (spec 15.1). What a real build writes is
 * checked in Chrome by `test/acceptance.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { engineReport, REPORT_ID, removeReport, writeReport } = await importSrc(
    "engine/react-flow/report",
);

const FIXTURE = JSON.parse(
    readFileSync(
        new URL("../scripts/__fixtures__/workspace.json", import.meta.url),
        "utf-8",
    ),
);

const LABELS = { descriptions: true, technologies: true };
const graphOf = (workspace, key = "FixtureContext") =>
    buildGraph(new WorkspaceModel(workspace), key, "light", LABELS);

/* ---------------------------------------------------------------- contents */

test("the report names the view and when it became ready", () => {
    const report = engineReport(graphOf(FIXTURE), 412.5);

    assert.equal(report.view, "FixtureContext");
    assert.equal(report.readyAt, 412.5);
});

test("the report lists every drawn element with its box, shape and outline", () => {
    const report = engineReport(graphOf(FIXTURE), 0);

    assert.deepEqual(
        report.elements.map(({ id, shape, x, y, width, height }) => ({
            id,
            shape,
            x,
            y,
            width,
            height,
        })),
        [
            {
                id: "1",
                shape: "Person",
                x: 200,
                y: 200,
                width: 400,
                height: 400,
            },
            { id: "2", shape: "Box", x: 200, y: 800, width: 450, height: 300 },
        ],
    );
    // Every element is drawn as its box until shapes have outlines of their
    // own (#43), so the outline is the box's four corners.
    assert.deepEqual(report.elements[1].outline, [
        { x: 200, y: 800 },
        { x: 650, y: 800 },
        { x: 650, y: 1100 },
        { x: 200, y: 1100 },
    ]);
});

test("the report lists every drawn edge with its ends and path samples", () => {
    const graph = graphOf(FIXTURE);
    const [line] = graph.edges;
    const report = engineReport(graph, 0);

    assert.deepEqual(report.edges, [
        {
            key: "10",
            id: "10",
            sourceId: "1",
            targetId: "2",
            vertices: false,
            path: [line.source, line.target],
        },
    ]);
    // Leaves the Person through its bottom, enters the system through its top.
    assert.equal(report.edges[0].path[0].y, 600);
    assert.equal(report.edges[0].path.at(-1).y, 800);
});

test("a dynamic view's edges carry their order", () => {
    const workspace = structuredClone(FIXTURE);
    workspace.views.dynamicViews = [
        {
            key: "FixtureDynamic",
            elements: workspace.views.systemContextViews[0].elements,
            relationships: [{ id: "10", order: "1", description: "Request" }],
        },
    ];
    const [edge] = engineReport(graphOf(workspace, "FixtureDynamic"), 0).edges;

    assert.equal(edge.order, "1");
});

test("an edge with stored vertices says so", () => {
    const workspace = structuredClone(FIXTURE);
    workspace.views.systemContextViews[0].relationships[0].vertices = [
        { x: 600, y: 700 },
    ];
    const [edge] = engineReport(graphOf(workspace), 0).edges;

    assert.equal(edge.vertices, true);
});

test("boundaries are reported empty until the engine draws them (#44)", () => {
    assert.deepEqual(engineReport(graphOf(FIXTURE), 0).boundaries, []);
});

/* ----------------------------------------------------------------- writing */

const reportScript = () => dom.document.getElementById(REPORT_ID);

test("writeReport puts the report in a JSON script element", () => {
    const report = engineReport(graphOf(FIXTURE), 7);
    writeReport(dom.document, report);

    const script = reportScript();
    assert.ok(script, "no #engine-report in the document");
    assert.equal(script.getAttribute("type"), "application/json");
    assert.deepEqual(JSON.parse(script.textContent), report);
    removeReport(dom.document);
});

test("a second view replaces the report rather than adding one", () => {
    const report = engineReport(graphOf(FIXTURE), 1);
    writeReport(dom.document, report);
    writeReport(dom.document, { ...report, view: "Other" });

    assert.equal(
        dom.document.querySelectorAll(`#${REPORT_ID}`).length,
        1,
        "the report was written twice",
    );
    assert.equal(JSON.parse(reportScript().textContent).view, "Other");
    removeReport(dom.document);
});

test("text that would close the script element is escaped", () => {
    // An element named `</script>` would end the element early when the
    // dumped document is parsed back.
    const workspace = structuredClone(FIXTURE);
    workspace.views.systemContextViews[0].key = "</script><b>";
    const report = engineReport(graphOf(workspace, "</script><b>"), 0);
    writeReport(dom.document, report);

    const text = reportScript().textContent;
    assert.ok(!text.includes("</script>"), "the closing tag survived");
    assert.equal(JSON.parse(text).view, "</script><b>");
    removeReport(dom.document);
});

test("removeReport takes the report out of the document", () => {
    writeReport(dom.document, engineReport(graphOf(FIXTURE), 0));
    removeReport(dom.document);

    assert.equal(reportScript(), null);
});
