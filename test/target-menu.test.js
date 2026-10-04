/**
 * `src/components/target-menu.ts`: what the diagrams page does with an
 * activation (spec 6.1). One target is followed at once; several open a
 * small menu at the anchor, built from the vanilla `menu` component, that
 * arrows walk and Escape or an outside click closes.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";
import { DOMEvent } from "./support/dom.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { default: TargetMenu } = await importSrc("components/target-menu");

const { document } = dom;

const TARGETS = [
    { kind: "link", url: "https://github.com/x", label: "github.com" },
    { kind: "view", key: "Containers", label: "Container View: Shop" },
    {
        kind: "documentation",
        search: "page=docs",
        label: "Documentation",
    },
];

let host;
let followed;
let menu;

beforeEach(() => {
    dom.reset();
    host = dom.mount("page");
    followed = [];
    menu = new TargetMenu(host, (target) => followed.push(target));
    menu.render();
});

// A menu left open keeps its document listeners, which would answer the
// next test's keys too.
afterEach(() => menu.clear());

const popup = () => host.querySelector("[data-target-menu]");
const entries = () => host.querySelectorAll('[role="menuitem"]');

const press = (target, key) => {
    const event = new DOMEvent("keydown", { bubbles: true });
    event.key = key;
    target.dispatchEvent(event);
    return event;
};

/* ------------------------------------------------------------ one or none */

test("one target is followed at once, with no menu", () => {
    menu.activate([TARGETS[1]], { x: 10, y: 20 });

    assert.deepEqual(followed, [TARGETS[1]]);
    assert.equal(popup(), null);
});

test("no targets does nothing", () => {
    menu.activate([], { x: 10, y: 20 });

    assert.deepEqual(followed, []);
    assert.equal(popup(), null);
});

/* ------------------------------------------------------------- the menu */

test("several targets open a menu at the anchor, one entry per target, labelled", () => {
    menu.activate(TARGETS, { x: 120, y: 80 });

    assert.ok(popup(), "the menu opened");
    assert.equal(popup().style.left, "120px");
    assert.equal(popup().style.top, "80px");
    assert.equal(
        popup().querySelector("ul").getAttribute("role"),
        "menu",
        "the list is announced as a menu",
    );
    assert.deepEqual(
        entries().map((entry) => entry.textContent),
        ["github.com", "Container View: Shop", "Documentation"],
    );
    assert.deepEqual(followed, [], "nothing is followed until one is chosen");
});

test("the menu stays a list on a narrow screen", () => {
    dom.setViewportWidth(400);
    menu.activate(TARGETS, { x: 0, y: 0 });

    assert.equal(popup().querySelector("select"), null);
    assert.equal(entries().length, 3);
});

test("opening the menu focuses its first entry, and arrows walk the entries", () => {
    menu.activate(TARGETS, { x: 0, y: 0 });
    const [first, second, third] = entries();

    assert.equal(document.activeElement, first);
    press(first, "ArrowDown");
    assert.equal(document.activeElement, second);
    press(second, "ArrowDown");
    press(third, "ArrowDown");
    assert.equal(document.activeElement, first, "down from the last wraps");
    press(first, "ArrowUp");
    assert.equal(document.activeElement, third, "up from the first wraps");
});

test("choosing an entry follows its target and closes the menu", () => {
    menu.activate(TARGETS, { x: 0, y: 0 });
    entries()[1].click();

    assert.deepEqual(followed, [TARGETS[1]]);
    assert.equal(popup(), null);
});

test("Escape closes the menu and gives focus back to what opened it", () => {
    const opener = document.createElement("button");
    host.appendChild(opener);
    opener.focus();
    menu.activate(TARGETS, { x: 0, y: 0 });

    const event = press(entries()[0], "Escape");

    assert.equal(popup(), null);
    assert.equal(event.defaultPrevented, true);
    assert.equal(document.activeElement, opener);
    assert.deepEqual(followed, []);
});

test("a click outside the menu closes it; a click inside does not", () => {
    menu.activate(TARGETS, { x: 0, y: 0 });
    popup().dispatchEvent(new DOMEvent("pointerdown", { bubbles: true }));
    assert.ok(popup(), "a click inside keeps it open");

    document.body.dispatchEvent(new DOMEvent("pointerdown", { bubbles: true }));
    assert.equal(popup(), null);
});

test("activating again replaces the open menu", () => {
    menu.activate(TARGETS, { x: 0, y: 0 });
    menu.activate(TARGETS.slice(0, 2), { x: 5, y: 5 });

    assert.equal(host.querySelectorAll("[data-target-menu]").length, 1);
    assert.equal(entries().length, 2);
});

test("clear() closes the menu and stops listening", () => {
    menu.activate(TARGETS, { x: 0, y: 0 });
    menu.clear();

    assert.equal(popup(), null);
    assert.equal(document.listenersFor("pointerdown").length, 0);
    assert.equal(document.listenersFor("keydown").length, 0);
});
