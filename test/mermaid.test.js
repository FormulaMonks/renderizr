/**
 * Mermaid flowcharts as the page draws them (ADR 24): the view type the
 * build's `mermaid` model gives an image view, the resolved view it turns
 * into, its styles, its layout and sizes, its errors, the toolbar around it
 * and its export. The build's half is in `scripts/mermaid/*.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    mermaidView,
    mermaidWorkspace,
} from "../scripts/__fixtures__/mermaid.js";
import { readMermaidDiagrams } from "../scripts/mermaid/index.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const {
    WorkspaceModel,
    erdOf,
    findViewError,
    flowchartOf,
    inertToggles,
    mermaidNodeOf,
    resolveView,
    sequenceOf,
    whyNotEditable,
    NOTHING_TO_EXPORT,
} = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { estimateText } = await importSrc("engine/geometry/boundary");
const { mermaidNodeSize, mermaidLabelSize, mermaidLabelHeight } =
    await importSrc("engine/geometry/mermaid");
const { shapeGeometry } = await importSrc("engine/geometry/shapes/index");
const { SIDE_PADDING, INDICATOR_ROW_HEIGHT } = await importSrc(
    "engine/geometry/label",
);
const { INDICATOR_INSET, INDICATOR_SIZE, glyphDataUrl } = await importSrc(
    "engine/geometry/indicators",
);
const { layOutClusters, sourcesFirst } = await importSrc(
    "engine/layout/automatic",
);
const { exportSvg } = await importSrc("engine/react-flow/export-svg");
const { exportFrame } = await importSrc("engine/geometry/canvas");
const { default: CurrentView } = await importSrc("components/current-view");

const LABELS = { descriptions: true, technologies: true };

/** A fixture under `test/__fixtures__/`, read by the build the way `loadWorkspace` reads it. */
function built(name) {
    const json = JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}`, import.meta.url),
            "utf8",
        ),
    );
    readMermaidDiagrams(json);
    return json;
}

const FLOWCHART = built("mermaid-flowchart.json");
const ERRORS = built("mermaid-errors.json");

/** A model of one image view `flow` drawing `source`, with `styles` and `extra` on the view. */
function modelOf(source, { styles, extra, edit } = {}) {
    const json = mermaidWorkspace([mermaidView("flow", source, extra)]);
    if (styles) json.views.configuration.styles = styles;
    edit?.(json);
    readMermaidDiagrams(json);
    return new WorkspaceModel(json);
}

const graphOf = (model, scheme = "light", key = "flow") =>
    buildGraph(model, key, scheme, LABELS, estimateText);

/** The drawn element for Mermaid node `id`. */
const box = (graph, id) => graph.elements.find((e) => e.id === `mermaid:${id}`);

const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/* ------------------------------------------------------------ the view type */

test("an image view with a mermaid model draws as a Mermaid diagram, in the image views' place in the drawer", () => {
    const model = new WorkspaceModel(FLOWCHART);
    assert.equal(model.findViewByKey("plain").type, "Mermaid");
    assert.equal(model.findViewByKey("landscape").type, "SystemLandscape");
    assert.deepEqual(
        model.getViews().map((view) => view.key),
        [
            "landscape",
            "left-right",
            "links",
            "markers",
            "plain",
            "release",
            "signup",
            "styled",
            "untitled",
        ],
    );
});

test("a Mermaid diagram puts nothing into the workspace's model", () => {
    const model = new WorkspaceModel(FLOWCHART);
    assert.deepEqual(
        model.getElements().map((element) => element.name),
        ["Customer"],
    );
    assert.equal(model.getRelationships().length, 0);
});

test("a Mermaid diagram's title is its view's own, then the frontmatter's, then the image view fallback", () => {
    const model = new WorkspaceModel(FLOWCHART);
    assert.equal(
        model.getTitleForView(model.findViewByKey("plain")),
        "Order flow",
    );
    assert.equal(
        model.getTitleForView(model.findViewByKey("untitled")),
        "Returns",
    );
    const bare = modelOf("flowchart TD\n  A --> B\n");
    assert.equal(
        bare.getTitleForView(bare.findViewByKey("flow")),
        "Image View: flow",
    );
});

test("edit mode leaves a Mermaid diagram read-only, as an image view", () => {
    const model = new WorkspaceModel(FLOWCHART);
    assert.equal(whyNotEditable(model.findViewByKey("plain")), "image");
});

/* --------------------------------------------------------- the resolved view */

test("resolveView turns a flowchart into elements, relationships and groups laid out automatically", () => {
    const model = modelOf(
        [
            "flowchart LR",
            "  A[Start] -->|go| B{Check}",
            "  subgraph S [Outer]",
            "    subgraph T [Inner]",
            "      C",
            "    end",
            "    B",
            "  end",
            "  B --> C",
        ].join("\n"),
    );
    const view = resolveView(model, "flow");
    assert.equal(view.type, "Mermaid");
    assert.equal(view.layout, "automatic");
    assert.deepEqual(
        view.elements.map((e) => [e.id, e.element.name, e.element.tags]),
        [
            ["mermaid:A", "Start", "Element,Mermaid"],
            ["mermaid:B", "Check", "Element,Mermaid"],
            ["mermaid:C", "C", "Element,Mermaid"],
        ],
    );
    assert.deepEqual(
        view.relationships.map(({ relationship: r }) => [
            r.sourceId,
            r.destinationId,
            r.description,
            r.tags,
        ]),
        [
            ["mermaid:A", "mermaid:B", "go", "Relationship,Mermaid"],
            ["mermaid:B", "mermaid:C", "", "Relationship,Mermaid"],
        ],
    );
    assert.deepEqual(
        view.boundaries.map((b) => [
            b.id,
            b.kind,
            b.name,
            b.parent,
            b.children,
        ]),
        [
            [
                "mermaid-group:S",
                "Group",
                "Outer",
                undefined,
                ["mermaid:B", "mermaid-group:T"],
            ],
            [
                "mermaid-group:T",
                "Group",
                "Inner",
                "mermaid-group:S",
                ["mermaid:C"],
            ],
        ],
    );
    assert.deepEqual(view.automaticLayout, {
        implementation: "Dagre",
        rankDirection: "LeftRight",
        rankSeparation: 75,
        nodeSeparation: 75,
        edgeSeparation: 30,
        vertices: false,
    });
});

test("a source's nodeSpacing and rankSpacing scale by 1.5", () => {
    const model = modelOf(
        '%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 100}}}%%\nflowchart TD\n  A --> B\n',
    );
    const { automaticLayout } = resolveView(model, "flow");
    assert.equal(automaticLayout.nodeSeparation, 30);
    assert.equal(automaticLayout.rankSeparation, 150);
});

/* ------------------------------------------------------------------- errors */

test("a Mermaid diagram that can't be drawn says why, with the build's text", () => {
    const model = new WorkspaceModel(ERRORS);
    const reasons = Object.fromEntries(
        model
            .getViews()
            .map((view) => [view.key, findViewError(model, view.key)]),
    );
    assert.deepEqual(reasons, {
        "fields-disagree":
            'Mermaid diagram "fields-disagree": the content fields disagree.',
        "picture-beside-source":
            'Mermaid diagram "picture-beside-source": the content fields disagree.',
        "no-source":
            'Mermaid diagram "no-source": the image view carries no Mermaid source.',
        "parse-error":
            'Mermaid diagram "parse-error": a parse error at line 3: the source ends too early.',
        "edge-to-subgraph":
            'Mermaid diagram "edge-to-subgraph": an edge to a subgraph isn\'t something Renderizr draws yet.',
    });
    const graph = graphOf(model, "light", "parse-error");
    assert.equal(graph.error, reasons["parse-error"], "ViewError shows it");
    assert.equal(graph.elements.length, 0);
});

/* ------------------------------------------------------------------ sizing */

test("a node is as big as its label needs, by Mermaid's rule for its shape", () => {
    const label = "Order valid?";
    const size = (shape) => mermaidNodeSize(shape, label, 17, estimateText);
    const text = mermaidLabelSize(label, 17, estimateText);
    const rectangle = size("Box");
    assert.equal(
        rectangle.width,
        Math.ceil(text.width + 90),
        "30 each side, scaled",
    );
    assert.equal(
        rectangle.height,
        Math.ceil(text.height + 45),
        "15 above and below, scaled",
    );
    const diamond = size("Diamond");
    assert.equal(diamond.width, diamond.height, "a diamond is square");
    assert.equal(diamond.width, Math.ceil(text.width + text.height + 45));
    const circle = size("Circle");
    assert.equal(circle.width, circle.height, "a circle is round");
    assert.ok(
        size("Cylinder").height > rectangle.height,
        "a cylinder adds its lids",
    );
    assert.ok(
        size("Hexagon").width > text.width + 45,
        "a hexagon adds its points",
    );
    for (const shape of [
        "Box",
        "RoundedBox",
        "Diamond",
        "Circle",
        "Cylinder",
        "Hexagon",
    ]) {
        const { width, height } = size(shape);
        const { content } = shapeGeometry(shape, width, height);
        assert.ok(
            content.width - 2 * SIDE_PADDING >= text.width - 1e-6,
            `${shape}'s label fits on its line`,
        );
    }
});

test("a node with more lines is taller, and the workspace's fontSize sizes it", () => {
    const one = mermaidNodeSize("Box", "Help desk", 17, estimateText);
    const two = mermaidNodeSize(
        "Box",
        "Help desk\n9am to 5pm",
        17,
        estimateText,
    );
    const big = mermaidNodeSize("Box", "Help desk", 34, estimateText);
    assert.ok(two.height > one.height);
    assert.ok(big.width > one.width && big.height > one.height);
});

test("a node with a target grows by its indicator row, the diamond most", () => {
    const label = "Order valid?";
    const growth = (shape) => {
        const plain = mermaidNodeSize(shape, label, 17, estimateText);
        const linked = mermaidNodeSize(shape, label, 17, estimateText, 1);
        return {
            width: linked.width - plain.width,
            height: linked.height - plain.height,
        };
    };
    assert.deepEqual(growth("Box"), {
        width: 0,
        height: INDICATOR_ROW_HEIGHT,
    });
    const diamond = growth("Diamond");
    assert.equal(diamond.width, diamond.height, "a diamond stays square");
    for (const shape of [
        "Box",
        "RoundedBox",
        "Circle",
        "Cylinder",
        "Hexagon",
    ]) {
        assert.ok(growth(shape).height > 0, `${shape} grows`);
        assert.ok(
            diamond.height >= growth(shape).height,
            `the diamond grows at least as much as ${shape}`,
        );
    }
});

/** Whether `point`, relative to a `width` x `height` box, is inside `shape`'s outline. */
function inside(shape, width, height, { x, y }) {
    const dx = Math.abs(x - width / 2) / (width / 2);
    const dy = Math.abs(y - height / 2) / (height / 2);
    if (shape === "Diamond") return dx + dy <= 1 + 1e-9;
    if (shape === "Circle") return dx * dx + dy * dy <= 1 + 1e-9;
    if (shape === "Hexagon")
        return (
            dy <= 1 && Math.abs(x - width / 2) <= width / 2 - (dy * width) / 4
        );
    return x >= 0 && x <= width && y >= 0 && y <= height;
}

test("every shape fits its indicator row inside its outline, and the cylinder's above its bottom curve", () => {
    for (const label of ["A", "Order valid?", "Help desk\n9am to 5pm"]) {
        for (const shape of [
            "Box",
            "RoundedBox",
            "Diamond",
            "Circle",
            "Cylinder",
            "Hexagon",
        ]) {
            const name = `${shape} "${label}"`;
            const { width, height } = mermaidNodeSize(
                shape,
                label,
                17,
                estimateText,
                1,
            );
            const { content } = shapeGeometry(shape, width, height);
            const labelHeight = mermaidLabelHeight(shape, content, true);
            const text = mermaidLabelSize(label, 17, estimateText);
            assert.ok(
                text.height + INDICATOR_ROW_HEIGHT <= labelHeight + 1e-6,
                `${name}: the label and the row fit`,
            );
            const bottom = content.y + labelHeight - INDICATOR_INSET;
            const top = bottom - INDICATOR_SIZE;
            const left = content.x + (content.width - INDICATOR_SIZE) / 2;
            const right = left + INDICATOR_SIZE;
            for (const point of [
                { x: left, y: top },
                { x: right, y: top },
                { x: left, y: bottom },
                { x: right, y: bottom },
            ])
                assert.ok(
                    inside(shape, width, height, point),
                    `${name}: the row is inside at ${point.x},${point.y}`,
                );
            if (shape === "Cylinder")
                assert.ok(
                    bottom <= height - content.y + 1e-6,
                    `${name}: the row sits above the bottom curve`,
                );
        }
    }
});

/* ------------------------------------------------------------------ layout */

test("sourcesFirst hands Dagre the nodes with no incoming edge first, in model order", () => {
    const node = (id) => ({ id, width: 10, height: 10 });
    const graph = {
        nodes: ["a", "b", "c", "d"].map(node),
        boundaries: [],
        edges: [
            { id: "1", source: "c", target: "a" },
            { id: "2", source: "d", target: "b" },
        ],
    };
    assert.deepEqual(
        sourcesFirst(graph).nodes.map((n) => n.id),
        ["c", "d", "a", "b"],
    );
    const cycle = {
        nodes: ["a", "b"].map(node),
        boundaries: [],
        edges: [
            { id: "1", source: "a", target: "b" },
            { id: "2", source: "b", target: "a" },
        ],
    };
    assert.equal(sourcesFirst(cycle), cycle, "no source keeps model order");
});

test("a subgraph no edge crosses lays out on its own, in the flipped direction", () => {
    const graph = graphOf(
        modelOf("flowchart TB\n  A --> B\n  subgraph S\n    C --> D\n  end\n"),
    );
    const [a, b, c, d] = ["A", "B", "C", "D"].map((id) =>
        center(box(graph, id)),
    );
    assert.equal(a.x, b.x, "the outer graph runs top to bottom");
    assert.ok(b.y > a.y);
    assert.equal(c.y, d.y, "the subgraph runs left to right");
    assert.ok(d.x > c.x);
});

test("a subgraph keeps its own direction, and a crossed one stays in the compound graph", () => {
    const own = graphOf(
        modelOf(
            "flowchart TB\n  A --> B\n  subgraph S\n    direction TB\n    C --> D\n  end\n",
        ),
    );
    const [c, d] = ["C", "D"].map((id) => center(box(own, id)));
    assert.equal(c.x, d.x, "direction TB holds");
    assert.ok(d.y > c.y);

    const crossed = graphOf(
        modelOf("flowchart TB\n  A --> C\n  subgraph S\n    C --> D\n  end\n"),
    );
    const [cc, dd] = ["C", "D"].map((id) => center(box(crossed, id)));
    assert.ok(dd.y > cc.y, "a crossed subgraph runs the graph's way");
});

test("layOutClusters places an extracted subgraph as one node, its padding around it", () => {
    const nodes = [
        { id: "a", width: 40, height: 20 },
        { id: "c", width: 40, height: 20, parent: "s" },
        { id: "d", width: 40, height: 20, parent: "s" },
    ];
    const layout = layOutClusters(
        {
            nodes,
            boundaries: [{ id: "s" }],
            edges: [{ id: "e", source: "c", target: "d" }],
        },
        {
            rankDirection: "TopBottom",
            rankSeparation: 75,
            nodeSeparation: 75,
            edgeSeparation: 30,
            vertices: false,
        },
        {
            boxFor: (__, placed) => {
                const boxes = [...placed.values()];
                const x = Math.min(...boxes.map((b) => b.x)) - 12;
                const y = Math.min(...boxes.map((b) => b.y)) - 12;
                const right = Math.max(...boxes.map((b) => b.x + b.width)) + 12;
                const bottom =
                    Math.max(...boxes.map((b) => b.y + b.height)) + 12;
                return { x, y, width: right - x, height: bottom - y };
            },
            direction: () => undefined,
            rankBonus: 37.5,
            order: "sources",
        },
    );
    const c = layout.boxes.get("c");
    const d = layout.boxes.get("d");
    assert.equal(c.y, d.y, "flipped to left to right");
    assert.ok(d.x >= c.x + c.width + 75, "a rank's separation between them");
    assert.ok(layout.boxes.has("a"));
    assert.ok(
        !layout.boxes.has("s"),
        "the subgraph's own box is derived later",
    );
});

/* ------------------------------------------------------------------ styles */

test("a silent source fills its nodes with the page's primary color per scheme, white text and a darker border", () => {
    const model = modelOf("flowchart TD\n  A --> B\n");
    const light = box(graphOf(model, "light"), "A");
    const dark = box(graphOf(model, "dark"), "A");
    assert.equal(light.background, "#145b9e");
    assert.equal(dark.background, "#1168bd");
    assert.equal(light.color, "#ffffff");
    assert.equal(light.stroke, "#00296c", "every channel 50 darker");
    assert.equal(light.shape, "Box");
});

test("the branding's primary color fills a silent source", () => {
    globalThis.__RENDERIZR_PRIMARY_COLOR__ = "#e4572e";
    try {
        const node = box(graphOf(modelOf("flowchart TD\n  A --> B\n")), "A");
        assert.equal(node.background, "#e4572e");
        assert.equal(node.stroke, "#b22500");
    } finally {
        globalThis.__RENDERIZR_PRIMARY_COLOR__ = null;
    }
});

test("the workspace's Element and Mermaid styles sit over the silent fill, but never its shape or size", () => {
    const model = modelOf("flowchart TD\n  A{Check} --> B\n", {
        styles: {
            elements: [
                { tag: "Element", fontSize: 30, shape: "Person", width: 999 },
                { tag: "Mermaid", background: "#ffeecc", color: "#333333" },
            ],
            relationships: [],
        },
    });
    const node = box(graphOf(model), "A");
    assert.equal(node.background, "#ffeecc");
    assert.equal(
        node.stroke,
        "#e6d6b8",
        "a fill with no stroke takes one 10% darker",
    );
    assert.equal(node.color, "#333333");
    assert.equal(node.fontSize, 30);
    assert.equal(node.shape, "Diamond", "the source's shape wins");
    assert.notEqual(node.width, 999, "the workspace's width doesn't apply");
    assert.equal(node.metadata, "");
    assert.equal(node.description, "");
});

test("a node's default font draws its name at Mermaid's 24 px", () => {
    const node = box(graphOf(modelOf("flowchart TD\n  A --> B\n")), "A");
    assert.equal(node.fontSize, 17);
    const group = graphOf(
        modelOf("flowchart TD\n  subgraph S\n    A --> B\n  end\n"),
    ).boundaries[0];
    assert.equal(group.name.fontSize, 17 * 1.4, "and a subgraph's name too");
});

test("arrow syntax sets the line: solid, dotted, about twice as thick, and what fills at the end", () => {
    const graph = graphOf(
        modelOf(
            "flowchart LR\n  A --> B\n  B -.-> C\n  C ==> D\n  D --- E\n  E --o F\n",
            {
                styles: {
                    elements: [],
                    relationships: [
                        { tag: "Mermaid", thickness: 3, style: "Dashed" },
                    ],
                },
            },
        ),
    );
    const edges = graph.edges.map((e) => [
        e.style,
        e.thickness,
        e.arrowhead !== "",
    ]);
    assert.deepEqual(edges, [
        ["Solid", 3, true],
        ["Dotted", 3, true],
        ["Solid", 6, true],
        ["Solid", 3, false],
        // A circle end fills (test/end-markers.test.js).
        ["Solid", 3, true],
    ]);
    assert.ok(
        graph.edges.every((e) => e.centered),
        "Mermaid edge ends spread from the middle",
    );
    assert.ok(graph.edges.every((e) => e.targets.length === 0));
});

test("a silent source routes by the workspace's routing, then Orthogonal", () => {
    const plain = graphOf(modelOf("flowchart LR\n  A --> B\n"));
    assert.equal(plain.edges[0].routing, "Orthogonal");
    const curved = graphOf(
        modelOf("flowchart LR\n  A --> B\n", {
            styles: {
                elements: [],
                relationships: [{ tag: "Relationship", routing: "Curved" }],
            },
        }),
    );
    assert.equal(curved.edges[0].routing, "Curved");
});

test("an edge's label is its text alone, and a Mermaid node offers no activation", () => {
    const graph = graphOf(modelOf("flowchart LR\n  A -->|places order| B\n"));
    assert.equal(graph.edges[0].description, "places order");
    assert.equal(graph.edges[0].technology, "");
    assert.ok(graph.elements.every((e) => e.targets.length === 0));
    assert.deepEqual(graph.focusOrder, []);
});

/** A flowchart `flow` whose nodes link to another view, a URL and itself, beside a view `other`. */
const linkedModel = () =>
    modelOf(
        [
            "flowchart LR",
            "  view[Other view] --> url[Web shop] --> self[This view]",
            "  self --> none[Nothing]",
            "  subgraph group[Group]",
            "    none",
            "  end",
            '  click view href "#other"',
            '  click url "https://example.com/shop" "Open the shop"',
            '  click self href "#flow"',
            '  click group href "https://example.com/group"',
        ].join("\n"),
        {
            edit: (json) => {
                json.views.imageViews.push({
                    key: "other",
                    title: "Other",
                    content: "https://example.test/other.png",
                });
            },
        },
    );

test("a Mermaid node with a click link offers it, and one linking to itself or nowhere offers nothing", () => {
    const graph = graphOf(linkedModel());
    assert.deepEqual(box(graph, "view").targets, ["view"]);
    assert.deepEqual(box(graph, "url").targets, ["link"]);
    assert.deepEqual(box(graph, "self").targets, []);
    assert.deepEqual(box(graph, "none").targets, []);
    assert.ok(
        graph.boundaries.every((b) => b.targets.length === 0),
        "subgraphs offer nothing",
    );
    assert.ok(
        graph.edges.every((e) => e.targets.length === 0),
        "edges offer nothing",
    );
});

test("a linked node joins the Tab order in reading order, and grows by its row", () => {
    const graph = graphOf(linkedModel());
    assert.deepEqual(
        graph.focusOrder.map((item) => item.id),
        ["mermaid:view", "mermaid:url"],
    );
    assert.deepEqual(graph.focusOrder[0].activation, {
        type: "element",
        id: "mermaid:view",
    });
    assert.ok(box(graph, "url").height > box(graph, "self").height);
});

test("the fixture's click links offer views, URLs and nothing for this view, in every shape", () => {
    const graph = graphOf(new WorkspaceModel(FLOWCHART), "light", "links");
    const offered = Object.fromEntries(
        graph.elements.map((e) => [e.id.slice("mermaid:".length), e.targets]),
    );
    assert.deepEqual(offered, {
        pipeline: ["view"],
        shop: ["link"],
        check: ["view"],
        signup: ["view"],
        orders: ["link"],
        prepare: ["view"],
        here: [],
        notify: [],
    });
    assert.equal(graph.focusOrder.length, 6);
});

test("the page finds an activated node's link in the diagram's model, and nothing on any other view", () => {
    const model = linkedModel();
    const flow = model.findViewByKey("flow");
    assert.equal(
        mermaidNodeOf(flow, "mermaid:url")?.link,
        "https://example.com/shop",
    );
    assert.equal(mermaidNodeOf(flow, "mermaid-group:group"), undefined);
    assert.equal(
        mermaidNodeOf(model.findViewByKey("other"), "mermaid:url"),
        undefined,
    );
    assert.equal(
        mermaidNodeOf(
            new WorkspaceModel(ERRORS).findViewByKey("parse-error"),
            "mermaid:A",
        ),
        undefined,
    );
});

test("a node's tooltip is its hover title", () => {
    const graph = graphOf(linkedModel());
    assert.equal(box(graph, "url").tooltip, "Open the shop");
    assert.equal(box(graph, "view").tooltip, undefined);
});

test("a linked node exports its indicator glyph", () => {
    const graph = graphOf(linkedModel());
    const { svg } = exportSvg({
        graph,
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: "Flow",
            description: "",
            user: "Unknown",
            modified: "10/16/2026",
        },
        text: {
            measure: estimateText,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    });
    const color = box(graph, "url").color;
    const glyph = (kind) => glyphDataUrl(kind, color).replaceAll("&", "&amp;");
    assert.ok(svg.includes(glyph("link")), "the URL node's glyph");
    assert.ok(svg.includes(glyph("view")), "the view node's glyph");
});

/* ----------------------------------------------------------------- toolbar */

/** The toolbar showing `key` of `model`, with an engine that records labels. */
function toolbarOn(model, key) {
    const element = dom.document.createElement("section");
    const engine = {
        labels: [],
        setColorScheme() {},
        setLabels(labels) {
            engine.labels.push(labels);
        },
        fit() {},
        zoomIn() {},
        zoomOut() {},
        play() {},
        pause() {},
        stepForward() {},
        stepBack() {},
        onAnimationChanged(callback) {
            callback({ steps: 0, step: null, playing: false });
            return () => {};
        },
        exportView: () => Promise.resolve(new Blob(["<svg/>"])),
    };
    const toolbar = new CurrentView(element, engine, model, null, () => {});
    toolbar.render(model.findViewByKey(key));
    const hidden = (name) => element.querySelector(`.${name}`).hidden;
    return { toolbar, element, engine, hidden };
}

test("both label toggles hide on a flowchart, and the reader's preference stays", () => {
    const model = new WorkspaceModel(FLOWCHART);
    assert.deepEqual(inertToggles(model.findViewByKey("plain")), {
        descriptions: true,
        technologies: true,
    });
    const { toolbar, engine, hidden } = toolbarOn(model, "plain");
    assert.equal(hidden("toggle-description"), true);
    assert.equal(hidden("toggle-technologies"), true);
    const before = engine.labels.at(-1);
    toolbar.render(model.findViewByKey("landscape"));
    assert.equal(hidden("toggle-description"), false, "back on a C4 view");
    assert.equal(hidden("toggle-technologies"), false);
    assert.deepEqual(
        engine.labels.at(-1),
        before,
        "the preference is untouched",
    );
    toolbar.clear();
});

test("a flowchart exports, and one that can't be drawn shows its export buttons disabled, saying why", () => {
    const drawn = toolbarOn(new WorkspaceModel(FLOWCHART), "plain");
    const shown = (element) =>
        !element.querySelector(".export-buttons").hasAttribute("hidden");
    assert.equal(shown(drawn.element), true);
    assert.equal(drawn.element.querySelector(".export-svg").disabled, false);
    drawn.toolbar.clear();

    const failing = toolbarOn(new WorkspaceModel(ERRORS), "parse-error");
    assert.equal(shown(failing.element), true);
    for (const format of ["png", "svg"]) {
        const button = failing.element.querySelector(`.export-${format}`);
        assert.equal(button.disabled, true, `${format} is disabled`);
        assert.equal(button.title, NOTHING_TO_EXPORT);
        assert.equal(button.getAttribute("aria-label"), NOTHING_TO_EXPORT);
    }
    assert.equal(failing.hidden("toggle-description"), true);
    failing.toolbar.clear();
});

/* ------------------------------------------------------------------ export */

test("a flowchart exports through the serializer as any view does", () => {
    const graph = graphOf(new WorkspaceModel(FLOWCHART), "light", "plain");
    const { svg } = exportSvg({
        graph,
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: "Order flow",
            description: "",
            user: "Unknown",
            modified: "10/16/2026",
        },
        text: {
            measure: estimateText,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    });
    assert.match(svg, /<g data-element-id="mermaid:shop">/);
    assert.match(svg, /Web shop/);
    assert.match(svg, /Fulfilment/, "subgraphs export as groups");
    assert.match(svg, /places order/, "edge labels export");
    assert.match(svg, /#145b9e/, "the primary color is a literal");
});

test("each kind's helper gives that kind's diagram, and undefined for every other kind and a failure", () => {
    const json = mermaidWorkspace([
        mermaidView("flow", "flowchart LR\n  A --> B"),
        mermaidView("erd", "erDiagram\n  A ||--o{ B : has"),
        mermaidView("seq", "sequenceDiagram\n  A ->> B: hi"),
    ]);
    readMermaidDiagrams(json);
    const model = new WorkspaceModel(json);
    const views = {
        flowchart: model.findViewByKey("flow"),
        er: model.findViewByKey("erd"),
        sequence: model.findViewByKey("seq"),
    };
    const failure = new WorkspaceModel(ERRORS).findViewByKey("parse-error");
    const cases = [
        { name: "flowchartOf", of: flowchartOf, kind: "flowchart" },
        { name: "erdOf", of: erdOf, kind: "er" },
        { name: "sequenceOf", of: sequenceOf, kind: "sequence" },
    ];
    for (const { name, of, kind } of cases) {
        for (const [viewKind, view] of Object.entries(views)) {
            const diagram = of(view);
            if (viewKind === kind)
                assert.equal(
                    diagram,
                    view.mermaid,
                    `${name} gives a ${kind}'s diagram`,
                );
            else
                assert.equal(
                    diagram,
                    undefined,
                    `${name} gives nothing for a ${viewKind}`,
                );
        }
        assert.equal(
            of(failure),
            undefined,
            `${name} gives nothing for a failure`,
        );
        assert.equal(
            of(undefined),
            undefined,
            `${name} gives nothing without a view`,
        );
    }
});
