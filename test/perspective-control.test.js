/**
 * `src/components/perspective-control.ts`: the view toolbar's perspective
 * button, after the label toggles. It opens the popup menu with "No
 * perspective" first and then the view's names, shows pressed with filled
 * binoculars while a perspective is on, and hides in a view that carries
 * none. `Alt+P` opens it, by physical key, outside text fields.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";
import { DOMEvent } from "./support/dom.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const {
    default: PerspectiveControl,
    isPerspectiveKey,
    onPerspectiveKey,
} = await importSrc("components/perspective-control");
const { notation } = await importSrc("components/shortcuts");

/** `Alt+P` as the platform writes it: `⌥P` on macOS. */
const KEY = notation("Alt+P");

const { document } = dom;

let toolbar;
let picked;
let control;

beforeEach(() => {
    dom.reset();
    const host = dom.mount("page");
    toolbar = document.createElement("div");
    toolbar.innerHTML = `<div class="actions"></div><div class="animation-buttons"></div>`;
    host.appendChild(toolbar);
    picked = [];
    control = new PerspectiveControl((name) => picked.push(name));
    control.mount(toolbar);
});

afterEach(() => control.clear());

const button = () => toolbar.querySelector("button.perspective");
const popup = () => document.querySelector("[data-perspective-menu]");
const entries = () =>
    Array.from(document.querySelectorAll('[role="menuitemradio"]'));

const keydown = (target, init) => {
    const event = new DOMEvent("keydown", { bubbles: true, cancelable: true });
    Object.assign(event, {
        key: "",
        code: "",
        altKey: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        ...init,
    });
    target.dispatchEvent(event);
    return event;
};

/* ------------------------------------------------------------ the button */

test("the button sits after the label toggles", () => {
    control.show(["Security"], null);
    const groups = Array.from(toolbar.children);
    assert.deepEqual(
        groups.map((group) => group.className.split(" ")[0]),
        ["actions", "perspective-buttons", "animation-buttons"],
    );
});

test("the button hides in a view that carries no perspective", () => {
    control.show([], null);
    assert.equal(button().parentElement.hidden, true);
    control.show(["Security"], null);
    assert.equal(button().parentElement.hidden, false);
});

test("with no perspective on, the button shows unpressed and names the key", () => {
    control.show(["Ownership", "Security"], null);
    assert.equal(button().getAttribute("aria-pressed"), "false");
    assert.equal(button().title, `Perspectives (${KEY})`);
    assert.equal(button().getAttribute("aria-label"), `Perspectives (${KEY})`);
    assert.match(button().innerHTML, /bi-binoculars"/);
});

test("with a perspective on, the button shows pressed with filled binoculars", () => {
    control.show(["Ownership", "Security"], "Security");
    assert.equal(button().getAttribute("aria-pressed"), "true");
    assert.equal(button().dataset.active, "true");
    assert.equal(button().title, `Perspective: Security (${KEY})`);
    assert.match(button().innerHTML, /bi-binoculars-fill/);
});

test("a perspective the view doesn't carry shows the button unpressed", () => {
    control.show(["Ownership"], "Security");
    assert.equal(button().getAttribute("aria-pressed"), "false");
});

test("a toolbar drawn again gets the button back as it was", () => {
    control.show(["Security"], "Security");
    toolbar.innerHTML = `<div class="actions"></div>`;
    control.mount(toolbar);
    assert.equal(button().getAttribute("aria-pressed"), "true");
});

/* -------------------------------------------------------------- the menu */

test("the button opens a menu with No perspective first, then the names", () => {
    control.show(["Ownership", "Security"], "Security");
    button().click();
    assert.ok(popup(), "the menu opened");
    assert.deepEqual(
        entries().map((entry) => entry.textContent),
        ["No perspective", "Ownership", "Security"],
    );
    assert.deepEqual(
        entries().map((entry) => entry.getAttribute("aria-checked")),
        ["false", "false", "true"],
    );
    assert.equal(document.activeElement, entries()[2]);
});

test("picking a name reports it and closes the menu", () => {
    control.show(["Ownership", "Security"], null);
    button().click();
    entries()[1].click();
    assert.deepEqual(picked, ["Ownership"]);
    assert.equal(popup(), null);
});

test("picking No perspective reports none", () => {
    control.show(["Security"], "Security");
    button().click();
    entries()[0].click();
    assert.deepEqual(picked, [null]);
});

test("the button closes the menu it opened", () => {
    control.show(["Security"], null);
    button().click();
    button().dispatchEvent(new DOMEvent("pointerdown", { bubbles: true }));
    button().click();
    assert.equal(popup(), null);
});

test("Escape closes the menu and gives focus back to the button", () => {
    control.show(["Security"], null);
    button().click();
    keydown(entries()[0], { key: "Escape" });
    assert.equal(popup(), null);
    assert.equal(document.activeElement, button());
});

test("open does nothing while the button hides", () => {
    control.show([], null);
    control.open();
    assert.equal(popup(), null);
});

/* --------------------------------------------------------------- the key */

test("Alt+P is the key, by physical key", () => {
    assert.equal(
        isPerspectiveKey({ code: "KeyP", key: "p", altKey: true }),
        true,
    );
    // Option+P types π on macOS.
    assert.equal(
        isPerspectiveKey({ code: "KeyP", key: "π", altKey: true }),
        true,
    );
    assert.equal(isPerspectiveKey({ code: "KeyP", key: "p" }), false);
    assert.equal(
        isPerspectiveKey({
            code: "KeyP",
            key: "p",
            altKey: true,
            metaKey: true,
        }),
        false,
    );
    assert.equal(
        isPerspectiveKey({
            code: "KeyP",
            key: "P",
            altKey: true,
            shiftKey: true,
        }),
        false,
    );
    assert.equal(
        isPerspectiveKey({ code: "KeyO", key: "o", altKey: true }),
        false,
    );
});

test("Alt+P opens the menu, and a text field keeps the key", () => {
    control.show(["Security"], null);
    const stop = onPerspectiveKey(() => control.open());

    const field = document.createElement("input");
    document.body.appendChild(field);
    keydown(field, { code: "KeyP", key: "π", altKey: true });
    assert.equal(popup(), null);

    const event = keydown(document.body, {
        code: "KeyP",
        key: "π",
        altKey: true,
    });
    assert.ok(popup(), "the menu opened");
    assert.equal(event.defaultPrevented, true);
    stop();
});
