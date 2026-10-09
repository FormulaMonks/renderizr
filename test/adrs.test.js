/**
 * `src/pages/adrs.ts` — the decision log.
 *
 * The question a reader arrives with is "which of these still stand?", so the
 * landing view is the whole set rather than one decision, and the status of
 * each is load-bearing: an "Accepted" that renders as "Draft" is a wrong
 * answer to the only question being asked. That mapping, the ordering, the
 * deep link, and the cross-references between decisions are what these cover.
 *
 * The page reaches for `document.getElementById` throughout, so it is mounted
 * into the document rather than into a detached node.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach } from "node:test";
import { DOMEvent } from "./support/dom.js";
import history from "./support/history.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { default: Decisions } = await importSrc("pages/adrs");

const { document, window } = dom;

const WORKSPACE = JSON.parse(
    readFileSync(
        new URL("../scripts/__fixtures__/workspace.json", import.meta.url),
        "utf-8",
    ),
);

const FIXTURE_DECISIONS = WORKSPACE.documentation.decisions;

let host;

beforeEach(() => {
    dom.reset();
    host = dom.mount("page-content");
    history.replace({ search: "?page=adrs", hash: "" });
});

/** Render the page and run the deferred first paint. */
const renderPage = (decisions = FIXTURE_DECISIONS) => {
    const page = new Decisions(host, "adrs", decisions);
    page.render();
    dom.runTimers();
    return page;
};

const decision = (id, overrides = {}) => ({
    id,
    title: `Decision ${id}`,
    // Midday, not midnight: a UTC midnight lands on the previous day west of
    // Greenwich, which would make the year grouping depend on where the suite
    // is run.
    date: "2024-01-01T12:00:00Z",
    status: "Accepted",
    content: `# ${id}. Decision ${id}\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\nBecause.\n`,
    ...overrides,
});

const menuLinks = () =>
    document
        .querySelectorAll("#adrs-menu a[data-item-id]")
        .map((link) => link.textContent);

const summaryLinks = () =>
    document
        .querySelectorAll("#decision-content li a")
        .map((link) => link.textContent);

const title = () => document.getElementById("decision-title");
const content = () => document.getElementById("decision-content");

/* ---------------------------------------------------------------- summary -- */

test("the landing view is every decision, not the first one", () => {
    renderPage();

    assert.equal(title().innerHTML, "");
    assert.deepEqual(summaryLinks(), [
        "0002 Inline every asset for single-file output",
        "0001 Render diagrams in the browser",
    ]);
});

test("the summary counts how many decisions are still in force", () => {
    renderPage();

    // One Accepted, one Proposed: only the first governs anything.
    assert.equal(
        content().querySelector("p").textContent,
        "2 recorded, 1 currently in force.",
    );
});

test("amended decisions count as in force; rejected and superseded do not", () => {
    renderPage([
        decision("1", { status: "Accepted" }),
        decision("2", { status: "Amended" }),
        decision("3", { status: "Superseded" }),
        decision("4", { status: "Rejected" }),
        decision("5", { status: "Proposed" }),
    ]);

    assert.equal(
        content().querySelector("p").textContent,
        "5 recorded, 2 currently in force.",
    );
});

test("decisions are grouped by year, newest year first", () => {
    renderPage([
        decision("1", { date: "2022-06-01T12:00:00Z" }),
        decision("2", { date: "2024-03-01T12:00:00Z" }),
        decision("3", { date: "2023-01-01T12:00:00Z" }),
    ]);

    assert.deepEqual(
        content()
            .querySelectorAll("h3")
            .map((heading) => heading.textContent),
        ["2024", "2023", "2022"],
    );
});

test("a decision with no date is grouped as Undated", () => {
    renderPage([decision("1", { date: "" })]);

    assert.deepEqual(
        content()
            .querySelectorAll("h3")
            .map((heading) => heading.textContent),
        ["Undated"],
    );
});

test("each status gets the class its color comes from", () => {
    renderPage([
        decision("1", { status: "Accepted" }),
        decision("2", { status: "Proposed" }),
        decision("3", { status: "Amended" }),
        decision("4", { status: "Superseded" }),
        decision("5", { status: "Deprecated" }),
        decision("6", { status: "Rejected" }),
        decision("7", { status: "" }),
    ]);

    const pills = content()
        .querySelectorAll("li span[class*=status]")
        .map((pill) => `${pill.textContent}:${pill.className.split(" ")[1]}`);

    assert.deepEqual(pills.toSorted(), [
        "Accepted:accepted",
        "Amended:amended",
        "Deprecated:superseded",
        "Proposed:draft",
        "Rejected:superseded",
        "Superseded:superseded",
        "Unknown:draft",
    ]);
});

/* ------------------------------------------------------------------ order -- */

test("the menu lists decisions newest first", () => {
    renderPage();

    assert.deepEqual(menuLinks(), [
        "0002 Inline every asset for single-file output",
        "0001 Render diagrams in the browser",
    ]);
});

test("decisions recorded on the same day are ordered by number", () => {
    renderPage([
        decision("7", { date: "2024-05-05T12:00:00Z" }),
        decision("9", { date: "2024-05-05T12:00:00Z" }),
        decision("8", { date: "2024-05-05T12:00:00Z" }),
    ]);

    assert.deepEqual(menuLinks(), [
        "0009 Decision 9",
        "0008 Decision 8",
        "0007 Decision 7",
    ]);
});

/* -------------------------------------------------------------- numbers -- */

test("decision numbers read as four digits wherever they appear", () => {
    const cases = [
        { id: "7", number: "0007" },
        { id: "42", number: "0042" },
        { id: "1234", number: "1234" },
        { id: "12345", number: "12345" },
        // Not a number, so there is nothing to pad: it shows as written.
        { id: "adr-x", number: "adr-x" },
    ];

    for (const { id, number } of cases) {
        dom.reset();
        host = dom.mount("page-content");
        history.replace({ search: `?page=adrs&adr=${id}`, hash: "" });
        renderPage([decision(id)]);

        const menuNumber = document.querySelector(
            `#adrs-menu a[data-item-id="${id}"] span.number`,
        );
        assert.equal(menuNumber?.textContent, number, `menu entry for ${id}`);

        const titleNumber = title().querySelector("h2 span.number");
        assert.equal(titleNumber?.textContent, number, `heading for ${id}`);
        assert.equal(
            title().querySelector("h2").textContent,
            `${number} Decision ${id}`,
            `the heading of ${id} reads number, then title`,
        );
    }
});

test("the summary rows show the four-digit number before the title", () => {
    renderPage();

    assert.deepEqual(
        content()
            .querySelectorAll("li a span.number")
            .map((span) => span.textContent),
        ["0002", "0001"],
    );
});

test("the narrow-screen select shows four-digit numbers", () => {
    dom.setViewportWidth(600);
    renderPage();

    assert.deepEqual(
        document
            .querySelectorAll("#adrs-menu option")
            .map((option) => option.textContent),
        [
            "0002 Inline every asset for single-file output",
            "0001 Render diagrams in the browser",
        ],
    );
});

test("switching between the list and the select redraws the menu and keeps the open decision", () => {
    history.replace({ search: "?page=adrs&adr=1" });
    renderPage();

    dom.setViewportWidth(600);

    assert.equal(
        document.querySelector("#adrs-menu select")?.value,
        "1",
        "the select opens on the open decision",
    );

    dom.setViewportWidth(1280);

    const active = document.querySelector("#adrs-menu a.active");
    assert.equal(active?.dataset.itemId, "1", "the list marks the open one");
    assert.equal(active.textContent, "0001 Render diagrams in the browser");
    assert.equal(
        title().querySelector("h2").textContent,
        "0001 Render diagrams in the browser",
        "a redraw is not a navigation; the open decision stays open",
    );
});

/* --------------------------------------------------------- decision graph -- */

/**
 * Four decisions linked every way a workspace links them: 4 supersedes 1 and
 * says so, 2 states from its own side that 4 amends it, 4 references 3 in a
 * wording nobody knows, and 3 references 1.
 */
const LINKED = [
    decision("1", {
        date: "2024-01-01T12:00:00Z",
        status: "Superseded",
        links: [{ id: "4", description: "Superseded by" }],
    }),
    decision("2", {
        date: "2024-02-01T12:00:00Z",
        status: "Amended",
        links: [{ id: "4", description: "Amended by" }],
    }),
    decision("3", {
        date: "2024-03-01T12:00:00Z",
        links: [{ id: "1", description: "References" }],
    }),
    decision("4", {
        date: "2024-04-01T12:00:00Z",
        status: "Proposed",
        links: [
            { id: "1", description: "Supersedes" },
            { id: "3", description: "Clarifies" },
        ],
    }),
];

const graph = () => document.querySelector("#adrs-menu [data-decision-graph]");

/** Each dot's meaning, as the drawing records it, in drawing order. */
const dots = () =>
    document.querySelectorAll('#adrs-menu [data-mark="dot"]').map((dot) => ({
        decision: dot.getAttribute("data-decision"),
        status: dot.getAttribute("data-status"),
    }));

/** Each elbow's meaning, as the drawing records it, sorted for comparison. */
const elbows = () =>
    document
        .querySelectorAll('#adrs-menu [data-mark="edge"]')
        .map((edge) => ({
            kind: edge.getAttribute("data-kind"),
            from: edge.getAttribute("data-from"),
            to: edge.getAttribute("data-to"),
            status: edge.getAttribute("data-status"),
        }))
        .sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`));

/** The decisions whose dots the drawing marks as highlighted. */
const highlightedDots = () =>
    document
        .querySelectorAll('#adrs-menu [data-mark="dot"][data-highlighted]')
        .map((dot) => dot.getAttribute("data-decision"))
        .sort();

const open = (id) =>
    document.querySelector(`#adrs-menu a[data-item-id="${id}"]`).click();

test("the decision graph starts collapsed beside the menu", () => {
    renderPage(LINKED);

    assert.equal(graph()?.getAttribute("data-state"), "collapsed");
});

test("the collapsed decision graph draws a dot per decision, colored by its status, in menu order", () => {
    renderPage(LINKED);

    assert.deepEqual(dots(), [
        { decision: "4", status: "draft" },
        { decision: "3", status: "accepted" },
        { decision: "2", status: "amended" },
        { decision: "1", status: "superseded" },
    ]);
});

test("dots take the same status as the pill, older spellings included", () => {
    renderPage([
        decision("1", { status: "Rejected" }),
        decision("2", { status: "Deprecated" }),
        decision("3", { status: "Proposed" }),
        decision("4", { status: "Something new" }),
    ]);

    assert.deepEqual(
        dots().map((dot) => dot.status),
        ["draft", "draft", "superseded", "superseded"],
    );
});

test("no elbow shows until a decision opens", () => {
    renderPage(LINKED);

    assert.deepEqual(elbows(), []);
    assert.deepEqual(highlightedDots(), [], "nothing is highlighted either");
});

test("opening a decision draws an elbow to each decision it links to, by kind and older status", () => {
    renderPage(LINKED);

    open("4");

    assert.deepEqual(elbows(), [
        { kind: "supersede", from: "4", to: "1", status: "superseded" },
        // Stated only by 2, in its own words.
        { kind: "amend", from: "4", to: "2", status: "amended" },
        // A wording nobody knows is a reference.
        { kind: "reference", from: "4", to: "3", status: "accepted" },
    ]);
});

test("the open decision's dot and the dots it links to are highlighted", () => {
    renderPage(LINKED);

    open("3");

    assert.deepEqual(highlightedDots(), ["1", "3", "4"]);
    assert.equal(
        document
            .querySelector('#adrs-menu [data-mark="dot"][data-open]')
            ?.getAttribute("data-decision"),
        "3",
        "the open decision's dot says so",
    );
});

test("opening another decision redraws the elbows for it", () => {
    renderPage(LINKED);

    open("4");
    open("1");

    assert.deepEqual(elbows(), [
        { kind: "reference", from: "3", to: "1", status: "superseded" },
        { kind: "supersede", from: "4", to: "1", status: "superseded" },
    ]);
});

test("a decision opened from the URL draws its elbows on first paint", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(LINKED);

    assert.deepEqual(elbows(), [
        { kind: "amend", from: "4", to: "2", status: "amended" },
    ]);
});

test("All decisions clears the elbows", () => {
    renderPage(LINKED);

    open("4");
    document.getElementById("adrs-summary").click();

    assert.deepEqual(elbows(), []);
    assert.deepEqual(highlightedDots(), []);
});

test("the narrow-screen select carries no decision graph, and it comes back with the list", () => {
    history.replace({ search: "?page=adrs&adr=4" });
    renderPage(LINKED);

    dom.setViewportWidth(600);
    assert.deepEqual(dots(), [], "no dots beside a select");

    dom.setViewportWidth(1280);
    assert.equal(dots().length, 4, "the list gets its dots back");
    assert.equal(elbows().length, 3, "and the open decision its elbows");
});

/* -------------------------------------------------------------- selection -- */

test("choosing a decision shows its title, date and status", () => {
    renderPage();

    document.querySelector('#adrs-menu a[data-item-id="1"]').click();

    assert.equal(
        title().querySelector("h2").textContent,
        "0001 Render diagrams in the browser",
    );
    assert.match(title().querySelector("p").textContent, /2024/);
    assert.equal(
        title().querySelector("span[class*=status]").textContent,
        "Accepted",
    );
});

test("choosing a decision renders its body as markdown", () => {
    renderPage();

    document.querySelector('#adrs-menu a[data-item-id="1"]').click();

    const headings = content()
        .querySelectorAll("h2, h3")
        .map((heading) => heading.textContent);

    assert.deepEqual(headings, ["Context", "Decision", "Consequences"]);
    assert.match(content().textContent, /draws views client side/);
});

test("the body drops the title, the date line and a bare status", () => {
    // All three already appear above the body; repeating them is noise.
    renderPage();

    document.querySelector('#adrs-menu a[data-item-id="1"]').click();

    assert.equal(
        content().textContent.includes("Date: 2024-01-15"),
        false,
        "the date line is shown as a formatted date above the body",
    );
    assert.equal(
        content().querySelectorAll("blockquote").length,
        0,
        "a status that says only 'Accepted' is not a note worth quoting",
    );
});

test("a supersession note survives, because nothing else records it", () => {
    renderPage([
        decision("15", {
            content:
                "# 15. Old\n\nDate: 2024-01-01\n\n## Status\n\nAmended\n\nAmends 12.\n\nAmended by 39.\n\n## Context\n\nBecause.\n",
            status: "Amended",
        }),
    ]);

    document.querySelector('#adrs-menu a[data-item-id="15"]').click();

    const quote = content().querySelector("blockquote");

    assert.match(quote.textContent, /Amends 12\./);
    assert.match(quote.textContent, /Amended by 39\./);
    assert.equal(
        quote.querySelectorAll("br").length,
        1,
        "the two facts are separate lines, not one run-on paragraph",
    );
});

test("choosing a decision records it in the URL", () => {
    renderPage();

    document.querySelector('#adrs-menu a[data-item-id="2"]').click();

    assert.equal(new URLSearchParams(history.location.search).get("adr"), "2");
});

test("the decision named in the URL is the one that opens", () => {
    history.replace({ search: "?page=adrs&adr=1" });

    renderPage();

    assert.equal(
        title().querySelector("h2").textContent,
        "0001 Render diagrams in the browser",
    );
});

test("opening on a deep link does not add a history entry to go back through", () => {
    history.replace({ search: "?page=adrs&adr=1" });
    const depth = window.history.length;

    renderPage();

    assert.equal(window.history.length, depth);
});

/* ---------------------------------------------------- cross-references -- */

test("a link to another decision inside the body opens that decision", () => {
    // The only place the supersedes relationship is visible; a link that goes
    // nowhere is the bug this guards.
    renderPage([
        decision("1"),
        decision("2", {
            content:
                "# 2. Second\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\nSee [1. First](#1).\n",
        }),
    ]);

    document.querySelector('#adrs-menu a[data-item-id="2"]').click();
    content().querySelector('a[href="#1"]').click();

    assert.equal(title().querySelector("h2").textContent, "0001 Decision 1");
    assert.equal(new URLSearchParams(history.location.search).get("adr"), "1");
});

test("a link to something that is not a decision is left alone", () => {
    renderPage([
        decision("1", {
            content:
                "# 1. First\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\nSee [the heading](#context).\n",
        }),
    ]);

    document.querySelector('#adrs-menu a[data-item-id="1"]').click();

    const link = content().querySelector('a[href="#context"]');
    const event = new DOMEvent("click", { bubbles: true });
    link.dispatchEvent(event);

    // An ordinary heading anchor is the markdown renderer's business: it
    // scrolls the heading into view, and the decision page stays put.
    assert.equal(title().querySelector("h2").textContent, "0001 Decision 1");
    assert.deepEqual(
        document.scrolledIntoView.map((entry) => entry.id),
        ["context"],
    );
});

test("a heading anchor that starts with a number does not open that decision", () => {
    // `## 1. Option A` is `#1-option-a`. Only the first run of digits used to
    // be read, so following it opened decision 1 instead of scrolling.
    renderPage([
        decision("1"),
        decision("2", {
            content:
                "# 2. Second\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\nSee [option A](#1-option-a).\n\n## 1. Option A\n\nThis one.\n",
        }),
    ]);

    document.querySelector('#adrs-menu a[data-item-id="2"]').click();
    content().querySelector('a[href="#1-option-a"]').click();

    assert.equal(title().querySelector("h2").textContent, "0002 Decision 2");
    assert.deepEqual(
        document.scrolledIntoView.map((entry) => entry.id),
        ["1-option-a"],
    );
});

test("a relative link to another decision is routed through the resolver", () => {
    const page = new Decisions(
        host,
        "adrs",
        [
            decision("1"),
            decision("2", {
                content:
                    "# 2. Second\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\nSee [the first](0001-first.md).\n",
            }),
        ],
        (href) => (href === "0001-first.md" ? "#/?page=adrs&adr=1" : undefined),
    );
    page.render();
    dom.runTimers();

    document.querySelector('#adrs-menu a[data-item-id="2"]').click();

    assert.ok(content().querySelector('a[href="#/?page=adrs&adr=1"]'));
});

/* ------------------------------------------------------- back to summary -- */

test("All decisions returns to the summary and drops the decision from the URL", () => {
    renderPage();

    document.querySelector('#adrs-menu a[data-item-id="2"]').click();
    document.getElementById("adrs-summary").click();

    assert.equal(title().innerHTML, "");
    assert.equal(summaryLinks().length, 2);
    assert.equal(
        new URLSearchParams(history.location.search).has("adr"),
        false,
    );
});

/* ------------------------------------------------------------------ clear -- */

test("clear() empties the page and detaches its listeners", () => {
    const page = renderPage();

    page.clear();

    assert.equal(host.innerHTML, "");
    assert.equal(document.getElementById("decision-content"), null);
});
