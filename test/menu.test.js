/**
 * `src/components/menu.ts` — the sidebar every page navigates with.
 *
 * It is the one component all three pages share, it renders two entirely
 * different shapes depending on the viewport, and it is where "the link does
 * nothing" bugs live. The tests drive it through the real DOM in
 * `support/dom.js`: clicks are dispatched, not simulated by calling handlers.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { DOMEvent } from "./support/dom.js";
import { dom, importSrc } from "./support/ts.js";

const { default: Menu } = await importSrc("components/menu");

const { document } = dom;

/** The fixture tree: two sections, the first with two pages under it. */
const items = () => [
    {
        id: "section:one",
        title: "Getting started",
        items: [
            { id: "page:one:install", title: "Install" },
            { id: "page:one:configure", title: "Configure" },
        ],
    },
    { id: "section:two", title: "Deployment", items: [] },
];

let host;

beforeEach(() => {
    dom.reset();
    host = dom.mount("menu");
});

const renderMenu = (menuItems = items()) => {
    const menu = new Menu(host, menuItems);
    menu.render();
    return menu;
};

const anchors = () => host.querySelectorAll("a[data-item-id]");
const anchorFor = (id) => host.querySelector(`a[data-item-id="${id}"]`);

/* ------------------------------------------------------------ wide layout -- */

test("renders one link per entry, nested by depth", () => {
    renderMenu();

    assert.deepEqual(
        anchors().map((anchor) => anchor.dataset.itemId),
        [
            "section:one",
            "page:one:install",
            "page:one:configure",
            "section:two",
        ],
    );
    assert.deepEqual(
        anchors().map((anchor) => anchor.dataset.depth),
        ["0", "1", "1", "0"],
    );
    assert.equal(host.classList.contains("menu"), true);
});

test("nests a child list inside its parent's list item", () => {
    renderMenu();

    const nested = host.querySelectorAll("ul > li > ul > li > a");

    assert.deepEqual(
        nested.map((anchor) => anchor.textContent),
        ["Install", "Configure"],
    );
});

test("every link carries a real fragment href", () => {
    renderMenu();

    // The click handler cancels it, but a link with no href is not a link:
    // it loses the pointer cursor, keyboard focus and "copy link address".
    assert.equal(anchorFor("section:two").getAttribute("href"), "#section:two");
});

test("a custom text function renames the entries", () => {
    const menu = new Menu(host, [{ id: "3", title: "Use hash routing" }]);
    menu.setTextContentFn((item) => `#${item.id} - ${item.title}`);
    menu.render();

    assert.equal(anchorFor("3").textContent, "#3 - Use hash routing");
});

/* -------------------------------------------------------------- selection -- */

test("clicking a link selects it and reports the item", () => {
    const menu = renderMenu();
    const selected = [];
    menu.onSelectionChange((item) => selected.push(item.id));

    anchorFor("page:one:configure").click();

    assert.deepEqual(selected, ["page:one:configure"]);
    assert.equal(menu.getSelected().id, "page:one:configure");
});

test("a click never navigates, because the router lives in the hash", () => {
    renderMenu();

    // Letting `href="#section:two"` through would overwrite the hash the
    // router keeps its state in and throw the reader off the page.
    const event = new DOMEvent("click", { bubbles: true });
    anchorFor("section:two").dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
});

test("the selected entry is marked, and its ancestors are trailed", () => {
    const menu = renderMenu();

    menu.setActive({ id: "page:one:install", title: "Install" });

    assert.equal(
        anchorFor("page:one:install").classList.contains("active"),
        true,
    );
    assert.equal(
        anchorFor("page:one:install").getAttribute("aria-current"),
        "true",
    );
    assert.equal(
        anchorFor("section:one").classList.contains("activeTrail"),
        true,
        "the section holding the selected page should be trailed",
    );
    assert.equal(
        anchorFor("section:two").classList.contains("activeTrail"),
        false,
    );
});

test("selecting elsewhere clears the previous mark", () => {
    const menu = renderMenu();

    menu.setActive({ id: "page:one:install", title: "Install" });
    menu.setActive({ id: "section:two", title: "Deployment" });

    assert.equal(
        anchorFor("page:one:install").classList.contains("active"),
        false,
    );
    assert.equal(
        anchorFor("page:one:install").hasAttribute("aria-current"),
        false,
    );
    assert.equal(anchorFor("section:two").classList.contains("active"), true);
});

test("a non-selectable entry reports the click but does not become the selection", () => {
    // The documentation's "on this page" anchors: they scroll the page being
    // read rather than navigating to another one.
    const menu = renderMenu([
        { id: "page:one", title: "Install" },
        { id: "heading:limits", title: "Limits", selectable: false },
    ]);

    const seen = [];
    menu.onSelectionChange((item) => seen.push(item.id));

    menu.setActive({ id: "page:one", title: "Install" });
    anchorFor("heading:limits").click();

    assert.deepEqual(seen, ["page:one", "heading:limits"]);
    assert.equal(menu.getSelected().id, "page:one");
    assert.equal(
        anchorFor("heading:limits").classList.contains("active"),
        false,
    );
});

test("the scroll spy highlights without selecting", () => {
    const menu = renderMenu();
    menu.setActive({ id: "section:two", title: "Deployment" });

    menu.setHighlighted("page:one:install");

    assert.equal(
        anchorFor("page:one:install").classList.contains("current"),
        true,
    );
    assert.equal(
        anchorFor("page:one:install").classList.contains("active"),
        false,
    );
    assert.equal(menu.getSelected().id, "section:two");

    menu.setHighlighted(null);
    assert.equal(
        anchorFor("page:one:install").classList.contains("current"),
        false,
    );
});

test("setItems replaces the entries and keeps the selection painted", () => {
    const menu = renderMenu();
    menu.setActive({ id: "section:two", title: "Deployment" });

    menu.setItems([
        { id: "section:two", title: "Deployment", items: [] },
        { id: "section:three", title: "Operations", items: [] },
    ]);

    assert.deepEqual(
        anchors().map((anchor) => anchor.dataset.itemId),
        ["section:two", "section:three"],
    );
    assert.equal(anchorFor("section:two").classList.contains("active"), true);
});

test("a click after setItems still selects, so the new links are live", () => {
    // Rebuilding the list drops every listener with the old nodes; the bug
    // this guards against is rebuilding without attaching new ones.
    const menu = renderMenu();
    const seen = [];
    menu.onSelectionChange((item) => seen.push(item.id));

    menu.setItems([{ id: "section:new", title: "New", items: [] }]);
    anchorFor("section:new").click();

    assert.deepEqual(seen, ["section:new"]);
});

/* ------------------------------------------------------------ narrow layout */

test("a narrow viewport renders a select instead of a list", () => {
    dom.setViewportWidth(600);
    renderMenu();

    assert.equal(host.querySelectorAll("ul").length, 0);
    assert.deepEqual(
        host.querySelectorAll("option").map((option) => option.value),
        [
            "section:one",
            "page:one:install",
            "page:one:configure",
            "section:two",
        ],
    );
});

test("nested options are indented, since a select has no tree", () => {
    dom.setViewportWidth(600);
    renderMenu();

    const [, nested] = host.querySelectorAll("option");

    // Non-breaking spaces on purpose: a browser collapses ordinary ones
    // inside an <option>, which would flatten the indent to nothing.
    assert.equal(nested.textContent, `${" ".repeat(3)}· Install`);
});

test("non-selectable entries are left out of the select entirely", () => {
    dom.setViewportWidth(600);
    renderMenu([
        { id: "page:one", title: "Install" },
        { id: "heading:limits", title: "Limits", selectable: false },
    ]);

    assert.deepEqual(
        host.querySelectorAll("option").map((option) => option.value),
        ["page:one"],
    );
});

test("changing the select selects the entry it names", () => {
    dom.setViewportWidth(600);
    const menu = renderMenu();
    const seen = [];
    menu.onSelectionChange((item) => seen.push(item.id));

    const select = host.querySelector("select");
    select.value = "page:one:configure";
    select.dispatchEvent(new DOMEvent("change"));

    assert.deepEqual(seen, ["page:one:configure"]);
    assert.equal(menu.getSelected().id, "page:one:configure");
});

test("growing the viewport swaps the select back for the tree", () => {
    dom.setViewportWidth(600);
    const menu = renderMenu();
    menu.setActive({ id: "section:two", title: "Deployment" });

    dom.setViewportWidth(1200);

    assert.equal(host.querySelectorAll("select").length, 0);
    assert.equal(anchors().length, 4);
    assert.equal(
        anchorFor("section:two").classList.contains("active"),
        true,
        "a resize is not a navigation; the selection has to survive it",
    );
});

/* ------------------------------------------------------------------ clear -- */

test("clear() empties the menu and forgets the selection", () => {
    const menu = renderMenu();
    menu.setActive({ id: "section:two", title: "Deployment" });

    menu.clear();

    assert.equal(host.childNodes.length, 0);
    assert.equal(menu.getSelected(), null);
});

test("clear() stops the resize observer, so a later resize cannot repaint it", () => {
    const menu = renderMenu();
    menu.clear();

    dom.setViewportWidth(600);

    assert.equal(host.childNodes.length, 0);
});
