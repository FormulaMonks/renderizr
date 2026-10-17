import assert from "node:assert/strict";
import { test } from "node:test";
import { mermaidView, mermaidWorkspace } from "../__fixtures__/mermaid.js";
import { readMermaidDiagrams } from "./index.js";
import { ignoredWarning } from "./warnings.js";

/** The `mermaid` model and the notices of one image view drawing `source`. */
function readOne(source) {
    const workspace = mermaidWorkspace([mermaidView("shop", source)]);
    const notices = readMermaidDiagrams(workspace);
    return { mermaid: workspace.views.imageViews[0].mermaid, notices };
}

const SHOP = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
    PRODUCT ||--o{ LINE-ITEM : "ordered in"
    CATEGORY |o--o{ PRODUCT : groups
    CUSTOMER["Customer"] {
        string id PK
        string email UK "Login and receipts"
    }
    LINE-ITEM {
        int orderNumber PK, FK
        decimal price "Price when ordered"
    }
`;

test("an erDiagram image view gains an ERD model and stays an image view", () => {
    const { mermaid, notices } = readOne(SHOP);
    assert.equal(mermaid.kind, "er");
    assert.equal(mermaid.direction, "TB");
    assert.deepEqual(notices, []);
    assert.deepEqual(
        mermaid.entities.map((entity) => [entity.id, entity.label]),
        [
            ["CUSTOMER", "Customer"],
            ["ORDER", "ORDER"],
            ["DELIVERY-ADDRESS", "DELIVERY-ADDRESS"],
            ["PRODUCT", "PRODUCT"],
            ["LINE-ITEM", "LINE-ITEM"],
            ["CATEGORY", "CATEGORY"],
        ],
        "every entity in Mermaid's order, alias first, case unchanged",
    );
});

test("attributes keep Mermaid's column order: type, name, keys and comment", () => {
    const { mermaid } = readOne(SHOP);
    const byId = new Map(mermaid.entities.map((e) => [e.id, e]));
    assert.deepEqual(byId.get("CUSTOMER").attributes, [
        { type: "string", name: "id", keys: ["PK"], comment: "" },
        {
            type: "string",
            name: "email",
            keys: ["UK"],
            comment: "Login and receipts",
        },
    ]);
    assert.deepEqual(byId.get("LINE-ITEM").attributes[0].keys, ["PK", "FK"]);
    assert.deepEqual(byId.get("ORDER").attributes, []);
});

test("each relationship points from its first entity to its second, its cardinalities at the right ends", () => {
    const { mermaid } = readOne(SHOP);
    assert.deepEqual(
        mermaid.relationships.map(
            ({ id, source, target, label, start, end }) => [
                id,
                source,
                target,
                label,
                start,
                end,
            ],
        ),
        [
            ["0", "CUSTOMER", "ORDER", "places", "one", "zeroOrMore"],
            [
                "1",
                "CUSTOMER",
                "DELIVERY-ADDRESS",
                "uses",
                "oneOrMore",
                "oneOrMore",
            ],
            ["2", "PRODUCT", "LINE-ITEM", "ordered in", "one", "zeroOrMore"],
            ["3", "CATEGORY", "PRODUCT", "groups", "zeroOrOne", "zeroOrMore"],
        ],
    );
});

test("identifying relationships are solid and non-identifying ones dashed", () => {
    const { mermaid } = readOne(SHOP);
    assert.deepEqual(
        mermaid.relationships.map((r) => r.identifying),
        [true, false, true, true],
    );
});

test("an ERD reads its direction, its spacing config and its title", () => {
    const { mermaid } = readOne(
        "---\ntitle: Shop\nconfig:\n  er:\n    nodeSpacing: 20\n---\nerDiagram\n  direction LR\n  A ||--o{ B : has\n",
    );
    assert.equal(mermaid.direction, "LR");
    assert.equal(mermaid.title, "Shop");
    assert.equal(mermaid.config.er.nodeSpacing, 20);
});

test("entity styles and classes come through as written, unknown CSS warned about", () => {
    const { mermaid, notices } = readOne(
        "erDiagram\n  A ||--o{ B : has\n  A:::hot\n  classDef hot fill:#f00,font-style:italic\n  style B fill:#00f,stroke-width:4px\n",
    );
    const [a, b] = mermaid.entities;
    assert.deepEqual(a.classes, ["hot"]);
    assert.deepEqual(b.styles, ["fill:#00f", "stroke-width:4px"]);
    assert.deepEqual(mermaid.classDefs, {
        hot: ["fill:#f00", "font-style:italic"],
    });
    assert.deepEqual(notices, [ignoredWarning("shop", ["font-style"])]);
});

test("rowOdd and rowEven reach the palette only when the source sets them", () => {
    const set = readOne(
        '%%{init: {"theme": "forest", "themeVariables": {"rowOdd": "#ff0000", "attributeBackgroundColorEven": "#00ff00"}}}%%\nerDiagram\n  A ||--o{ B : has\n',
    );
    assert.deepEqual(set.mermaid.palette.rows, {
        odd: "#ff0000",
        even: "#00ff00",
    });
    assert.deepEqual(set.notices, []);
    const unset = readOne(
        '%%{init: {"theme": "forest"}}%%\nerDiagram\n  A ||--o{ B : has\n',
    );
    assert.equal(unset.mermaid.palette.rows, undefined);
});

test("constructs Renderizr doesn't draw yet fail the ERD", () => {
    const cases = [
        [
            "the parent cardinality",
            "erDiagram\n  A u--|| B : is\n",
            'the cardinality "u" (parent) isn\'t something Renderizr draws yet',
        ],
        [
            "a subgraph",
            "erDiagram\n  subgraph S [Shop]\n    A ||--o{ B : has\n  end\n",
            "an ERD subgraph isn't something Renderizr draws yet",
        ],
    ];
    for (const [name, source, reason] of cases) {
        const { mermaid, notices } = readOne(source);
        assert.deepEqual(mermaid, { kind: "er", error: reason }, name);
        assert.deepEqual(notices, [`Mermaid diagram "shop": ${reason}.`]);
    }
});

test("an ERD that doesn't parse fails as an ERD", () => {
    const { mermaid } = readOne("erDiagram\n  A ||--o{ B :\n");
    assert.equal(mermaid.kind, "er");
    assert.match(mermaid.error, /^a parse error at line 2/);
});
