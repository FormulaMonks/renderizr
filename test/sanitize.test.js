/**
 * `scripts/documentation/sanitize.js`: the build sanitizes the raw HTML an
 * author writes in a section or decision (ADR 31). It keeps GitHub's
 * allowlist plus `video`, with `id` and `class`, and drops scripts, styles,
 * frames, event handlers and `javascript:` links. Renderizr's own markup
 * stays whole, whatever it carries.
 *
 * These are input -> HTML tests: raw HTML or Markdown in, markup out.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
    renderDecision,
    renderSection,
} from "../scripts/documentation/index.js";
import {
    createMarkdown,
    renderMarkdown,
} from "../scripts/documentation/markdown.js";
import { KEPT_TAGS, sanitizeHtml } from "../scripts/documentation/sanitize.js";

const md = createMarkdown();
const render = (markdown, env) => renderMarkdown(md, markdown, env);

/* --------------------------------------------------------------- kept tags */

test("the allowlist holds GitHub's tags, video among them", () => {
    for (const tag of [
        "details",
        "summary",
        "kbd",
        "sub",
        "sup",
        "picture",
        "source",
        "img",
        "br",
        "div",
        "span",
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "ul",
        "ol",
        "li",
        "del",
        "ins",
        "s",
        "a",
        "video",
    ])
        assert.ok(KEPT_TAGS.includes(tag), tag);
});

test("every kept tag survives with its id and class", () => {
    for (const tag of KEPT_TAGS) {
        const html = `<${tag} id="anchor" class="wide">x</${tag}>`;
        assert.equal(sanitizeHtml(html), html, tag);
    }
});

test("an opening or closing tag on its own survives, since raw HTML reaches the sanitizer in pieces", () => {
    assert.equal(sanitizeHtml("<details open>"), "<details open>");
    assert.equal(sanitizeHtml("</details>"), "</details>");
    assert.equal(sanitizeHtml('<div class="note">'), '<div class="note">');
});

test("a collapsed section keeps the Markdown inside it", () => {
    const html = render(
        "<details>\n<summary>More</summary>\n\nSome **bold** text.\n\n</details>\n",
    );
    assert.equal(
        html,
        "<details>\n<summary>More</summary>\n<p>Some <strong>bold</strong> text.</p>\n</details>\n",
    );
});

test("inline raw HTML keeps kbd, sub, sup, del, ins and s", () => {
    assert.equal(
        render(
            "Press <kbd>Ctrl</kbd>, H<sub>2</sub>O, mc<sup>2</sup>, <del>a</del> <ins>b</ins> <s>c</s>.",
        ),
        "<p>Press <kbd>Ctrl</kbd>, H<sub>2</sub>O, mc<sup>2</sup>, <del>a</del> <ins>b</ins> <s>c</s>.</p>\n",
    );
});

test("a picture keeps its sources and image, media queries, srcset and all", () => {
    const html =
        "<picture>\n" +
        '<source media="(prefers-color-scheme: dark)" srcset="dark.png">\n' +
        '<img src="light.png" alt="Logo" width="120" height="40">\n' +
        "</picture>\n";
    assert.equal(render(html), html);
});

test("a video keeps its player attributes and sources", () => {
    const html =
        '<video src="demo.mp4" poster="demo.png" controls muted loop playsinline width="640">\n' +
        '<source src="demo.webm" type="video/webm">\n' +
        "</video>\n";
    assert.equal(render(html), html);
});

test("a link keeps a web, mail, relative or fragment address", () => {
    for (const href of [
        "https://example.com/a?b=1",
        "http://example.com",
        "mailto:team@example.com",
        "other.md",
        "../docs/other.md#part",
        "/root",
        "#part",
    ])
        assert.equal(
            sanitizeHtml(`<a href="${href}" title="Go">x</a>`),
            `<a href="${href}" title="Go">x</a>`,
            href,
        );
});

test("an image keeps a relative path and an SVG data URI", () => {
    for (const src of [
        "images/diagram.png",
        "data:image/svg+xml;base64,PHN2Zy8+",
        "https://example.com/i.png",
    ])
        assert.equal(
            sanitizeHtml(`<img src="${src}" alt="A">`),
            `<img src="${src}" alt="A">`,
            src,
        );
});

test("a table keeps its spans and alignment", () => {
    const html =
        '<table>\n<tr><th colspan="2" align="left">Head</th></tr>\n<tr><td rowspan="2">a</td><td>b</td></tr>\n</table>\n';
    assert.equal(render(html), html);
});

/* ------------------------------------------------------------ dropped tags */

test("a script goes, body and all", () => {
    assert.equal(
        render("<script>alert(1)</script>\n\nAfter."),
        "<p>After.</p>\n",
    );
    assert.equal(
        sanitizeHtml('<p>a<script src="x.js"></script>b</p>'),
        "<p>ab</p>",
    );
});

test("a style element goes, body and all", () => {
    assert.equal(
        render("<style>\nbody { display: none }\n</style>\n\nAfter."),
        "<p>After.</p>\n",
    );
});

test("an iframe, an object and an embed go", () => {
    assert.equal(
        sanitizeHtml(
            '<iframe src="https://example.com"></iframe><object data="x.swf"></object><embed src="x.swf">',
        ),
        "",
    );
});

test("an iframe goes with its fallback text, as GitHub drops it", () => {
    assert.equal(
        render(
            '<iframe src="https://example.com">Fallback text.</iframe>\n\nAfter.',
        ),
        "<p>After.</p>\n",
    );
    assert.equal(sanitizeHtml("a<noscript>Enable scripts.</noscript>b"), "ab");
});

test("event handler attributes go", () => {
    assert.equal(
        sanitizeHtml(
            '<img src="a.png" onerror="alert(1)" alt="A"><div onclick="x()" onmouseover="y()">b</div>',
        ),
        '<img src="a.png" alt="A"><div>b</div>',
    );
});

test("style attributes go", () => {
    assert.equal(
        render('<div style="color: red" class="note">\n\nText\n\n</div>\n'),
        '<div class="note">\n<p>Text</p>\n</div>\n',
    );
    assert.equal(
        render('A <span style="display:none">hidden</span> word.'),
        "<p>A <span>hidden</span> word.</p>\n",
    );
});

test("javascript: links go, however they are spelled", () => {
    for (const href of [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        " javascript:alert(1)",
        "java\tscript:alert(1)",
        "javascript&colon;alert(1)",
        "&#106;avascript:alert(1)",
        "vbscript:msgbox(1)",
        "data:text/html,<script>alert(1)</script>",
    ])
        assert.equal(sanitizeHtml(`<a href="${href}">x</a>`), "<a>x</a>", href);
});

test("script addresses go from images, sources and videos too", () => {
    assert.equal(
        sanitizeHtml(
            '<img src="javascript:alert(1)" alt="A"><source srcset="a.png, javascript:alert(1) 2x"><video poster="javascript:alert(1)" controls></video>',
        ),
        '<img alt="A"><source><video controls></video>',
    );
});

test("a tag outside the allowlist goes and its text stays", () => {
    assert.equal(
        sanitizeHtml(
            '<form action="/x"><button>Go</button></form><marquee>hi</marquee>',
        ),
        "Gohi",
    );
});

test("an HTML comment goes", () => {
    assert.equal(render("<!-- hidden -->\n\nShown."), "<p>Shown.</p>\n");
});

/* -------------------------------------------------- Renderizr's own markup */

test("an alert keeps its icon", () => {
    const html = render("> [!NOTE]\n> Read this.");
    assert.match(html, /<div class="rz-alert-title"><svg [^>]*viewBox=/);
    assert.match(html, /<path [^>]*d="/);
});

test("highlighting keeps its classes", () => {
    const html = render('```json\n{"a": 1}\n```');
    assert.ok(
        html.includes('<span class="hljs-attr">&quot;a&quot;</span>'),
        html,
    );
});

test("a resolved link and an unresolved one keep their markup", () => {
    const html = render("[here](other.md) and [gone](missing.md)", {
        resolveLink: (href) => (href === "other.md" ? "#/docs/other" : null),
    });
    assert.ok(html.includes('<a href="#/docs/other">here</a>'), html);
    assert.ok(
        html.includes(
            '<span class="rz-unresolved-link" title="Not part of this workspace: missing.md">gone</span>',
        ),
        html,
    );
});

test("markup a plugin adds stays whole, whatever tags and attributes it carries", () => {
    // Math, footnotes and diagram cards come from later plugins as tokens of
    // their own, and none of them reaches the sanitizer.
    const own = createMarkdown().use((md) =>
        md.core.ruler.push("own_markup", (state) => {
            const token = new state.Token("html_block", "", 0);
            token.content =
                '<math display="block"><mi>x</mi></math><section class="footnotes" style="--n: 1" data-key="a"><button onclick="open()">Card</button></section>\n';
            state.tokens.push(token);
        }),
    );
    assert.equal(
        renderMarkdown(own, '<span style="color: red">a</span>'),
        "<p><span>a</span></p>\n" +
            '<math display="block"><mi>x</mi></math><section class="footnotes" style="--n: 1" data-key="a"><button onclick="open()">Card</button></section>\n',
    );
});

/* ------------------------------------------------- sections and decisions */

test("an AsciiDoc section is sanitized like a Markdown one", () => {
    const html = renderSection({
        filename: "01-context.adoc",
        content:
            '== Context\n\n<div style="color: red" onclick="x()">Note</div>\n\n<script>alert(1)</script>\n',
    });
    assert.ok(html.includes("<div>Note</div>"), html);
    assert.ok(!/script|onclick|style=/.test(html), html);
});

test("a decision is sanitized like a section", () => {
    const html = renderDecision({
        content:
            '# 1. Use HTML\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\n<span style="color: red" onmouseover="x()">Why</span> <a href="javascript:alert(1)">this</a>.\n',
    });
    assert.ok(html.includes("<span>Why</span> <a>this</a>"), html);
});
