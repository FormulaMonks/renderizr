import assert from "node:assert/strict";
import { test } from "node:test";
import { mermaidView, mermaidWorkspace } from "../__fixtures__/mermaid.js";
import { readMermaidDiagrams } from "./index.js";
import { themes } from "./parser.js";
import { readPalette } from "./styling.js";
import { Ignored, ignoredWarning } from "./warnings.js";

/** The `mermaid` model and the notices of one image view drawing `source`. */
function readOne(source) {
    const workspace = mermaidWorkspace([mermaidView("flow", source)]);
    const notices = readMermaidDiagrams(workspace);
    return { mermaid: workspace.views.imageViews[0].mermaid, notices };
}

const init = (config) => `%%{init: ${JSON.stringify(config)}}%%\n`;

/* ----------------------------------------------------------------- palette */

test("a silent source carries no palette", () => {
    const { mermaid, notices } = readOne("flowchart TD\n  A --> B\n");
    assert.equal(mermaid.palette, undefined);
    assert.deepEqual(notices, []);
});

test("a named theme gives the palette Mermaid's own theme code derives", () => {
    const { mermaid } = readOne(
        `${init({ theme: "forest" })}flowchart TD\n  A --> B\n`,
    );
    const forest = themes.forest.getThemeVariables({});
    assert.deepEqual(mermaid.palette, {
        dark: false,
        node: {
            background: forest.mainBkg,
            stroke: forest.nodeBorder,
            color: forest.textColor,
        },
        edge: {
            color: forest.lineColor,
            labelColor: forest.textColor,
            labelBackground: forest.edgeLabelBackground,
        },
        group: {
            background: forest.clusterBkg,
            stroke: forest.clusterBorder,
            color: forest.titleColor,
        },
        rows: {
            odd: forest.attributeBackgroundColorOdd,
            even: forest.attributeBackgroundColorEven,
        },
    });
});

test("a lone primaryColor derives its text and border colors under the base theme", () => {
    const { mermaid } = readOne(
        `${init({ theme: "base", themeVariables: { primaryColor: "#ffcc00" } })}flowchart TD\n  A --> B\n`,
    );
    assert.equal(mermaid.palette.node.background, "#ffcc00");
    assert.equal(mermaid.palette.node.stroke, "hsl(48, 60%, 40%)");
    assert.equal(mermaid.palette.node.color, "#333");
});

test("themeVariables with no theme layer over Mermaid's default theme, as Mermaid reads them", () => {
    const { mermaid } = readOne(
        `${init({ themeVariables: { lineColor: "#123456", primaryTextColor: "#654321" } })}flowchart TD\n  A --> B\n`,
    );
    assert.equal(mermaid.palette.edge.color, "#123456");
    assert.equal(mermaid.palette.node.color, "#654321");
    assert.equal(mermaid.palette.dark, false);
});

test("theme dark, and darkMode under base, give a dark palette", () => {
    const dark = readOne(`${init({ theme: "dark" })}flowchart TD\n  A --> B\n`);
    assert.equal(dark.mermaid.palette.dark, true);
    assert.equal(dark.mermaid.palette.node.background, "#1f2020");
    const base = readOne(
        `${init({ theme: "base", themeVariables: { darkMode: true, primaryColor: "#223344" } })}flowchart TD\n  A --> B\n`,
    );
    assert.equal(base.mermaid.palette.dark, true);
});

test("the palette carries fontSize and fontFamily only when the source sets them", () => {
    const { mermaid } = readOne(
        `${init({ theme: "base", themeVariables: { fontSize: "20px", fontFamily: "Georgia, serif" } })}flowchart TD\n  A --> B\n`,
    );
    assert.equal(mermaid.palette.fontSize, 20);
    assert.equal(mermaid.palette.fontFamily, "Georgia, serif");
    const plain = readOne(
        `${init({ theme: "base" })}flowchart TD\n  A --> B\n`,
    );
    assert.equal(plain.mermaid.palette.fontSize, undefined);
    assert.equal(plain.mermaid.palette.fontFamily, undefined);
});

test("readPalette hands Mermaid's theme code only the honored theme variables", () => {
    const ignored = new Ignored();
    const palette = readPalette(
        { theme: "base", themeVariables: { mainBkg: "#ff0000" } },
        ignored,
    );
    assert.notEqual(palette.node.background, "#ff0000");
    assert.equal(ignored.warning("k"), ignoredWarning("k", ["mainBkg"]));
});

/* ------------------------------------------------------- ignored styling */

test("CSS outside the honored lists warns once per property: subgraphs, nodes, edges, then classes", () => {
    const { notices } = readOne(
        [
            "flowchart TD",
            "  A --> B",
            "  B --> C",
            "  subgraph S",
            "    C",
            "  end",
            "  style A fill:#f00,opacity:0.5,font-weight:bold,font-family:Georgia",
            "  style B opacity:0.2,text-decoration:underline",
            "  style S fill:#eee,rx:5",
            "  classDef warn fill:#fde2e2,font-style:italic",
            "  linkStyle 0 stroke:#f00,color:#0f0,fill:none,stroke-dasharray:3",
            "  linkStyle 1 stroke-linecap:round",
        ].join("\n"),
    );
    assert.deepEqual(notices, [
        ignoredWarning("flow", [
            "rx",
            "opacity",
            "text-decoration",
            "stroke-linecap",
            "font-style",
        ]),
    ]);
});

test("look, htmlLabels, layout: elk, elk keys, unknown themes and theme variables outside the list warn", () => {
    const { notices } = readOne(
        [
            "---",
            "config:",
            "  theme: sunset",
            "  look: handDrawn",
            "  htmlLabels: false",
            "  layout: elk",
            "  elk:",
            "    mergeEdges: true",
            "    nodePlacementStrategy: SIMPLE",
            "  themeVariables:",
            "    primaryColor: '#ffcc00'",
            "    nodeBorder: '#000000'",
            "---",
            "flowchart TD",
            "  A --> B",
        ].join("\n"),
    );
    assert.deepEqual(notices, [
        ignoredWarning("flow", [
            'theme "sunset"',
            "nodeBorder",
            "look",
            "htmlLabels",
            "layout: elk",
            "elk.mergeEdges",
            "elk.nodePlacementStrategy",
        ]),
    ]);
});

test("look: classic and layout: dagre draw as Renderizr does, with no warning", () => {
    const { notices } = readOne(
        `${init({ look: "classic", layout: "dagre" })}flowchart TD\n  A --> B\n`,
    );
    assert.deepEqual(notices, []);
});

test("htmlLabels warns under flowchart too, and for labels that hold HTML", () => {
    const set = readOne(
        `${init({ flowchart: { htmlLabels: true } })}flowchart TD\n  A --> B\n`,
    );
    assert.deepEqual(set.notices, [ignoredWarning("flow", ["htmlLabels"])]);
    const html = readOne(
        "graph TB\n  1[\"<div style='font-weight: bold'>Customer</div><div>[Person]</div>\"]\n  2[Two<br>lines]\n  1 --> 2\n",
    );
    assert.deepEqual(html.notices, [ignoredWarning("flow", ["htmlLabels"])]);
    const br = readOne("flowchart TD\n  A[Two<br/>lines] --> B\n");
    assert.deepEqual(br.notices, [], "a line break alone is no HTML label");
});

test("a curve on a flowchart is honored, with no warning", () => {
    for (const curve of ["linear", "step", "basis", "cardinal"]) {
        const { notices } = readOne(
            `${init({ flowchart: { curve } })}flowchart TD\n  A --> B\n`,
        );
        assert.deepEqual(notices, [], curve);
    }
});
