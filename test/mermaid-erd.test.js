/**
 * Mermaid ERDs as the page draws them (spec: ERD entities): entities
 * collapsed and expanded, their rows' colors, their toggles in the Tab
 * order, their relationships' lines and ends, and their export. The
 * build's half is in `scripts/mermaid/erd.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    mermaidView,
    mermaidWorkspace,
} from "../scripts/__fixtures__/mermaid.js";
import { readMermaidDiagrams } from "../scripts/mermaid/index.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, findViewError, resolveView, mermaidPrimaryColor } =
    await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { estimateText } = await importSrc("engine/geometry/boundary");
const { collapsedContent, layOutEntity, rowTints, parseColor, TOGGLE_ROOM } =
    await importSrc("engine/geometry/entity");
const { spreadEnds } = await importSrc("engine/geometry/routing/sides");
const { exportSvg } = await importSrc("engine/react-flow/export-svg");

const LABELS = { descriptions: true, technologies: true };
const EXPANDED = { ...LABELS, entitiesCollapsed: false };

/** A fixture under `test/__fixtures__/`, read by the build the way `loadWorkspace` reads it. */
function built(name) {
    const json = JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}`, import.meta.url),
            "utf8",
        ),
    );
    readMermaidDiagrams(json);
    return new WorkspaceModel(json);
}

const FIXTURE = built("mermaid-erd.json");

/** A model of one image view `erd` drawing `source`. */
function modelOf(source, styles) {
    const json = mermaidWorkspace([mermaidView("erd", source)]);
    if (styles) json.views.configuration.styles = styles;
    readMermaidDiagrams(json);
    return new WorkspaceModel(json);
}

const graphOf = (model, labels = LABELS, key = "erd", scheme = "light") =>
    buildGraph(model, key, scheme, labels, estimateText);

/** The drawn element for entity `id`. */
const box = (graph, id) => graph.elements.find((e) => e.id === `mermaid:${id}`);

const ATTRIBUTES = [
    { type: "string", name: "id", keys: ["PK"], comment: "" },
    { type: "string", name: "email", keys: ["UK"], comment: "Login" },
    { type: "date", name: "createdAt", keys: [], comment: "" },
];

const entityInput = (extra = {}) => ({
    name: "Customer",
    attributes: ATTRIBUTES,
    collapsed: true,
    comments: true,
    fontSize: 17,
    bold: true,
    measure: estimateText,
    fill: "#145b9e",
    color: "#ffffff",
    strokeWidth: 2,
    ...extra,
});

/* ------------------------------------------------------------ the view */

test("resolveView turns an ERD into entities and relationships laid out by Mermaid's ERD spacing", () => {
    const view = resolveView(FIXTURE, "shop");
    assert.equal(view.type, "Mermaid");
    assert.equal(view.layout, "automatic");
    assert.deepEqual(
        view.elements.map((e) => e.id),
        [
            "mermaid:CUSTOMER",
            "mermaid:ORDER",
            "mermaid:DELIVERY-ADDRESS",
            "mermaid:LINE-ITEM",
            "mermaid:PRODUCT",
            "mermaid:CATEGORY",
        ],
    );
    assert.equal(view.elements[0].element.name, "Customer");
    assert.deepEqual(view.boundaries, []);
    assert.equal(view.automaticLayout.nodeSeparation, 210);
    assert.equal(view.automaticLayout.rankSeparation, 120);
    assert.equal(view.mermaid.order, "model");
    const [places] = view.relationships;
    assert.equal(places.relationship.sourceId, "mermaid:CUSTOMER");
    assert.equal(places.relationship.destinationId, "mermaid:ORDER");
});

test("an ERD's nodeSpacing and rankSpacing scale by 1.5", () => {
    const view = resolveView(
        modelOf(
            "---\nconfig:\n  er:\n    nodeSpacing: 20\n    rankSpacing: 40\n---\nerDiagram\n  A ||--o{ B : has\n",
        ),
        "erd",
    );
    assert.equal(view.automaticLayout.nodeSeparation, 30);
    assert.equal(view.automaticLayout.rankSeparation, 60);
});

test("an ERD with the parent cardinality says why it can't be drawn", () => {
    const model = modelOf("erDiagram\n  A u--|| B : is\n");
    assert.equal(
        findViewError(model, "erd"),
        'Mermaid diagram "erd": the cardinality "u" (parent) isn\'t something Renderizr draws yet.',
    );
    assert.match(graphOf(model).error, /parent/);
});

/* ------------------------------------------------------------ sizing */

test("a collapsed entity keeps a C4 element's 3:2 proportions, and grows with its name and keys", () => {
    const small = collapsedContent(entityInput({ name: "A", attributes: [] }));
    assert.ok(Math.abs(small.width / small.height - 1.5) < 0.01);
    const long = collapsedContent(
        entityInput({ name: "A much longer entity name than most" }),
    );
    assert.ok(long.width > small.width);
    assert.ok(Math.abs(long.width / long.height - 1.5) < 0.01);
    const keys = collapsedContent(
        entityInput({
            name: "A",
            attributes: Array.from({ length: 8 }, (_, i) => ({
                type: "int",
                name: `k${i}`,
                keys: ["PK"],
                comment: "",
            })),
        }),
    );
    assert.ok(keys.height > small.height, "eight key lines need more room");
});

test("collapsed, an entity shows its name over its PK and FK attributes only", () => {
    const { entity } = layOutEntity(entityInput());
    assert.equal(entity.collapsed, true);
    assert.deepEqual(
        entity.texts.map((t) => [t.part, t.text, t.bold]),
        [
            ["name", "Customer", true],
            ["key", "id [PK]", false],
        ],
        "UK doesn't count",
    );
    assert.deepEqual(entity.rows, []);
    assert.ok(entity.toggle, "it draws a toggle");
});

test("expanded, an entity draws a header, one row per attribute in column order, and a band", () => {
    const laid = layOutEntity(entityInput({ collapsed: false }));
    const { entity } = laid;
    assert.equal(entity.collapsed, false);
    assert.equal(entity.rows.length, 3);
    assert.deepEqual(
        entity.texts
            .filter((t) => t.y > entity.rows[0].y && t.y < entity.rows[1].y)
            .map((t) => t.part),
        ["type", "name", "keys"],
        "the first row: no comment to show",
    );
    assert.deepEqual(
        entity.texts
            .filter((t) => t.y > entity.rows[1].y && t.y < entity.rows[2].y)
            .map((t) => [t.part, t.text]),
        [
            ["type", "string"],
            ["name", "email"],
            ["keys", "UK"],
            ["comment", "Login"],
        ],
    );
    const lastRow = entity.rows.at(-1);
    assert.equal(
        laid.height - (lastRow.y + lastRow.height),
        TOGGLE_ROOM,
        "the band below the last row holds the toggle",
    );
    assert.equal(entity.toggle.x, laid.width / 2);
    assert.ok(entity.toggle.y > lastRow.y + lastRow.height);
    const { type, name, keys, comment } = entity.columns;
    assert.equal(type + name + keys + comment, laid.width);
});

test("the comment column shows only with descriptions on", () => {
    const on = layOutEntity(entityInput({ collapsed: false }));
    const off = layOutEntity(
        entityInput({ collapsed: false, comments: false }),
    );
    assert.ok(on.entity.columns.comment > 0);
    assert.equal(off.entity.columns.comment, 0);
    assert.ok(!off.entity.texts.some((t) => t.part === "comment"));
});

test("the last column shown takes the width the header leaves over", () => {
    const { entity, width } = layOutEntity(
        entityInput({
            collapsed: false,
            name: "An entity with a very long name indeed",
            attributes: [{ type: "int", name: "id", keys: [], comment: "" }],
        }),
    );
    assert.equal(entity.columns.keys, 0);
    assert.equal(entity.columns.type + entity.columns.name, width);
    assert.ok(entity.columns.name > entity.columns.type);
});

test("an entity without attributes never expands and draws no toggle", () => {
    const size = { width: 450, height: 300 };
    const { entity, width, height } = layOutEntity(
        entityInput({ attributes: [], collapsed: false, collapsedSize: size }),
    );
    assert.equal(entity.collapsed, true);
    assert.equal(entity.toggle, undefined);
    assert.deepEqual({ width, height }, size);
});

/* ------------------------------------------------------------ colors */

test("rows take light alternating tints of the fill, with dark text mixed from it", () => {
    const tints = rowTints("#145b9e");
    assert.equal(tints.odd, "#d5e1ee");
    assert.equal(tints.even, "#c2d4e6");
    assert.equal(tints.text, "#08243f");
    assert.notEqual(tints.odd, tints.even);
    const { entity } = layOutEntity(entityInput({ collapsed: false }));
    assert.deepEqual(
        entity.rows.map((row) => row.fill),
        [tints.odd, tints.even, tints.odd],
        "the first row is odd, as Mermaid counts",
    );
});

test("a source's row colors win over the tints", () => {
    const { entity } = layOutEntity(
        entityInput({ collapsed: false, rowColors: { odd: "#ff0000" } }),
    );
    assert.equal(entity.rows[0].fill, "#ff0000");
    assert.equal(entity.rows[1].fill, rowTints("#145b9e").even);
});

test("parseColor reads hex, rgb() and hsl(), and tints what it can't read as gray", () => {
    assert.deepEqual(parseColor("#fff"), [255, 255, 255]);
    assert.deepEqual(parseColor("rgb(1, 2, 3)"), [1, 2, 3]);
    assert.deepEqual(parseColor("hsl(0, 100%, 50%)"), [255, 0, 0]);
    assert.equal(parseColor("rebeccapurple"), undefined);
    assert.equal(rowTints("rebeccapurple").odd, rowTints("#808080").odd);
});

/* ------------------------------------------------------------ the graph */

test("an ERD draws collapsed on first visit, every collapsed entity at one size", () => {
    const graph = graphOf(FIXTURE, LABELS, "shop");
    const sizes = new Set(graph.elements.map((e) => `${e.width}x${e.height}`));
    assert.equal(sizes.size, 1, "one size for every entity");
    assert.ok(graph.elements.every((e) => e.entity.collapsed));
    assert.equal(box(graph, "CATEGORY").entity.toggle, undefined);
    assert.ok(box(graph, "CUSTOMER").entity.toggle);
});

test("an override flips one entity for the visit, and refits the rest around it", () => {
    const collapsed = graphOf(FIXTURE, LABELS, "shop");
    const graph = graphOf(
        FIXTURE,
        { ...LABELS, entityOverrides: { "mermaid:ORDER": false } },
        "shop",
    );
    assert.equal(box(graph, "ORDER").entity.collapsed, false);
    assert.equal(box(graph, "CUSTOMER").entity.collapsed, true);
    assert.notDeepEqual(
        box(graph, "ORDER").height,
        box(collapsed, "ORDER").height,
    );
});

test("expanded, every entity with attributes expands and one without stays collapsed", () => {
    const graph = graphOf(FIXTURE, EXPANDED, "shop");
    assert.equal(box(graph, "CUSTOMER").entity.collapsed, false);
    assert.equal(box(graph, "CATEGORY").entity.collapsed, true);
    const back = graphOf(
        FIXTURE,
        { ...EXPANDED, entityOverrides: { "mermaid:CUSTOMER": true } },
        "shop",
    );
    assert.equal(box(back, "CUSTOMER").entity.collapsed, true);
});

test("a silent ERD fills its entities with the primary color, and tints its rows from it", () => {
    const graph = graphOf(FIXTURE, EXPANDED, "shop");
    const customer = box(graph, "CUSTOMER");
    assert.equal(customer.background, mermaidPrimaryColor("Light"));
    assert.equal(customer.color, "#ffffff");
    assert.equal(
        customer.entity.rows[0].fill,
        rowTints(mermaidPrimaryColor("Light")).odd,
    );
    const dark = graphOf(FIXTURE, EXPANDED, "shop", "dark");
    assert.equal(
        box(dark, "CUSTOMER").entity.rows[0].fill,
        rowTints(mermaidPrimaryColor("Dark")).odd,
        "light rows in both schemes",
    );
});

test("entity style and classDef fill entities, and rowOdd and rowEven color the rows", () => {
    const graph = graphOf(FIXTURE, EXPANDED, "styled");
    const customer = box(graph, "CUSTOMER");
    assert.equal(customer.background, "#7a3e9d");
    assert.equal(customer.stroke, "#4b2061");
    assert.equal(box(graph, "LINE-ITEM").background, "#2e7d32");
    assert.deepEqual(
        customer.entity.rows.map((row) => row.fill),
        ["#fff7e0", "#ffeec2"],
    );
});

test("identifying relationships draw solid and non-identifying ones dashed, with cardinalities at both ends", () => {
    const graph = graphOf(FIXTURE, LABELS, "shop");
    const edge = (id) => graph.edges.find((e) => e.id === `mermaid-edge:${id}`);
    assert.equal(edge("0").style, "Solid");
    assert.equal(edge("1").style, "Dashed");
    assert.equal(edge("0").description, "places");
    for (const e of graph.edges)
        assert.ok(e.markerStroke, `${e.description} draws its markers`);
});

test("each toggle is a focus item in reading order by its entity, and an entity without one stays out", () => {
    const graph = graphOf(FIXTURE, LABELS, "shop");
    const toggles = graph.focusOrder.filter((item) => item.type === "toggle");
    assert.equal(toggles.length, 5);
    assert.ok(!toggles.some((item) => item.id === "mermaid:CATEGORY"));
    const ordered = [...toggles].sort(
        (a, b) => a.box.y - b.box.y || a.box.x - b.box.x,
    );
    assert.deepEqual(toggles, ordered);
    assert.equal(toggles[0].activation, undefined, "it activates nothing");
});

/* ------------------------------------------------------------ spreading */

test("an odd count of centered ends on a toggle's side leaves its middle free", () => {
    const box = { x: 0, y: 0, width: 300, height: 200 };
    const spans = { bottom: { from: 0, to: 300 } };
    const ends = [0, 1, 2].map((i) => ({
        id: `e${i}`,
        side: "bottom",
        far: { x: 100 + i * 50, y: 500 },
        order: i,
        centered: true,
    }));
    const plain = spreadEnds(ends, spans, box);
    assert.equal(plain.get("e1"), 150, "the middle end sits at the middle");
    const toggled = spreadEnds(ends, spans, box, "bottom");
    assert.ok(
        [...toggled.values()].every((x) => Math.abs(x - 150) > 10),
        "no end at the toggle",
    );
    const elsewhere = spreadEnds(ends, spans, box, "top");
    assert.deepEqual(elsewhere, plain, "another side spreads as before");
});

/* ------------------------------------------------------------ export */

const TEXT = {
    measure: estimateText,
    ascent: 0.9,
    descent: 0.2,
    family: "sans-serif",
    fontFaces: "",
};

const exported = (graph) =>
    exportSvg({
        graph,
        frame: graph.bounds,
        titleBlock: { view: "", description: "", user: "", modified: "" },
        text: TEXT,
    }).svg;

test("entities export in their current state, without their toggles", () => {
    const collapsed = exported(graphOf(FIXTURE, LABELS, "shop"));
    assert.match(collapsed, /data-entity="collapsed"/);
    assert.doesNotMatch(collapsed, /data-entity="expanded"/);
    assert.match(collapsed, />id \[PK\]</);
    assert.doesNotMatch(collapsed, />email</);
    assert.doesNotMatch(collapsed, /Expand|Collapse/);

    const graph = graphOf(FIXTURE, EXPANDED, "shop");
    const expanded = exported(graph);
    assert.match(expanded, /data-entity="expanded"/);
    assert.match(expanded, />email</);
    assert.match(expanded, /font-style="italic"[^>]*>Login and receipts</);
    const tint = box(graph, "CUSTOMER").entity.rows[0].fill;
    assert.match(expanded, new RegExp(`fill="${tint}"`));
});

test("an export follows the descriptions toggle: no comment column while off", () => {
    const svg = exported(
        graphOf(FIXTURE, { ...EXPANDED, descriptions: false }, "shop"),
    );
    assert.match(svg, />email</);
    assert.doesNotMatch(svg, /Login and receipts/);
});
