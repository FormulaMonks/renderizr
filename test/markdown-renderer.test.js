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

test("showing a document adds Temml's stylesheet and font to the page once", () => {
    dom.reset();
    new MarkdownRenderer(dom.mount("one")).setContent(ONE);
    new MarkdownRenderer(dom.mount("two")).setContent(ONE);

    const styles = dom.document.head.childNodes.filter(
        (node) => node.tagName === "STYLE",
    );
    assert.equal(styles.length, 1);
    assert.match(styles[0].textContent, /font-family: 'Temml'/);
    assert.match(styles[0].textContent, /Temml\.woff2/);
});

test("a renderer with no element is inert rather than fatal", () => {
    const renderer = new MarkdownRenderer(null);

    assert.doesNotThrow(() => renderer.setContent(ONE));
    assert.doesNotThrow(() => renderer.render());
    assert.doesNotThrow(() => renderer.clear());
});
