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

const { default: Decisions, indexColumnCap } = await importSrc("pages/adrs");

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

const index = () => document.getElementById("adrs-index");
const menuSection = () => document.getElementById("adrs-menu");
const decisionSection = () => document.getElementById("decision");

const indexRows = () => index().querySelectorAll("a[data-item-id]");

/** Each index row as a reader sees it: number, status and title. */
const indexEntries = () =>
    indexRows().map((row) =>
        row
            .querySelectorAll("span")
            .map((span) => span.textContent)
            .join(" | "),
    );

const title = () => document.getElementById("decision-title");
const content = () => document.getElementById("decision-content");

/* ------------------------------------------------------------------ index -- */

test("with no decision open, the page shows the index and hides the menu", () => {
    renderPage();

    assert.equal(index().hidden, false, "the index shows");
    assert.equal(menuSection().hidden, true, "the menu hides");
    assert.equal(decisionSection().hidden, true, "no decision body shows");
    assert.equal(title().innerHTML, "");
    assert.equal(
        content().querySelector("li"),
        null,
        "the summary list is gone",
    );
});

test("the index lists every decision with its four-digit number, status and full title", () => {
    renderPage();

    assert.equal(index().querySelector("h2").textContent, "Decisions");
    assert.deepEqual(indexEntries(), [
        "0002 | Proposed | Inline every asset for single-file output",
        "0001 | Accepted | Render diagrams in the browser",
    ]);
});

test("the index counts how many decisions are still in force", () => {
    renderPage();

    // One Accepted, one Proposed: only the first governs anything.
    assert.equal(
        index().querySelector("p").textContent,
        "2 recorded, 1 in force",
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
        index().querySelector("p").textContent,
        "5 recorded, 2 in force",
    );
});

test("the index groups decisions by year, newest year first", () => {
    renderPage([
        decision("1", { date: "2022-06-01T12:00:00Z" }),
        decision("2", { date: "2024-03-01T12:00:00Z" }),
        decision("3", { date: "2023-01-01T12:00:00Z" }),
    ]);

    assert.deepEqual(
        index()
            .querySelectorAll("h3")
            .map((heading) => heading.textContent),
        ["2024", "2023", "2022"],
    );
});

test("a decision with no date is grouped as Undated", () => {
    renderPage([decision("1", { date: "" })]);

    assert.deepEqual(
        index()
            .querySelectorAll("h3")
            .map((heading) => heading.textContent),
        ["Undated"],
    );
    assert.equal(indexRows()[0].title, "", "with no date for a tooltip");
});

test("a row's date is its tooltip", () => {
    renderPage();

    const expected = new Date("2024-01-15").toLocaleDateString(undefined, {
        dateStyle: "long",
    });
    assert.equal(index().querySelector('a[data-item-id="1"]').title, expected);
});

test("each status in the index gets the class its color comes from", () => {
    renderPage([
        decision("1", { status: "Accepted" }),
        decision("2", { status: "Proposed" }),
        decision("3", { status: "Amended" }),
        decision("4", { status: "Superseded" }),
        decision("5", { status: "Deprecated" }),
        decision("6", { status: "Rejected" }),
        decision("7", { status: "" }),
    ]);

    const statuses = index()
        .querySelectorAll("a span[class*=indexStatus]")
        .map((span) => `${span.textContent}:${span.className.split(" ")[1]}`);

    assert.deepEqual(statuses.toSorted(), [
        "Accepted:accepted",
        "Amended:amended",
        "Deprecated:superseded",
        "Proposed:draft",
        "Rejected:superseded",
        "Superseded:superseded",
        "Unknown:draft",
    ]);
});

test("clicking a row opens the decision with the menu and records it in the URL", () => {
    renderPage();

    index().querySelector('a[data-item-id="1"]').click();

    assert.equal(new URLSearchParams(history.location.search).get("adr"), "1");
    assert.equal(index().hidden, true, "the index hides");
    assert.equal(menuSection().hidden, false, "the menu shows");
    assert.equal(decisionSection().hidden, false, "the decision shows");
    assert.equal(
        title().querySelector("h2").textContent,
        "0001 Render diagrams in the browser",
    );
});

test("a decision opened from the URL shows the menu, not the index", () => {
    history.replace({ search: "?page=adrs&adr=1" });
    renderPage();

    assert.equal(index().hidden, true);
    assert.equal(menuSection().hidden, false);
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

/** The decisions whose dots the collapsed gutter dims. */
const dimmedDots = () =>
    document
        .querySelectorAll('#adrs-menu [data-mark="dot"][data-dimmed]')
        .map((dot) => dot.getAttribute("data-decision"))
        .sort();

test("the collapsed gutter dims every dot outside the open decision's links", () => {
    renderPage([...LINKED, decision("5", { date: "2024-05-01T12:00:00Z" })]);

    assert.deepEqual(dimmedDots(), [], "nothing dims while nothing is open");

    open("3");
    assert.deepEqual(dimmedDots(), ["2", "5"]);

    open("5");
    assert.deepEqual(highlightedDots(), [], "5 links to nothing");
    assert.deepEqual(dimmedDots(), ["1", "2", "3", "4", "5"]);
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

/* ------------------------------------------------ expanded decision graph -- */

const controls = () => document.getElementById("adrs-controls");
const expandToggle = () => document.getElementById("adrs-expand");
const expand = () => expandToggle().click();

/** Each mark of one kind, by what it means, sorted for comparison. */
const marks = (mark) =>
    document
        .querySelectorAll(`#adrs-menu [data-mark="${mark}"]`)
        .map((element) => ({
            kind: element.getAttribute("data-kind"),
            from: element.getAttribute("data-from"),
            to: element.getAttribute("data-to"),
            status: element.getAttribute("data-status"),
            lane: element.getAttribute("data-lane"),
        }))
        .sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`));

test("the controls bar sits above the menu, outside its scroll area, with All decisions and the expand toggle", () => {
    renderPage(LINKED);

    const bar = controls();
    assert.ok(bar, "the page has a controls bar");
    assert.equal(
        bar.querySelector("#adrs-summary")?.textContent,
        "All decisions",
    );
    assert.ok(bar.querySelector("#adrs-expand"), "it holds the expand toggle");

    const scrollArea = document.getElementById("adrs-scroll");
    assert.ok(
        scrollArea.querySelector("a[data-item-id]"),
        "the menu's entries scroll",
    );
    assert.ok(
        scrollArea.querySelector("[data-decision-graph]"),
        "and the decision graph scrolls with them",
    );
    assert.equal(
        scrollArea.querySelector("#adrs-controls"),
        null,
        "the controls bar stays out of the scroll area",
    );
});

test("the expand toggle expands the decision graph, and pressing it again collapses it", () => {
    renderPage(LINKED);

    assert.equal(expandToggle().getAttribute("aria-expanded"), "false");

    expand();
    assert.equal(graph().getAttribute("data-state"), "expanded");
    assert.equal(expandToggle().getAttribute("aria-expanded"), "true");

    expand();
    assert.equal(graph().getAttribute("data-state"), "collapsed");
    assert.equal(expandToggle().getAttribute("aria-expanded"), "false");
});

test("the expanded decision graph draws each lane's stretches by kind and the older decision's status", () => {
    renderPage(LINKED);

    expand();

    assert.deepEqual(marks("stretch"), [
        // 4 supersedes 1 and amends 2, so 1, 2 and 4 share a lane: 4 amends
        // 2 along it, and 4's supersede of 1 carries the stretch below 2.
        {
            kind: "supersede",
            from: "2",
            to: "1",
            status: "superseded",
            lane: "1",
        },
        { kind: "amend", from: "4", to: "2", status: "amended", lane: "1" },
        // 4 references 3, so 3 gets a lane that only carries references.
        {
            kind: "reference",
            from: "4",
            to: "3",
            status: "accepted",
            lane: "3",
        },
    ]);
});

test("a reference joins the lane of the decision it links to", () => {
    renderPage(LINKED);

    expand();

    assert.deepEqual(marks("join"), [
        {
            kind: "reference",
            from: "3",
            to: "1",
            status: "superseded",
            lane: "1",
        },
        {
            kind: "reference",
            from: "4",
            to: "3",
            status: "accepted",
            lane: "3",
        },
    ]);
});

test("every dot in the expanded decision graph sits on its lane, or alone", () => {
    renderPage([...LINKED, decision("5", { date: "2024-05-01T12:00:00Z" })]);

    expand();

    assert.deepEqual(
        document
            .querySelectorAll('#adrs-menu [data-mark="dot"]')
            .map((dot) => [
                dot.getAttribute("data-decision"),
                dot.getAttribute("data-lane"),
            ]),
        [
            ["5", null],
            ["4", "1"],
            ["3", "3"],
            ["2", "1"],
            ["1", "1"],
        ],
    );
});

test("the expanded decision graph draws no elbows, and collapsing brings them back", () => {
    history.replace({ search: "?page=adrs&adr=4" });
    renderPage(LINKED);

    expand();
    assert.deepEqual(elbows(), [], "lanes and joins stand in for elbows");
    assert.equal(
        document
            .querySelector('#adrs-menu [data-mark="dot"][data-open]')
            ?.getAttribute("data-decision"),
        "4",
        "the open decision's dot still says so",
    );

    expand();
    assert.equal(elbows().length, 3);
    assert.deepEqual(marks("stretch"), [], "and the lanes go");
});

/** Each mark of the expanded graph that lights up, by what it means. */
const lit = () =>
    document
        .querySelectorAll("#adrs-menu [data-mark][data-highlighted]")
        .map((mark) => {
            const name = mark.getAttribute("data-mark");
            const decision = mark.getAttribute("data-decision");
            if (decision) return `${name} ${decision}`;
            const kind = mark.getAttribute("data-kind");
            const from = mark.getAttribute("data-from");
            const to = mark.getAttribute("data-to");
            return `${name} ${kind} ${from}-${to} on ${mark.getAttribute("data-lane")}`;
        })
        .sort();

/** Each mark of the expanded graph that dims, by what it means. */
const dimmed = () =>
    document
        .querySelectorAll("#adrs-menu [data-mark][data-dimmed]")
        .map((mark) => {
            const name = mark.getAttribute("data-mark");
            const decision = mark.getAttribute("data-decision");
            if (decision) return `${name} ${decision}`;
            return `${name} ${mark.getAttribute("data-from")}-${mark.getAttribute("data-to")}`;
        })
        .sort();

const LONE = decision("5", { date: "2024-05-01T12:00:00Z" });

test("opening a decision lights its lane with every join on it, its own joins, and only its stretch of other lanes", () => {
    renderPage([...LINKED, LONE]);
    expand();

    open("3");

    assert.deepEqual(
        lit(),
        [
            "dot 1",
            "dot 3",
            "dot 4",
            // 4 joins 3's lane, and 3's lane lights in full.
            "join reference 4-3 on 3",
            // 3's own join into 1's lane.
            "join reference 3-1 on 1",
            // Of 1's lane, only the stretch from 3's join down to 1.
            "stretch reference 3-1 on 1",
            "stretch reference 4-3 on 3",
        ].sort(),
    );
    assert.deepEqual(
        dimmed(),
        ["dot 2", "dot 5", "stretch 2-1", "stretch 4-2"],
        "the rest of 1's lane and every other dot dim",
    );
});

test("opening a decision on a lineage lights every stretch of its lane", () => {
    renderPage([...LINKED, LONE]);
    expand();

    open("2");

    assert.deepEqual(
        lit().filter((mark) => mark.startsWith("stretch")),
        ["stretch amend 4-2 on 1", "stretch supersede 2-1 on 1"],
    );
    assert.deepEqual(
        lit().filter((mark) => mark.startsWith("join")),
        ["join reference 3-1 on 1"],
        "3 joins 2's lane, so its join lights too",
    );
    assert.deepEqual(
        dimmed(),
        ["dot 5", "join 4-3", "stretch 4-3"],
        "3's dot lights with its join, so the join never starts at a dimmed dot",
    );
});

test("opening a decision with no links dims the whole graph, its own dot too, and the ring still marks it", () => {
    renderPage([...LINKED, LONE]);
    expand();

    open("5");

    assert.deepEqual(lit(), []);
    assert.deepEqual(dimmed(), [
        "dot 1",
        "dot 2",
        "dot 3",
        "dot 4",
        "dot 5",
        "join 3-1",
        "join 4-3",
        "stretch 2-1",
        "stretch 4-2",
        "stretch 4-3",
    ]);
    assert.equal(
        document
            .querySelector('#adrs-menu [data-mark="ring"]')
            ?.getAttribute("data-decision"),
        "5",
    );
});

test("nothing lights or dims until a decision opens", () => {
    renderPage([...LINKED, LONE]);
    expand();

    assert.deepEqual(lit(), []);
    assert.deepEqual(dimmed(), []);

    open("3");
    document.getElementById("adrs-summary").click();

    assert.deepEqual(lit(), [], "All decisions puts out the light");
    assert.deepEqual(dimmed(), []);
});

/* --------------------------------------- the cap and the reference column -- */

/**
 * The versioned decision graph fixture: its newest decision, 46, builds on 35
 * others, more lanes than the menu's 30 columns hold.
 */
const GRAPH_DECISIONS = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/decision-graph.json", import.meta.url),
        "utf-8",
    ),
).documentation.decisions;

/** Where every dot sits and how wide the graph is, to compare two draws. */
const geometry = () => ({
    width: graph().querySelector("svg").getAttribute("width"),
    dots: document
        .querySelectorAll('#adrs-menu [data-mark="dot"]')
        .map(
            (dot) =>
                `${dot.getAttribute("data-decision")} ${dot.getAttribute("cx")}`,
        ),
});

test("past the menu's cap, references open no lanes and only supersede and amend lanes remain", () => {
    renderPage(GRAPH_DECISIONS);
    expand();

    assert.equal(graph().getAttribute("data-fallback"), "lineage");
    assert.ok(marks("stretch").length > 0, "supersede and amend lanes draw");
    assert.deepEqual(
        [...marks("stretch"), ...marks("join")].filter(
            (mark) => mark.kind === "reference",
        ),
        [],
        "no reference joins a lane or runs up one",
    );
    assert.deepEqual(marks("edge"), [], "the reference column stays empty");
});

test("past the menu's cap, the reference column carries the open decision's references in full", () => {
    renderPage(GRAPH_DECISIONS);
    expand();

    open("8");

    assert.deepEqual(
        marks("edge").map(({ kind, from, to, lane }) => ({
            kind,
            from,
            to,
            lane,
        })),
        [
            { kind: "reference", from: "8", to: "2", lane: null },
            { kind: "reference", from: "8", to: "5", lane: null },
        ],
    );
    assert.ok(
        document
            .querySelectorAll('#adrs-menu [data-mark="edge"]')
            .every((edge) => edge.hasAttribute("data-highlighted")),
        "every reference on the column lights",
    );
    assert.ok(lit().includes("dot 2") && lit().includes("dot 5"));

    open("46");
    assert.equal(marks("edge").length, 36, "every reference 46 makes");
});

test("opening a decision never moves a column", () => {
    renderPage(GRAPH_DECISIONS);
    expand();
    const closed = geometry();

    open("46");

    assert.deepEqual(geometry(), closed);
});

test("the expand toggle's state survives a reload", () => {
    const page = renderPage(LINKED);
    expand();
    page.clear();

    renderPage(LINKED);

    assert.equal(graph().getAttribute("data-state"), "expanded");
    assert.equal(expandToggle().getAttribute("aria-expanded"), "true");
    assert.ok(marks("stretch").length > 0, "the lanes draw on first paint");
});

test("the decision graph renders collapsed when storage is unavailable, and the toggle still works", () => {
    const realStorage = window.localStorage;
    const refuse = () => {
        throw new Error("SecurityError: storage is unavailable");
    };
    const broken = {
        getItem: refuse,
        setItem: refuse,
        removeItem: refuse,
        clear: refuse,
    };
    window.localStorage = broken;
    globalThis.localStorage = broken;

    try {
        renderPage(LINKED);
        assert.equal(graph().getAttribute("data-state"), "collapsed");

        expand();
        assert.equal(graph().getAttribute("data-state"), "expanded");
    } finally {
        window.localStorage = realStorage;
        globalThis.localStorage = realStorage;
    }
});

test("a stored state the page does not know renders collapsed", () => {
    window.localStorage.setItem("renderizr:decision-graph", "sideways");

    renderPage(LINKED);

    assert.equal(graph().getAttribute("data-state"), "collapsed");
});

/* ----------------------------------------------------------- related only -- */

/**
 * 2 supersedes 1 and 3 amends 2: one lineage. 2 references 5 and 4 references
 * 2. 6 references 4 and 7 supersedes 5, each one step too far from 2. Each
 * body links to every decision it names.
 */
const FAMILY = [
    ["1", "2024-01-01", []],
    ["5", "2024-01-05", []],
    [
        "2",
        "2024-02-01",
        [
            ["1", "Supersedes"],
            ["5", "References"],
        ],
    ],
    ["3", "2024-03-01", [["2", "Amends"]]],
    ["4", "2024-04-01", [["2", "References"]]],
    ["6", "2024-06-01", [["4", "References"]]],
    ["7", "2024-07-01", [["5", "Supersedes"]]],
].map(([id, day, links]) =>
    decision(id, {
        date: `${day}T12:00:00Z`,
        links: links.map(([to, description]) => ({ id: to, description })),
        content: `# ${id}. Decision ${id}\n\nDate: ${day}\n\n## Status\n\nAccepted\n\n## Context\n\n${links.map(([to, description]) => `${description} [${to}. Decision ${to}](#${to}).`).join("\n\n")}\n`,
    }),
);

const relatedOnly = () => document.getElementById("adrs-related");
const menuIds = () =>
    document
        .querySelectorAll("#adrs-menu a[data-item-id]")
        .map((link) => link.getAttribute("data-item-id"));
const dotIds = () => dots().map((dot) => dot.decision);

test("Related only sits at the right of the controls bar, unpressed", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(FAMILY);

    // Compared by id: a failing comparison of two elements would print the
    // whole document.
    assert.equal(
        controls().querySelectorAll("button").at(-1)?.id,
        "adrs-related",
    );
    assert.equal(relatedOnly().textContent, "Related only");
    assert.equal(relatedOnly().getAttribute("aria-pressed"), "false");
});

test("Related only keeps the open decision's lineage and direct references, and shows as pressed", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(FAMILY);

    relatedOnly().click();

    assert.equal(relatedOnly().getAttribute("aria-pressed"), "true");
    assert.deepEqual(menuIds(), ["4", "3", "2", "5", "1"]);
    assert.deepEqual(
        dotIds(),
        ["4", "3", "2", "5", "1"],
        "and so does the graph",
    );
    assert.equal(
        document
            .querySelector('#adrs-menu a[aria-current="true"]')
            ?.getAttribute("data-item-id"),
        "2",
        "the open decision stays open",
    );
});

test("the filtered decision graph is laid out from the related decisions alone", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(FAMILY);

    relatedOnly().click();
    expand();

    assert.ok(
        marks("stretch").every((mark) => mark.from !== "7"),
        "7 supersedes 5, but 7 is hidden",
    );
    assert.ok(
        marks("join").every((mark) => mark.from !== "6"),
        "6 references 4, but 6 is hidden",
    );
});

test("opening another decision while filtered narrows the menu to its relatives, in decision order", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(FAMILY);

    relatedOnly().click();
    open("4");

    assert.deepEqual(menuIds(), ["6", "4", "2"]);
    assert.deepEqual(dotIds(), ["6", "4", "2"]);
    assert.equal(relatedOnly().getAttribute("aria-pressed"), "true");
});

test("the open decision's body still links to decisions the filter hides", () => {
    history.replace({ search: "?page=adrs&adr=4" });
    renderPage(FAMILY);

    relatedOnly().click();
    open("2");
    open("4");

    assert.equal(menuIds().includes("5"), false, "5 is hidden");
    open("2");
    assert.ok(content().querySelector('a[href="#5"]'), "2's body links to 5");

    // Following that link opens 5 and narrows the menu to 5's relatives.
    content().querySelector('a[href="#5"]').click();
    assert.equal(title().querySelector("h2").textContent, "0005 Decision 5");
    assert.deepEqual(menuIds(), ["7", "2", "5"]);
});

test("the filtered, expanded graph still lights the open decision's edges and dims the rest", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(FAMILY);

    relatedOnly().click();
    expand();
    assert.deepEqual(
        lit().filter((mark) => mark.startsWith("dot")),
        ["dot 1", "dot 2", "dot 3", "dot 4", "dot 5"],
        "every decision left is related to 2, so every dot lights",
    );

    open("4");
    assert.deepEqual(lit(), [
        "dot 2",
        "dot 4",
        "dot 6",
        "join reference 4-2 on 2",
        "join reference 6-4 on 4",
        "stretch reference 4-2 on 2",
        "stretch reference 6-4 on 4",
    ]);
    assert.deepEqual(dimmed(), ["stretch 4-2"]);

    // Turning the filter off brings the hidden decisions back, dimmed.
    relatedOnly().click();
    assert.deepEqual(
        dimmed().filter((mark) => mark.startsWith("dot")),
        ["dot 1", "dot 3", "dot 5", "dot 7"],
    );
    assert.deepEqual(
        lit().filter((mark) => mark.startsWith("dot")),
        ["dot 2", "dot 4", "dot 6"],
    );
});

test("pressing Related only again shows every decision", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(FAMILY);

    relatedOnly().click();
    relatedOnly().click();

    assert.equal(relatedOnly().getAttribute("aria-pressed"), "false");
    assert.deepEqual(menuIds(), ["7", "6", "4", "3", "2", "5", "1"]);
    assert.equal(dots().length, 7);
});

test("All decisions turns Related only off and shows every decision", () => {
    history.replace({ search: "?page=adrs&adr=2" });
    renderPage(FAMILY);

    relatedOnly().click();
    document.getElementById("adrs-summary").click();

    assert.equal(relatedOnly().getAttribute("aria-pressed"), "false");
    assert.equal(relatedOnly().hidden, true, "and never shows on the index");
    assert.deepEqual(menuIds(), ["7", "6", "4", "3", "2", "5", "1"]);

    open("4");
    assert.equal(menuIds().length, 7, "opening a decision keeps every one");
});

test("Related only hides while no decision is open", () => {
    renderPage(FAMILY);

    assert.equal(relatedOnly().hidden, true);
    open("2");
    assert.equal(relatedOnly().hidden, false);
});

/* ---------------------------------------------- the index's decision graph -- */

const indexGraph = () =>
    document.querySelector("#adrs-index [data-decision-graph]");

/** The index's marks that light or dim, by what they mean. */
const indexMarks = (emphasis) =>
    document
        .querySelectorAll(`#adrs-index [data-mark][data-${emphasis}]`)
        .map((mark) => {
            const name = mark.getAttribute("data-mark");
            const decision = mark.getAttribute("data-decision");
            if (decision) return `${name} ${decision}`;
            return `${name} ${mark.getAttribute("data-from")}-${mark.getAttribute("data-to")}`;
        })
        .sort();

const indexRow = (id) => index().querySelector(`a[data-item-id="${id}"]`);

const point = (element, type) =>
    element.dispatchEvent(new DOMEvent(type, { bubbles: true }));

test("the index draws the decision graph expanded, beside its rows", () => {
    renderPage([...LINKED, LONE]);

    assert.equal(indexGraph().getAttribute("data-state"), "expanded");
    assert.deepEqual(
        document
            .querySelectorAll('#adrs-index [data-mark="dot"]')
            .map((dot) => dot.getAttribute("data-decision")),
        ["5", "4", "3", "2", "1"],
        "a dot per row, in the index's order",
    );
    assert.ok(
        document.querySelectorAll('#adrs-index [data-mark="stretch"]').length >
            0,
        "with every lane",
    );
});

test("the index stays expanded whatever the menu's decision graph was left as", () => {
    window.localStorage.setItem("renderizr:decision-graph", "collapsed");

    renderPage(LINKED);

    assert.equal(indexGraph().getAttribute("data-state"), "expanded");
});

test("the index has no expand toggle and no Related only", () => {
    renderPage(LINKED);

    // Compared by what they do: a failing comparison of two elements would
    // print the whole document.
    assert.deepEqual(
        index()
            .querySelectorAll("button")
            .map((button) => button.getAttribute("data-scroll-lanes")),
        ["left", "right"],
        "only the ‹ › buttons, for lanes that scroll",
    );
});

test("pointing at a row lights its edges and dims the rest, and nothing dims once it leaves", () => {
    renderPage([...LINKED, LONE]);

    assert.deepEqual(indexMarks("dimmed"), [], "nothing dims at first");

    point(indexRow("3"), "mouseover");

    assert.deepEqual(indexMarks("highlighted"), [
        "dot 1",
        "dot 3",
        "dot 4",
        "join 3-1",
        "join 4-3",
        "stretch 3-1",
        "stretch 4-3",
    ]);
    assert.deepEqual(indexMarks("dimmed"), [
        "dot 2",
        "dot 5",
        "stretch 2-1",
        "stretch 4-2",
    ]);

    point(index().querySelector("[data-index-rows]"), "mouseleave");

    assert.deepEqual(indexMarks("highlighted"), []);
    assert.deepEqual(indexMarks("dimmed"), []);
});

test("focusing a row lights its edges, and moving focus away puts them out", () => {
    renderPage([...LINKED, LONE]);

    point(indexRow("5"), "focusin");
    assert.deepEqual(indexMarks("highlighted"), [], "5 stands alone");
    assert.ok(indexMarks("dimmed").includes("dot 5"), "so its dot dims too");

    point(indexRow("5"), "focusout");
    assert.deepEqual(indexMarks("dimmed"), []);
});

test("pointing at a row of the index leaves the menu's decision graph alone", () => {
    renderPage([...LINKED, LONE]);

    point(indexRow("3"), "mouseover");

    assert.equal(
        document.querySelectorAll("#adrs-menu [data-mark][data-dimmed]").length,
        0,
    );
});

test("All decisions returns to the index with nothing lit", () => {
    renderPage([...LINKED, LONE]);

    point(indexRow("3"), "mouseover");
    indexRow("3").click();
    document.getElementById("adrs-summary").click();

    assert.equal(index().hidden, false);
    assert.equal(menuSection().hidden, true);
    assert.deepEqual(indexMarks("dimmed"), []);
});

test("on a narrow screen, the index keeps its decision graph", () => {
    dom.setViewportWidth(600);
    renderPage(LINKED);

    assert.equal(
        document.querySelectorAll('#adrs-index [data-mark="dot"]').length,
        4,
    );
    assert.deepEqual(dots(), [], "the menu's select has none");
});

test("the index's decision graph takes up to half the index's width", () => {
    const cases = [
        { width: 1120, cap: 35 },
        { width: 343, cap: 10 },
        // Never less than the column the lone dots sit in.
        { width: 0, cap: 1 },
    ];

    for (const { width, cap } of cases) {
        assert.equal(indexColumnCap(width), cap, `at ${width}px`);
    }
});

/* ---------------------------------------------- each decision graph's cap -- */

test("under Related only, the menu's decision graph keeps the menu's cap", () => {
    history.replace({ search: "?page=adrs&adr=46" });
    renderPage(GRAPH_DECISIONS);
    expand();

    relatedOnly().click();

    // 46 and the 36 decisions it builds on would open 37 columns.
    assert.equal(menuIds().length, 37);
    assert.equal(graph().getAttribute("data-fallback"), "lineage");
    assert.ok(marks("edge").length > 0, "46's references run on their column");
});

test("the index lays out its decision graph under its own cap", () => {
    // Half of 1,280px holds 40 of the index's columns: room for all 37.
    renderPage(GRAPH_DECISIONS);
    assert.equal(indexGraph().getAttribute("data-fallback"), "none");
});

test("a decision opened from the URL lays out the index at the index's own width once it shows", () => {
    history.replace({ search: "?page=adrs&adr=46" });
    renderPage(GRAPH_DECISIONS);
    // Hidden behind the open decision, the index measures nothing, so its
    // graph laid out at the window's 1,280px, room for all 37 columns.
    assert.equal(indexGraph().getAttribute("data-fallback"), "none");

    // Shown, the index measures 600px: 18 columns, fewer than 37.
    document.getElementById("adrs-index").clientWidth = 600;
    document.getElementById("adrs-summary").click();

    assert.equal(indexGraph().getAttribute("data-fallback"), "lineage");
});

test("on a narrow index, the decision graph falls back", () => {
    dom.setViewportWidth(600);
    renderPage(GRAPH_DECISIONS);

    // 600px holds 18 of the index's columns, fewer than the 37 it needs.
    assert.equal(indexGraph().getAttribute("data-fallback"), "lineage");
    assert.deepEqual(
        document
            .querySelectorAll(
                '#adrs-index [data-mark="stretch"][data-kind="reference"]',
            )
            .map((mark) => mark.getAttribute("data-from")),
        [],
        "no reference runs up a lane",
    );
});

/* ------------------------------------------------------- scrolling lanes -- */

/**
 * The scrolling fixture: forty supersede and amend lineages stay open across
 * the same rows, 42 columns in all, so the lanes outgrow the menu's cap and
 * the index's. Decision k's lane sits in column 42 - k; 41 references 40, at
 * the other end of the lanes, and 82 references 33 and 35, two lanes apart.
 */
const SCROLL_DECISIONS = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/decision-graph-scroll.json", import.meta.url),
        "utf-8",
    ),
).documentation.decisions;

const lanesView = (scope = "#adrs-menu") =>
    document.querySelector(`${scope} [data-lanes]`);
const pinnedStrip = (scope = "#adrs-menu") =>
    document.querySelector(`${scope} [data-pinned]`);
const laneButtons = (scope = "#adrs-menu") =>
    document.querySelectorAll(`${scope} [data-scroll-lanes]`);

/**
 * Give the lanes' view the size a browser would, then let the graph redraw
 * the way it does when anything resizes: the menu's view shows 30 columns of
 * 12px out of 42, with the 8px gap after the pinned columns.
 */
const layOutLanes = () => {
    const view = lanesView();
    view.clientWidth = 2 * 9 + 29 * 12;
    view.scrollWidth = 2 * 9 + 8 + 41 * 12;
    dom.setViewportWidth(1280);
    return view;
};

test("past even the lineage fallback, the lanes scroll behind the pinned columns", () => {
    renderPage(SCROLL_DECISIONS);
    expand();

    assert.equal(graph().getAttribute("data-fallback"), "scroll");
    const view = lanesView();
    assert.ok(view, "the lanes sit in a view of their own");
    assert.equal(
        view.style.getPropertyValue("--lanes-width"),
        "366px",
        "as wide as 30 columns",
    );
    assert.equal(
        view.querySelectorAll('[data-mark="dot"]').length,
        82,
        "every dot draws once, in the scrolling view",
    );

    // The pinned strip repeats the drawing's right edge, where the lone dots
    // and the reference column sit, over the lanes that scroll under it.
    const strip = pinnedStrip();
    assert.ok(strip, "the lone and reference columns stay pinned");
    const drawing = view.querySelector("[data-drawing]").getAttribute("id");
    assert.equal(
        strip.querySelector("use").getAttribute("href"),
        `#${drawing}`,
    );
    assert.equal(strip.querySelectorAll("[data-mark]").length, 0);
});

test("the lanes scroll only past the lineage fallback, and only expanded", () => {
    for (const [decisions, expanded] of [
        [LINKED, true],
        [GRAPH_DECISIONS, true],
        [SCROLL_DECISIONS, false],
    ]) {
        dom.reset();
        host = dom.mount("page-content");
        history.replace({ search: "?page=adrs&adr=2", hash: "" });
        renderPage(decisions);
        if (expanded) expand();

        assert.equal(lanesView(), null);
        assert.equal(pinnedStrip(), null);
    }
});

test("the ‹ › buttons show in the controls bar only while the lanes scroll", () => {
    history.replace({ search: "?page=adrs&adr=82" });
    renderPage(SCROLL_DECISIONS);
    const buttons = () => document.getElementById("adrs-lanes");

    assert.ok(buttons().hidden, "collapsed, nothing scrolls");
    expand();
    assert.equal(buttons().hidden, false);
    assert.deepEqual(
        laneButtons().map((button) => [button.textContent, button.title]),
        [
            [
                "‹",
                "Scroll the lanes left. A trackpad swipe, or Shift with the mouse wheel, scrolls them too.",
            ],
            [
                "›",
                "Scroll the lanes right. A trackpad swipe, or Shift with the mouse wheel, scrolls them too.",
            ],
        ],
    );

    // Related only lays out 82's relatives alone, and their lanes fit.
    relatedOnly().click();
    assert.ok(buttons().hidden, "the related decisions' lanes fit");
    relatedOnly().click();
    assert.equal(buttons().hidden, false, "every decision again");
    expand();
    assert.ok(buttons().hidden, "collapsed again");
});

test("the ‹ › buttons sit between the expand toggle and Related only", () => {
    renderPage(SCROLL_DECISIONS);

    assert.deepEqual(
        controls().children.map((child) => child.getAttribute("id")),
        ["adrs-summary", "adrs-expand", "adrs-lanes", "adrs-related"],
    );
});

test("‹ and › scroll the lanes by four columns", () => {
    history.replace({ search: "?page=adrs&adr=82" });
    renderPage(SCROLL_DECISIONS);
    expand();
    const [left, right] = laneButtons();

    left.click();
    right.click();

    assert.deepEqual(
        document.scrolledBy.map(({ element, options }) => ({
            lanes: element === lanesView(),
            options,
        })),
        [
            { lanes: true, options: { left: -48, behavior: "smooth" } },
            { lanes: true, options: { left: 48, behavior: "smooth" } },
        ],
    );
});

test("the lanes start scrolled to the titles' edge", () => {
    history.replace({ search: "?page=adrs&adr=80" });
    renderPage(SCROLL_DECISIONS);
    expand();

    const view = layOutLanes();

    assert.equal(view.scrollLeft, view.scrollWidth - view.clientWidth);
});

test("opening a decision scrolls as little as possible to show the lanes its edges reach", () => {
    history.replace({ search: "?page=adrs&adr=41" });
    renderPage(SCROLL_DECISIONS);
    expand();
    const view = layOutLanes();

    // 41's own lane is the last column, and its reference to 40 reaches the
    // first lane: the two never fit at once, so its own lane wins.
    assert.equal(view.scrollLeft, 0, "41's lane in view, at the far left");

    // 82 references 33 and 35, two lanes apart: the view moves just far
    // enough to take both in, with room to spare at its edge.
    open("82");
    assert.equal(view.scrollLeft, 92);

    // A redraw that opens nothing leaves the lanes where the reader put them.
    view.scrollLeft = 40;
    dom.setViewportWidth(1280);
    assert.equal(view.scrollLeft, 40);
});

test("the index shows ‹ › in a bar of its own while its lanes scroll", () => {
    // 1,280px holds 40 of the index's columns, fewer than the 42 it needs.
    renderPage(SCROLL_DECISIONS);

    assert.equal(indexGraph().getAttribute("data-fallback"), "scroll");
    assert.ok(lanesView("#adrs-index"), "the index's lanes scroll");
    assert.ok(pinnedStrip("#adrs-index"), "behind their own pinned columns");
    const bar = document.getElementById("adrs-index-controls");
    assert.equal(bar.hidden, false);
    assert.deepEqual(
        bar.querySelectorAll("button").map((button) => button.textContent),
        ["‹", "›"],
        "the index's bar holds only the ‹ › buttons",
    );

    const [left] = laneButtons("#adrs-index");
    left.click();
    assert.deepEqual(
        document.scrolledBy.map(({ element, options }) => ({
            lanes: element === lanesView("#adrs-index"),
            left: options.left,
        })),
        [{ lanes: true, left: -64 }],
        "four of the index's wider columns",
    );
});

test("the index hides its ‹ › bar while its lanes fit", () => {
    renderPage(GRAPH_DECISIONS);

    assert.ok(document.getElementById("adrs-index-controls").hidden);
    assert.equal(lanesView("#adrs-index"), null);
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

/* --------------------------------------------------------- back to index -- */

test("All decisions returns to the index and drops the decision from the URL", () => {
    renderPage();

    document.querySelector('#adrs-menu a[data-item-id="2"]').click();
    document.getElementById("adrs-summary").click();

    assert.equal(title().innerHTML, "");
    assert.equal(index().hidden, false);
    assert.equal(indexRows().length, 2);
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
