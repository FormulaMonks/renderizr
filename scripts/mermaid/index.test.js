import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MERMAID_URL,
    encodeBase64,
    encodeMermaid,
    mermaidView,
    mermaidWorkspace,
} from "../__fixtures__/mermaid.js";
import { parseErrorReason, readMermaidDiagrams } from "./index.js";
import { read } from "./parser.js";
import { ignoredWarning } from "./warnings.js";

/** The `mermaid` model and the notices of one image view drawing `source`. */
function readOne(source, extra = {}, properties = {}) {
    const workspace = mermaidWorkspace(
        [mermaidView("flow", source, extra)],
        properties,
    );
    const notices = readMermaidDiagrams(workspace);
    return {
        mermaid: workspace.views.imageViews[0].mermaid,
        notices,
        workspace,
    };
}

/* ------------------------------------------------------- which views draw */

test("a flowchart image view gains a mermaid model and stays an image view", () => {
    const { mermaid, notices, workspace } = readOne(
        "flowchart LR\n  A --> B\n",
    );
    assert.equal(workspace.views.imageViews.length, 1, "the view stays put");
    assert.equal(mermaid.kind, "flowchart");
    assert.equal(mermaid.direction, "LR");
    assert.deepEqual(
        mermaid.nodes.map((n) => n.id),
        ["A", "B"],
    );
    assert.deepEqual(notices, [], "nothing to warn about");
    assert.deepEqual(workspace.model, {}, "nothing enters the model");
    assert.equal(workspace.views.customViews, undefined, "no custom view");
});

test("graph reads as a flowchart too", () => {
    const { mermaid } = readOne("graph TD\n  A --> B\n");
    assert.equal(mermaid.kind, "flowchart");
    assert.equal(mermaid.direction, "TB");
});

test("image views that carry no Mermaid source Renderizr draws stay ordinary, with no warning", () => {
    const cases = [
        ["a picture", { content: "https://example.test/a.png" }],
        ["inlined Mermaid", { content: "data:image/svg+xml;base64,PHN2Zy8+" }],
        ["a pie chart", { content: encodeMermaid('pie\n  "a": 1\n') }],
    ];
    for (const [name, fields] of cases) {
        const workspace = mermaidWorkspace([{ key: "v", ...fields }]);
        const notices = readMermaidDiagrams(workspace);
        assert.equal(workspace.views.imageViews[0].mermaid, undefined, name);
        assert.deepEqual(notices, [], `${name} warns about nothing`);
    }
});

test("mermaid.url comes from the image view's properties, then the view set's", () => {
    const own = "https://mermaid.example.test";
    const workspace = mermaidWorkspace([
        {
            key: "own",
            content: encodeMermaid("graph TD\n  A-->B", { url: own }),
            properties: { "mermaid.url": own },
        },
        { key: "set", content: encodeMermaid("graph TD\n  A-->B") },
        {
            key: "other",
            content: encodeMermaid("graph TD\n  A-->B", { url: own }),
        },
    ]);
    readMermaidDiagrams(workspace);
    const [first, second, third] = workspace.views.imageViews;
    assert.equal(first.mermaid?.kind, "flowchart", "the view's own URL");
    assert.equal(second.mermaid?.kind, "flowchart", "the view set's URL");
    assert.equal(third.mermaid, undefined, "another server is a picture");
});

test("every filled content field must hold the same source once CRLF becomes LF", () => {
    const source = "graph TD\n  A --> B\n";
    const agree = readOne(source, {
        contentLight: encodeBase64(source.replace(/\n/g, "\r\n")),
        contentDark: encodeMermaid(source, { kind: "img" }),
    });
    assert.equal(agree.mermaid.error, undefined, "CRLF and LF agree");

    const cases = [
        [
            "two sources",
            { contentDark: encodeMermaid("graph TD\n  A --> C\n") },
            "the content fields disagree",
        ],
        [
            "a picture beside the source",
            { contentDark: "https://example.test/dark.png" },
            "the content fields disagree",
        ],
        [
            "a Mermaid URL that carries nothing",
            { contentDark: `${MERMAID_URL}/svg/` },
            "the image view carries no Mermaid source",
        ],
    ];
    for (const [name, extra, reason] of cases) {
        const { mermaid, notices } = readOne(source, extra);
        assert.equal(mermaid.error, reason, name);
        assert.deepEqual(
            notices,
            [`Mermaid diagram "flow": ${reason}.`],
            `${name} prints its reason once`,
        );
    }
});

test("a source with CRLF frontmatter still draws as the type it opens", () => {
    const { mermaid } = readOne(
        "---\r\ntitle: Orders\r\n---\r\nflowchart LR\r\n  A --> B\r\n",
    );
    assert.equal(mermaid?.kind, "flowchart");
    assert.equal(mermaid.error, undefined);
    assert.equal(mermaid.title, "Orders");
});

test("a drawn source in any content field makes the fields disagree with another type, whatever their order", () => {
    const flowchart = "flowchart LR\n  A --> B\n";
    const pie = 'pie\n  "A" : 1\n';
    for (const [content, other] of [
        [pie, flowchart],
        [flowchart, pie],
    ]) {
        const { mermaid } = readOne(content, {
            contentDark: encodeMermaid(other),
        });
        assert.equal(mermaid?.error, "the content fields disagree");
    }
});

test("theme colors Mermaid's theme code can't read fall back to the silent look and warn", () => {
    const { mermaid, notices } = readOne(
        `%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#12345"}}}%%\nflowchart LR\n  A --> B\n`,
    );
    assert.equal(mermaid.error, undefined);
    assert.equal(mermaid.palette, undefined);
    assert.deepEqual(notices, [ignoredWarning("flow", ["theme colors"])]);
});

/* ------------------------------------------------------------ parse errors */

test("a parse error fails the diagram with the line and no Jison noise", () => {
    const { mermaid, notices } = readOne("flowchart TD\n  A --> B\n  B -->\n");
    assert.equal(
        mermaid.error,
        "a parse error at line 3: the source ends too early",
    );
    assert.equal(notices.length, 1);
    assert.doesNotMatch(notices[0], /Expecting|---\^/);
});

test("parseErrorReason keeps the text the parser stopped after, at its line under the frontmatter", () => {
    const source =
        "---\ntitle: x\n---\nflowchart TD\n  A[unclosed\n  B --> C\n";
    let error;
    try {
        read(source);
    } catch (caught) {
        error = caught;
    }
    const reason = parseErrorReason(error, source);
    assert.match(reason, /^a parse error at line 5: unexpected text after "/);
    assert.doesNotMatch(reason, /Expecting|\^|\n/);
});

test("an edge to a subgraph fails the diagram as a construct not drawn yet", () => {
    const { mermaid } = readOne(
        "flowchart TD\n  A --> S\n  subgraph S\n    B\n  end\n",
    );
    assert.equal(
        mermaid.error,
        "an edge to a subgraph isn't something Renderizr draws yet",
    );
});

/* ------------------------------------------------------ the flowchart model */

test("nodes carry their label lines, shape, subgraph, classes, styles and link", () => {
    const { mermaid } = readOne(
        [
            "flowchart LR",
            "  A[Start<br>here] --> B{ok?}",
            "  B --> C((done))",
            "  B --> D[(store)]",
            "  B --> E{{prepare}}",
            "  B --> F(rounded)",
            "  subgraph S [Group one]",
            "    direction TB",
            "    C",
            "  end",
            "  classDef hot fill:#f00",
            "  class A hot",
            "  style B fill:#0f0",
            '  click A href "https://example.test" "Open it" _blank',
        ].join("\n"),
    );
    const byId = Object.fromEntries(mermaid.nodes.map((n) => [n.id, n]));
    assert.equal(byId.A.label, "Start\nhere");
    assert.deepEqual(
        mermaid.nodes.map((n) => [n.id, n.shape]),
        [
            ["A", "Box"],
            ["B", "Diamond"],
            ["C", "Circle"],
            ["D", "Cylinder"],
            ["E", "Hexagon"],
            ["F", "RoundedBox"],
        ],
    );
    assert.equal(byId.C.parent, "S");
    assert.deepEqual(byId.A.classes, ["hot"]);
    assert.deepEqual(byId.B.styles, ["fill:#0f0"]);
    assert.equal(byId.A.link, "https://example.test");
    assert.equal(byId.A.linkTarget, "_blank");
    assert.equal(byId.A.tooltip, "Open it");
    assert.deepEqual(mermaid.subgraphs, [
        {
            id: "S",
            label: "Group one",
            direction: "TB",
            classes: [],
            styles: [],
        },
    ]);
    assert.deepEqual(mermaid.classDefs, { hot: ["fill:#f00"] });
});

test("edges carry their line, ends, label and styles in source order", () => {
    const { mermaid } = readOne(
        [
            "flowchart LR",
            "  A -->|go| B",
            "  B -.-> C",
            "  C ==> D",
            "  D --- E",
            "  E --o F",
            "  F --x G",
            "  G <--> H",
            "  linkStyle 0 stroke:#f00",
        ].join("\n"),
    );
    assert.deepEqual(
        mermaid.edges.map((e) => [e.source, e.target, e.line, e.start, e.end]),
        [
            ["A", "B", "normal", "none", "arrow"],
            ["B", "C", "dotted", "none", "arrow"],
            ["C", "D", "thick", "none", "arrow"],
            ["D", "E", "normal", "none", "none"],
            ["E", "F", "normal", "none", "circle"],
            ["F", "G", "normal", "none", "cross"],
            ["G", "H", "normal", "arrow", "arrow"],
        ],
    );
    assert.equal(mermaid.edges[0].label, "go");
    assert.deepEqual(mermaid.edges[0].styles, ["stroke:#f00", "fill:none"]);
});

test("HTML in labels becomes plain text lines, as Structurizr's mermaid export writes them", () => {
    const { mermaid } = readOne(
        [
            "graph TB",
            "  1[\"<div style='font-weight: bold'>Customer</div><div style='font-size: 70%'>[Person]</div><div>A customer of the bank.</div>\"]",
            '  2["Internet &amp; Mobile #quot;Banking#quot;"]',
            "  1-. \"<div>Uses</div><div style='font-size: 70%'></div>\" .->2",
        ].join("\n"),
    );
    assert.equal(
        mermaid.nodes[0].label,
        "Customer\n[Person]\nA customer of the bank.",
    );
    assert.equal(mermaid.nodes[1].label, 'Internet & Mobile "Banking"');
    assert.equal(mermaid.edges[0].label, "Uses");
});

test("the frontmatter title and the config travel with the model", () => {
    const { mermaid } = readOne(
        [
            "---",
            "title: Order flow",
            "config:",
            "  flowchart:",
            "    nodeSpacing: 20",
            "---",
            "flowchart TD",
            "  A --> B",
        ].join("\n"),
    );
    assert.equal(mermaid.title, "Order flow");
    assert.deepEqual(mermaid.config, { flowchart: { nodeSpacing: 20 } });
});

test("a source with no title carries none", () => {
    const { mermaid } = readOne("flowchart TD\n  A --> B\n");
    assert.equal(mermaid.title, undefined);
});

/* ------------------------------------------------------- ignored styling */

test("shapes that fall back to a rectangle warn once, in source order", () => {
    const { mermaid, notices } = readOne(
        [
            "flowchart TD",
            "  A([stadium]) --> B[[subroutine]]",
            "  B --> C>asymmetric]",
            "  C --> D[/parallelogram/]",
            "  D --> E[/trapezoid\\]",
            "  E --> F(((double)))",
            "  F --> G@{ shape: hourglass }",
            "  G --> H([again])",
        ].join("\n"),
    );
    assert.ok(mermaid.nodes.every((n) => n.shape === "Box"));
    assert.deepEqual(notices, [
        ignoredWarning("flow", [
            'shape "stadium"',
            'shape "subroutine"',
            'shape "asymmetric"',
            'shape "parallelogram"',
            'shape "trapezoid"',
            'shape "double circle"',
            'shape "hourglass"',
        ]),
    ]);
    assert.match(
        notices[0],
        /^Image view "flow": Renderizr supports only a subset of Mermaid styling; ignored: shape "stadium", /,
    );
});

test("invisible links, link length, Markdown strings and fa: icons fall back and warn", () => {
    const { mermaid, notices } = readOne(
        [
            "flowchart TD",
            "  A ~~~ B",
            "  A ---> C",
            '  D["`**bold** words`"]',
            "  E[fa:fa-car Car]",
        ].join("\n"),
    );
    assert.equal(mermaid.edges.length, 1, "the invisible link goes");
    const byId = Object.fromEntries(mermaid.nodes.map((n) => [n.id, n]));
    assert.equal(byId.D.label, "bold words");
    assert.equal(byId.E.label, "Car");
    assert.deepEqual(notices, [
        ignoredWarning("flow", [
            "Markdown strings",
            "fa: icons",
            "invisible links",
            "link length",
        ]),
    ]);
});

test("animate and animation on an edge's metadata are ignored and warn, and the edges stay", () => {
    const { mermaid, notices } = readOne(
        [
            "flowchart LR",
            "  A e1@--> B",
            "  B e2@--> C",
            "  e1@{ animate: true }",
            "  e2@{ animation: fast }",
        ].join("\n"),
    );
    assert.equal(mermaid.edges.length, 2, "both edges draw");
    assert.deepEqual(notices, [
        ignoredWarning("flow", ["animate", "animation"]),
    ]);
});

test("click callbacks are ignored and warn once, and a click link stays", () => {
    const { mermaid, notices } = readOne(
        [
            "flowchart TD",
            "  A --> B --> C",
            "  click A callback",
            '  click B call notify("B")',
            '  click C href "https://example.test/c" "Open C"',
        ].join("\n"),
    );
    const byId = Object.fromEntries(mermaid.nodes.map((n) => [n.id, n]));
    assert.equal(byId.A.link, undefined);
    assert.equal(byId.B.link, undefined);
    assert.equal(byId.C.link, "https://example.test/c");
    assert.equal(byId.C.tooltip, "Open C");
    assert.deepEqual(notices, [ignoredWarning("flow", ["click callbacks"])]);
});

test("a click link reads under securityLevel loose, so the page decides what a script link offers", () => {
    const { mermaid } = readOne(
        'flowchart TD\n  A\n  click A "javascript:alert(1)"\n',
    );
    assert.equal(mermaid.nodes[0].link, "javascript:alert(1)");
});
