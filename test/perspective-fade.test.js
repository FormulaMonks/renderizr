/**
 * A selected perspective on the React Flow engine's graph (spec: What a
 * selected perspective draws): what carries it stays at full strength,
 * colored by the author's `Perspective` styles, and the rest fades as an
 * animation step fades it. Boundaries and Mermaid diagrams never change.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { stepStateOf } = await importSrc("engine/react-flow/animation");
const { estimateText } = await importSrc("engine/geometry/boundary");
const { exportFrame } = await importSrc("engine/geometry/canvas");
const { exportSvg } = await importSrc("engine/react-flow/export-svg");

const fixture = (name) =>
    JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}.json`, import.meta.url),
            "utf-8",
        ),
    );

const PERSPECTIVES = fixture("perspectives");
const LABELS = { descriptions: true, technologies: true };

const graphOf = (key, perspective, workspace = PERSPECTIVES) =>
    buildGraph(
        new WorkspaceModel(workspace),
        key,
        "light",
        LABELS,
        estimateText,
        undefined,
        perspective,
    );

/** What view `key` shows of each element and edge, by id, with no step. */
function presences(graph) {
    const state = stepStateOf(graph, null);
    return {
        elements: state.elements,
        boundaries: state.boundaries,
        edges: Object.fromEntries(
            graph.edges.map((edge) => [edge.id, state.edges[edge.key]]),
        ),
    };
}

test("the graph lists the perspectives its drawn items carry, sorted", () => {
    assert.deepEqual(graphOf("Containers").perspectives, [
        "Ownership",
        "Security",
    ]);
    assert.deepEqual(graphOf("Context").perspectives, [
        "Ownership",
        "Security",
    ]);
    assert.deepEqual(graphOf("Mailing").perspectives, []);
});

test("what doesn't carry the perspective fades, and what carries it stays at full strength", () => {
    const graph = graphOf("Containers", "Security");
    assert.equal(graph.perspective, "Security");
    const { elements, edges } = presences(graph);
    assert.deepEqual(elements, {
        1: "faded",
        3: "shown",
        4: "shown",
        5: "shown",
        6: "shown",
        7: "shown",
        8: "faded",
    });
    assert.deepEqual(edges, {
        10: "shown",
        11: "faded",
        12: "shown",
        13: "shown",
        14: "faded",
        15: "shown",
    });
});

test("a relationship that carries the perspective stays at full strength when both its ends fade", () => {
    const { elements, edges } = presences(graphOf("Containers", "Security"));
    assert.equal(elements["1"], "faded");
    assert.equal(elements["8"], "faded");
    assert.equal(edges["15"], "shown");
});

test("an implied relationship and an instance carry what they link to", () => {
    const context = presences(graphOf("Context", "Security"));
    assert.equal(context.edges["16"], "shown");
    assert.equal(context.edges["17"], "shown");
    assert.equal(context.elements["2"], "faded");
    const live = presences(graphOf("Live", "Security"));
    assert.equal(live.elements["21"], "shown");
    assert.equal(live.elements["22"], "shown");
    assert.equal(live.elements["23"], "shown");
});

test("boundaries never fade and never take a perspective style", () => {
    const plain = graphOf("Live");
    const graph = graphOf("Live", "Ownership");
    assert.ok(graph.boundaries.length > 0);
    assert.deepEqual(graph.boundaries, plain.boundaries);
    for (const presence of Object.values(presences(graph).boundaries))
        assert.equal(presence, "shown");
});

test("the author's Perspective styles color what carries the perspective", () => {
    const plain = graphOf("Containers");
    const graph = graphOf("Containers", "Ownership");
    const color = (g, id) => g.elements.find((e) => e.id === id).background;
    assert.equal(color(graph, "3"), "#6a1b9a");
    assert.equal(color(graph, "7"), "#6a1b9a");
    assert.equal(color(graph, "6"), color(plain, "6"));
    assert.equal(color(graph, "4"), color(plain, "4"));
});

test("a perspective without styles shows by the fade alone", () => {
    const plain = graphOf("Containers");
    const graph = graphOf("Containers", "Security");
    const strip = (g) => ({
        elements: g.elements.map(({ faded: _, ...box }) => box),
        edges: g.edges.map(({ faded: _, ...edge }) => edge),
    });
    assert.deepEqual(strip(graph), strip(plain));
});

test("a view where nothing drawn carries the perspective draws as with no perspective", () => {
    assert.deepEqual(graphOf("Mailing", "Security"), graphOf("Mailing"));
    assert.deepEqual(graphOf("Containers", "Nope"), graphOf("Containers"));
});

test("every view draws as before while no perspective is passed", () => {
    const graph = graphOf("Containers");
    assert.equal(graph.perspective, undefined);
    assert.ok(graph.elements.every((box) => box.faded === undefined));
    assert.ok(graph.edges.every((edge) => edge.faded === undefined));
    assert.deepEqual(graphOf("Containers", null), graph);
});

test("a Mermaid diagram ignores the perspective", () => {
    const mermaid = fixture("mermaid-flowchart");
    const plain = graphOf("plain", undefined, mermaid);
    assert.deepEqual(plain.perspectives, []);
    assert.deepEqual(graphOf("plain", "Security", mermaid), plain);
});

test("when a step and the perspective both apply, the stronger effect wins", () => {
    const workspace = structuredClone(PERSPECTIVES);
    const view = workspace.views.containerViews.find(
        (v) => v.key === "Containers",
    );
    view.animations = [
        { order: 1, elements: ["1", "3"], relationships: ["10"] },
        { order: 2, elements: ["8"], relationships: ["15"] },
    ];
    const graph = graphOf("Containers", "Security", workspace);
    const first = stepStateOf(graph, 1);
    // Hidden by the step beats faded by the perspective.
    assert.equal(first.elements["8"], "hidden");
    // Faded by the perspective beats shown by the step.
    assert.equal(first.elements["1"], "faded");
    // Shown by both.
    assert.equal(first.elements["3"], "shown");
    const second = stepStateOf(graph, 2);
    assert.equal(second.elements["8"], "faded");
    const edge = graph.edges.find((e) => e.id === "15");
    assert.equal(second.edges[edge.key], "shown");
});

test("an export draws faded items at 0.2", () => {
    const graph = graphOf("Containers", "Security");
    const { svg } = exportSvg({
        graph,
        step: stepStateOf(graph, null),
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: "Shop containers",
            description: "",
            user: "",
            modified: "",
        },
        text: {
            measure: estimateText,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    });
    assert.match(svg, /<g opacity="0\.2"><g data-element-id="1">/);
    assert.doesNotMatch(svg, /<g opacity="0\.2"><g data-element-id="3">/);
});
