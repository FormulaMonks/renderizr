/**
 * `src/components/markdown-renderer.ts` — the component that shows a
 * section or a decision body the build rendered (ADR 31). It takes HTML, so
 * these feed it HTML; what the build makes of Markdown is in
 * `markdown.test.js`.
 */

import assert from "node:assert/strict";
import { dom, importSrc, srcTest as test, stubElement } from "./support/ts.js";

const { default: MarkdownRenderer } = await importSrc(
    "components/markdown-renderer",
);

const ONE = '<h2 id="one" tabindex="-1">One</h2>\n';

test("the HTML the build rendered shows inside the wrapper the module CSS styles", () => {
    const element = stubElement();
    new MarkdownRenderer(element).setContent(ONE);

    assert.equal(element.html, ONE.trim());
    assert.ok(element.querySelector(".markdown-renderer > h2#one"));
});

test("rendering tags the host element and attaches exactly one click listener", () => {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);

    renderer.setContent(ONE);
    renderer.setContent('<h2 id="two" tabindex="-1">Two</h2>');

    assert.ok(element.classList.contains("markdownRenderer"));
    assert.equal(
        element.listeners.length,
        1,
        "re-rendering stacked up duplicate listeners",
    );
});

test("a heading link scrolls to its heading rather than navigating", () => {
    dom.reset();
    const element = dom.mount("content");
    new MarkdownRenderer(element).setContent(
        `<p><a href="#one">up</a></p>${ONE}`,
    );

    element.querySelector('a[href="#one"]').click();

    assert.deepEqual(
        dom.document.scrolledIntoView.map((entry) => entry.id),
        ["one"],
    );
});

test("clear() empties the element and detaches the listener", () => {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);

    renderer.setContent(ONE);
    renderer.clear();

    assert.equal(element.innerHTML, "");
    assert.equal(element.listeners.length, 0);
});

test("empty content leaves whatever was there alone", () => {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);

    renderer.setContent(ONE);
    const before = element.innerHTML;
    renderer.setContent("");

    assert.equal(element.innerHTML, before);
});

test("showing a document adopts Temml's stylesheet and font once, and writes no style element", () => {
    dom.reset();
    const constructed = globalThis.CSSStyleSheet;
    // The test DOM has no CSSOM: a sheet that keeps the CSS it was given.
    globalThis.CSSStyleSheet = class {
        css = "";
        replaceSync(css) {
            this.css = css;
        }
    };
    dom.document.adoptedStyleSheets = [];
    try {
        new MarkdownRenderer(dom.mount("one")).setContent(ONE);
        new MarkdownRenderer(dom.mount("two")).setContent(ONE);

        const sheets = dom.document.adoptedStyleSheets;
        assert.equal(sheets.length, 1, "Temml's sheet was adopted twice");
        assert.match(sheets[0].css, /font-family: 'Temml'/);
        assert.match(sheets[0].css, /Temml\.woff2/);
        assert.equal(dom.document.querySelectorAll("style").length, 0);
    } finally {
        globalThis.CSSStyleSheet = constructed;
        delete dom.document.adoptedStyleSheets;
    }
});

test("Temml's stylesheet joins the sheets the page already adopted", () => {
    dom.reset();
    const constructed = globalThis.CSSStyleSheet;
    globalThis.CSSStyleSheet = class {
        replaceSync() {}
    };
    const font = { font: "Inter" };
    dom.document.adoptedStyleSheets = [font];
    try {
        new MarkdownRenderer(dom.mount("one")).setContent(ONE);

        const sheets = dom.document.adoptedStyleSheets;
        assert.equal(sheets.length, 2);
        assert.equal(sheets[0], font, "the branding font's sheet went");
    } finally {
        globalThis.CSSStyleSheet = constructed;
        delete dom.document.adoptedStyleSheets;
    }
});

test("a renderer with no element is inert rather than fatal", () => {
    const renderer = new MarkdownRenderer(null);

    assert.doesNotThrow(() => renderer.setContent(ONE));
    assert.doesNotThrow(() => renderer.render());
    assert.doesNotThrow(() => renderer.clear());
});
