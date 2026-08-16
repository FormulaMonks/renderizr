/**
 * `src/pages/docs.ts` — the documentation reader, and the largest single file
 * in the application.
 *
 * Most of it is one idea: a Structurizr documentation section is one long
 * markdown document, and this page turns it into a sequence of screen-sized
 * pages with a sidebar, a pager and a URL. Everything downstream — the tree,
 * the "on this page" anchors, the previous/next buttons, the deep link — is
 * derived from where the page boundaries fell, so that is what most of these
 * assert.
 *
 * The model is built from the *rendered* headings rather than the markdown, so
 * the tests feed real markdown through the real renderer and read the real
 * elements back.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach } from "node:test";
import history from "./support/history.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { default: Docs } = await importSrc("pages/docs");

const { document, window } = dom;

const WORKSPACE = JSON.parse(
    readFileSync(
        new URL("../scripts/__fixtures__/workspace.json", import.meta.url),
        "utf-8",
    ),
);

/**
 * One section with an intro, two pages, and a sub-heading on the first page —
 * the smallest document that exercises every level of the tree.
 */
const GUIDE = {
    filename: "01-guide.md",
    order: 1,
    title: "Guide",
    content: [
        "# Guide",
        "",
        "Everything starts here.",
        "",
        "## Install",
        "",
        "Run the installer.",
        "",
        "### Requirements",
        "",
        "Node 20 or newer.",
        "",
        "## Configure",
        "",
        "Edit the file.",
        "",
    ].join("\n"),
};

const OPERATIONS = {
    filename: "02-operations.md",
    order: 2,
    title: "Operations",
    content: "# Operations\n\nKeep it running.\n",
};

let host;

beforeEach(() => {
    dom.reset();
    host = dom.mount("page-content");
    history.replace({ search: "?page=docs", hash: "" });
});

const renderPage = (sections = [GUIDE, OPERATIONS]) => {
    const page = new Docs(host, "docs", sections);
    page.render();
    return page;
};

const menuEntries = () =>
    document
        .querySelectorAll("#docs-menu a[data-item-id]")
        .map((link) => `${link.dataset.depth}:${link.textContent}`);

const menuItem = (title) =>
    document
        .querySelectorAll("#docs-menu a[data-item-id]")
        .find((link) => link.textContent === title);

/** The headings and paragraphs currently on screen, hidden ones excluded. */
const visible = () =>
    document
        .querySelectorAll(".markdown-renderer > *")
        .filter((node) => !node.classList.contains("pageHidden"))
        .map((node) => `${node.tagName}:${node.textContent.trim()}`);

const params = () => new URLSearchParams(history.location.search);

/* ------------------------------------------------------------ section list */

test("sections are ordered by their order field, not by arrival", () => {
    renderPage([
        { ...OPERATIONS, order: 2 },
        { ...GUIDE, order: 1 },
    ]);

    assert.deepEqual(
        document
            .querySelectorAll('#docs-menu a[data-depth="0"]')
            .map((link) => link.textContent),
        ["Guide", "Operations"],
    );
});

test("a section with no title of its own takes it from its first heading", () => {
    renderPage([
        {
            filename: "03-untitled.md",
            order: 1,
            content: "# Written In The Document\n\nBody.\n",
        },
    ]);

    assert.equal(menuItem("Written In The Document")?.dataset.depth, "0");
});

test("a section with neither falls back to a tidied-up filename", () => {
    // "0001-record-architecture-decisions.md" only becomes a title as a last
    // resort, and when it does it should not look like a filename.
    renderPage([
        { filename: "0004-record_the-facts.md", order: 1, content: "Body.\n" },
    ]);

    assert.equal(menuItem("Record The Facts")?.dataset.depth, "0");
});

test("an AsciiDoc section is converted and titled from its = heading", () => {
    renderPage([
        {
            filename: "04-adoc.adoc",
            order: 1,
            content: "= Runbook\n\nRestart the service.\n",
        },
    ]);

    assert.equal(menuItem("Runbook")?.dataset.depth, "0");
    assert.match(
        document.getElementById("docs-content").textContent,
        /Restart the service/,
    );
});

/* ------------------------------------------------------------- page splits */

test("a section becomes an intro plus one page per top-level heading", () => {
    renderPage();

    assert.deepEqual(menuEntries(), [
        "0:Guide",
        "1:Install",
        "1:Configure",
        "0:Operations",
    ]);
});

test("the section opens on its intro, with the other pages hidden", () => {
    renderPage();

    assert.deepEqual(visible(), ["H1:Guide", "P:Everything starts here."]);
});

test("choosing a page shows that page and nothing else", () => {
    renderPage();

    menuItem("Install").click();

    assert.deepEqual(visible(), [
        "H1:Install",
        "P:Run the installer.",
        "H2:Requirements",
        "P:Node 20 or newer.",
    ]);
});

test("each page's headings are renumbered to start at h1", () => {
    // Within the section these are an h3 and an h4 — a page titled by an h3
    // sitting under no h1 or h2 is a broken outline for a screen reader.
    renderPage();

    menuItem("Install").click();

    const [first, second] = document
        .querySelectorAll(".markdown-renderer > *")
        .filter((node) => !node.classList.contains("pageHidden"))
        .filter((node) => /^H[1-6]$/.test(node.tagName));

    assert.equal(first.tagName, "H1");
    assert.equal(second.tagName, "H2");
});

test("relative nesting survives the renumbering, so the tree is unchanged", () => {
    renderPage();

    menuItem("Install").click();

    assert.deepEqual(menuEntries(), [
        "0:Guide",
        "1:Install",
        "2:Requirements",
        "1:Configure",
        "0:Operations",
    ]);
});

test("an intro holding nothing but the section title is not a page of its own", () => {
    renderPage([
        {
            filename: "05-titleonly.md",
            order: 1,
            title: "Title Only",
            content: "# Title Only\n\n## First\n\nOne.\n\n## Second\n\nTwo.\n",
        },
    ]);

    assert.deepEqual(visible(), ["H1:First", "P:One."]);
    assert.deepEqual(menuEntries(), ["0:Title Only", "1:First", "1:Second"]);
});

test("a document that opens straight into a sub-heading has no title page", () => {
    renderPage([
        {
            filename: "06-nohead.md",
            order: 1,
            title: "No Title",
            content: "## Alpha\n\nOne.\n\n## Beta\n\nTwo.\n",
        },
    ]);

    assert.deepEqual(menuEntries(), ["0:No Title", "1:Alpha", "1:Beta"]);
});

/* -------------------------------------------------------- on this page tree */

test("the page on screen contributes its own headings to the tree", () => {
    renderPage();
    menuItem("Install").click();

    const requirements = menuItem("Requirements");

    assert.equal(requirements.dataset.itemId, "heading:requirements");
});

test("only the page on screen carries anchors", () => {
    renderPage();

    menuItem("Install").click();
    assert.ok(menuItem("Requirements"), "the open page lists its headings");

    menuItem("Configure").click();
    assert.equal(
        menuItem("Requirements"),
        undefined,
        "a wall of links into pages nobody is reading is worse than none",
    );
});

test("clicking an anchor scrolls rather than navigating", () => {
    renderPage();
    menuItem("Install").click();

    const before = params().get("subsection");
    menuItem("Requirements").click();

    assert.deepEqual(
        document.scrolledIntoView.map((entry) => entry.id),
        ["requirements"],
    );
    assert.equal(params().get("subsection"), before, "still the same page");
});

/* -------------------------------------------------------------------- pager */

test("the pager offers the next page, and no previous one at the start", () => {
    renderPage();

    const buttons = document
        .querySelectorAll("#docs-pager button")
        .map((button) => button.textContent.replace(/\s+/g, " ").trim());

    assert.deepEqual(buttons, ["Next Install"]);
});

test("the pager crosses into the next section, naming it", () => {
    renderPage();
    menuItem("Configure").click();

    const next = document.querySelectorAll("#docs-pager button").at(-1);

    assert.match(next.textContent.replace(/\s+/g, " "), /Next Operations/);
});

test("the pager moves the reader", () => {
    renderPage();

    document.querySelector("#docs-pager button").click();

    assert.deepEqual(visible()[0], "H1:Install");
    assert.equal(params().get("subsection"), "install");
});

test("a click on the label inside a pager button still turns the page", () => {
    // The buttons wrap several spans; the click lands on whichever one was
    // under the pointer.
    renderPage();

    document.querySelector("#docs-pager button span").click();

    assert.deepEqual(visible()[0], "H1:Install");
});

/* --------------------------------------------------------------------- URL */

test("the section and page are written into the URL", () => {
    renderPage();

    assert.equal(params().get("section"), "01-guide");
    assert.equal(params().has("subsection"), false, "an intro is the section");

    menuItem("Install").click();

    assert.equal(params().get("subsection"), "install");
});

test("the URL decides which page opens", () => {
    history.replace({
        search: "?page=docs&section=01-guide&subsection=configure",
    });

    renderPage();

    assert.deepEqual(visible(), ["H1:Configure", "P:Edit the file."]);
});

test("a URL naming only a section opens that section's first page", () => {
    history.replace({ search: "?page=docs&section=02-operations" });

    renderPage();

    assert.deepEqual(visible(), ["H1:Operations", "P:Keep it running."]);
});

test("an unknown section falls back to the first page rather than a blank one", () => {
    history.replace({ search: "?page=docs&section=nope&subsection=nope" });

    renderPage();

    assert.deepEqual(visible(), ["H1:Guide", "P:Everything starts here."]);
});

test("Back returns to the page before, on the docs page", () => {
    renderPage();

    menuItem("Install").click();
    menuItem("Configure").click();

    window.history.back();

    assert.deepEqual(visible()[0], "H1:Install");
});

/* -------------------------------------------------------------- breadcrumb */

test("the breadcrumb names the section on a page, and nothing on an intro", () => {
    renderPage();

    assert.equal(document.getElementById("docs-breadcrumb").textContent, "");

    menuItem("Install").click();

    assert.equal(
        document.getElementById("docs-breadcrumb").textContent,
        "Guide",
    );
});

/* ------------------------------------------------------- in-document links */

test("a link to a heading on another page turns the page and scrolls to it", () => {
    // A document's own table of contents. Before this, the anchor scrolled to
    // a heading that was hidden, so nothing happened at all.
    renderPage([
        {
            filename: "07-toc.md",
            order: 1,
            title: "Contents",
            content:
                "# Contents\n\n- [Configure](#configure)\n\n## Install\n\nOne.\n\n## Configure\n\nTwo.\n",
        },
    ]);

    document.querySelector('.markdown-renderer a[href="#configure"]').click();

    assert.deepEqual(visible(), ["H1:Configure", "P:Two."]);

    // Twice, not once: the markdown renderer scrolls to the anchor first —
    // which does nothing while the target is still hidden — and the page then
    // turns and scrolls to it for real. Pinned so a change in either shows up.
    assert.deepEqual(
        document.scrolledIntoView.map((entry) => entry.id),
        ["configure", "configure"],
    );
});

test("a link to a heading on the page being read is left to scroll", () => {
    renderPage();
    menuItem("Install").click();
    document.scrolledIntoView.length = 0;

    const anchor = document.querySelector(
        '.markdown-renderer a[href="#requirements"]',
    );
    anchor?.click();

    assert.deepEqual(visible()[0], "H1:Install", "the page has not changed");
});

/* ------------------------------------------------ the committed workspace */

test("the fixture workspace builds one menu entry per section", () => {
    // Both of its sections are a single heading and a short body, so neither
    // splits: the tree is flat and every entry is a section.
    renderPage(WORKSPACE.documentation.sections);

    assert.deepEqual(menuEntries(), ["0:Overview", "0:Deployment"]);
    assert.match(
        document.getElementById("docs-content").textContent,
        /without reaching the network/,
    );
});

/* ------------------------------------------------------------------- clear */

test("clear() empties the page and stops listening to history", () => {
    const page = renderPage();

    page.clear();

    assert.equal(host.innerHTML, "");

    // The listener the page installed must be gone; if it is not, this
    // navigation renders into a container that is no longer on screen.
    assert.doesNotThrow(() =>
        history.push({ search: "page=docs&section=01-guide" }),
    );
    assert.equal(host.innerHTML, "");
});
