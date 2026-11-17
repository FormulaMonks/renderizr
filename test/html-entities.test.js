/**
 * `scripts/documentation/html-entities.js`: the one place the build escapes
 * text into HTML and reads escaped text back (ADR 31).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import {
    escapeHtml,
    unescapeHtml,
} from "../scripts/documentation/html-entities.js";

/* ------------------------------------------------------------------ escape */

test('escaping writes &, <, > and " as entities, the way markdown-it does', () => {
    for (const [text, html] of [
        ["plain", "plain"],
        ['a < b && c > "d"', "a &lt; b &amp;&amp; c &gt; &quot;d&quot;"],
        ["it's", "it's"],
        ["&amp;", "&amp;amp;"],
        [42, "42"],
    ])
        assert.equal(escapeHtml(text), html, String(text));
});

/* ---------------------------------------------------------------- unescape */

test("unescaping reads the entities markdown-it, asciidoctor.js and the sanitizer write", () => {
    for (const [html, text] of [
        ["a &lt; b &amp;&amp; c &gt; &quot;d&quot;", 'a < b && c > "d"'],
        ["it&#39;s and it&apos;s", "it's and it's"],
        ["&#8217; &#x2019; &#X2019;", "’ ’ ’"],
        ["&AMP; &Lt;", "& <"],
    ])
        assert.equal(unescapeHtml(html), text, html);
});

test("unescaping reads each entity once, so an escaped entity stays an entity", () => {
    assert.equal(unescapeHtml("&amp;lt;script&amp;gt;"), "&lt;script&gt;");
    assert.equal(unescapeHtml("&amp;#39;"), "&#39;");
});

test("unescaping leaves an entity it does not know, or one past Unicode, as written", () => {
    for (const html of ["&nbsp;", "&copy;", "&#99999999;", "&#x110000;", "& ;"])
        assert.equal(unescapeHtml(html), html, html);
});

test("unescaping what escaping wrote gives the text back, whatever it holds", () => {
    fc.assert(
        fc.property(fc.string({ unit: "binary" }), (text) => {
            assert.equal(unescapeHtml(escapeHtml(text)), text);
        }),
    );
});
