/**
 * `src/components/markdown-alerts.ts` — the markdown-it plugin that turns
 * GitHub-flavoured `> [!NOTE]` blockquotes into alert panels.
 *
 * Exercised against a bare `markdown-it` with single-letter class names, so
 * the expected markup is the whole rendered string rather than a substring
 * hunt. SVG icons are collapsed to `[svg]` except in the test that is about
 * the icons.
 *
 * The file lives in `scripts/` because `pnpm test` globs `scripts/*.test.js`.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import markdownIt from "markdown-it";
import { importSrc, srcTest as test } from "./support/ts.js";

const { default: markdownItAlerts } = await importSrc(
    "components/markdown-alerts",
);

const CLASS_NAMES = {
    alert: "A",
    title: "T",
    note: "N",
    tip: "P",
    important: "I",
    warning: "W",
    caution: "C",
};

/**
 * Built lazily: on a Node too old for the module hooks the plugin is undefined
 * and every test here is skipped, so constructing the parser at module level
 * would take the file down before the skips could be reported.
 */
let parser;
const md = () => {
    parser ??= markdownIt({ html: true }).use(markdownItAlerts, CLASS_NAMES);
    return parser;
};

/** Rendered markup with each inline icon collapsed to `[svg]`. */
const render = (source) =>
    md()
        .render(source)
        .replace(/<svg[\s\S]*?<\/svg>/g, "[svg]");

const ICON_FILES = {
    note: "info-circle-fill.svg",
    tip: "lightbulb-fill.svg",
    important: "megaphone-fill.svg",
    warning: "exclamation-triangle-fill.svg",
    caution: "exclamation-octagon-fill.svg",
};

/* ------------------------------------------------------------- every type */

test("each alert type renders its own modifier class, icon slot and label", () => {
    const expected = {
        NOTE: ["N", "Note"],
        TIP: ["P", "Tip"],
        IMPORTANT: ["I", "Important"],
        WARNING: ["W", "Warning"],
        CAUTION: ["C", "Caution"],
    };

    for (const [marker, [modifier, label]] of Object.entries(expected)) {
        assert.equal(
            render(`> [!${marker}]\n> body\n`),
            [
                `<div class="A ${modifier}">`,
                `<div class="T">[svg]<span>${label}</span></div>`,
                "<p>body</p>",
                "</div>",
                "",
            ].join("\n"),
        );
    }
});

test("the marker is case insensitive", () => {
    assert.equal(render("> [!note]\n> body\n"), render("> [!NOTE]\n> body\n"));
    assert.equal(render("> [!NoTe]\n> body\n"), render("> [!NOTE]\n> body\n"));
});

test("trailing spaces after the marker do not break the match", () => {
    assert.equal(
        render("> [!WARNING]   \n> body\n"),
        render("> [!WARNING]\n> body\n"),
    );
});

/* ------------------------------------------------------- what stays a quote */

test("an unrecognized marker leaves the blockquote alone", () => {
    assert.equal(
        render("> [!DANGER]\n> body\n"),
        "<blockquote>\n<p>[!DANGER]\nbody</p>\n</blockquote>\n",
    );
});

test("a plain blockquote is untouched", () => {
    assert.equal(
        render("> Just a quote.\n"),
        "<blockquote>\n<p>Just a quote.</p>\n</blockquote>\n",
    );
});

test("the marker has to be on a line of its own", () => {
    assert.equal(
        render("> [!NOTE] on the same line\n"),
        "<blockquote>\n<p>[!NOTE] on the same line</p>\n</blockquote>\n",
    );
});

test("the marker has to open the blockquote", () => {
    assert.equal(
        render("> intro\n>\n> [!NOTE]\n> body\n"),
        "<blockquote>\n<p>intro</p>\n<p>[!NOTE]\nbody</p>\n</blockquote>\n",
    );
});

/* ------------------------------------------------------------------ content */

test("a marker with nothing after it renders as the title alone", () => {
    assert.equal(
        render("> [!TIP]\n"),
        '<div class="A P">\n' +
            '<div class="T">[svg]<span>Tip</span></div>\n' +
            "</div>\n",
    );
});

test("every paragraph of the blockquote survives, in order", () => {
    assert.equal(
        render("> [!CAUTION]\n> one\n>\n> two\n"),
        '<div class="A C">\n' +
            '<div class="T">[svg]<span>Caution</span></div>\n' +
            "<p>one</p>\n" +
            "<p>two</p>\n" +
            "</div>\n",
    );
});

test("a blockquote nested inside an alert stays a blockquote", () => {
    // The close tag is found by depth counting; a naive search for the first
    // `blockquote_close` would rewrite the inner quote's closing tag instead.
    assert.equal(
        render("> [!IMPORTANT]\n> outer\n>\n> > inner quote\n"),
        '<div class="A I">\n' +
            '<div class="T">[svg]<span>Important</span></div>\n' +
            "<p>outer</p>\n" +
            "<blockquote>\n<p>inner quote</p>\n</blockquote>\n" +
            "</div>\n",
    );
});

test("consecutive alerts are both converted", () => {
    const html = render("> [!NOTE]\n> a\n\n> [!TIP]\n> b\n");

    assert.equal((html.match(/<div class="A /g) ?? []).length, 2);
    assert.ok(!html.includes("<blockquote>"), html);
});

test("markdown inside an alert is still markdown", () => {
    assert.equal(
        render("> [!NOTE]\n> **bold** and `code`\n"),
        '<div class="A N">\n' +
            '<div class="T">[svg]<span>Note</span></div>\n' +
            "<p><strong>bold</strong> and <code>code</code></p>\n" +
            "</div>\n",
    );
});

/* -------------------------------------------------------------------- icons */

test("each type carries the vendored Bootstrap icon it names", async () => {
    for (const [type, file] of Object.entries(ICON_FILES)) {
        const source = await readFile(
            new URL(
                `../vendor/structurizr/bootstrap-icons/${file}`,
                import.meta.url,
            ),
            "utf-8",
        );

        const body = source.trim().replace(/^<svg [^>]*>/, "");
        const html = md().render(`> [!${type}]\n`);

        assert.ok(
            html.includes(body),
            `the ${type} alert is not rendering ${file}`,
        );
    }
});

test("the icon is hidden from assistive technology and from tab order", () => {
    const html = md().render("> [!NOTE]\n> body\n");

    assert.match(html, /<svg aria-hidden="true" focusable="false" /);
    assert.equal((html.match(/<svg /g) ?? []).length, 1);
});

/* ------------------------------------------------------------ configuration */

test("the class names are taken from the caller, not hardcoded", () => {
    const custom = markdownIt().use(markdownItAlerts, {
        alert: "x-alert",
        title: "x-title",
        note: "x-note",
        tip: "x-tip",
        important: "x-important",
        warning: "x-warning",
        caution: "x-caution",
    });

    const html = custom
        .render("> [!NOTE]\n> body\n")
        .replace(/<svg[\s\S]*?<\/svg>/g, "[svg]");

    assert.equal(
        html,
        '<div class="x-alert x-note">\n' +
            '<div class="x-title">[svg]<span>Note</span></div>\n' +
            "<p>body</p>\n" +
            "</div>\n",
    );
});
