import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CLASSES,
    renderDecision,
    renderSection,
} from "./documentation/index.js";

/**
 * Footnotes in the build (ADR 31): both syntaxes number them across the
 * whole section, in the order their references first appear, and give them
 * GitHub's ids, `fn-<label>` and `fnref-<label>`, and the same classes. The
 * page lists each page's own at its foot (`test/docs.test.js`).
 */

const markdown = (content) =>
    renderSection({ filename: "01-a.md", format: "Markdown", content });

const asciidoc = (content) =>
    renderSection({ filename: "01-a.adoc", format: "AsciiDoc", content });

/** Each reference's number, its href and its id, in the order they appear. */
const references = (html) =>
    [
        ...html.matchAll(
            /<sup class="rz-footnote-ref"><a href="#([^"]*)" id="([^"]*)">([^<]*)<\/a><\/sup>/g,
        ),
    ].map(([, href, id, number]) => `${number} #${href} ${id}`);

/** Each listed footnote's id and number, and the back links it carries. */
const footnotes = (html) =>
    [...html.matchAll(/<li id="([^"]*)" value="(\d+)">([\s\S]*?)<\/li>/g)].map(
        ([, id, value, body]) =>
            [
                `${value} ${id}`,
                ...[
                    ...body.matchAll(
                        /<a href="#([^"]*)" class="rz-footnote-backref"/g,
                    ),
                ].map(([, href]) => `#${href}`),
            ].join(" "),
    );

/* ---------------------------------------------------------------- Markdown */

test("Markdown footnotes take GitHub's ids and number by first reference", async () => {
    const html = await markdown(
        [
            "A named one[^note], a numbered one[^1] and a word[^word].",
            "",
            "[^1]: Numbered.",
            "[^word]: Word.",
            "[^note]: Named.",
            "",
        ].join("\n"),
    );

    assert.deepEqual(references(html), [
        "1 #fn-note fnref-note",
        "2 #fn-1 fnref-1",
        "3 #fn-word fnref-word",
    ]);
    assert.deepEqual(footnotes(html), [
        "1 fn-note #fnref-note",
        "2 fn-1 #fnref-1",
        "3 fn-word #fnref-word",
    ]);
});

test("a Markdown footnote referenced again takes a numbered reference id and a back link to each", async () => {
    const html = await markdown(
        "One[^a], two[^b] and one again[^a].\n\n[^a]: A.\n[^b]: B.\n",
    );

    assert.deepEqual(references(html), [
        "1 #fn-a fnref-a",
        "2 #fn-b fnref-b",
        "1 #fn-a fnref-a-2",
    ]);
    assert.deepEqual(footnotes(html), [
        "1 fn-a #fnref-a #fnref-a-2",
        "2 fn-b #fnref-b",
    ]);
});

test("a Markdown footnote nobody references stays out of the list", async () => {
    const html = await markdown("Only one[^a].\n\n[^a]: A.\n[^b]: B.\n");

    assert.deepEqual(footnotes(html), ["1 fn-a #fnref-a"]);
});

test("Markdown footnotes sit in one list at the section's foot", async () => {
    const html = await markdown(
        "# Title\n\nText[^a].\n\n## Page\n\nMore.\n\n[^a]: A *footnote*.\n",
    );

    assert.match(
        html,
        /<section class="rz-footnotes" aria-label="Footnotes">\n<ol>\n<li id="fn-a" value="1"><p>A <em>footnote<\/em>\.? ?<a href="#fnref-a" class="rz-footnote-backref" aria-label="Back to reference 1">↩︎<\/a><\/p>\n<\/li>\n<\/ol>\n<\/section>\n$/,
    );
    assert.doesNotMatch(html, /<hr/);
});

test("a Markdown footnote's label is escaped in its ids", async () => {
    const html = await markdown('Text[^a"b].\n\n[^a"b]: A.\n');

    assert.deepEqual(references(html), ["1 #fn-a&quot;b fnref-a&quot;b"]);
});

/* ---------------------------------------------------------------- AsciiDoc */

test("AsciiDoc footnotes take the Markdown markup: a named one by its name, an anonymous one by its number", async () => {
    const html = await asciidoc(
        "A simple footnote.footnote:[My reference.] A named one.footnote:disclaimer[Named footnotes can repeat.]\n",
    );

    assert.deepEqual(references(html), [
        "1 #fn-1 fnref-1",
        "2 #fn-disclaimer fnref-disclaimer",
    ]);
    assert.deepEqual(footnotes(html), [
        "1 fn-1 #fnref-1",
        "2 fn-disclaimer #fnref-disclaimer",
    ]);
    assert.match(
        html,
        /<section class="rz-footnotes" aria-label="Footnotes">\n<ol>\n<li id="fn-1" value="1"><p>My reference\. <a href="#fnref-1" class="rz-footnote-backref" aria-label="Back to reference 1">↩︎<\/a><\/p><\/li>/,
    );
    assert.doesNotMatch(html, /_footnote|id="footnotes"|<hr/);
});

test("an AsciiDoc footnote referenced again takes a numbered reference id and a back link to each", async () => {
    const html = await asciidoc(
        "One.footnote:a[A.] Two.footnote:[B.] One again.footnote:a[]\n\nAnd again.footnote:a[]\n",
    );

    assert.deepEqual(references(html), [
        "1 #fn-a fnref-a",
        "2 #fn-2 fnref-2",
        "1 #fn-a fnref-a-2",
        "1 #fn-a fnref-a-3",
    ]);
    assert.deepEqual(footnotes(html), [
        "1 fn-a #fnref-a #fnref-a-2 #fnref-a-3",
        "2 fn-2 #fnref-2",
    ]);
});

test("AsciiDoc numbers footnotes in list items in document order too", async () => {
    const html = await asciidoc(
        "Before.footnote:[First.]\n\n* An item.footnote:[Second.]\n\nAfter.footnote:[Third.]\n",
    );

    assert.deepEqual(references(html), [
        "1 #fn-1 fnref-1",
        "2 #fn-2 fnref-2",
        "3 #fn-3 fnref-3",
    ]);
    assert.deepEqual(footnotes(html), [
        "1 fn-1 #fnref-1",
        "2 fn-2 #fnref-2",
        "3 fn-3 #fnref-3",
    ]);
});

test("an AsciiDoc reference to a footnote that does not exist stays as asciidoctor.js writes it", async () => {
    const html = await asciidoc("Nothing.footnote:missing[]\n");

    assert.deepEqual(references(html), []);
    assert.doesNotMatch(html, /rz-footnotes/);
});

/* -------------------------------------------------------------- decisions */

test("a decision lists all its footnotes at its foot, in both syntaxes", async () => {
    const markdownDecision = await renderDecision({
        format: "Markdown",
        content:
            "# 1. Use it\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\nBecause[^why].\n\n## Decision\n\nDo it[^how].\n\n[^why]: Why.\n[^how]: How.\n",
    });
    const asciidocDecision = await renderDecision({
        format: "AsciiDoc",
        content:
            "= 1. Use it\n\nDate: 2024-01-01\n\n== Status\n\nAccepted\n\n== Context\n\nBecause.footnote:why[Why.]\n\n== Decision\n\nDo it.footnote:how[How.]\n",
    });

    for (const html of [markdownDecision, asciidocDecision]) {
        assert.deepEqual(footnotes(html), [
            "1 fn-why #fnref-why",
            "2 fn-how #fnref-how",
        ]);
        assert.match(html, /<\/section>\n$/);
    }
});

/* ------------------------------------------------------------- class names */

test("both syntaxes write the footnote classes the page targets", async () => {
    assert.equal(CLASSES.footnotes, "rz-footnotes");
    assert.equal(CLASSES.footnoteRef, "rz-footnote-ref");
    assert.equal(CLASSES.footnoteBackref, "rz-footnote-backref");

    for (const html of [
        await markdown("A[^a].\n\n[^a]: A.\n"),
        await asciidoc("A.footnote:a[A.]\n"),
    ]) {
        assert.match(html, /class="rz-footnotes"/);
        assert.match(html, /class="rz-footnote-ref"/);
        assert.match(html, /class="rz-footnote-backref"/);
    }
});
