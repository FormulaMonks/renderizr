/**
 * `scripts/documentation/highlight.js` and the Structurizr DSL grammar in
 * `scripts/documentation/structurizr.js`: the highlight.js every fence and
 * AsciiDoc source block goes through, in the build (ADR 31).
 *
 * The grammar tests feed DSL in and read the `hljs-*` spans out, one token
 * class at a time.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import hljs from "highlight.js";
import {
    createAsciiDoc,
    renderAsciiDoc,
} from "../scripts/documentation/asciidoc.js";
import { highlight } from "../scripts/documentation/highlight.js";
import {
    createMarkdown,
    renderMarkdown,
} from "../scripts/documentation/markdown.js";

/** `dsl` highlighted as Structurizr DSL. */
const dsl = (source) => highlight(source, "structurizr");

/** The span highlight.js writes for `text` in token class `scope`. */
const span = (scope, text) => `<span class="hljs-${scope}">${text}</span>`;

/**
 * Assert that `html` shows `text` in token class `scope`.
 *
 * @param {string} html
 * @param {string} scope
 * @param {string} text
 */
function assertToken(html, scope, text) {
    assert.ok(
        html.includes(span(scope, text)),
        `expected ${text} as hljs-${scope} in ${html}`,
    );
}

/**
 * Assert that `html` shows `text` outside every token span.
 *
 * @param {string} html
 * @param {string} text
 */
function assertPlain(html, text) {
    const outside = html.replace(
        /<span class="[^"]*">[^<]*<\/span>/g,
        "\u0000",
    );
    assert.ok(outside.includes(text), `expected ${text} plain in ${html}`);
}

/* ---------------------------------------------------------------- languages */

test("every language highlight.js knows, and every alias, selects its grammar", () => {
    for (const name of hljs.listLanguages()) {
        const { aliases = [] } = hljs.getLanguage(name) ?? {};
        for (const language of [name, ...aliases]) {
            assert.notEqual(
                highlight("x", language),
                "",
                `${language} selects no grammar`,
            );
        }
    }
});

test("a language outside the eleven the documentation used to carry is highlighted", () => {
    assertToken(highlight("fn main() {}", "rust"), "keyword", "fn");
    assertToken(highlight("fn main() {}", "rs"), "keyword", "fn");
    assertToken(highlight("package main", "go"), "keyword", "package");
    assertToken(highlight("puts 'hi'", "ruby"), "string", "&#x27;hi&#x27;");
});

test("a fence with no language, or one highlight.js does not know, stays plain with no guessing", () => {
    assert.equal(highlight("const x = 1;"), "");
    assert.equal(highlight("const x = 1;", ""), "");
    assert.equal(highlight("const x = 1;", "nosuchlang"), "");
});

test("structurizr selects the DSL grammar, and no other name does", () => {
    assertToken(dsl("workspace {\n}"), "keyword", "workspace");

    for (const name of ["dsl", "structurizr-dsl", "c4", "Structurizr DSL"]) {
        assert.equal(
            highlight("workspace {\n}", name),
            "",
            `${name} selected a grammar`,
        );
    }
});

test("a structurizr fence in Markdown and a [source,structurizr] block in AsciiDoc read as DSL", async () => {
    const markdown = renderMarkdown(
        createMarkdown(),
        "```structurizr\nworkspace {\n}\n```\n",
    );
    assert.ok(
        markdown.startsWith('<pre><code class="language-structurizr">'),
        markdown,
    );
    assertToken(markdown, "keyword", "workspace");

    const asciidoc = await renderAsciiDoc(
        createAsciiDoc(),
        "[source,structurizr]\n----\nworkspace {\n}\n----\n",
    );
    assert.ok(
        asciidoc.startsWith('<pre><code class="language-structurizr">'),
        asciidoc,
    );
    assertToken(asciidoc, "keyword", "workspace");
});

test("a bare fence of DSL stays plain", () => {
    const markdown = renderMarkdown(
        createMarkdown(),
        "```\nworkspace {\n}\n```\n",
    );
    assert.doesNotMatch(markdown, /hljs-/, markdown);
});

/* --------------------------------------------------------- the DSL grammar */

test("directives and structural blocks are keywords", () => {
    const html = dsl(
        [
            "workspace {",
            "    !identifiers hierarchical",
            "    !docs docs",
            "    !adrs decisions",
            "    model {",
            '        group "Bank" {',
            "        }",
            "    }",
            "    views {",
            "        styles {",
            "        }",
            "    }",
            "    configuration {",
            "    }",
            "}",
        ].join("\n"),
    );

    for (const word of [
        "workspace",
        "!identifiers",
        "!docs",
        "!adrs",
        "model",
        "group",
        "views",
        "styles",
        "configuration",
    ]) {
        assertToken(html, "keyword", word);
    }
});

test("element, relationship and view types are types", () => {
    const html = dsl(
        [
            'person "A"',
            'softwareSystem "B"',
            'container "C"',
            'component "D"',
            'deploymentNode "E"',
            "containerInstance api",
            'element "Person"',
            'relationship "Synchronous"',
            "systemContext s",
            "dynamic s",
        ].join("\n"),
    );

    for (const word of [
        "person",
        "softwareSystem",
        "container",
        "component",
        "deploymentNode",
        "containerInstance",
        "element",
        "relationship",
        "systemContext",
        "dynamic",
    ]) {
        assertToken(html, "type", word);
    }
});

test("statements and style properties are attributes", () => {
    const html = dsl(
        [
            "include *",
            "autoLayout lr",
            'description "D"',
            'tags "T"',
            "background #999999",
            "fontSize 22",
            "routing Orthogonal",
            "theme default",
        ].join("\n"),
    );

    for (const word of [
        "include",
        "autoLayout",
        "description",
        "tags",
        "background",
        "fontSize",
        "routing",
        "theme",
    ]) {
        assertToken(html, "attr", word);
    }
});

test("enumerated values are literals", () => {
    const html = dsl(
        [
            "autoLayout lr",
            "shape Cylinder",
            "routing Orthogonal",
            "dashed false",
            "!identifiers hierarchical",
        ].join("\n"),
    );

    for (const word of [
        "lr",
        "Cylinder",
        "Orthogonal",
        "false",
        "hierarchical",
    ]) {
        assertToken(html, "literal", word);
    }
});

test("the identifier an = assigns is a title, and -> and = are operators", () => {
    const html = dsl(
        ['customer = person "Customer"', 'customer -> system "Uses"'].join(
            "\n",
        ),
    );

    assertToken(html, "title", "customer");
    assertToken(html, "operator", "=");
    assertToken(html, "operator", "-&gt;");
});

test("strings and text blocks are strings, with a substitution as a template variable", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a DSL substitution, not a template
    const name = "${ORGANISATION}";
    const html = dsl(
        [
            `group "${name}" {`,
            "}",
            'description """',
            `    More than one line, by ${name}.`,
            '"""',
        ].join("\n"),
    );
    const variable = span("template-variable", name);

    assert.ok(html.includes(span("string", `&quot;${variable}&quot;`)), html);
    assertToken(
        html,
        "string",
        `&quot;&quot;&quot;\n    More than one line, by ${variable}.\n&quot;&quot;&quot;`,
    );
});

test("numbers and #rrggbb colors are numbers", () => {
    const html = dsl("fontSize 22\ncolor #ffffff\nopacity 50");

    assertToken(html, "number", "22");
    assertToken(html, "number", "#ffffff");
    assertToken(html, "number", "50");
});

test("//, a line-leading # and /* */ are comments", () => {
    const html = dsl(
        [
            "// A slash comment",
            "    # A hash comment",
            "/*",
            " * A block comment",
            " */",
        ].join("\n"),
    );

    assertToken(html, "comment", "// A slash comment");
    assertToken(html, "comment", "# A hash comment");
    assertToken(html, "comment", "/*\n * A block comment\n */");
});

/* ------------------------------------------------------------------- case */

test("keywords ignore case", () => {
    const html = dsl(
        "WORKSPACE {\n    SoftwareSystem s\n    AUTOLAYOUT LR\n    !DOCS docs\n}",
    );

    assertToken(html, "keyword", "WORKSPACE");
    assertToken(html, "type", "SoftwareSystem");
    assertToken(html, "attr", "AUTOLAYOUT");
    assertToken(html, "literal", "LR");
    assertToken(html, "keyword", "!DOCS");
});

test("a dotted identifier reads as one word, so a keyword segment stays plain", () => {
    const html = dsl("internetBanking.api -> bank.container.model");

    assertPlain(html, "internetBanking.api");
    assertPlain(html, "bank.container.model");
});

test("// after a scheme stays part of the URL after !include", () => {
    const html = dsl("!include https://example.com/model.dsl");

    assertToken(html, "keyword", "!include");
    assert.doesNotMatch(html, /hljs-comment/, html);
    assertPlain(html, "https://example.com/model.dsl");
});

test("# after a keyword starts a color, not a comment", () => {
    const html = dsl("    background #1168bd\n    stroke #fff");

    assertToken(html, "number", "#1168bd");
    assertToken(html, "number", "#fff");
    assert.doesNotMatch(html, /hljs-comment/, html);
});
