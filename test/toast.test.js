/**
 * The toast, from `src/components/toast.ts`: one region at the bottom right
 * of the page that shows a notice, which leaves after 6 seconds unless the
 * reader holds it, and an error, which stays until it no longer applies, the
 * author acts or someone closes it. A new message of a kind replaces the
 * last one of that kind.
 */

import assert from "node:assert/strict";
import { DOMEvent } from "./support/dom.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { showNotice, showError, showErrorInPlace, dismissToast, NOTICE_MS } =
    await importSrc("components/toast");

const { document } = dom;

/** The toast of `kind` on the page, or null. */
const toastOf = (kind) => document.querySelector(`[data-toast="${kind}"]`);

/** Every toast on the page. */
const toasts = () => document.querySelectorAll("[data-toast]");

/** The button in `toast` that reads `label`. */
const button = (toast, label) =>
    [...toast.querySelectorAll("button")].find(
        (candidate) =>
            candidate.textContent.trim() === label ||
            candidate.getAttribute("aria-label") === label,
    );

/** Fire `type` on `element`, as the browser does. */
const fire = (element, type) => element.dispatchEvent(new DOMEvent(type));

/* ---------------- the region */

test("the page has one toast region, labeled for assistive technology, whatever it shows", () => {
    dom.reset();
    showNotice("first");
    showError("second");
    showNotice("third");
    const regions = document.querySelectorAll("[data-toasts]");
    assert.equal(regions.length, 1, "one region holds every toast");
    assert.equal(regions[0].getAttribute("role"), "region");
    assert.equal(regions[0].getAttribute("aria-label"), "Messages");
    assert.equal(regions[0].parentNode, document.body);
    dismissToast("notice");
    dismissToast("error");
});

/* ---------------- the two kinds */

test("a notice is a status and an error is an alert, each with its text", () => {
    dom.reset();
    const cases = [
        [
            "notice",
            () => showNotice("Payments has no view Deployment."),
            "status",
        ],
        ["error", () => showError("The workspace didn't load."), "alert"],
    ];
    for (const [kind, show, role] of cases) {
        show();
        const toast = toastOf(kind);
        assert.ok(toast, `the ${kind} shows`);
        assert.equal(toast.getAttribute("role"), role, kind);
        assert.match(toast.querySelector("p").textContent, /\.$/, kind);
    }
    dismissToast("notice");
    dismissToast("error");
});

test("a toast shows its text as text, so markup in it stays visible", () => {
    dom.reset();
    showNotice("<b>Payments</b> & Orders");
    assert.equal(
        toastOf("notice").querySelector("p").textContent,
        "<b>Payments</b> & Orders",
    );
    assert.equal(toastOf("notice").querySelector("b"), null);
    dismissToast("notice");
});

test("a notice and an error show together, one of each", () => {
    dom.reset();
    showNotice("the page shows Containers");
    showError("the workspace didn't load");
    assert.equal(toasts().length, 2);
    assert.ok(toastOf("notice") && toastOf("error"));
    dismissToast("notice");
    dismissToast("error");
});

/* ---------------- replacement within a kind */

test("a new message of a kind replaces the last one of that kind and leaves the other kind alone", () => {
    dom.reset();
    const cases = [
        ["notice", showNotice, "error", showError],
        ["error", showError, "notice", showNotice],
    ];
    for (const [kind, show, other, showOther] of cases) {
        showOther("stays");
        show("first");
        show("second");
        const shown = document.querySelectorAll(`[data-toast="${kind}"]`);
        assert.equal(shown.length, 1, `one ${kind} at a time`);
        assert.equal(shown[0].querySelector("p").textContent, "second");
        assert.equal(
            toastOf(other).querySelector("p").textContent,
            "stays",
            `the ${other} stays`,
        );
        dismissToast("notice");
        dismissToast("error");
    }
});

test("a replaced notice's timeout no longer takes away the notice that replaced it", () => {
    dom.reset();
    showNotice("first");
    const remove = showNotice("second");
    assert.equal(dom.window.timers.length, 1, "one timeout runs per notice");
    remove();
    showNotice("third");
    assert.equal(dom.window.timers.length, 1);
    dom.runTimers();
    assert.equal(toastOf("notice"), null);
});

test("dismissToast takes away the toast of that kind only", () => {
    dom.reset();
    showNotice("notice");
    showError("error");
    dismissToast("error");
    assert.equal(toastOf("error"), null);
    assert.ok(toastOf("notice"));
    dismissToast("notice");
    assert.equal(toasts().length, 0);
    dismissToast("notice");
});

test("the remover a show returns takes away that toast, and leaves the one that replaced it", () => {
    dom.reset();
    const removeFirst = showError("first");
    showError("second");
    removeFirst();
    assert.equal(toastOf("error").querySelector("p").textContent, "second");
    const removeSecond = showError("third");
    removeSecond();
    assert.equal(toastOf("error"), null);
});

/* ---------------- the notice's timeout */

test("a notice leaves after 6 seconds", () => {
    dom.reset();
    assert.equal(NOTICE_MS, 6000);
    showNotice("the page shows Containers");
    assert.deepEqual(
        dom.window.timers.map((timer) => timer.delay),
        [NOTICE_MS],
    );
    dom.runTimers();
    assert.equal(toastOf("notice"), null);
});

test("a notice stays while hovered or focused, and leaves once neither holds it", () => {
    dom.reset();
    const holds = [
        ["pointerenter", "pointerleave"],
        ["focusin", "focusout"],
    ];
    for (const [hold, release] of holds) {
        showNotice("the page shows Containers");
        const toast = toastOf("notice");
        fire(toast, hold);
        assert.ok(toast.hasAttribute("data-paused"), `${hold} pauses it`);
        dom.runTimers();
        assert.ok(toastOf("notice"), `${hold} holds the notice`);
        fire(toast, release);
        assert.ok(!toast.hasAttribute("data-paused"), `${release} resumes`);
        dom.runTimers();
        assert.equal(toastOf("notice"), null, `${release} lets it leave`);
    }
});

test("a notice hovered and focused stays until the pointer leaves and focus goes", () => {
    dom.reset();
    showNotice("the page shows Containers");
    const toast = toastOf("notice");
    fire(toast, "pointerenter");
    fire(toast, "focusin");
    fire(toast, "pointerleave");
    dom.runTimers();
    assert.ok(toastOf("notice"), "focus still holds it");
    fire(toast, "focusout");
    dom.runTimers();
    assert.equal(toastOf("notice"), null);
});

test("a notice shows how long it has left, and an error does not", () => {
    dom.reset();
    showNotice("notice");
    showError("error");
    assert.ok(toastOf("notice").querySelector("[data-toast-timer]"));
    assert.equal(toastOf("error").querySelector("[data-toast-timer]"), null);
    dismissToast("notice");
    dismissToast("error");
});

/* ---------------- the error */

test("an error stays until someone closes it", () => {
    dom.reset();
    showError("the workspace didn't load");
    assert.equal(dom.window.timers.length, 0, "an error sets no timeout");
    dom.runTimers();
    assert.ok(toastOf("error"));
    button(toastOf("error"), "Dismiss").click();
    assert.equal(toastOf("error"), null);
});

test("a notice closes from its Dismiss button before its timeout", () => {
    dom.reset();
    showNotice("the page shows Containers");
    button(toastOf("notice"), "Dismiss").click();
    assert.equal(toastOf("notice"), null);
    assert.equal(dom.window.timers.length, 0, "the timeout goes with it");
});

test("an error shows its detail as preformatted text", () => {
    dom.reset();
    const detail = "line 4: <unexpected token>\n  at Parser";
    showError("the workspace didn't load", { detail });
    assert.equal(toastOf("error").querySelector("pre").textContent, detail);
    showError("again");
    assert.equal(toastOf("error").querySelector("pre"), null);
    dismissToast("error");
});

test("an error's actions show in order, the first as primary, and each takes the toast away then runs", () => {
    dom.reset();
    for (const [index, label] of [
        "Keep my changes",
        "Discard them",
    ].entries()) {
        const ran = [];
        showError("workspace.json changed on disk", {
            actions: [
                {
                    label: "Keep my changes",
                    run: () => ran.push(["keep", !!toastOf("error")]),
                },
                {
                    label: "Discard them",
                    run: () => ran.push(["discard", !!toastOf("error")]),
                },
            ],
        });
        const toast = toastOf("error");
        const labels = [...toast.querySelectorAll("[data-toast-action]")].map(
            (action) => action.textContent.trim(),
        );
        assert.deepEqual(labels, ["Keep my changes", "Discard them"]);
        assert.ok(
            toast
                .querySelector("[data-toast-action]")
                .classList.contains("primary"),
            "the first action is primary",
        );
        button(toast, label).click();
        assert.deepEqual(ran, [[index === 0 ? "keep" : "discard", false]]);
        assert.equal(toastOf("error"), null);
    }
});

test("an error with actions waits for one and offers no Dismiss", () => {
    dom.reset();
    showError("workspace.json changed on disk", {
        actions: [{ label: "Keep my changes", run: () => {} }],
    });
    assert.equal(button(toastOf("error"), "Dismiss"), undefined);
    dismissToast("error");
});

/* ---------------- the error in place of the canvas */

test("with nothing to draw yet, an error shows in place of the canvas with its detail, and leaves the toast region alone", () => {
    dom.reset();
    const canvas = dom.mount("structurizr-diagram-target");
    canvas.innerHTML = "<svg></svg>";
    showErrorInPlace(canvas, "The workspace didn't load.", "line 4: <oops>");
    const error = canvas.querySelector("[data-error-in-place]");
    assert.ok(error, "the error shows in the canvas");
    assert.equal(
        canvas.querySelector("svg"),
        null,
        "it takes the canvas's place",
    );
    assert.equal(error.getAttribute("role"), "alert");
    assert.equal(
        error.querySelector("p").textContent,
        "The workspace didn't load.",
    );
    assert.equal(error.querySelector("pre").textContent, "line 4: <oops>");
    assert.equal(document.querySelector("[data-toasts]"), null);
});
