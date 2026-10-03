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

test("a subscriber added after the first paint hears the current view at once", () => {
    const shown = new ShownListeners(() => "A");
    shown.start();
    const heard = [];
    shown.add((view) => heard.push(view));
    assert.deepEqual(heard, ["A"]);
});

test("a subscriber added before the first paint is not called early", () => {
    let current = "A";
    const shown = new ShownListeners(() => current);
    const heard = [];
    shown.add((view) => heard.push(view));
    shown.start();
    assert.deepEqual(heard, []);
    current = "B";
    shown.emit();
    assert.deepEqual(heard, ["B"]);
});

test("an unsubscribed callback hears nothing more", () => {
    const shown = new ShownListeners(() => "A");
    shown.start();
    const heard = [];
    const unsubscribe = shown.add((view) => heard.push(view));
    unsubscribe();
    shown.emit();
    assert.deepEqual(heard, ["A"]);
});

test("the canvas is ready only for the view it painted", () => {
    assert.equal(readyFor("A", "A"), true);
    assert.equal(readyFor("B", "A"), false);
    assert.equal(readyFor("A", null), false);
    assert.equal(readyFor(undefined, null), false);
    assert.equal(readyFor(undefined, undefined), false);
});
