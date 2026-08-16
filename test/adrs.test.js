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
        "#2 - Inline every asset for single-file output",
        "#1 - Render diagrams in the browser",
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
        "#2 - Inline every asset for single-file output",
        "#1 - Render diagrams in the browser",
    ]);
});

test("decisions recorded on the same day are ordered by number", () => {
    renderPage([
        decision("7", { date: "2024-05-05T12:00:00Z" }),
        decision("9", { date: "2024-05-05T12:00:00Z" }),
        decision("8", { date: "2024-05-05T12:00:00Z" }),
    ]);

    assert.deepEqual(menuLinks(), [
        "#9 - Decision 9",
        "#8 - Decision 8",
        "#7 - Decision 7",
    ]);
});

/* -------------------------------------------------------------- selection -- */

test("choosing a decision shows its title, date and status", () => {
    renderPage();

    document.querySelector('#adrs-menu a[data-item-id="1"]').click();

    assert.equal(
        title().querySelector("h2").textContent,
        "#1 - Render diagrams in the browser",
    );
    assert.match(title().querySelector("p").textContent, /2024/);
    assert.equal(title().querySelector("span").textContent, "Accepted");
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
        "#1 - Render diagrams in the browser",
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

    assert.equal(title().querySelector("h2").textContent, "#1 - Decision 1");
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
    assert.equal(title().querySelector("h2").textContent, "#1 - Decision 1");
    assert.deepEqual(
        document.scrolledIntoView.map((entry) => entry.id),
        ["context"],
    );
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
