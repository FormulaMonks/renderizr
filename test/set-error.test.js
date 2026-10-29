/**
 * A set error in `pnpm dev`, from `src/components/set-error.ts` (spec 264,
 * _The toast_): the tools' or the set's message in an error toast over the
 * last set that loaded, or in place of the canvas while no set has loaded.
 */

import assert from "node:assert/strict";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { showSetError } = await importSrc("components/set-error");
const { dismissToast } = await importSrc("components/toast");

const { document } = dom;

const CASES = [
    {
        name: "a DSL the tools refused names its file",
        error: {
            message: "Unexpected tokens at line 3",
            source: "payments/workspace.dsl",
            blank: false,
        },
        text: "payments/workspace.dsl didn't load. The page keeps the last set that did, and follows once you fix it.",
    },
    {
        name: "a set error speaks of the set",
        error: {
            message: "Two landscape scoped workspaces.",
            source: null,
            blank: false,
        },
        text: "The set didn't load. The page keeps the last set that did, and follows once you fix it.",
    },
];

for (const { name, error, text } of CASES) {
    test(`an error toast over the last set: ${name}`, () => {
        dom.reset();
        const canvas = document.createElement("div");
        canvas.innerHTML = "<svg></svg>";
        document.body.appendChild(canvas);
        showSetError(error, canvas);
        const toast = document.querySelector('[data-toast="error"]');
        assert.ok(toast, "no error toast shows");
        assert.equal(toast.querySelector("p").textContent, text);
        assert.equal(toast.querySelector("pre").textContent, error.message);
        assert.ok(canvas.querySelector("svg"), "the last set's canvas went");
        dismissToast("error");
    });
}

test("with no set loaded yet, the error shows in place of the canvas, and a later one replaces it", () => {
    dom.reset();
    const canvas = document.createElement("div");
    canvas.innerHTML = "<p>This workspace has no views.</p>";
    document.body.appendChild(canvas);
    showSetError(
        { message: "Nope", source: "workspace.dsl", blank: true },
        canvas,
    );
    const shown = canvas.querySelector("[data-error-in-place]");
    assert.ok(shown, "the error isn't in place of the canvas");
    assert.equal(
        shown.querySelector("p").textContent,
        "workspace.dsl didn't load, so there is nothing to draw yet. The page follows once you fix it.",
    );
    assert.equal(shown.querySelector("pre").textContent, "Nope");
    assert.equal(document.querySelector('[data-toast="error"]'), null);

    showSetError({ message: "Still not", source: null, blank: true }, canvas);
    assert.equal(
        canvas.querySelector("[data-error-in-place] p").textContent,
        "The set didn't load, so there is nothing to draw yet. The page follows once you fix it.",
    );
    assert.equal(
        canvas.querySelectorAll("[data-error-in-place]").length,
        1,
        "the errors stack in place",
    );
});
