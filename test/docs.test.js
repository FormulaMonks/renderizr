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
const { documentationScopes } = await importSrc("model/documentation");

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

/** The documentation scopes of a workspace whose own sections are these. */
const workspaceOf = (sections) =>
    documentationScopes({ name: "Guidebook", documentation: { sections } });

const renderPage = (sections = [GUIDE, OPERATIONS]) => {
    const page = new Docs(host, "docs", workspaceOf(sections));
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

test("a URL naming a heading opens the page that holds it and scrolls there", () => {
    // What a link from another section — `01-guide.md#requirements` — turns
    // into: the heading is on the Install page, not a page of its own.
    renderPage();
    document.scrolledIntoView.length = 0;

    history.push({
        search: "?page=docs&section=01-guide&subsection=requirements",
    });

    assert.equal(visible()[0], "H1:Install");
    // Pages rendered by earlier tests are still listening to the shared
    // history, so the count is not this page's to pin; the target is.
    const scrolled = document.scrolledIntoView.map((entry) => entry.id);
    assert.ok(scrolled.length, "nothing was scrolled into view");
    assert.ok(
        scrolled.every((id) => id === "requirements"),
        `${scrolled}`,
    );
    assert.equal(
        params().get("subsection"),
        "install",
        "the URL names the page",
    );
});

test("a URL naming a heading on the page being read only scrolls", () => {
    renderPage();
    menuItem("Install").click();
    document.scrolledIntoView.length = 0;

    history.push({
        search: "?page=docs&section=01-guide&subsection=requirements",
    });

    assert.equal(visible()[0], "H1:Install");
    // Pages rendered by earlier tests are still listening to the shared
    // history, so the count is not this page's to pin; the target is.
    const scrolled = document.scrolledIntoView.map((entry) => entry.id);
    assert.ok(scrolled.length, "nothing was scrolled into view");
    assert.ok(
        scrolled.every((id) => id === "requirements"),
        `${scrolled}`,
    );
});

test("a heading with an ampersand is a page the menu can open", () => {
    // Its id used to be percent-encoded, and was encoded again on its way into
    // the URL, so the page could never be found from its own menu entry.
    renderPage([
        {
            filename: "06-glossary.md",
            order: 1,
            title: "Glossary",
            content:
                "# Glossary\n\nTerms.\n\n## People & parties\n\nOne.\n\n## Customs & documentation terms\n\nTwo.\n",
        },
    ]);

    menuItem("Customs & documentation terms").click();

    assert.deepEqual(visible(), ["H1:Customs & documentation terms", "P:Two."]);
    assert.equal(params().get("subsection"), "customs--documentation-terms");
});

test("links between sections are routed through the resolver it was given", () => {
    const page = new Docs(
        host,
        "docs",
        workspaceOf([
            {
                ...GUIDE,
                content: `${GUIDE.content}\nSee [ops](02-operations.md).\n`,
            },
            OPERATIONS,
        ]),
        () => (href) =>
            href === "02-operations.md"
                ? "#/?page=docs&section=02-operations"
                : undefined,
    );
    page.render();
    menuItem("Configure").click();

    assert.ok(
        document.querySelector(
            '.markdown-renderer a[href="#/?page=docs&section=02-operations"]',
        ),
        "the sibling link was not rerouted",
    );
});

/* ---------------------------------------------------- documentation scopes */

const section = (filename, order, content) => ({ filename, order, content });

const IBS_CONTEXT = section(
    "01-context.md",
    1,
    "# Context\n\nWhy it exists.\n",
);
const IBS_DEPLOYMENT = section(
    "02-deployment.md",
    2,
    "# Deployment\n\nWhere it runs.\n",
);
// The author titles the element's first section after the element.
const API_OVERVIEW = section(
    "01-overview.md",
    1,
    "# API Application\n\nServes JSON.\n",
);
const API_OPERATIONS = section(
    "02-operations.md",
    2,
    "# Operations\n\nKeep it up.\n\n## Restarts\n\nRestart it.\n\n## Alerts\n\nPage someone.\n\n### Paging\n\nAt night too.\n",
);
const MAINFRAME_NOTES = section("01-notes.md", 1, "# Notes\n\nOld iron.\n");

/** A workspace with documentation on itself and on three of its elements. */
const bigBank = (own = [GUIDE]) => ({
    name: "Big Bank plc",
    documentation: { sections: own },
    model: {
        softwareSystems: [
            {
                id: "1",
                name: "Internet Banking System",
                documentation: { sections: [IBS_CONTEXT, IBS_DEPLOYMENT] },
                containers: [
                    {
                        id: "2",
                        name: "API Application",
                        documentation: {
                            sections: [API_OPERATIONS, API_OVERVIEW],
                        },
                    },
                ],
            },
            { id: "3", name: "Email System" },
            {
                id: "4",
                name: "Mainframe Banking System",
                documentation: { sections: [MAINFRAME_NOTES] },
            },
        ],
    },
});

const renderScopes = (workspace = bigBank(), ...resolvers) => {
    const page = new Docs(
        host,
        "docs",
        documentationScopes(workspace),
        ...resolvers,
    );
    page.render();
    return page;
};

const breadcrumb = () => document.getElementById("docs-breadcrumb").textContent;

const pagerText = () =>
    document
        .querySelectorAll("#docs-pager button")
        .map((button) => button.textContent.replace(/\s+/g, " ").trim());

test("the scope tree opens only the scope on screen, its children nested under their element", () => {
    renderScopes();

    assert.deepEqual(menuEntries(), [
        "0:Big Bank plc",
        "1:Guide",
        "2:Install",
        "2:Configure",
        "0:Internet Banking System",
        "1:API Application",
        "0:Mainframe Banking System",
    ]);
});

test("a closed scope opens on its first page, and then it alone shows its sections", () => {
    renderScopes();

    menuItem("Internet Banking System").click();

    assert.deepEqual(visible(), ["H1:Context", "P:Why it exists."]);
    assert.equal(params().get("section"), "internet-banking-system/01-context");
    assert.deepEqual(menuEntries(), [
        "0:Big Bank plc",
        "0:Internet Banking System",
        "1:Context",
        "1:Deployment",
        "1:API Application",
        "0:Mainframe Banking System",
    ]);
});

test("a container's scope opens under its software system, which stays closed", () => {
    history.replace({
        search: "?page=docs&section=internet-banking-system/api-application/02-operations&subsection=alerts",
    });
    renderScopes();

    assert.deepEqual(menuEntries(), [
        "0:Big Bank plc",
        "0:Internet Banking System",
        "1:API Application",
        "2:API Application",
        "2:Operations",
        "3:Restarts",
        "3:Alerts",
        "4:Paging",
        "0:Mainframe Banking System",
    ]);
});

test("titles stay the author's, even when the first section repeats the element's name", () => {
    history.replace({
        search: "?page=docs&section=internet-banking-system/api-application",
    });
    renderScopes();

    const titles = menuEntries().filter((entry) =>
        entry.endsWith(":API Application"),
    );
    assert.deepEqual(titles, ["1:API Application", "2:API Application"]);
    assert.deepEqual(visible(), ["H1:API Application", "P:Serves JSON."]);
});

test("the pager runs through every scope in menu order, naming the scope it crosses into", () => {
    renderScopes();

    menuItem("Configure").click();
    assert.deepEqual(pagerText(), [
        "Previous Install",
        "Next Internet Banking System › Context Context",
    ]);

    document.querySelectorAll("#docs-pager button").at(-1).click();
    assert.deepEqual(pagerText(), [
        "Previous Big Bank plc › Guide Configure",
        "Next Deployment Deployment",
    ]);

    document.querySelectorAll("#docs-pager button").at(-1).click();
    assert.deepEqual(pagerText(), [
        "Previous Context Context",
        "Next API Application › API Application API Application",
    ]);
});

test("the pager ends at the last scope's last page", () => {
    history.replace({
        search: "?page=docs&section=mainframe-banking-system/01-notes",
    });
    renderScopes();

    assert.deepEqual(pagerText(), [
        "Previous API Application › Operations Alerts",
    ]);
});

test("the breadcrumb names an element's scope by type and name, and the workspace's adds nothing", () => {
    renderScopes();
    assert.equal(breadcrumb(), "");
    menuItem("Install").click();
    assert.equal(breadcrumb(), "Guide");

    menuItem("Internet Banking System").click();
    assert.equal(breadcrumb(), "Software System: Internet Banking System");

    history.push({
        search: "?page=docs&section=internet-banking-system/api-application/02-operations&subsection=restarts",
    });
    assert.equal(breadcrumb(), "Container: API Application › Operations");
});

test("landing with no section opens the workspace's first section", () => {
    renderScopes();

    assert.deepEqual(visible(), ["H1:Guide", "P:Everything starts here."]);
    assert.equal(params().get("section"), "01-guide");
});

test("landing without workspace sections opens the first scope with sections", () => {
    const workspace = bigBank([]);
    // Decisions alone give the workspace no page of the docs.
    workspace.documentation.decisions = [{ id: "1", title: "Record" }];
    renderScopes(workspace);

    assert.deepEqual(visible(), ["H1:Context", "P:Why it exists."]);
    assert.equal(params().get("section"), "internet-banking-system/01-context");
    assert.equal(menuEntries()[0], "0:Internet Banking System");
});

test("a workspace with no element documentation keeps its flat menu and its addresses", () => {
    renderScopes({
        name: "Big Bank plc",
        documentation: { sections: [GUIDE, OPERATIONS] },
        model: { softwareSystems: [{ id: "1", name: "Internet Banking" }] },
    });

    assert.deepEqual(menuEntries(), [
        "0:Guide",
        "1:Install",
        "1:Configure",
        "0:Operations",
    ]);
    menuItem("Operations").click();
    assert.equal(params().get("section"), "02-operations");
});

test("a heading inside an element's section rides in subsection", () => {
    history.replace({
        search: "?page=docs&section=internet-banking-system/api-application/02-operations&subsection=paging",
    });
    renderScopes();

    assert.equal(visible()[0], "H1:Alerts");
    assert.equal(params().get("subsection"), "alerts");
});

test("an unknown section in a known scope opens that scope's first page", () => {
    history.replace({
        search: "?page=docs&section=internet-banking-system/99-nope",
    });
    renderScopes();

    assert.deepEqual(visible(), ["H1:Context", "P:Why it exists."]);
});

test("each scope's sections render through the link and image resolvers of their own scope", () => {
    const asked = [];
    const workspace = bigBank();
    workspace.model.softwareSystems[0].documentation.sections[0] = section(
        "01-context.md",
        1,
        "# Context\n\nSee [deployment](02-deployment.md).\n\n![Map](map.png)\n",
    );
    renderScopes(
        workspace,
        (scope) => (href) => {
            asked.push(`link ${scope}`);
            return href === "02-deployment.md"
                ? `#/?page=docs&section=${scope}/02-deployment`
                : undefined;
        },
        (scope) => (src) => {
            asked.push(`image ${scope}`);
            return src === "map.png"
                ? `data:image/png;base64,${scope}`
                : undefined;
        },
    );

    menuItem("Internet Banking System").click();

    assert.ok(
        document.querySelector(
            '.markdown-renderer a[href="#/?page=docs&section=internet-banking-system/02-deployment"]',
        ),
        "the link was not resolved in its own scope",
    );
    assert.equal(
        document.querySelector(".markdown-renderer img")?.getAttribute("src"),
        "data:image/png;base64,internet-banking-system",
    );
    assert.ok(asked.includes("link internet-banking-system"), `${asked}`);
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
