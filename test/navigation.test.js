/**
 * `src/components/navigation.ts` — the header every page is read under.
 *
 * It is the first thing rendered and the only thing on screen that is not a
 * page, so when it is wrong the site looks broken before anything else has had
 * a chance to run. Three things it has to get right: which tabs exist (a
 * workspace with no documentation must not offer a Documentation tab), links
 * that survive a middle click, and the theme toggle's three-way cycle.
 *
 * The workspace is the committed fixture, so the tabs asserted here are the
 * tabs a reader gets from `scripts/__fixtures__/workspace.json`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { DOMEvent } from "./support/dom.js";
import history from "./support/history.js";
import { dom, importSrc } from "./support/ts.js";

const { default: Navigation } = await importSrc("components/navigation");
const { getMode, setMode } = await importSrc("components/theme");

const { document, window } = dom;

const WORKSPACE = JSON.parse(
    readFileSync(
        new URL("../scripts/__fixtures__/workspace.json", import.meta.url),
        "utf-8",
    ),
);

let host;

beforeEach(() => {
    dom.reset();
    host = dom.mount("workspace-navigation");
    globalThis.structurizr = { workspace: { name: WORKSPACE.name } };
    history.replace({ search: "", hash: "" });
    setMode("system");
});

/** The fixture, with documentation and decisions optionally removed. */
const workspace = ({ docs = true, decisions = true, ...rest } = {}) => ({
    ...WORKSPACE,
    ...rest,
    documentation: {
        sections: docs ? WORKSPACE.documentation.sections : [],
        decisions: decisions ? WORKSPACE.documentation.decisions : [],
    },
});

const render = (options) => {
    const nav = new Navigation(host, workspace(options));
    nav.render();
    return nav;
};

const tabs = () =>
    host.querySelectorAll("ul > li > a").map((link) => link.dataset.page);

/* ------------------------------------------------------------------ header */

test("the workspace name is the page's h1", () => {
    render();

    assert.equal(host.querySelector("h1").textContent, "Fixture Workspace");
});

test("the description and the modified date are shown", () => {
    render();

    const paragraphs = host.querySelectorAll("section > p");

    assert.equal(paragraphs[0].textContent, WORKSPACE.description);
    assert.match(paragraphs[1].textContent, /^Last modified: /);
    assert.ok(host.querySelector("strong").textContent.length > 0);
});

test("a version, when the workspace has one, precedes the date", () => {
    render({ version: "1.4.0" });

    const [, meta] = host.querySelectorAll("section > p");

    assert.match(meta.textContent, /^Version: 1\.4\.0 - Last modified: /);
});

/* -------------------------------------------------------------------- tabs */

test("the fixture workspace offers all three tabs", () => {
    render();

    assert.deepEqual(tabs(), ["diagrams", "docs", "adrs"]);
});

test("a workspace with no documentation has no Documentation tab", () => {
    const nav = render({ docs: false });

    assert.deepEqual(tabs(), ["diagrams", "adrs"]);
    assert.equal(nav.hasDocs, false);
    assert.equal(nav.hasDecisions, true);
    assert.equal(nav.hasDocsAndDecisions, false);
});

test("a workspace with only diagrams shows no tabs at all", () => {
    // One destination is not a choice; a lone "Diagrams" tab is just noise.
    const nav = render({ docs: false, decisions: false });

    assert.deepEqual(tabs(), []);
    assert.equal(nav.hasDocs, false);
    assert.equal(nav.hasDecisions, false);
});

test("every tab is a real link, so cmd-click and copy-link-address work", () => {
    render();

    const docs = host.querySelector('a[data-page="docs"]');

    assert.equal(docs.getAttribute("href"), "#/?page=docs");
    assert.equal(docs.textContent, "Documentation");
});

test("clicking a tab navigates through history rather than the browser", () => {
    render();

    host.querySelector('a[data-page="adrs"]').click();

    assert.equal(
        new URLSearchParams(history.location.search).get("page"),
        "adrs",
    );
});

test("a tab click is cancelled, so the hash router keeps the URL", () => {
    render();

    const event = new DOMEvent("click", { bubbles: true });
    host.querySelector('a[data-page="docs"]').dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
});

test("the tab for the current page is marked active", () => {
    render();

    history.push({ search: "page=docs" });

    assert.equal(
        host
            .querySelector('a[data-page="docs"]')
            .classList.contains("navigationActive"),
        true,
    );
    assert.equal(
        host
            .querySelector('a[data-page="adrs"]')
            .classList.contains("navigationActive"),
        false,
    );
});

/* -------------------------------------------------------------------- logo */

test("no logo means no image in the header", () => {
    render();

    assert.equal(host.querySelectorAll("img").length, 0);
});

test("a logo is rendered with its alt text and intrinsic size", () => {
    globalThis.__RENDERIZR_LOGO__ = {
        src: "data:image/svg+xml;base64,PHN2Zy8+",
        alt: "Acme",
        width: 120,
        height: 40,
    };

    render();
    const logo = host.querySelector("img");

    assert.equal(
        logo.getAttribute("src"),
        "data:image/svg+xml;base64,PHN2Zy8+",
    );
    assert.equal(logo.getAttribute("alt"), "Acme");
    assert.equal(logo.getAttribute("width"), "120");
    assert.equal(logo.getAttribute("height"), "40");
    assert.equal(host.querySelectorAll("a[href] img").length, 0);
});

test("a logo with a href is wrapped in a link that opens away from the page", () => {
    globalThis.__RENDERIZR_LOGO__ = {
        src: "data:image/png;base64,AA==",
        alt: "Acme",
        href: "https://example.com",
    };

    render();
    const link = host.querySelector(".brand a");

    assert.equal(link.getAttribute("href"), "https://example.com");
    assert.equal(link.getAttribute("target"), "_blank");
    assert.equal(link.getAttribute("rel"), "noreferrer");
    assert.equal(link.querySelector("img").getAttribute("alt"), "Acme");
});

/* ------------------------------------------------------------ theme toggle */

const toggle = () => host.querySelector("#theme-toggle");

test("the toggle opens on the stored mode and says what it will do next", () => {
    render();

    assert.equal(toggle().dataset.mode, "system");
    assert.equal(
        toggle().getAttribute("title"),
        "Page theme: system. Switch to light",
    );
    assert.equal(
        toggle().getAttribute("aria-label"),
        "Page theme: system. Switch to light",
    );
    assert.ok(toggle().querySelector("svg"), "the mode should have an icon");
});

test("clicking cycles system, light, dark and back", () => {
    render();

    toggle().click();
    assert.equal(getMode(), "light");
    assert.equal(toggle().dataset.mode, "light");
    assert.equal(document.documentElement.dataset.theme, "light");

    toggle().click();
    assert.equal(getMode(), "dark");
    assert.equal(document.documentElement.dataset.theme, "dark");

    toggle().click();
    assert.equal(getMode(), "system");
});

test("the chosen mode is remembered", () => {
    render();

    toggle().click();

    assert.equal(window.localStorage.getItem("renderizr:theme"), "light");
});

test("each mode gets a different icon", () => {
    render();

    const icons = new Set();
    for (let click = 0; click < 3; click += 1) {
        icons.add(toggle().innerHTML);
        toggle().click();
    }

    assert.equal(icons.size, 3);
});

/* ------------------------------------------------------------------- clear */

test("clear() empties the header and stops repainting the toggle", () => {
    const nav = render();

    nav.clear();

    assert.equal(host.querySelectorAll("*").length, 0);
    assert.equal(host.classList.contains("navigation"), false);

    // The subscription is dropped, so a later theme change cannot resurrect
    // markup in a header that is no longer on screen.
    setMode("dark");
    assert.equal(host.querySelectorAll("*").length, 0);
});
