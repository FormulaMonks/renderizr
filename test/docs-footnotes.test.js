/**
 * Footnotes on the docs page (ADR 31). The build lists every footnote of a
 * section at its foot, numbered across the whole section; the page shows,
 * at the foot of each page of a split section, the footnotes that page's own
 * references use, with the numbers the whole section gave them.
 */

import assert from "node:assert/strict";
import { beforeEach } from "node:test";
import { rendered } from "./support/documentation.js";
import history from "./support/history.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { default: Docs } = await importSrc("pages/docs");
const { documentationScopes } = await importSrc("model/documentation");

const { document } = dom;

/**
 * An intro and three pages: the intro and the first page each reference a
 * footnote of their own, the second references the first page's again and
 * one of its own, and the third references none.
 */
const SPLIT = {
    filename: "01-split.md",
    order: 1,
    title: "Split",
    content: [
        "# Split",
        "",
        "The intro[^intro].",
        "",
        "## First",
        "",
        "The first page[^first].",
        "",
        "## Second",
        "",
        "The first page's again[^first] and its own[^second].",
        "",
        "## Third",
        "",
        "No footnotes here.",
        "",
        "[^intro]: Intro note.",
        "[^first]: First note.",
        "[^second]: Second note.",
        "",
    ].join("\n"),
};

/** The same section in AsciiDoc. */
const SPLIT_ASCIIDOC = {
    filename: "02-split.adoc",
    order: 2,
    format: "AsciiDoc",
    title: "Split AsciiDoc",
    content: [
        "= Split AsciiDoc",
        "",
        "The intro.footnote:intro[Intro note.]",
        "",
        "== First",
        "",
        "The first page.footnote:first[First note.]",
        "",
        "== Second",
        "",
        "The first page's again.footnote:first[] And its own.footnote:second[Second note.]",
        "",
        "== Third",
        "",
        "No footnotes here.",
        "",
    ].join("\n"),
};

let host;

beforeEach(() => {
    dom.reset();
    host = dom.mount("page-content");
    history.replace({ search: "?page=docs", hash: "" });
});

const renderPage = async (sections = [SPLIT]) => {
    const workspace = await rendered({
        name: "Guidebook",
        documentation: { sections },
    });
    const page = new Docs(host, "docs", documentationScopes(workspace));
    page.render();
    return page;
};

const menuItem = (title) =>
    document
        .querySelectorAll("#docs-menu a[data-item-id]")
        .find((link) => link.textContent === title);

const list = () => document.querySelector(".markdown-renderer .rz-footnotes");

/**
 * The footnotes listed at the foot of the page on screen, by number, id and
 * text, each with the back links it shows. None when the list is hidden.
 */
const listed = () => {
    const section = list();
    if (!section || section.hasAttribute("hidden")) return [];
    return section.querySelectorAll("li").map((item) => {
        const backLinks = item
            .querySelectorAll(".rz-footnote-backref")
            .filter((link) => !link.hasAttribute("hidden"))
            .map((link) => link.getAttribute("href"));
        const text = item.querySelector("p").childNodes[0].textContent.trim();
        return [item.getAttribute("value"), item.id, text, ...backLinks].join(
            " ",
        );
    });
};

/** The blocks of the page on screen, hidden ones and the list excluded. */
const visible = () =>
    document
        .querySelectorAll(".markdown-renderer > *")
        .filter(
            (node) =>
                !node.classList.contains("pageHidden") &&
                !node.classList.contains("rz-footnotes"),
        )
        .map((node) => `${node.tagName}:${node.textContent.trim()}`);

for (const [syntax, section, title] of [
    ["Markdown", SPLIT, "Split"],
    ["AsciiDoc", SPLIT_ASCIIDOC, "Split AsciiDoc"],
]) {
    test(`${syntax}: each page lists only the footnotes its own references use`, async () => {
        await renderPage([section]);

        assert.deepEqual(listed(), ["1 fn-intro Intro note. #fnref-intro"]);

        menuItem("First").click();
        assert.deepEqual(listed(), ["2 fn-first First note. #fnref-first"]);

        menuItem("Second").click();
        assert.deepEqual(listed(), [
            "2 fn-first First note. #fnref-first-2",
            "3 fn-second Second note. #fnref-second",
        ]);

        menuItem("Third").click();
        assert.deepEqual(listed(), []);
        assert.ok(list().hasAttribute("hidden"));

        menuItem(title).click();
        assert.deepEqual(listed(), ["1 fn-intro Intro note. #fnref-intro"]);
    });
}

test("a footnote referenced on two pages shows on both, with the same number", async () => {
    await renderPage();

    menuItem("First").click();
    const [onFirst] = listed();
    menuItem("Second").click();
    const [onSecond] = listed();

    assert.equal(onFirst.split(" #")[0], "2 fn-first First note.");
    assert.equal(onSecond.split(" #")[0], "2 fn-first First note.");
    assert.equal(
        document.querySelectorAll('[id="fn-first"]').length,
        1,
        "one footnote element, moved from page to page",
    );
});

test("the list is not a page of its own and never hides with the page", async () => {
    await renderPage();

    menuItem("Second").click();

    assert.deepEqual(visible(), [
        "H1:Second",
        "P:The first page’s again2 and its own3.",
    ]);
    assert.equal(list().classList.contains("pageHidden"), false);
    assert.deepEqual(
        document
            .querySelectorAll("#docs-menu a[data-item-id]")
            .map((link) => link.textContent),
        ["Split", "First", "Second", "Third"],
    );
});

test("a reference scrolls to its footnote on the same page, and a back link to the reference", async () => {
    await renderPage();
    menuItem("Second").click();
    document.scrolledIntoView.length = 0;

    document.querySelector('.markdown-renderer a[href="#fn-second"]').click();
    document
        .querySelector('.markdown-renderer a[href="#fnref-second"]')
        .click();

    assert.deepEqual(
        document.scrolledIntoView.map((entry) => entry.id),
        ["fn-second", "fnref-second"],
    );
    assert.deepEqual(visible()[0], "H1:Second", "the page has not changed");
});

test("a section with no footnotes shows no list", async () => {
    await renderPage([
        {
            filename: "01-plain.md",
            order: 1,
            title: "Plain",
            content: "# Plain\n\nNo notes.\n\n## Page\n\nStill none.\n",
        },
    ]);

    assert.equal(list(), null);
});
