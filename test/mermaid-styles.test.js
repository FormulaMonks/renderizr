/**
 * A Mermaid flowchart styled from its source (spec: Styling): `style` and
 * `linkStyle` over `class` and `classDef` over the config's palette over the
 * workspace's tag styles over the scheme defaults, `curve` routing, the dark
 * mode rule, and the font. The build's half is in
 * `scripts/mermaid/styling.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    mermaidView,
    mermaidWorkspace,
} from "../scripts/__fixtures__/mermaid.js";
import { readMermaidDiagrams } from "../scripts/mermaid/index.js";
import { themes } from "../scripts/mermaid/parser.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, parseCss, mermaidRouting, mermaidFontFamily } =
    await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { estimateText } = await importSrc("engine/geometry/boundary");
const { exportSvg } = await importSrc("engine/react-flow/export-svg");
const { exportFrame } = await importSrc("engine/geometry/canvas");
const { diagramFontFamily } = await importSrc("engine/react-flow/fonts");

const LABELS = { descriptions: true, technologies: true };

/** A model of one image view `flow` drawing `source`, with workspace `styles`. */
function modelOf(source, styles) {
    const json = mermaidWorkspace([mermaidView("flow", source)]);
    if (styles)
        json.views.configuration.styles = {
            elements: [],
            relationships: [],
            ...styles,
        };
    readMermaidDiagrams(json);
    return new WorkspaceModel(json);
}

const graphOf = (
    model,
    scheme = "light",
    key = "flow",
    measure = estimateText,
) => buildGraph(model, key, scheme, LABELS, measure);

const box = (graph, id) => graph.elements.find((e) => e.id === `mermaid:${id}`);

const init = (config) => `%%{init: ${JSON.stringify(config)}}%%\n`;

const WORKSPACE = {
    elements: [{ tag: "Mermaid", background: "#111111", stroke: "#111112" }],
    relationships: [{ tag: "Mermaid", color: "#111111", routing: "Curved" }],
};

/* -------------------------------------------------------------- precedence */

test("style over class over classDef default over the config over the workspace's tag styles", () => {
    const palette = init({
        theme: "base",
        themeVariables: { primaryColor: "#222222" },
    });
    const cases = [
        ["the workspace", "", "flowchart TD\n  A --> B\n", "#111111"],
        ["the config", palette, "flowchart TD\n  A --> B\n", "#222222"],
        [
            "classDef default",
            palette,
            "flowchart TD\n  A --> B\n  classDef default fill:#333333\n",
            "#333333",
        ],
        [
            "a class",
            palette,
            "flowchart TD\n  A:::warn --> B\n  classDef warn fill:#444444\n  classDef default fill:#333333\n",
            "#444444",
        ],
        [
            "style",
            palette,
            "flowchart TD\n  A:::warn --> B\n  classDef warn fill:#444444\n  style A fill:#555555\n",
            "#555555",
        ],
    ];
    for (const [layer, head, body, fill] of cases) {
        const graph = graphOf(modelOf(head + body, WORKSPACE));
        assert.equal(box(graph, "A").background, fill, layer);
    }
    const silent = graphOf(modelOf("flowchart TD\n  A --> B\n"));
    assert.equal(
        box(silent, "A").background,
        "#145b9e",
        "the scheme defaults, then the silent fill",
    );
});

test("classes apply in the order the source defines them", () => {
    const graph = graphOf(
        modelOf(
            "flowchart TD\n  A:::two --> B\n  classDef one fill:#111111\n  classDef two fill:#222222\n  class A one\n",
        ),
    );
    assert.equal(box(graph, "A").background, "#222222");
});

test("linkStyle over the config's lineColor over the workspace's edge styles", () => {
    const cases = [
        ["the workspace", "flowchart LR\n  A --> B\n", "#111111"],
        [
            "the config",
            `${init({ themeVariables: { lineColor: "#222222" } })}flowchart LR\n  A --> B\n`,
            "#222222",
        ],
        [
            "linkStyle",
            `${init({ themeVariables: { lineColor: "#222222" } })}flowchart LR\n  A --> B\n  linkStyle 0 stroke:#333333\n`,
            "#333333",
        ],
    ];
    for (const [layer, source, color] of cases) {
        const graph = graphOf(modelOf(source, WORKSPACE));
        assert.equal(graph.edges[0].color, color, layer);
    }
});

test("a source's own fill keeps the border beneath it, as in Mermaid", () => {
    const graph = graphOf(
        modelOf("flowchart TD\n  A --> B\n  style A fill:#ff0000\n"),
    );
    assert.equal(box(graph, "A").stroke, "#00296c", "the silent border stays");
});

/* -------------------------------------------------------------- CSS keys */

test("each node CSS key sets its style", () => {
    const graph = graphOf(
        modelOf(
            "flowchart TD\n  A --> B\n  style A fill:#010101,stroke:#020202,stroke-width:4px,stroke-dasharray:5 5,color:#030303,font-size:32px,font-weight:normal,font-family:Georgia\n",
        ),
    );
    const node = box(graph, "A");
    assert.equal(node.background, "#010101");
    assert.equal(node.stroke, "#020202");
    assert.equal(node.strokeWidth, 4);
    assert.equal(node.border, "Dashed");
    assert.equal(node.color, "#030303");
    assert.equal(node.fontSize, 34, "32 px at Mermaid's scale");
    assert.equal(node.fontWeight, "normal");
    assert.equal(node.fontFamily, "Georgia");
    assert.equal(box(graph, "B").fontFamily, undefined);
});

test("a source's font-size wins over the workspace's fontSize, which applies otherwise", () => {
    const styles = { elements: [{ tag: "Element", fontSize: 30 }] };
    const plain = graphOf(modelOf("flowchart TD\n  A --> B\n", styles));
    assert.equal(box(plain, "A").fontSize, 30);
    const themed = graphOf(
        modelOf(
            `${init({ themeVariables: { fontSize: "32px" } })}flowchart TD\n  A --> B\n`,
            styles,
        ),
    );
    assert.equal(box(themed, "A").fontSize, 34);
});

test("each edge CSS key sets its style, and the arrow syntax still wins", () => {
    const graph = graphOf(
        modelOf(
            "flowchart LR\n  A --> B\n  B -.-> C\n  C ==> D\n  linkStyle 0 stroke:#010101,stroke-width:3px,stroke-dasharray:4,color:#020202\n  linkStyle 1 stroke-dasharray:4\n  linkStyle 2 stroke-width:3px\n",
        ),
    );
    const [solid, dotted, thick] = graph.edges;
    assert.equal(solid.color, "#010101");
    assert.equal(solid.thickness, 3);
    assert.equal(solid.style, "Dashed");
    assert.equal(solid.labelColor, "#020202");
    assert.equal(dotted.style, "Dotted", "a dotted link stays dotted");
    assert.equal(thick.thickness, 6, "a thick link doubles the source's width");
});

test("a workspace line style never dashes a Mermaid edge", () => {
    const graph = graphOf(
        modelOf("flowchart LR\n  A --> B\n", {
            relationships: [{ tag: "Mermaid", style: "Dashed" }],
        }),
    );
    assert.equal(graph.edges[0].style, "Solid");
});

test("parseCss reads Mermaid's declarations, the last of each winning", () => {
    assert.deepEqual(
        parseCss([
            "fill:#f00",
            " stroke : #0f0 ",
            "fill:#00f !important",
            "nonsense",
        ]),
        { fill: "#00f", stroke: "#0f0" },
    );
});

/* ----------------------------------------------------------------- routing */

test("each curve routes as listed, over the workspace's routing", () => {
    const cases = [
        ["linear", "Direct"],
        ["step", "Orthogonal"],
        ["stepBefore", "Orthogonal"],
        ["stepAfter", "Orthogonal"],
        ["basis", "Curved"],
        ["cardinal", "Curved"],
        ["monotoneX", "Curved"],
        ["natural", "Curved"],
    ];
    for (const [curve, routing] of cases) {
        assert.equal(mermaidRouting({ flowchart: { curve } }), routing, curve);
        const graph = graphOf(
            modelOf(
                `${init({ flowchart: { curve } })}flowchart LR\n  A --> B\n`,
                WORKSPACE,
            ),
        );
        assert.equal(graph.edges[0].routing, routing, curve);
    }
    assert.equal(mermaidRouting({ curve: "linear" }), "Direct");
    assert.equal(mermaidRouting({}), undefined);
});

/* --------------------------------------------------------------- dark mode */

test("theme dark draws a dark palette in light mode too", () => {
    const dark = themes.dark.getThemeVariables({});
    const model = modelOf(
        `${init({ theme: "dark" })}flowchart LR\n  A -->|go| B\n`,
    );
    for (const scheme of ["light", "dark"]) {
        const graph = graphOf(model, scheme);
        assert.equal(box(graph, "A").background, dark.mainBkg, scheme);
        assert.equal(box(graph, "A").color, dark.textColor, scheme);
        assert.equal(graph.edges[0].color, dark.lineColor, scheme);
        assert.equal(graph.edges[0].labelBackground, dark.edgeLabelBackground);
    }
});

test("a light palette keeps its fills in dark mode, and its edges follow the scheme", () => {
    const model = modelOf(
        `${init({ theme: "base", themeVariables: { primaryColor: "#ffcc00", lineColor: "#8a5a2b" } })}flowchart LR\n  A -->|go| B\n`,
    );
    const light = graphOf(model, "light");
    const dark = graphOf(model, "dark");
    assert.equal(box(light, "A").background, "#ffcc00");
    assert.equal(box(dark, "A").background, "#ffcc00", "the fill stays");
    assert.equal(light.edges[0].color, "#8a5a2b");
    const silent = graphOf(modelOf("flowchart LR\n  A -->|go| B\n"), "dark");
    assert.equal(
        dark.edges[0].color,
        silent.edges[0].color,
        "the line follows the scheme",
    );
    assert.equal(dark.edges[0].labelColor, undefined);
    assert.equal(
        dark.edges[0].labelBackground,
        undefined,
        "the label backs onto the canvas",
    );
});

test("a silent source follows the color scheme", () => {
    const model = modelOf("flowchart LR\n  A --> B\n");
    assert.notEqual(
        graphOf(model, "light").edges[0].color,
        graphOf(model, "dark").edges[0].color,
    );
    assert.notEqual(
        box(graphOf(model, "light"), "A").background,
        box(graphOf(model, "dark"), "A").background,
    );
});

/* ------------------------------------------------------------------ groups */

test("a subgraph takes the palette's cluster colors, then its classes and style", () => {
    const source = `${init({ theme: "forest" })}flowchart TD\n  subgraph S\n    A --> B\n  end\n  subgraph T\n    C\n  end\n  style T fill:#010101,stroke:#020202,stroke-dasharray:3\n`;
    const forest = themes.forest.getThemeVariables({});
    const graph = graphOf(modelOf(source));
    const [s, t] = ["S", "T"].map((id) =>
        graph.boundaries.find((b) => b.id === `mermaid-group:${id}`),
    );
    assert.equal(s.background, forest.clusterBkg);
    assert.equal(s.stroke, forest.clusterBorder);
    assert.equal(s.border, "Solid");
    assert.equal(t.background, "#010101");
    assert.equal(t.stroke, "#020202");
    assert.equal(t.border, "Dashed");
});

/* -------------------------------------------------------------------- font */

test("the source's fontFamily goes ahead of --font and the fallback stack", () => {
    const model = modelOf(
        `${init({ themeVariables: { fontFamily: "Georgia, serif" } })}flowchart TD\n  A --> B\n`,
    );
    const family = mermaidFontFamily(model.findViewByKey("flow").mermaid);
    assert.equal(family, "Georgia, serif");
    assert.equal(
        diagramFontFamily("Inter", family),
        'Georgia, serif, "Inter", Helvetica, Arial, sans-serif',
    );
    assert.equal(
        mermaidFontFamily(
            modelOf("flowchart TD\n  A --> B\n").findViewByKey("flow").mermaid,
        ),
        undefined,
    );
});

test("a node's own font-family and font-weight measure its size", () => {
    const calls = [];
    const measure = (text, size, bold, family) => {
        calls.push({ text, bold, family });
        return estimateText(text, size, bold);
    };
    graphOf(
        modelOf(
            "flowchart TD\n  A[Alpha] --> B[Beta]\n  style A font-family:Georgia,font-weight:normal\n",
        ),
        "light",
        "flow",
        measure,
    );
    const alpha = calls.find((c) => c.text === "Alpha");
    const beta = calls.find((c) => c.text === "Beta");
    assert.deepEqual(alpha, { text: "Alpha", bold: false, family: "Georgia" });
    assert.deepEqual(beta, { text: "Beta", bold: true, family: undefined });
});

/* ------------------------------------------------------------------ export */

/** The styles fixture, read by the build the way `loadWorkspace` reads it. */
function stylesFixture() {
    const json = JSON.parse(
        readFileSync(
            new URL("./__fixtures__/mermaid-styles.json", import.meta.url),
            "utf8",
        ),
    );
    const notices = readMermaidDiagrams(json);
    return { model: new WorkspaceModel(json), notices };
}

test("the styles fixture: the workspace's tag styles under a silent source, each curve, one warning", () => {
    const { model, notices } = stylesFixture();
    const silent = graphOf(model, "light", "silent");
    assert.equal(box(silent, "shop").background, "#e8eef4");
    assert.ok(silent.edges.every((e) => e.routing === "Curved"));
    assert.ok(
        graphOf(model, "light", "dark").edges.every(
            (e) => e.routing === "Direct",
        ),
    );
    assert.ok(
        graphOf(model, "light", "fonts").edges.every(
            (e) => e.routing === "Curved",
        ),
    );
    assert.deepEqual(notices, [
        'Image view "fonts": Renderizr supports only a subset of Mermaid styling; ignored: look, font-style, opacity',
    ]);
});

test("the styled fixture draws its style, classDef and linkStyle colors over the workspace's, and exports them", () => {
    const graph = graphOf(stylesFixture().model, "light", "styled");
    assert.equal(box(graph, "valid").background, "#fde2e2", "classDef warn");
    assert.equal(box(graph, "orders").background, "#d6eaf8", "style");
    assert.equal(box(graph, "orders").strokeWidth, 3);
    assert.equal(
        box(graph, "shop").background,
        "#ffe8cc",
        "the config's primaryColor",
    );
    assert.equal(graph.edges[0].color, "#c0392b", "linkStyle 0");
    assert.equal(graph.edges[1].color, "#8a5a2b", "the config's lineColor");
    assert.ok(
        graph.edges.every((e) => e.routing === "Orthogonal"),
        "curve: step",
    );
    const group = graph.boundaries.find(
        (b) => b.id === "mermaid-group:fulfilment",
    );
    assert.equal(group.background, "#eef6ee", "a subgraph's style");

    const { svg } = exportSvg({
        graph,
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: "Styled",
            description: "",
            user: "Unknown",
            modified: "Unknown",
        },
        text: {
            measure: estimateText,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    });
    assert.match(svg, /#fde2e2/);
    assert.match(svg, /#c0392b/);
    const labelled = graph.edges.find((e) => e.labelBackground);
    assert.ok(labelled, "a palette backs its edge labels");
    assert.ok(svg.includes(`fill="${labelled.labelBackground}"`));
});

test("a node's own font exports with it", () => {
    const graph = graphOf(
        modelOf(
            "flowchart TD\n  A[Alpha] --> B\n  style A font-family:Georgia,font-weight:normal\n",
        ),
    );
    const { svg } = exportSvg({
        graph,
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: "Flow",
            description: "",
            user: "Unknown",
            modified: "Unknown",
        },
        text: {
            measure: estimateText,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, sans-serif",
            fontFaces: "",
        },
    });
    assert.match(
        svg,
        /<text [^>]*font-weight="normal" font-family="Georgia, Helvetica, sans-serif"[^>]*>Alpha<\/text>/,
    );
});
