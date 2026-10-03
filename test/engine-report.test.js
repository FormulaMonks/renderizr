/**
 * `src/engine/react-flow/report.ts` and `report-script.ts`: the engine report
 * the acceptance harness reads back from a built page (spec 15.1), and the
 * script element it travels in. What a real build writes is checked in Chrome
 * by `test/acceptance.test.js`.
 */

import assert from "node:assert/strict";
import { readJsonFixture } from "../scripts/__fixtures__/helpers.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { engineReport } = await importSrc("engine/react-flow/report");
const { REPORT_ID, removeReport, writeReport } = await importSrc(
    "engine/react-flow/report-script",
);

const FIXTURE = readJsonFixture("workspace.json");

const LABELS = { descriptions: true, technologies: true };
const graphOf = (workspace, key = "FixtureContext") =>
    buildGraph(new WorkspaceModel(workspace), key, "light", LABELS);

/* ---------------------------------------------------------------- contents */

test("the report names the view it describes", () => {
    assert.equal(
        engineReport(graphOf(FIXTURE)).view,
        "FixtureContext",
        "the report names another view",
    );
});

test("the report lists every drawn element with its shape and box", () => {
    // No outline: the harness derives where edge ends belong from the shape
    // and box with geometry of its own, so the engine cannot vouch for itself.
    assert.deepEqual(
        engineReport(graphOf(FIXTURE)).elements,
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
        "the reported elements differ from the drawn ones",
    );
});

test("the report lists every drawn edge with its ends and route", () => {
    const graph = graphOf(FIXTURE);
    const [line] = graph.edges;
    const report = engineReport(graph);

    assert.deepEqual(
        report.edges,
        [
            {
                key: "10",
                id: "10",
                sourceId: "1",
                targetId: "2",
                routedByAuthor: false,
                route: [line.source, line.target],
            },
        ],
        "the reported edges differ from the drawn ones",
    );
    // Leaves the Person through its bottom, enters the system through its top.
    assert.equal(
        report.edges[0].route[0].y,
        600,
        "the route does not leave the Person through its bottom",
    );
    assert.equal(
        report.edges[0].route.at(-1).y,
        800,
        "the route does not enter the system through its top",
    );
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
    const [edge] = engineReport(graphOf(workspace, "FixtureDynamic")).edges;

    assert.equal(edge.order, "1", "the edge lost its order");
});

test("an edge with stored vertices is reported as routed by its author", () => {
    const workspace = structuredClone(FIXTURE);
    workspace.views.systemContextViews[0].relationships[0].vertices = [
        { x: 600, y: 700 },
    ];
    const [edge] = engineReport(graphOf(workspace)).edges;

    assert.equal(
        edge.routedByAuthor,
        true,
        "an edge with vertices is reported as free to route",
    );
});

test("boundaries are reported empty until the engine draws them (#44)", () => {
    assert.deepEqual(
        engineReport(graphOf(FIXTURE)).boundaries,
        [],
        "the tracer reported boundaries it does not draw",
    );
});

/* ----------------------------------------------------------------- writing */

const reportScript = () => dom.document.getElementById(REPORT_ID);

test("writeReport puts the report in a JSON script element", () => {
    const report = engineReport(graphOf(FIXTURE));
    writeReport(dom.document, report);

    const script = reportScript();
    assert.ok(script, "no #engine-report in the document");
    assert.equal(
        script.getAttribute("type"),
        "application/json",
        "the report is not typed as JSON, so the page would run it",
    );
    assert.deepEqual(
        JSON.parse(script.textContent),
        report,
        "the written report does not read back as the one given",
    );
    removeReport(dom.document);
});

test("a second view replaces the report rather than adding one", () => {
    const report = engineReport(graphOf(FIXTURE));
    writeReport(dom.document, report);
    writeReport(dom.document, { ...report, view: "Other" });

    assert.equal(
        dom.document.querySelectorAll(`#${REPORT_ID}`).length,
        1,
        "the report was written twice",
    );
    assert.equal(
        JSON.parse(reportScript().textContent).view,
        "Other",
        "the report still describes the first view",
    );
    removeReport(dom.document);
});

test("text that would close the script element is escaped", () => {
    // An element named `</script>` would end the element early when the
    // dumped document is parsed back.
    const workspace = structuredClone(FIXTURE);
    workspace.views.systemContextViews[0].key = "</script><b>";
    const report = engineReport(graphOf(workspace, "</script><b>"));
    writeReport(dom.document, report);

    const text = reportScript().textContent;
    assert.ok(!text.includes("</script>"), "the closing tag survived");
    assert.equal(
        JSON.parse(text).view,
        "</script><b>",
        "escaping changed the view key",
    );
    removeReport(dom.document);
});

test("removeReport takes the report out of the document", () => {
    writeReport(dom.document, engineReport(graphOf(FIXTURE)));
    removeReport(dom.document);

    assert.equal(reportScript(), null, "the report outlived the engine");
});
