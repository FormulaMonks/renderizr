/**
 * `src/components/router.ts` — the whole of the site's navigation.
 *
 * Everything the reader can reach goes through it: the first render, the nav
 * links, a pasted URL, and the Back button. Its rules are subtle enough to be
 * worth writing down — a correction to where the reader already is replaces
 * the history entry, an actual navigation pushes one — and getting that wrong
 * is what made Back need two presses per link.
 *
 * The pages here are stand-ins that record what they were told to do. What is
 * under test is the router, not the pages; those have tests of their own.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";
import history from "./support/history.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { default: Router } = await importSrc("components/router");
const { default: Page } = await importSrc("pages/_page");

const { document, window } = dom;

/** A page that writes its own name and remembers how it was driven. */
class RecordingPage extends Page {
    constructor(name, log) {
        super(null, name);
        this.log = log;
        this.renders = 0;
    }

    render() {
        this.renders += 1;
        this.log.push(`render:${this.name}`);
        this.container.innerHTML = `<h2>${this.name}</h2>`;
    }

    clear() {
        this.log.push(`clear:${this.name}`);
        this.container.innerHTML = "";
    }
}

let host;
let log;
/**
 * `Router` subscribes to history and never unsubscribes, so a router built in
 * one test would keep navigating during the next one. The subscriptions are
 * captured here and dropped afterwards, which isolates the tests and records
 * the leak in the one place a fix would show up.
 */
let unlisteners;
const realListen = history.listen.bind(history);

beforeEach(() => {
    dom.reset();
    host = dom.mount("page-content");
    log = [];
    unlisteners = [];

    history.listen = (listener) => {
        const unlisten = realListen(listener);
        unlisteners.push(unlisten);
        return unlisten;
    };

    history.replace({ search: "", hash: "" });
});

afterEach(() => {
    for (const unlisten of unlisteners) unlisten();
    history.listen = realListen;
});

const pages = () => [
    new RecordingPage("diagrams", log),
    new RecordingPage("docs", log),
    new RecordingPage("adrs", log),
];

const currentPage = () =>
    new URLSearchParams(history.location.search).get("page");

/* ------------------------------------------------------------ first render */

test("opens the first page when the URL names none", () => {
    new Router(host, pages());

    assert.deepEqual(log, ["render:diagrams"]);
    assert.equal(host.querySelector("h2").textContent, "diagrams");
    assert.equal(currentPage(), "diagrams");
});

test("opens the page the URL names", () => {
    history.replace({ search: "?page=adrs" });

    new Router(host, pages());

    assert.deepEqual(log, ["render:adrs"]);
    assert.equal(host.querySelector("h2").textContent, "adrs");
});

test("an unknown page falls back to the first one and rewrites the URL", () => {
    history.replace({ search: "?page=nope" });

    new Router(host, pages());

    assert.equal(currentPage(), "diagrams");
    assert.deepEqual(log, ["render:diagrams"]);
});

test("filling in the default does not add a history entry", () => {
    // Landing on the site is not a navigation; if it pushed, the first Back
    // would take the reader nowhere.
    const before = window.history.length;

    new Router(host, pages());

    assert.equal(window.history.length, before);
});

test("every page is given the router's container", () => {
    const all = pages();
    new Router(host, all);

    for (const page of all) assert.equal(page.getContainer(), host);
});

test("the page name reaches the root element, for the stylesheet", () => {
    new Router(host, pages());

    assert.equal(document.documentElement.dataset.page, "diagrams");
});

/* -------------------------------------------------------------- navigation */

test("navigating clears the page it is leaving before rendering the next", () => {
    const router = new Router(host, pages());

    router.navigateTo("docs");

    assert.deepEqual(log, ["render:diagrams", "clear:diagrams", "render:docs"]);
    assert.equal(host.querySelector("h2").textContent, "docs");
    assert.equal(currentPage(), "docs");
    assert.equal(document.documentElement.dataset.page, "docs");
});

test("navigating to another page pushes, so Back returns to the previous one", () => {
    const router = new Router(host, pages());

    router.navigateTo("docs");

    assert.equal(currentPage(), "docs");

    window.history.back();

    assert.equal(currentPage(), "diagrams");
    assert.equal(
        host.querySelector("h2").textContent,
        "diagrams",
        "Back should put the previous page back on screen",
    );
});

test("Back and Forward both re-render, without pushing anything new", () => {
    const router = new Router(host, pages());
    router.navigateTo("docs");
    router.navigateTo("adrs");

    const depth = window.history.length;

    window.history.back();
    assert.equal(host.querySelector("h2").textContent, "docs");

    window.history.forward();
    assert.equal(host.querySelector("h2").textContent, "adrs");

    assert.equal(
        window.history.length,
        depth,
        "following the URL is a correction, not a new destination",
    );
});

test("a pasted link switches pages", () => {
    new Router(host, pages());

    // What arrives when someone opens a link to a deep page: the hash is
    // already correct and the router only has to catch up with it.
    window.location.hash = "#/?page=adrs";

    assert.equal(host.querySelector("h2").textContent, "adrs");
});

test("re-navigating to the page already open replaces rather than pushes", () => {
    // The guard compares the search it is about to write with the one already
    // in the URL. `URLSearchParams.toString()` has no leading "?" and
    // `history.location.search` does, so this used to never match: navigating
    // to the page you are on pushed a duplicate entry and cost an extra Back
    // press. Nothing in the shipped UI reached it — the nav links push through
    // history themselves and the router's own listener passes replace=true —
    // which is why it went unnoticed.
    const router = new Router(host, pages());
    router.navigateTo("docs");
    const depth = window.history.length;

    router.navigateTo("docs");

    assert.equal(window.history.length, depth);
    assert.equal(currentPage(), "docs");
});

test("navigating to an unknown page lands on the first one", () => {
    const router = new Router(host, pages());

    router.navigateTo("nowhere");

    assert.equal(currentPage(), "diagrams");
    assert.equal(host.querySelector("h2").textContent, "diagrams");
});

test("other search parameters survive a page change", () => {
    // The decision and documentation pages keep their own state in the query
    // string; a page change must not wipe it.
    const router = new Router(host, pages());

    router.navigateTo("adrs", "?adr=3");

    const search = new URLSearchParams(history.location.search);
    assert.equal(search.get("page"), "adrs");
    assert.equal(search.get("adr"), "3");
});

test("render() and clear() delegate to the page on screen", () => {
    const router = new Router(host, pages());
    log.length = 0;

    router.render();
    router.clear();

    assert.deepEqual(log, ["render:diagrams", "clear:diagrams"]);
});
