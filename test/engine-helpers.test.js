/**
 * The React-free pieces of the React Flow engine: the header summary of a
 * workspace, the `onViewShown` replay and the canvas's `data-ready` gate. The
 * engine itself is exercised in Chrome by `test/e2e.test.js`.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { summarizeWorkspace } = await importSrc("engine/workspace-summary");
const { ShownListeners } = await importSrc("engine/react-flow/shown");
const { readyFor } = await importSrc("engine/react-flow/graph");
const { FALLBACK_FONT, canvasMeasure, diagramFontFamily, whenFontLoads } =
    await importSrc("engine/react-flow/fonts");
const { estimateText } = await importSrc("engine/geometry/boundary");

test("a workspace without a name or description summarizes to empty text", () => {
    const summary = summarizeWorkspace({});
    assert.equal(summary.name, "");
    assert.equal(summary.description, "");
    assert.deepEqual(summary.documentation, {
        sections: [],
        decisions: [],
        images: [],
    });
});

test("a workspace without a lastModifiedDate gets a parseable one", () => {
    const { lastModifiedDate } = summarizeWorkspace({ name: "W" });
    assert.ok(!Number.isNaN(new Date(lastModifiedDate).getTime()));
});

test("a workspace's own name, description and date are kept", () => {
    const summary = summarizeWorkspace({
        name: "W",
        description: "D",
        lastModifiedDate: "2024-01-02T00:00:00Z",
    });
    assert.equal(summary.name, "W");
    assert.equal(summary.description, "D");
    assert.equal(summary.lastModifiedDate, "2024-01-02T00:00:00Z");
});

test("a subscriber added after a paint hears the painted view at once", () => {
    const shown = new ShownListeners();
    shown.paint("A");
    const heard = [];
    shown.add((view) => heard.push(view));
    assert.deepEqual(heard, ["A"]);
});

test("a subscriber added before any paint is not called early", () => {
    const shown = new ShownListeners();
    const heard = [];
    shown.add((view) => heard.push(view));
    assert.deepEqual(heard, []);
    shown.paint("B");
    assert.deepEqual(heard, ["B"]);
});

test("an unsubscribed callback hears nothing more", () => {
    const shown = new ShownListeners();
    shown.paint("A");
    const heard = [];
    const unsubscribe = shown.add((view) => heard.push(view));
    unsubscribe();
    shown.paint("B");
    assert.deepEqual(heard, ["A"]);
});

test("the canvas is ready only for the view it painted", () => {
    assert.equal(readyFor("A", "A"), true);
    assert.equal(readyFor("B", "A"), false);
    assert.equal(readyFor("A", null), false);
    assert.equal(readyFor(undefined, null), false);
    assert.equal(readyFor(undefined, undefined), false);
});

/* ------------------------------------------------------------------- fonts */

/** A stand-in for `document.fonts` whose loads resolve with `faces`. */
const fontSet = (faces) => {
    const loads = [];
    return {
        loads,
        load(font) {
            loads.push(font);
            return Promise.resolve(faces);
        },
    };
};

/** Let every pending promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the diagram is first drawn in the fallback stack, after the --font family", () => {
    assert.equal(FALLBACK_FONT, "Helvetica, Arial, sans-serif");
    assert.equal(diagramFontFamily(null), FALLBACK_FONT);
    assert.equal(
        diagramFontFamily("Source Sans 3"),
        `"Source Sans 3", ${FALLBACK_FONT}`,
    );
});

test("boundaries re-derive once when the diagram family loads with faces", async () => {
    const fonts = fontSet([{ family: "Inter" }]);
    let derived = 0;
    whenFontLoads(fonts, "Inter", () => derived++);
    await settle();

    assert.equal(derived, 1, "re-derived other than once");
    assert.deepEqual(fonts.loads, ['16px "Inter"', 'bold 16px "Inter"']);
});

test("a family that loads no faces, or no --font at all, re-derives nothing", async () => {
    let derived = 0;
    whenFontLoads(fontSet([]), "Inter", () => derived++);
    const none = fontSet([{}]);
    whenFontLoads(none, null, () => derived++);
    whenFontLoads(undefined, "Inter", () => derived++);
    await settle();

    assert.equal(derived, 0);
    assert.deepEqual(none.loads, [], "nothing to load without a family");
});

test("a font that loads after the canvas is gone re-derives nothing", async () => {
    let derived = 0;
    const stop = whenFontLoads(fontSet([{}]), "Inter", () => derived++);
    stop();
    await settle();
    assert.equal(derived, 0);
});

test("a font that fails to load leaves the fallback in place", async () => {
    let derived = 0;
    whenFontLoads(
        { load: () => Promise.reject(new Error("blocked")) },
        "Inter",
        () => derived++,
    );
    await settle();
    assert.equal(derived, 0);
});

test("text is measured with canvas measureText in the CSS font string", () => {
    const fonts = [];
    const context = {
        font: "",
        measureText(text) {
            fonts.push(this.font);
            return { width: text.length * 7 };
        },
    };
    const document = {
        createElement: () => ({ getContext: () => context }),
    };
    const measure = canvasMeasure(document, diagramFontFamily("Inter"));

    assert.equal(measure("abc", 20, true), 21);
    assert.equal(measure("abcd", 10, false), 28);
    assert.deepEqual(fonts, [
        `bold 20px "Inter", ${FALLBACK_FONT}`,
        `10px "Inter", ${FALLBACK_FONT}`,
    ]);
});

test("without a canvas, text is estimated rather than not measured", () => {
    const document = { createElement: () => ({ getContext: () => null }) };
    assert.equal(canvasMeasure(document, FALLBACK_FONT), estimateText);
});
