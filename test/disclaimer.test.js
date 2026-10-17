/**
 * The page's footer, from `src/components/disclaimer.ts`: one line that
 * says what is on screen, from a C4 view to a Mermaid diagram, a picture,
 * the documentation or the decisions, and always credits Renderizr.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { disclaimerHtml, disclaimerKind } = await importSrc(
    "components/disclaimer",
);

/** The footer's text, links and all, as a reader sees it. */
const text = (html) => html.replace(/<[^>]*>/g, "");

test("the footer says what is on screen, and credits Renderizr with its version", () => {
    const cases = [
        [
            "c4",
            "Diagrams from a Structurizr workspace, in C4 notation, drawn with React Flow. Created with Renderizr v2.4.0.",
        ],
        [
            "mermaid",
            "Diagrams from a Structurizr workspace, from Mermaid source, drawn with React Flow. Created with Renderizr v2.4.0.",
        ],
        [
            "image",
            "Diagrams from a Structurizr workspace. Created with Renderizr v2.4.0.",
        ],
        [
            "docs",
            "A Structurizr workspace's documentation. Created with Renderizr v2.4.0.",
        ],
        [
            "adrs",
            "A Structurizr workspace's decisions. Created with Renderizr v2.4.0.",
        ],
    ];
    for (const [kind, expected] of cases) {
        assert.equal(text(disclaimerHtml(kind, "2.4.0")), expected, kind);
    }
});

test("the footer leaves the version out when the build doesn't know it", () => {
    assert.equal(
        text(disclaimerHtml("image", "")),
        "Diagrams from a Structurizr workspace. Created with Renderizr.",
    );
});

test("the footer links Structurizr, the notation, React Flow and Renderizr where it names them", () => {
    const html = disclaimerHtml("c4", "2.4.0");
    for (const href of [
        "https://structurizr.com/",
        "https://c4model.com/",
        "https://reactflow.dev/",
        "https://github.com/FormulaMonks/renderizr",
    ]) {
        assert.ok(html.includes(`href="${href}"`), href);
    }
    assert.ok(
        disclaimerHtml("mermaid", "").includes(
            'href="https://mermaid.js.org/"',
        ),
    );
});

test("a view's type picks its footer: Mermaid diagrams, pictures, and every C4 view", () => {
    assert.equal(disclaimerKind({ type: "Mermaid" }), "mermaid");
    assert.equal(disclaimerKind({ type: "Image" }), "image");
    for (const type of ["SystemContext", "Container", "Dynamic", "Custom"]) {
        assert.equal(disclaimerKind({ type }), "c4", type);
    }
});
