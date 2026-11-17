import assert from "node:assert/strict";
import { test } from "node:test";
import { CLASSES, renderDocumentation } from "./documentation/index.js";
import { readMermaidDiagrams } from "./mermaid/index.js";

/**
 * Mermaid blocks (spec #342, _Mermaid blocks_; ADR 31): a Mermaid block in a
 * section or decision becomes an image view the build adds, which the
 * Mermaid reader then reads like any other, and the section shows a diagram
 * card in its place. A type Renderizr does not draw, or a block that fails
 * to parse, shows a note instead and adds no view.
 */

const FLOWCHART = "flowchart LR\n  Cart --> Checkout";
const SEQUENCE = "sequenceDiagram\n  Alice->>Bob: Hi";
const ERD = "erDiagram\n  CUSTOMER ||--o{ ORDER : places";

/** A Markdown fence holding `source`. */
const fence = (source) => `\`\`\`mermaid\n${source}\n\`\`\``;

/** A section of `filename` holding `content`. */
const section = (filename, content) => ({
    title: "",
    order: 1,
    filename,
    format: /\.adoc$/.test(filename) ? "AsciiDoc" : "Markdown",
    content,
});

/**
 * A workspace whose own documentation holds `sections` and `decisions`, with
 * the software system Internet Banking, whose documentation holds `system`,
 * and the views `views`.
 */
const workspace = ({
    sections = [],
    decisions = [],
    system,
    views = {},
} = {}) => ({
    id: 42,
    name: "Shop",
    documentation: { sections, decisions },
    model: {
        softwareSystems: [
            {
                id: "1",
                name: "Internet Banking",
                ...(system ? { documentation: system } : {}),
            },
        ],
    },
    views,
});

/** `shown` rendered, and the warnings the render gave. */
const render = async (shown) => {
    const warnings = [];
    await renderDocumentation(shown, {
        warn: (message) => warnings.push(message),
    });
    return { shown, warnings };
};

/** The workspace with one section of `content`, rendered. */
const renderOne = async (content, filename = "01-flows.md", options = {}) =>
    render(workspace({ sections: [section(filename, content)], ...options }));

/** The image views a render added. */
const imageViews = (shown) => shown.views.imageViews ?? [];

/** Each card in `html`: its address, its type and its title. */
const cards = (html) =>
    [
        ...html.matchAll(
            new RegExp(
                `<a class="${CLASSES.diagramCard}" href="([^"]*)">.*?<span class="${CLASSES.diagramCardType}">([^<]*)</span><span class="${CLASSES.diagramCardTitle}">([^<]*)</span>`,
                "g",
            ),
        ),
    ].map(([, address, type, title]) => ({
        address: address.replace(/&amp;/g, "&"),
        type,
        title,
    }));

const address = (key) =>
    `#/?page=diagrams&view=${new URLSearchParams({ view: key }).toString().slice(5).replace(/%2F/gi, "/")}`;

/* ---------------------------------------------------------- block forms */

test("a mermaid fence becomes an image view and a diagram card in its place", async () => {
    const { shown } = await renderOne(
        `# Flows\n\n## Order flow\n\n${fence(FLOWCHART)}\n`,
    );

    const [view] = imageViews(shown);
    assert.equal(view.key, "01-flows/order-flow");
    assert.equal(view.title, "Order flow");
    assert.equal(view.elementId, undefined, "the workspace has no element");
    const html = shown.documentation.sections[0].content;
    assert.deepEqual(cards(html), [
        {
            address: address("01-flows/order-flow"),
            type: "Flowchart",
            title: "Order flow",
        },
    ]);
    assert.doesNotMatch(html, /Cart --&gt; Checkout|<pre/);
    assert.doesNotMatch(html, /rz-mermaid:/, "no marker is left behind");
});

test("the Mermaid reader reads the view the build adds like any image view's source", async () => {
    const { shown } = await renderOne(`## Order flow\n\n${fence(FLOWCHART)}\n`);
    const notices = readMermaidDiagrams(shown);

    const [view] = imageViews(shown);
    assert.deepEqual(notices, []);
    assert.equal(view.mermaid.error, undefined);
    assert.deepEqual(
        view.mermaid.nodes.map((node) => node.id),
        ["Cart", "Checkout"],
    );
});

test("each drawn type names its own kind on the card", async () => {
    const { shown } = await renderOne(
        [
            `## Flow\n\n${fence(FLOWCHART)}`,
            `## Graph\n\n${fence("graph TD\n  A --> B")}`,
            `## Data\n\n${fence(ERD)}`,
            `## Talk\n\n${fence(SEQUENCE)}`,
        ].join("\n\n"),
    );

    assert.deepEqual(
        cards(shown.documentation.sections[0].content).map(({ type }) => type),
        [
            "Flowchart",
            "Flowchart",
            "Entity relationship diagram",
            "Sequence diagram",
        ],
    );
    assert.equal(imageViews(shown).length, 4);
});

test("AsciiDoc's [mermaid] block and a mermaid source block become diagrams", async () => {
    const { shown } = await renderOne(
        [
            "= Flows",
            "",
            "== Order flow",
            "",
            "[mermaid]",
            "....",
            FLOWCHART,
            "....",
            "",
            "== Conversation",
            "",
            "[source,mermaid]",
            "----",
            SEQUENCE,
            "----",
            "",
        ].join("\n"),
        "01-flows.adoc",
    );

    assert.deepEqual(
        imageViews(shown).map((view) => [view.key, view.title]),
        [
            ["01-flows/order-flow", "Order flow"],
            ["01-flows/conversation", "Conversation"],
        ],
    );
    const html = shown.documentation.sections[0].content;
    assert.deepEqual(
        cards(html).map(({ type }) => type),
        ["Flowchart", "Sequence diagram"],
    );
    assert.doesNotMatch(html, /<pre/);
});

/** Structurizr's encoded link to `source` under `base`, in the `form` given. */
const pluginLink = (source, form = "svg", base = "https://mermaid.ink") =>
    `${base}/${form}/${Buffer.from(source).toString("base64url")}`;

test("the image link Structurizr's Mermaid plugin writes becomes a diagram, the png form like the img form", async () => {
    for (const form of ["svg", "img", "png"]) {
        const { shown } = await renderOne(
            `## Plugin\n\n![](${pluginLink(FLOWCHART, form)})\n`,
        );
        const html = shown.documentation.sections[0].content;
        assert.equal(imageViews(shown).length, 1, form);
        assert.deepEqual(
            cards(html).map(({ title }) => title),
            ["Plugin"],
            form,
        );
        assert.doesNotMatch(html, /<img|<p>/, `${form} stands on its own`);
    }
});

test("the plugin's link reads under the workspace's own mermaid.url", async () => {
    const base = "https://mermaid.example.com/";
    const { shown } = await renderOne(
        `## Plugin\n\n![](${pluginLink(FLOWCHART, "svg", base.slice(0, -1))})\n`,
        "01-flows.md",
        { views: { configuration: { properties: { "mermaid.url": base } } } },
    );
    assert.equal(imageViews(shown).length, 1);
    readMermaidDiagrams(shown);
    assert.equal(imageViews(shown)[0].mermaid.error, undefined);
});

test("an AsciiDoc image of the plugin's link becomes a diagram", async () => {
    const { shown } = await renderOne(
        `= Flows\n\n== Plugin\n\nimage::${pluginLink(FLOWCHART)}[]\n`,
        "01-flows.adoc",
    );
    assert.deepEqual(
        cards(shown.documentation.sections[0].content).map(
            ({ title }) => title,
        ),
        ["Plugin"],
    );
});

test("an ordinary image and an ordinary code block stay as they are", async () => {
    const { shown } = await renderOne(
        "## Pictures\n\n![A cat](https://example.com/cat.svg)\n\n```js\nlet a;\n```\n",
    );
    const html = shown.documentation.sections[0].content;
    assert.match(html, /<img src="https:\/\/example.com\/cat.svg"/);
    assert.match(html, /<pre/);
    assert.equal(imageViews(shown).length, 0);
});

/* --------------------------------------------------------------- titles */

test("the title is the source's own, else the heading above, else the section's", async () => {
    const { shown } = await renderOne(
        [
            "# Flows",
            "",
            "Before any heading of its own.",
            "",
            fence(FLOWCHART),
            "",
            "## Order flow",
            "",
            fence(`---\ntitle: Checkout flow\n---\n${FLOWCHART}`),
            "",
            fence(`${SEQUENCE.replace("\n", "\n  title Greeting\n")}`),
            "",
            fence(FLOWCHART),
        ].join("\n"),
    );
    assert.deepEqual(
        imageViews(shown).map((view) => view.title),
        ["Flows", "Checkout flow", "Greeting", "Order flow"],
    );
});

test("a section with no heading above the block takes the section's title", async () => {
    const { shown } = await renderOne(fence(FLOWCHART), "03-the-flows.md");
    assert.deepEqual(
        imageViews(shown).map((view) => [view.key, view.title]),
        [["03-the-flows/the-flows", "The Flows"]],
    );
});

test("a title repeated within one section takes (2), (3), and its key -2, -3", async () => {
    const { shown } = await renderOne(
        `## Flows\n\n${fence(FLOWCHART)}\n\n${fence(SEQUENCE)}\n\n${fence(ERD)}\n`,
    );
    assert.deepEqual(
        imageViews(shown).map((view) => [view.key, view.title]),
        [
            ["01-flows/flows", "Flows"],
            ["01-flows/flows-2", "Flows (2)"],
            ["01-flows/flows-3", "Flows (3)"],
        ],
    );
    assert.deepEqual(
        cards(shown.documentation.sections[0].content).map(
            ({ title }) => title,
        ),
        ["Flows", "Flows (2)", "Flows (3)"],
    );
});

test("the same title in two sections repeats nothing", async () => {
    const { shown } = await render(
        workspace({
            sections: [
                section("01-a.md", `## Flows\n\n${fence(FLOWCHART)}\n`),
                section("02-b.md", `## Flows\n\n${fence(FLOWCHART)}\n`),
            ],
        }),
    );
    assert.deepEqual(
        imageViews(shown).map((view) => [view.key, view.title]),
        [
            ["01-a/flows", "Flows"],
            ["02-b/flows", "Flows"],
        ],
    );
});

/* ----------------------------------------------------------------- keys */

test("a key another view holds takes -2", async () => {
    const { shown } = await renderOne(
        `## Flows\n\n${fence(FLOWCHART)}\n`,
        "01-flows.md",
        {
            views: {
                imageViews: [
                    { key: "01-flows/flows", elementId: "1", order: 7 },
                ],
            },
        },
    );
    assert.deepEqual(
        imageViews(shown).map((view) => view.key),
        ["01-flows/flows", "01-flows/flows-2"],
    );
    assert.equal(
        cards(shown.documentation.sections[0].content)[0].address,
        address("01-flows/flows-2"),
    );
});

test("an element's block sits under its documentation scope, with the element as its element", async () => {
    const { shown } = await render(
        workspace({
            system: {
                sections: [
                    section("01-flows.md", `## Login\n\n${fence(FLOWCHART)}\n`),
                ],
            },
        }),
    );
    const [view] = imageViews(shown);
    assert.equal(view.key, "internet-banking/01-flows/login");
    assert.equal(view.elementId, "1");
    assert.equal(
        shown.model.softwareSystems[0].elements,
        undefined,
        "the model gains no element",
    );
});

test("a decision's block sits under the decision", async () => {
    const { shown } = await render(
        workspace({
            decisions: [
                {
                    id: "2",
                    title: "Draw diagrams",
                    date: "2026-11-13",
                    status: "Accepted",
                    format: "Markdown",
                    content: `# 2. Draw diagrams\n\nDate: 2026-11-13\n\n## Status\n\nAccepted\n\n## Context\n\n${fence(SEQUENCE)}\n`,
                },
            ],
        }),
    );
    const [view] = imageViews(shown);
    assert.deepEqual([view.key, view.title], ["decision-2/context", "Context"]);
    assert.equal(cards(shown.documentation.decisions[0].content).length, 1);
});

/* ---------------------------------------------------------- drawer order */

test("documentation diagrams join the image views in document order, created after the workspace's views", async () => {
    const { shown } = await render(
        workspace({
            sections: [
                section(
                    "01-a.adoc",
                    `= A\n\n== One\n\n[mermaid]\n....\n${FLOWCHART}\n....\n`,
                ),
                section("02-b.md", `## Two\n\n${fence(FLOWCHART)}\n`),
            ],
            views: {
                systemContextViews: [
                    { key: "Context", softwareSystemId: "1", order: 4 },
                ],
                imageViews: [{ key: "Picture", elementId: "1", order: 9 }],
            },
        }),
    );
    assert.deepEqual(
        imageViews(shown).map((view) => [view.key, view.order]),
        [
            ["Picture", 9],
            ["01-a/one", 10],
            ["02-b/two", 11],
        ],
    );
    assert.equal(shown.views.systemContextViews.length, 1);
});

/* ---------------------------------------------------------- the way back */

test("the diagram's origin leads back to the section and the heading the block came from", async () => {
    const { shown } = await render(
        workspace({
            sections: [
                section(
                    "01-flows.md",
                    `# Flows\n\n## Order & pay\n\n${fence(FLOWCHART)}\n`,
                ),
            ],
            system: {
                sections: [
                    section("02-login.md", `# Login\n\n${fence(FLOWCHART)}\n`),
                ],
            },
        }),
    );
    assert.deepEqual(
        imageViews(shown).map((view) => view.origin),
        [
            {
                title: "Flows › Order & pay",
                address: "#/?page=docs&section=01-flows&subsection=order--pay",
            },
            {
                title: "Login",
                address:
                    "#/?page=docs&section=internet-banking/02-login&subsection=login",
            },
        ],
    );
});

test("a decision's diagram leads back to the decision", async () => {
    const { shown } = await render(
        workspace({
            decisions: [
                {
                    id: "2",
                    title: "",
                    format: "Markdown",
                    content: `# 2. Draw diagrams\n\n## Context\n\n${fence(FLOWCHART)}\n`,
                },
            ],
        }),
    );
    assert.deepEqual(imageViews(shown)[0].origin, {
        title: "Draw diagrams › Context",
        address: "#/?page=adrs&adr=2",
    });
});

/* ------------------------------------------------- types it does not draw */

test("a type Renderizr does not draw shows a note with its source and adds no view", async () => {
    const source =
        'pie title Traffic\n  "Web" : 62\n  "Mobile" : 31\n  "API" : 7\n  "Other" : 1';
    const { shown, warnings } = await renderOne(
        `## Traffic\n\n${fence(source)}\n`,
    );
    const html = shown.documentation.sections[0].content;

    assert.equal(imageViews(shown).length, 0);
    assert.deepEqual(warnings, []);
    assert.deepEqual(cards(html), []);
    assert.match(html, new RegExp(`class="${CLASSES.diagramNote}`));
    assert.match(html, /<code>pie<\/code>/);
    assert.match(
        html,
        /flowcharts, entity relationship diagrams and sequence diagrams/,
    );
    assert.match(
        html,
        new RegExp(`<details class="${CLASSES.diagramNoteSource}"`),
    );
    assert.ok(html.includes("&quot;Other&quot; : 1"), "the full source");
});

test("a short source shows whole, with nothing to expand", async () => {
    const { shown } = await renderOne(
        `## Classes\n\n${fence("classDiagram\n  A <|-- B")}\n`,
    );
    const html = shown.documentation.sections[0].content;
    assert.match(html, /<code>classDiagram<\/code>/);
    assert.doesNotMatch(html, /<details/);
    assert.match(html, /A &lt;\|-- B/);
});

/* ---------------------------------------------------------- parse errors */

test("a block that fails to parse shows the note with the parse error, adds no view and warns once", async () => {
    const { shown, warnings } = await renderOne(
        `# Flows\n\n## Broken\n\n${fence("flowchart TD\n  A -->")}\n`,
    );
    const html = shown.documentation.sections[0].content;

    assert.equal(imageViews(shown).length, 0);
    assert.deepEqual(cards(html), []);
    assert.match(html, /the source ends too early/);
    assert.match(html, /A --&gt;/);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Flows › Broken/);
    assert.match(warnings[0], /the source ends too early/);
});

test("a parse error leaves the next block's title and key alone", async () => {
    const { shown } = await renderOne(
        `## Flows\n\n${fence("flowchart TD\n  A -->")}\n\n${fence(FLOWCHART)}\n`,
    );
    assert.deepEqual(
        imageViews(shown).map((view) => [view.key, view.title]),
        [["01-flows/flows", "Flows"]],
    );
});

test("a marker an author writes stays the author's comment", async () => {
    const { shown } = await renderOne(
        "## Flows\n\n<!--rz-mermaid:0-->\n\nText.\n",
    );
    assert.equal(imageViews(shown).length, 0);
});
