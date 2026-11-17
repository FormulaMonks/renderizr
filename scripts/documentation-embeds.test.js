import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CLASSES,
    diagramCard,
    diagramNote,
    renderDocumentation,
    viewAddress,
} from "./documentation/index.js";

/**
 * Embedded views (spec #342, _Embedded views_ and _Diagram cards_): a view a
 * section or decision embeds shows as a diagram card that opens it on the
 * diagrams page, and a key the workspace lacks as a note in its place.
 */

/** A section of `filename` holding `content`. */
const section = (filename, content) => ({
    title: "",
    order: 1,
    filename,
    format: /\.adoc$/.test(filename) ? "AsciiDoc" : "Markdown",
    content,
});

/**
 * Workspace 42, whose software system Internet Banking has a system context
 * view, a container view titled "Inside the bank" and a view whose key holds
 * braces. Its own documentation holds `content` in `filename`; its software
 * system's documentation holds `system`.
 */
const workspace = (filename, content, { system, id = 42 } = {}) => ({
    id,
    name: "Bank",
    documentation: { sections: [section(filename, content)] },
    model: {
        softwareSystems: [
            {
                id: "1",
                name: "Internet Banking",
                ...(system ? { documentation: system } : {}),
            },
        ],
    },
    views: {
        systemContextViews: [{ key: "SystemContext", softwareSystemId: "1" }],
        containerViews: [
            {
                key: "Containers",
                title: "Inside <the> bank",
                softwareSystemId: "1",
            },
            { key: "Odd{type=graph}", softwareSystemId: "1" },
        ],
    },
});

/** The HTML `content` renders to as the workspace's only section. */
const rendered = async (content, filename = "01-views.md", options) => {
    const shown = workspace(filename, content, options);
    await renderDocumentation(shown);
    return shown.documentation.sections[0].content;
};

/** The `href` of every card in `html`. */
const cardAddresses = (html) =>
    [
        ...html.matchAll(
            new RegExp(`<a class="${CLASSES.diagramCard}" href="([^"]*)"`, "g"),
        ),
    ].map(([, href]) => href.replace(/&amp;/g, "&"));

/* ------------------------------------------------------------- the card */

test("a diagram card shows the type, the title and Open in diagrams, with an icon and no picture", () => {
    const html = diagramCard({
        type: "Container view",
        title: "Inside <the> bank",
        address: "#/?page=diagrams&view=Containers&perspective=A&B",
    });

    assert.match(html, new RegExp(`class="${CLASSES.diagramCard}"`));
    assert.match(html, /Container view/);
    assert.match(html, /Inside &lt;the&gt; bank/);
    assert.match(html, />Open in diagrams</);
    assert.match(html, /^<a [^>]*>[\s\S]*<\/a>$/);
    assert.match(
        html,
        /href="#\/\?page=diagrams&amp;view=Containers&amp;perspective=A&amp;B"/,
    );
    assert.match(html, /<svg aria-hidden="true"/);
    assert.doesNotMatch(html, /<img/);
});

test("a diagram card is phrasing content, so it sits in a paragraph or a list item", () => {
    const html = diagramCard({
        type: "T",
        title: "A",
        address: "#/?page=diagrams&view=a",
    });
    assert.doesNotMatch(html, /<(div|p|section|figure)\b/);
});

test("a diagram note says what it is given in a card's place", () => {
    const html = diagramNote("No such <code>view</code>.");
    assert.match(html, new RegExp(`class="${CLASSES.diagramNote}"`));
    assert.match(html, /role="note"/);
    assert.match(html, /No such <code>view<\/code>\./);
});

test("a view's address opens it on the diagrams page, under a perspective when one is named", () => {
    assert.equal(
        viewAddress("SystemContext"),
        "#/?page=diagrams&view=SystemContext",
    );
    assert.equal(
        viewAddress("A view", { perspective: "Security & Risk" }),
        "#/?page=diagrams&view=A+view&perspective=Security+%26+Risk",
    );
});

/* ------------------------------------------------------------ the forms */

test("![](embed:<key>) shows a card for the view, titled as the diagrams page titles it", async () => {
    const html = await rendered("# Views\n\n![](embed:SystemContext)\n");

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext",
    ]);
    assert.match(html, /System context view/);
    assert.match(html, /System Context View: Internet Banking/);
    assert.doesNotMatch(html, /<img/);
    // The card stands in the paragraph's place, not inside an empty one.
    assert.doesNotMatch(html, /<p>\s*<a class="rz-diagram-card"/);
});

test("a view's own title titles its card", async () => {
    const html = await rendered("![](embed:Containers)\n");

    assert.match(html, /Container view/);
    assert.match(html, /Inside &lt;the&gt; bank/);
});

test("image::embed:<key>[] shows the same card in AsciiDoc", async () => {
    const html = await rendered(
        "= Views\n\nimage::embed:SystemContext[]\n",
        "01-views.adoc",
    );

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext",
    ]);
    assert.match(html, /System Context View: Internet Banking/);
    assert.doesNotMatch(html, /<img/);
});

test("an embed inside a sentence keeps the sentence around its card", async () => {
    const html = await rendered("See ![](embed:SystemContext) here.\n");

    assert.match(html, /<p>See <a class="rz-diagram-card"/);
    assert.match(html, /<\/a> here\.<\/p>/);
});

/* ------------------------------------------------------- the parameters */

test("{type=graph} and {type=tree} open the view as the diagrams page draws it, and the card names neither", async () => {
    const html = await rendered(
        "![](embed:SystemContext{type=graph})\n\n![](embed:SystemContext{type=tree})\n",
    );

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext",
        "#/?page=diagrams&view=SystemContext",
    ]);
    assert.doesNotMatch(html, /graph|tree/);
});

test("{perspective=<name>} opens the view under that perspective", async () => {
    const html = await rendered(
        "![](embed:SystemContext{perspective=Security})\n",
    );

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext&perspective=Security",
    ]);
});

test("AsciiDoc reads the parameters too", async () => {
    const html = await rendered(
        "image::embed:SystemContext{type=graph,perspective=Security}[]\n",
        "01-views.adoc",
    );

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext&perspective=Security",
    ]);
});

test("the braces stay part of the key when a view has the whole string as its key", async () => {
    const html = await rendered("![](embed:Odd{type=graph})\n");

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=Odd%7Btype%3Dgraph%7D",
    ]);
});

/* ----------------------------------------------------- published PNGs */

test("a published PNG of the workspace shows the card of its view", async () => {
    const html = await rendered(
        [
            "![](https://structurizr.com/workspace/42/images/SystemContext.png)",
            "![](https://structurizr.com/share/42/images/Containers.png)",
            "![](https://structurizr.example.com/share/42/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0/images/SystemContext.png)",
        ].join("\n\n"),
    );

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext",
        "#/?page=diagrams&view=Containers",
        "#/?page=diagrams&view=SystemContext",
    ]);
    assert.doesNotMatch(html, /<img/);
});

test("a published PNG of the workspace shows the card in AsciiDoc too", async () => {
    const html = await rendered(
        "image::https://structurizr.com/share/42/images/SystemContext.png[]\n",
        "01-views.adoc",
    );

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext",
    ]);
});

test("a published PNG of workspace 0 is the workspace's when its id is 0", async () => {
    const html = await rendered(
        "![](https://structurizr.com/share/0/images/SystemContext.png)\n",
        "01-views.md",
        { id: 0 },
    );

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext",
    ]);
});

test("a published PNG of another workspace stays an ordinary image", async () => {
    const html = await rendered(
        "![Theirs](https://structurizr.com/share/99999/images/SystemContext.png)\n",
    );

    assert.deepEqual(cardAddresses(html), []);
    assert.match(
        html,
        /<img src="https:\/\/structurizr\.com\/share\/99999\/images\/SystemContext\.png" alt="Theirs">/,
    );
});

test("a published PNG stays an ordinary image when the workspace has no id", async () => {
    const html = await rendered(
        "![](https://structurizr.com/share/42/images/SystemContext.png)\n",
        "01-views.md",
        { id: null },
    );

    assert.deepEqual(cardAddresses(html), []);
    assert.match(html, /<img/);
});

/* ------------------------------------------------ a key the workspace lacks */

test("a key the workspace lacks shows a note that names it", async () => {
    const html = await rendered("![](embed:No<Such>View)\n");

    assert.deepEqual(cardAddresses(html), []);
    assert.match(html, new RegExp(`class="${CLASSES.diagramNote}"`));
    assert.match(html, /<code>No&lt;Such&gt;View<\/code>/);
    assert.match(html, /no view/i);
    assert.doesNotMatch(html, /<img/);
});

test("a key the workspace lacks shows the note in AsciiDoc too", async () => {
    const html = await rendered("image::embed:NoSuchView[]\n", "01-views.adoc");

    assert.match(html, new RegExp(`class="${CLASSES.diagramNote}"`));
    assert.match(html, /<code>NoSuchView<\/code>/);
});

test("a published PNG of the workspace whose key it lacks shows the note", async () => {
    const html = await rendered(
        "![](https://structurizr.com/share/42/images/Gone.png)\n",
    );

    assert.match(html, new RegExp(`class="${CLASSES.diagramNote}"`));
    assert.match(html, /<code>Gone<\/code>/);
});

/* ------------------------------------------------ documentation scopes */

test("a section and a decision of an element's documentation scope show cards from the workspace's views", async () => {
    const system = {
        sections: [section("01-system.md", "![](embed:Containers)\n")],
        decisions: [
            {
                id: "1",
                title: "Draw it",
                date: "2024-01-01T00:00:00Z",
                status: "Accepted",
                format: "Markdown",
                links: [],
                content:
                    "# 1. Draw it\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\n![](embed:SystemContext{perspective=Risk})\n",
            },
        ],
    };
    const shown = workspace("01-a.md", "# A\n", { system });
    await renderDocumentation(shown);

    assert.deepEqual(cardAddresses(system.sections[0].content), [
        "#/?page=diagrams&view=Containers",
    ]);
    assert.deepEqual(cardAddresses(system.decisions[0].content), [
        "#/?page=diagrams&view=SystemContext&perspective=Risk",
    ]);
});

test("another workspace's key reads as a key the workspace lacks", async () => {
    const orders = workspace("01-orders.md", "![](embed:Payments)\n");
    const payments = {
        ...workspace("01-payments.md", "![](embed:Payments)\n"),
        views: {
            systemContextViews: [{ key: "Payments", softwareSystemId: "1" }],
        },
    };
    await renderDocumentation(orders);
    await renderDocumentation(payments);

    assert.match(
        orders.documentation.sections[0].content,
        new RegExp(`class="${CLASSES.diagramNote}"`),
    );
    assert.deepEqual(
        cardAddresses(payments.documentation.sections[0].content),
        ["#/?page=diagrams&view=Payments"],
    );
});

/* ------------------------------------- GitHub formatting around embeds */

/** The class attribute of every card or note in `html`. */
const embedClasses = (html) =>
    [
        ...html.matchAll(
            new RegExp(
                `<(?:a|span) class="((?:${CLASSES.diagramCard}|${CLASSES.diagramNote})(?: [^"]*)?)"`,
                "g",
            ),
        ),
    ].map(([, classes]) => classes);

test("an embed with a color-scheme fragment shows its card in that scheme only", async () => {
    const html = await rendered(
        [
            "![](embed:SystemContext#gh-light-mode-only)",
            "![](https://structurizr.com/share/42/images/Containers.png#gh-dark-mode-only)",
            "![](embed:Gone#gh-dark-mode-only)",
        ].join("\n\n"),
    );

    assert.deepEqual(embedClasses(html), [
        `${CLASSES.diagramCard} ${CLASSES.schemeLight}`,
        `${CLASSES.diagramCard} ${CLASSES.schemeDark}`,
        `${CLASSES.diagramNote} ${CLASSES.schemeDark}`,
    ]);
    assert.match(html, /<code>Gone<\/code>/);
    assert.doesNotMatch(html, /gh-(dark|light)-mode-only/);
});

test("an AsciiDoc embed with a color-scheme fragment shows its card in that scheme only", async () => {
    const html = await rendered(
        "image::embed:SystemContext#gh-dark-mode-only[]\n",
        "01-views.adoc",
    );

    assert.deepEqual(embedClasses(html), [
        `${CLASSES.diagramCard} ${CLASSES.schemeDark}`,
    ]);
});

test("an image beside an embed still follows the color scheme", async () => {
    const shown = workspace(
        "01-views.md",
        "![](embed:SystemContext)\n\n![Dark](images/dark.svg#gh-dark-mode-only)\n",
    );
    shown.documentation.images = [
        { name: "images/dark.svg", type: "image/svg+xml", content: "REFSSw==" },
    ];
    await renderDocumentation(shown);
    const html = shown.documentation.sections[0].content;

    assert.deepEqual(cardAddresses(html), [
        "#/?page=diagrams&view=SystemContext",
    ]);
    assert.match(
        html,
        new RegExp(
            `<img src="data:image/svg\\+xml;base64,REFSSw==" alt="Dark" class="${CLASSES.schemeDark}">`,
        ),
    );
});

test("a bare published PNG of the workspace becomes an ordinary link, not a card", async () => {
    const url = "https://structurizr.com/share/42/images/SystemContext.png";
    const html = await rendered(`See ${url} for the picture.\n`);

    assert.deepEqual(cardAddresses(html), []);
    assert.match(html, new RegExp(`<a href="${url.replace(/\./g, "\\.")}">`));
});
