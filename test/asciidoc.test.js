/**
 * `scripts/documentation/asciidoc.js` — the asciidoctor.js every AsciiDoc
 * section and decision goes through, in the build (ADR 31).
 *
 * These are input -> HTML tests: feed AsciiDoc in, assert the markup out.
 * Each AsciiDoc construct with a Markdown counterpart has to come out as the
 * markup the Markdown path writes, so the page styles both alike.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createAsciiDoc,
    isAsciiDoc,
    renderAsciiDoc,
} from "../scripts/documentation/asciidoc.js";
import { CLASSES } from "../scripts/documentation/classes.js";

const asciidoc = createAsciiDoc();

/** `source` rendered with `env`, as the build renders it. */
const render = (source, env) => renderAsciiDoc(asciidoc, source, env);

/* --------------------------------------------------------------- detection */

test("a .adoc file name or the AsciiDoc format selects the AsciiDoc path", async () => {
    assert.equal(isAsciiDoc({ filename: "architecture.adoc" }), true);
    assert.equal(isAsciiDoc({ filename: "nested/NOTES.AdOc" }), true);
    assert.equal(isAsciiDoc({ format: "AsciiDoc" }), true);
    assert.equal(
        isAsciiDoc({ filename: "notes.txt", format: "AsciiDoc" }),
        true,
    );

    assert.equal(isAsciiDoc({ filename: "architecture.md" }), false);
    assert.equal(isAsciiDoc({ filename: "a.adoc.md" }), false);
    assert.equal(isAsciiDoc({ format: "Markdown" }), false);
    assert.equal(isAsciiDoc({}), false);
});

/* ---------------------------------------------------------------- headings */

test("the document title and every section level shift like Markdown's headings", async () => {
    assert.equal(
        await render(
            "= Runbook\n\nIntro.\n\n== Restart\n\nNow.\n\n=== Again\n",
        ),
        '<h2 id="runbook" tabindex="-1">Runbook</h2>\n' +
            "<p>Intro.</p>\n" +
            '<h3 id="restart" tabindex="-1">Restart</h3>\n' +
            "<p>Now.</p>\n" +
            '<h4 id="again" tabindex="-1">Again</h4>\n',
    );
});

test("headings sit side by side, with no wrapper around a section, so the page can split it", async () => {
    const html = await render("== One\n\nA.\n\n== Two\n\nB.\n");

    assert.ok(!html.includes("<div"), html);
});

test("a heading's id follows GitHub's AsciiDoc ids, and an internal reference lands on it", async () => {
    assert.equal(
        await render("== Deploy the API\n\nSee <<deploy-the-api>>.\n"),
        '<h3 id="deploy-the-api" tabindex="-1">Deploy the API</h3>\n' +
            '<p>See <a href="#deploy-the-api">Deploy the API</a>.</p>\n',
    );
});

test("the table of contents macro writes nothing: the documentation menu is the page's own", async () => {
    assert.equal(
        (await render("= Doc\n:toc: macro\n\ntoc::[]\n\n== One\n")).replace(
            /\n+/g,
            "\n",
        ),
        '<h2 id="doc" tabindex="-1">Doc</h2>\n' +
            '<h3 id="one" tabindex="-1">One</h3>\n',
    );
});

/* ------------------------------------------------------------------ tables */

test("a table sits in the scroll container Markdown tables sit in", async () => {
    assert.equal(
        await render("|===\n|Name |Role\n\n|api\n|serves\n|===\n"),
        `<div class="${CLASSES.tableWrap}"><table>\n` +
            "<thead>\n<tr>\n<th>Name</th>\n<th>Role</th>\n</tr>\n</thead>\n" +
            "<tbody>\n<tr>\n<td>api</td>\n<td>serves</td>\n</tr>\n</tbody>\n" +
            "</table></div>\n",
    );
});

test("a table's [cols] keep their widths and their alignment", async () => {
    const html = await render(
        '[cols="1,2,^1,>1"]\n|===\n|A |B |C |D\n\n|a\n|b\n|c\n|d\n|===\n',
    );

    assert.ok(
        html.includes(
            '<colgroup>\n<col width="20%">\n<col width="40%">\n<col width="20%">\n<col width="20%">\n</colgroup>',
        ),
        html,
    );
    assert.ok(html.includes("<td>a</td>"), html);
    assert.ok(html.includes('<td style="text-align:center">c</td>'), html);
    assert.ok(html.includes('<td style="text-align:right">d</td>'), html);
});

/* ------------------------------------------------- strikethrough, sub, sup */

test("a line-through role strikes the text the way Markdown's tildes do", async () => {
    assert.equal(
        await render("[.line-through]#mistaken text#\n"),
        "<p><s>mistaken text</s></p>\n",
    );
});

test("subscript and superscript render as sub and sup", async () => {
    assert.equal(
        await render("H~2~O and E = mc^2^\n"),
        "<p>H<sub>2</sub>O and E = mc<sup>2</sup></p>\n",
    );
});

/* ------------------------------------------------------------------ alerts */

test("a NOTE: paragraph becomes the alert box Markdown alerts draw", async () => {
    const html = await render("NOTE: Mind the gap.\n");

    assert.ok(
        html.startsWith(
            `<div class="${CLASSES.alert} ${CLASSES.alertNote}">\n<div class="${CLASSES.alertTitle}"><svg aria-hidden="true"`,
        ),
        html,
    );
    assert.ok(html.includes("<span>Note</span></div>\n"), html);
    assert.ok(html.endsWith("<p>Mind the gap.</p>\n</div>\n"), html);
});

test("every admonition type, as a paragraph or a block, maps onto its alert", async () => {
    for (const [label, type] of [
        ["NOTE", CLASSES.alertNote],
        ["TIP", CLASSES.alertTip],
        ["IMPORTANT", CLASSES.alertImportant],
        ["WARNING", CLASSES.alertWarning],
        ["CAUTION", CLASSES.alertCaution],
    ]) {
        const paragraph = await render(`${label}: Text.\n`);
        const block = await render(
            `[${label}]\n====\nFirst.\n\nSecond.\n====\n`,
        );

        assert.ok(paragraph.includes(`class="${CLASSES.alert} ${type}"`));
        assert.ok(block.includes(`class="${CLASSES.alert} ${type}"`));
        assert.ok(block.includes("<p>First.</p>\n<p>Second.</p>\n</div>"));
    }
});

test("an alert block's title leads its body", async () => {
    const html = await render("[CAUTION]\n.Read this\n====\nRisky.\n====\n");

    assert.ok(
        html.includes(
            "</div>\n<p><strong>Read this</strong></p>\n<p>Risky.</p>",
        ),
        html,
    );
});

/* -------------------------------------------------------------- typography */

test("asciidoctor.js's own typographic replacements apply", async () => {
    assert.equal(
        await render("It's done -- (C) 2026... see -> there\n"),
        "<p>It&#8217;s done&#8201;&#8212;&#8201;&#169; 2026&#8230;&#8203; see &#8594; there</p>\n",
    );
});

/* ----------------------------------------------------------- source blocks */

test("a source block goes through the highlight.js Markdown fences use", async () => {
    const html = await render('[source,json]\n----\n{"a": 1}\n----\n');

    assert.ok(html.startsWith('<pre><code class="language-json">'), html);
    assert.ok(
        html.includes('<span class="hljs-attr">&quot;a&quot;</span>'),
        html,
    );
    assert.ok(html.includes('<span class="hljs-number">1</span>'), html);
    assert.ok(html.endsWith("</code></pre>\n"), html);
});

test("a source block in a language highlight.js lacks, or in none, stays plain and escaped", async () => {
    assert.equal(
        await render("[source,nosuchlang]\n----\n<b>x</b>\n----\n"),
        '<pre><code class="language-nosuchlang">&lt;b&gt;x&lt;/b&gt;</code></pre>\n',
    );
    assert.equal(
        await render("----\n<b>x</b>\n----\n"),
        "<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>\n",
    );
});

test("a literal block is preformatted text", async () => {
    assert.equal(
        await render("....\nas <typed>\n....\n"),
        "<pre><code>as &lt;typed&gt;</code></pre>\n",
    );
});

/* ------------------------------------------------- collapsible and example */

test("a collapsible block renders the way asciidoctor.js writes it, not as code", async () => {
    assert.equal(
        await render(".More\n[%collapsible]\n====\nHidden.\n====\n"),
        '<details>\n<summary class="title">More</summary>\n<div class="content">\n<p>Hidden.</p>\n</div>\n</details>\n',
    );
});

test("an example block renders the way asciidoctor.js writes it, not as code", async () => {
    assert.equal(
        await render("====\nShown.\n====\n"),
        '<div class="exampleblock">\n<div class="content">\n<p>Shown.</p>\n</div>\n</div>\n',
    );
});

/* -------------------------------------------------------------- lists, quote */

test("a list item holding only text reads like a tight Markdown list", async () => {
    assert.equal(
        await render("* one\n** two\n"),
        "<ul>\n<li>one\n<ul>\n<li>two</li>\n</ul>\n</li>\n</ul>\n",
    );
    assert.equal(
        await render("[start=3]\n. third\n"),
        '<ol start="3">\n<li>third</li>\n</ol>\n',
    );
});

test("a quote block is a blockquote", async () => {
    assert.equal(
        await render("____\nSaid it. +\nTwice.\n____\n"),
        "<blockquote>\n<p>Said it.<br>\nTwice.</p>\n</blockquote>\n",
    );
});

/* ------------------------------------------------------------------- links */

/** A resolver that knows one sibling file. */
const resolveLink = (href) => {
    if (/^02-other\.(adoc|md)(#.*)?$/.test(href))
        return `#/?page=docs&section=02-other${href.includes("#") ? "&subsection=on-call" : ""}`;
    if (/\.(adoc|md)(#.*)?$/.test(href)) return null;
    return undefined;
};

test("a link, an xref and a cross reference to another file resolve the way Markdown links do", async () => {
    for (const source of [
        "link:02-other.adoc[Other]",
        "link:02-other.md[Other]",
        "xref:02-other.adoc[Other]",
        "<<02-other.adoc#,Other>>",
    ]) {
        assert.equal(
            await render(`${source}\n`, { resolveLink }),
            '<p><a href="#/?page=docs&amp;section=02-other">Other</a></p>\n',
            source,
        );
    }
    assert.equal(
        await render("xref:02-other.adoc#on-call[On call]\n", { resolveLink }),
        '<p><a href="#/?page=docs&amp;section=02-other&amp;subsection=on-call">On call</a></p>\n',
    );
});

test("a link to a file the workspace lacks keeps its text but stops being a link", async () => {
    assert.equal(
        await render("See xref:reference/model.adoc[the model] here.\n", {
            resolveLink,
        }),
        `<p>See <span class="${CLASSES.unresolvedLink}" title="Not part of this workspace: reference/model.adoc">the model</span> here.</p>\n`,
    );
});

test("links the resolver has no opinion about are left as written", async () => {
    assert.equal(
        await render("https://example.com[Example] and <<top>>\n", {
            resolveLink,
        }),
        '<p><a href="https://example.com">Example</a> and <a href="#top">[top]</a></p>\n',
    );
});

/* ------------------------------------------------------------------ images */

test("an image the resolver knows gets the embedded source, block or inline", async () => {
    const resolveImage = (src) =>
        src === "edit-mode.png"
            ? "data:image/png;base64,iVBORw0KGgo="
            : undefined;
    const html = await render(
        "image::edit-mode.png[Edit mode]\n\nSee image:edit-mode.png[icon] and image:logo.png[Logo].\n",
        { resolveImage },
    );

    assert.equal(
        html.match(/src="data:image\/png;base64,iVBORw0KGgo="/g)?.length,
        2,
        html,
    );
    assert.ok(html.includes('alt="Edit mode"'), html);
    assert.ok(html.includes('<img src="logo.png" alt="Logo">'), html);
});

/* ---------------------------------------------------------------- raw HTML */

test("a passthrough block's raw HTML is sanitized the way Markdown's is", async () => {
    assert.equal(
        await render(
            '++++\n<kbd style="color:red" onclick="x()">K</kbd><script>alert(1)</script>\n++++\n',
        ),
        "<kbd>K</kbd>\n",
    );
    assert.equal(
        await render(
            '[pass]\n<details><summary>More</summary>Hidden.</details><iframe src="x"></iframe>\n',
        ),
        "<details><summary>More</summary>Hidden.</details>\n",
    );
});

test("an inline passthrough's raw HTML is sanitized, the text around it kept", async () => {
    assert.equal(
        await render(
            'Press pass:[<kbd onclick="x()">K</kbd>] or +++<a href="javascript:x()">this</a>+++ now.\n',
        ),
        "<p>Press <kbd>K</kbd> or <a>this</a> now.</p>\n",
    );
});

test("asciidoctor.js's own markup around a passthrough stays as it renders", async () => {
    const html = await render(
        "NOTE: See pass:q[*bold* <script>x</script>] and https://example.com[a link].\n",
    );

    assert.ok(html.includes('<svg aria-hidden="true"'), html);
    assert.ok(html.includes("<strong>bold</strong>"), html);
    assert.ok(!html.includes("<script>"), html);
    assert.ok(html.includes('<a href="https://example.com">a link</a>'), html);
});
