/**
 * The small rows of GitHub's formatting the build renders (ADR 31): task
 * lists, emoji, bare URLs, `<kbd>`, single-tilde strikethrough, video,
 * images in raw HTML and images that follow the color scheme. Each row goes
 * from Markdown, and from AsciiDoc where it has a counterpart, into the HTML
 * the page shows.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createAsciiDoc,
    renderAsciiDoc,
} from "../scripts/documentation/asciidoc.js";
import { CLASSES } from "../scripts/documentation/classes.js";
import { createImageResolver } from "../scripts/documentation/images.js";
import {
    createMarkdown,
    renderMarkdown,
} from "../scripts/documentation/markdown.js";

const md = createMarkdown();
const asciidoc = createAsciiDoc();

/** `source` rendered from Markdown with `env`, as the build renders it. */
const markdown = (source, env) => renderMarkdown(md, source, env);

/** `source` rendered from AsciiDoc with `env`, as the build renders it. */
const adoc = (source, env) => renderAsciiDoc(asciidoc, source, env);

/** The embedded images the image tests resolve against. */
const resolveImage = createImageResolver([
    { name: "images/light.svg", type: "image/svg+xml", content: "TElHSFQ=" },
    { name: "images/dark.svg", type: "image/svg+xml", content: "REFSSw==" },
]);
const LIGHT = "data:image/svg+xml;base64,TElHSFQ=";
const DARK = "data:image/svg+xml;base64,REFSSw==";

const checkbox = (checked) =>
    `<input class="${CLASSES.taskListCheckbox}" type="checkbox" disabled${checked ? " checked" : ""}>`;

/* -------------------------------------------------------------- task lists */

test("a Markdown task list renders read-only checkboxes in items with no bullet", () => {
    assert.equal(
        markdown("- [ ] Draft\n- [x] Review\n- [X] Ship\n"),
        `<ul class="${CLASSES.taskList}">\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(false)} Draft</li>\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(true)} Review</li>\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(true)} Ship</li>\n` +
            "</ul>\n",
    );
});

test("a task list nests, in ordered lists too, and keeps an escaped parenthesis", () => {
    const html = markdown(
        "1. [ ] Write the spec\n   - [x] Draft\n2. [x] Ship it\n\n- [ ] \\(Optional) Follow up\n",
    );

    assert.match(
        html,
        new RegExp(
            `<ol class="${CLASSES.taskList}">\n<li class="${CLASSES.taskListItem}">${checkbox(false)} Write the spec\n<ul class="${CLASSES.taskList}">`,
        ),
    );
    assert.ok(html.includes(`${checkbox(true)} Ship it</li>`), html);
    assert.ok(html.includes(`${checkbox(false)} (Optional) Follow up`), html);
});

test("a task that starts with a bare URL keeps its checkbox and its link", () => {
    assert.equal(
        markdown("- [ ] https://example.com/issues/740\n"),
        `<ul class="${CLASSES.taskList}">\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(false)} <a href="https://example.com/issues/740">https://example.com/issues/740</a></li>\n` +
            "</ul>\n",
    );
});

test("a list item that only looks like a task stays an ordinary item", () => {
    for (const source of [
        "- [ ]\n",
        "- [x]done\n",
        "- Not [ ] a task\n",
        "- [y] Nope\n",
        "- `[ ]` code\n",
    ]) {
        const html = markdown(source);
        assert.ok(!html.includes("checkbox"), `${source}: ${html}`);
        assert.ok(!html.includes(CLASSES.taskList), `${source}: ${html}`);
    }
});

test("a list mixing tasks and ordinary items keeps the bullet on the ordinary ones", () => {
    assert.equal(
        markdown("- [x] Done\n- Plain\n"),
        `<ul class="${CLASSES.taskList}">\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(true)} Done</li>\n` +
            "<li>Plain</li>\n" +
            "</ul>\n",
    );
});

test("an AsciiDoc checklist renders the markup a Markdown task list does", async () => {
    assert.equal(
        await adoc(
            "* [*] Checked\n* [x] Also checked\n* [ ] Not checked\n* Plain\n",
        ),
        `<ul class="${CLASSES.taskList}">\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(true)} Checked</li>\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(true)} Also checked</li>\n` +
            `<li class="${CLASSES.taskListItem}">${checkbox(false)} Not checked</li>\n` +
            "<li>Plain</li>\n" +
            "</ul>\n",
    );
});

/* ------------------------------------------------------------------- emoji */

test("an emoji shortcode renders as the Unicode emoji", () => {
    assert.equal(
        markdown(":+1: Ship it :tada: :white_check_mark:\n"),
        "<p>👍 Ship it 🎉 ✅</p>\n",
    );
});

test("GitHub's image emoji, text smileys, times and code stay as written", () => {
    assert.equal(
        markdown(":shipit: :octocat: :) <3 10:30:45 `:smile:`\n"),
        "<p>:shipit: :octocat: :) &lt;3 10:30:45 <code>:smile:</code></p>\n",
    );
});

/* --------------------------------------------------------------- bare URLs */

test("a bare URL, a www. address and an email become links", () => {
    assert.equal(
        markdown(
            "Visit https://github.com, www.github.com or octocat@github.com.\n",
        ),
        '<p>Visit <a href="https://github.com">https://github.com</a>, ' +
            '<a href="http://www.github.com">www.github.com</a> or ' +
            '<a href="mailto:octocat@github.com">octocat@github.com</a>.</p>\n',
    );
});

test("a file name, code and an existing link stay as written", () => {
    assert.equal(
        markdown(
            "See README.md, `https://example.com` and [the site](https://example.com).\n",
        ),
        "<p>See README.md, <code>https://example.com</code> and " +
            '<a href="https://example.com">the site</a>.</p>\n',
    );
});

test("a bare URL goes through the link resolver", () => {
    const resolveLink = (href) =>
        href === "https://example.com/docs/02-usage.md"
            ? "?page=docs&section=02-usage"
            : undefined;

    assert.equal(
        markdown("Read https://example.com/docs/02-usage.md\n", {
            resolveLink,
        }),
        '<p>Read <a href="?page=docs&amp;section=02-usage">https://example.com/docs/02-usage.md</a></p>\n',
    );
});

test("a bare video URL becomes an ordinary link", () => {
    assert.equal(
        markdown("https://example.com/demo.mp4\n"),
        '<p><a href="https://example.com/demo.mp4">https://example.com/demo.mp4</a></p>\n',
    );
});

/* --------------------------------------------------------------------- kbd */

test("kbd in raw HTML stays a kbd", () => {
    assert.equal(
        markdown("Press <kbd>Ctrl</kbd>+<kbd>K</kbd>.\n"),
        "<p>Press <kbd>Ctrl</kbd>+<kbd>K</kbd>.</p>\n",
    );
});

test("AsciiDoc's kbd and menu macros render key caps", async () => {
    assert.equal(
        await adoc("Press kbd:[Ctrl+Shift+P], kbd:[⌘ K] or menu:File[Save].\n"),
        '<p>Press <span class="keyseq"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd></span>, ' +
            "<kbd>⌘ K</kbd> or " +
            `<span class="${CLASSES.menu}"><kbd>File</kbd>&#160;&#8250; <kbd>Save</kbd></span>.</p>\n`,
    );
});

test("an AsciiDoc menu with submenus puts each step in a key cap", async () => {
    assert.equal(
        await adoc("menu:View[Zoom > Reset]\n"),
        `<p><span class="${CLASSES.menu}"><kbd>View</kbd>&#160;&#8250; <kbd>Zoom</kbd>&#160;&#8250; <kbd>Reset</kbd></span></p>\n`,
    );
});

/* ------------------------------------------------- single-tilde strikethrough */

test("single tildes draw a line through the text, as double ones do", () => {
    assert.equal(
        markdown("~One tilde~ and ~~two tildes~~.\n"),
        "<p><s>One tilde</s> and <s>two tildes</s>.</p>\n",
    );
});

test("a single tilde holds inline formatting", () => {
    assert.equal(
        markdown("~one **bold** word~\n"),
        "<p><s>one <strong>bold</strong> word</s></p>\n",
    );
});

test("a tilde that opens or closes on a space, a lone tilde and code stay as written", () => {
    for (const [source, html] of [
        ["~ spaced ~\n", "<p>~ spaced ~</p>\n"],
        ["~/home and ~/work\n", "<p>~/home and ~/work</p>\n"],
        ["About ~5 minutes\n", "<p>About ~5 minutes</p>\n"],
        ["`~code~`\n", "<p><code>~code~</code></p>\n"],
        ["\\~escaped~\n", "<p>~escaped~</p>\n"],
        ["A ~~~one~\n", "<p>A ~~~one~</p>\n"],
    ]) {
        assert.equal(markdown(source), html, source);
    }
});

/* ------------------------------------------------------------------- video */

test("a video in raw HTML renders a player, its relative poster resolved", () => {
    assert.equal(
        markdown('<video src="demo.mp4" poster="images/light.svg"></video>\n', {
            resolveImage,
        }),
        `<p><video src="demo.mp4" poster="${LIGHT}" controls></video></p>\n`,
    );
});

test("a video that asks for controls keeps them once", () => {
    assert.equal(
        markdown(
            '<video controls src="https://example.com/demo.mp4"></video>\n',
        ),
        '<p><video controls src="https://example.com/demo.mp4"></video></p>\n',
    );
});

test("AsciiDoc's video:: renders a player, its poster resolved", async () => {
    const html = await adoc(
        ".A demo\nvideo::demo.mp4[poster=images/dark.svg,width=640]\n",
        { resolveImage },
    );

    assert.match(html, /<div class="title">A demo<\/div>/);
    assert.ok(
        html.includes(
            `<video src="demo.mp4" width="640" poster="${DARK}" controls>`,
        ),
        html,
    );
});

test("AsciiDoc's YouTube and Vimeo videos become links, since the page loads no frame", async () => {
    const html = await adoc("video::abc123[youtube]\n\nvideo::67890[vimeo]\n");

    assert.ok(!html.includes("<iframe"), html);
    assert.match(
        html,
        /<a href="https:\/\/www\.youtube\.com\/watch\?v=abc123">https:\/\/www\.youtube\.com\/watch\?v=abc123<\/a>/,
    );
    assert.match(
        html,
        /<a href="https:\/\/vimeo\.com\/67890">https:\/\/vimeo\.com\/67890<\/a>/,
    );
});

/* -------------------------------------------------------- images in raw HTML */

test("an image in raw HTML resolves the way a Markdown image does", () => {
    assert.equal(
        markdown('<img src="images/light.svg" width="120" alt="Light">\n', {
            resolveImage,
        }),
        `<img src="${LIGHT}" width="120" alt="Light">\n`,
    );
});

test("a srcset and a picture's sources resolve each candidate", () => {
    assert.equal(
        markdown(
            '<picture>\n<source srcset="images/dark.svg 2x, https://example.com/a.png 1x">\n<img src="./images/light.svg" alt="A">\n</picture>\n',
            { resolveImage },
        ),
        `<picture>\n<source srcset="${DARK} 2x, https://example.com/a.png 1x">\n<img src="${LIGHT}" alt="A">\n</picture>\n`,
    );
});

test("a path with a fragment resolves, keeping its fragment", () => {
    assert.equal(
        markdown(
            '![A](images/light.svg#frag) <img src="images/dark.svg#x">\n',
            {
                resolveImage,
            },
        ),
        `<p><img src="${LIGHT}#frag" alt="A"> <img src="${DARK}#x"></p>\n`,
    );
});

test("an SVG data URI in raw HTML stays as written", () => {
    const svg = "data:image/svg+xml;base64,PHN2Zy8+";
    assert.equal(
        markdown(`<img src="${svg}" alt="SVG">\n`, { resolveImage }),
        `<img src="${svg}" alt="SVG">\n`,
    );
});

test("AsciiDoc's image:: and image: resolve a path with a fragment, and a passthrough image resolves", async () => {
    const html = await adoc(
        'image::images/light.svg#frag[Block]\n\nInline image:images/dark.svg[Inline].\n\n++++\n<img src="images/light.svg" alt="Raw">\n++++\n',
        { resolveImage },
    );

    assert.ok(html.includes(`<img src="${LIGHT}#frag" alt="Block">`), html);
    assert.ok(html.includes(`<img src="${DARK}" alt="Inline">`), html);
    assert.ok(html.includes(`<img src="${LIGHT}" alt="Raw">`), html);
});

/* --------------------------------------------- images that follow the scheme */

test("#gh-dark-mode-only and #gh-light-mode-only mark the image for the site's own color scheme", () => {
    assert.equal(
        markdown(
            "![Light](images/light.svg#gh-light-mode-only)\n![Dark](images/dark.svg#gh-dark-mode-only)\n",
            { resolveImage },
        ),
        `<p><img src="${LIGHT}" alt="Light" class="${CLASSES.schemeLight}">\n` +
            `<img src="${DARK}" alt="Dark" class="${CLASSES.schemeDark}"></p>\n`,
    );
});

test("the fragments work on remote images and in raw HTML, keeping the author's class", () => {
    assert.equal(
        markdown(
            '<img class="logo" src="https://example.com/a.png#gh-dark-mode-only">\n',
        ),
        `<img class="logo ${CLASSES.schemeDark}" src="https://example.com/a.png">\n`,
    );
});

test("a picture with prefers-color-scheme sources becomes one picture per color scheme", () => {
    assert.equal(
        markdown(
            "<picture>\n" +
                '  <source media="(prefers-color-scheme: dark)" srcset="images/dark.svg">\n' +
                '  <source media="(prefers-color-scheme: light)" srcset="images/light.svg">\n' +
                '  <img alt="Logo" src="images/light.svg">\n' +
                "</picture>\n",
            { resolveImage },
        ),
        `<picture class="${CLASSES.schemeLight}">\n` +
            `  <source srcset="${LIGHT}">\n` +
            `  <img alt="Logo" src="${LIGHT}">\n` +
            "</picture>" +
            `<picture class="${CLASSES.schemeDark}">\n` +
            `  <source srcset="${DARK}">\n` +
            `  <img alt="Logo" src="${LIGHT}">\n` +
            "</picture>\n",
    );
});

test("a picture with only a dark source falls back to its image in the light scheme", () => {
    assert.equal(
        markdown(
            '<picture><source media="(prefers-color-scheme: dark)" srcset="d.png"><img src="l.png"></picture>\n',
        ),
        `<p><picture class="${CLASSES.schemeLight}"><img src="l.png"></picture>` +
            `<picture class="${CLASSES.schemeDark}"><source srcset="d.png"><img src="l.png"></picture></p>\n`,
    );
});

test("a picture with no color-scheme source stays as written", () => {
    const source =
        '<picture><source media="(min-width: 600px)" srcset="w.png"><img src="n.png"></picture>';
    assert.equal(markdown(`${source}\n`), `<p>${source}</p>\n`);
});

test("a passthrough picture in AsciiDoc follows the color scheme too", async () => {
    const html = await adoc(
        '++++\n<picture><source media="(prefers-color-scheme: dark)" srcset="d.png"><img src="l.png"></picture>\n++++\n',
    );
    assert.ok(html.includes(`<picture class="${CLASSES.schemeLight}">`), html);
    assert.ok(html.includes(`<picture class="${CLASSES.schemeDark}">`), html);
});

test("an image in code stays as written", () => {
    assert.equal(
        markdown('```\n<img src="images/light.svg#gh-dark-mode-only">\n```\n', {
            resolveImage,
        }).includes("&lt;img"),
        true,
    );
});
