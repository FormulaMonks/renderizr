/**
 * `src/components/markdown-renderer.ts` — the component every documentation
 * section and every ADR body goes through.
 *
 * These are input -> HTML tests: feed markdown in, assert the markup out. The
 * source is TypeScript with Vite-only imports (a CSS module, five `?raw`
 * SVGs), so it is imported through the hooks in `support/vite-hooks.js`,
 * which stub the CSS module with a proxy that returns the property name —
 * `styles.alert` is the string `"alert"`. That keeps the expected markup
 * readable and independent of the hash Vite would generate.
 *
 * The file lives in `scripts/` because `pnpm test` globs `scripts/*.test.js`.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test, stubElement } from "./support/ts.js";

const { default: MarkdownRenderer } = await importSrc(
    "components/markdown-renderer",
);

/** Render `markdown` into a stub element and return the markup it produced. */
function render(markdown) {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);
    renderer.setContent(markdown);
    return element.html;
}

/* ------------------------------------------------------------- heading tree */

test("every heading is shifted down one level, so the page title stays the h1", () => {
    assert.equal(render("# Title"), '<h2 id="title" tabindex="-1">Title</h2>');
    assert.equal(
        render("## Section"),
        '<h3 id="section" tabindex="-1">Section</h3>',
    );
});

test("the shift saturates at h6 rather than emitting an h7", () => {
    assert.equal(render("###### Six"), '<h6 id="six" tabindex="-1">Six</h6>');
});

test("headings get anchor ids, and a repeated heading gets a distinct one", () => {
    assert.equal(
        render("## Same\n\n## Same\n"),
        '<h3 id="same" tabindex="-1">Same</h3>\n' +
            '<h3 id="same-1" tabindex="-1">Same</h3>',
    );
});

test("a `---` under a paragraph is a rule, not a setext heading", () => {
    // With `lheading` enabled this paragraph would become an <h2> and, because
    // the navigation is derived from heading structure, would take over the
    // page. `.disable("lheading")` is the fix; this is its regression test.
    assert.equal(
        render("Just a paragraph\n---\nnext\n"),
        "<p>Just a paragraph</p>\n<hr>\n<p>next</p>",
    );
});

/* -------------------------------------------------------------------- tables */

test("every table is wrapped in its own scroll container", () => {
    const html = render("| a | b |\n|---|---|\n| 1 | 2 |\n");

    assert.ok(
        html.startsWith('<div class="tableWrap"><table>'),
        `table was not wrapped: ${html}`,
    );
    assert.ok(
        html.endsWith("</table></div>"),
        `wrapper was not closed: ${html}`,
    );
    assert.equal((html.match(/<div class="tableWrap">/g) ?? []).length, 1);
});

test("two tables get two wrappers", () => {
    const html = render("| a |\n|---|\n| 1 |\n\ntext\n\n| b |\n|---|\n| 2 |\n");

    assert.equal((html.match(/<div class="tableWrap">/g) ?? []).length, 2);
    assert.equal((html.match(/<\/table><\/div>/g) ?? []).length, 2);
});

/* --------------------------------------------------- empty element stripping */

test("empty inline and block elements the source left behind are stripped", () => {
    const html = render("<p></p>\n\ntext <em></em> here\n");

    assert.ok(!html.includes("<p></p>"), html);
    assert.ok(!html.includes("<em></em>"), html);
    assert.ok(html.includes("<p>text  here</p>"), html);
});

test("structural emptiness survives: empty table cells are not stripped", () => {
    const html = render("| a |  |\n|---|---|\n|  | 2 |\n");

    assert.ok(
        html.includes("<th></th>"),
        `empty header cell was eaten: ${html}`,
    );
    assert.ok(html.includes("<td></td>"), `empty body cell was eaten: ${html}`);
});

test("zero-width characters count as empty", () => {
    assert.equal(render("<p>​</p>\n"), "");
});

/* ---------------------------------------------------------------- code blocks */

test("a fenced block in a registered language is highlighted", () => {
    const html = render('```json\n{"a":1}\n```\n');

    assert.ok(html.startsWith('<pre><code class="language-json">'), html);
    // Read back off the element, so the quotes are the ones a browser would
    // report from `innerHTML` rather than the ones markdown-it wrote.
    assert.ok(html.includes('<span class="hljs-attr">"a"</span>'), html);
    assert.ok(html.includes('<span class="hljs-number">1</span>'), html);
});

test("an unregistered language falls back to escaped plain text", () => {
    const html = render("```nosuchlang\nplain <b>text</b>\n```\n");

    assert.equal(
        html,
        '<pre><code class="language-nosuchlang">plain &lt;b&gt;text&lt;/b&gt;\n</code></pre>',
    );
});

test("the languages that turn up in architecture docs are all registered", () => {
    const samples = {
        bash: 'echo "hello"',
        css: "a { color: red; }",
        java: "class A {}",
        javascript: "const x = 1;",
        json: '{"a":1}',
        markdown: "# heading",
        python: "def f():\n    pass",
        sql: "SELECT 1",
        typescript: "const x: number = 1;",
        xml: '<a href="b" />',
        yaml: "a: 1",
    };

    for (const [language, sample] of Object.entries(samples)) {
        const html = render(`\`\`\`${language}\n${sample}\n\`\`\`\n`);
        assert.ok(
            html.includes(`class="language-${language}"`),
            `${language} did not survive as a class`,
        );
        assert.ok(
            html.includes("hljs-"),
            `${language} produced no highlighting tokens: ${html}`,
        );
    }
});

/* --------------------------------------------------------------- passthrough */

test("raw HTML in the source is passed through, not escaped", () => {
    assert.ok(
        render('<div class="custom">raw</div>\n').includes(
            '<div class="custom">raw</div>',
        ),
    );
});

test("the typographer is on", () => {
    assert.equal(
        render('Hello (c) world -- yes... "quoted"\n'),
        "<p>Hello © world – yes… “quoted”</p>",
    );
});

test("links are left exactly as written", () => {
    assert.equal(
        render("[in](./other.md) and [out](https://example.com)\n"),
        '<p><a href="./other.md">in</a> and ' +
            '<a href="https://example.com">out</a></p>',
    );
});

/* ------------------------------------------------------------------ alerts */

test("a GitHub alert becomes an alert div carrying both class names", () => {
    const html = render("> [!WARNING]\n> Mind the gap.\n");

    assert.ok(html.startsWith('<div class="alert alertWarning">'), html);
    assert.ok(html.includes('<div class="alertTitle">'), html);
    assert.ok(html.includes("<span>Warning</span>"), html);
    assert.ok(html.includes("<p>Mind the gap.</p>"), html);
    assert.ok(!html.includes("<blockquote>"), html);
});

test("a plain blockquote is still a blockquote", () => {
    assert.equal(
        render("> Just a quote.\n"),
        "<blockquote>\n<p>Just a quote.</p>\n</blockquote>",
    );
});

/* ------------------------------------------------------------ the component */

test("the content formatter runs before the markdown is parsed", () => {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);

    renderer.setContentFormatter((content) =>
        content.replace(/hi/g, "# Hello"),
    );
    renderer.setContent("hi");

    assert.equal(element.html, '<h2 id="hello" tabindex="-1">Hello</h2>');
});

test("rendering tags the host element and attaches exactly one click listener", () => {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);

    renderer.setContent("# One");
    renderer.setContent("# Two");

    assert.ok(element.classList.contains("markdownRenderer"));
    assert.equal(
        element.listeners.length,
        1,
        "re-rendering stacked up duplicate listeners",
    );
});

test("clear() empties the element and detaches the listener", () => {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);

    renderer.setContent("# One");
    renderer.clear();

    assert.equal(element.innerHTML, "");
    assert.equal(element.listeners.length, 0);
});

test("empty content leaves whatever was there alone", () => {
    const element = stubElement();
    const renderer = new MarkdownRenderer(element);

    renderer.setContent("# One");
    const before = element.innerHTML;
    renderer.setContent("");

    assert.equal(element.innerHTML, before);
});

test("a renderer with no element is inert rather than fatal", () => {
    const renderer = new MarkdownRenderer(null);

    assert.doesNotThrow(() => renderer.setContent("# Title"));
    assert.doesNotThrow(() => renderer.render());
    assert.doesNotThrow(() => renderer.clear());
});
