/**
 * The page's edit session (spec 7.4, 9.1, ADR 18): edited layouts, what
 * waits to be saved, autosave and the save requests themselves.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { EditSession, AUTOSAVE_MS, SAVE_ENDPOINT, TOKEN_HEADER } =
    await importSrc("components/edit-session");

/**
 * A host whose timers wait to be run by hand and whose `fetch` answers from
 * `answers` in turn: `{ status, body }`, or an `Error` to throw. A promise in
 * place of an answer holds that request until it settles.
 */
function stubHost(answers = []) {
    const requests = [];
    const timers = new Map();
    let next = 1;
    return {
        requests,
        timers,
        runTimers() {
            for (const [id, { callback }] of [...timers]) {
                timers.delete(id);
                callback();
            }
        },
        host: {
            setTimeout(callback, ms) {
                const id = next++;
                timers.set(id, { callback, ms });
                return id;
            },
            clearTimeout(id) {
                timers.delete(id);
            },
            async fetch(url, init) {
                requests.push({ url, init, body: JSON.parse(init.body) });
                const answer = await (answers.shift() ?? {
                    status: 200,
                    body: { version: `v${requests.length + 1}` },
                });
                if (answer instanceof Error) throw answer;
                return {
                    ok: answer.status >= 200 && answer.status < 300,
                    status: answer.status,
                    json: async () => answer.body,
                };
            },
        },
    };
}

const change = (view, id, x, y) => ({
    view,
    before: { elements: { [id]: { x: 0, y: 0 } } },
    after: { elements: { [id]: { x, y } } },
});

const session = (stub, version = "v1") =>
    new EditSession({ version, token: "secret", host: stub.host });

test("a change lays its after over the view's edited layout and waits for a save", () => {
    const stub = stubHost();
    const edits = session(stub);
    assert.deepEqual(edits.status(), { state: "saved", waiting: false });
    edits.record(change("A", "1", 10, 20));
    const layout = edits.record(change("A", "2", 30, 40));
    assert.deepEqual(layout, {
        elements: { 1: { x: 10, y: 20 }, 2: { x: 30, y: 40 } },
    });
    assert.deepEqual(edits.layoutOf("A"), layout);
    assert.deepEqual(edits.layouts(), { A: layout });
    assert.equal(edits.layoutOf("B"), undefined);
    assert.deepEqual(edits.status(), { state: "unsaved", waiting: true });
});

test("autosave runs 5 s after the last change", async () => {
    const stub = stubHost();
    const edits = session(stub);
    edits.record(change("A", "1", 10, 20));
    edits.record(change("A", "1", 15, 20));
    assert.equal(stub.timers.size, 1, "each change starts the countdown again");
    assert.equal([...stub.timers.values()][0].ms, AUTOSAVE_MS);
    assert.equal(AUTOSAVE_MS, 5000);
    assert.equal(stub.requests.length, 0);
    stub.runTimers();
    await edits.save();
    assert.equal(stub.requests.length, 1);
    assert.deepEqual(stub.requests[0].body.views, {
        A: { elements: { 1: { x: 15, y: 20 } } },
    });
});

test("a save sends the token, JSON, the loaded version, the open view and only what changed", async () => {
    const stub = stubHost();
    const edits = session(stub, "first");
    edits.setView("B");
    edits.record(change("A", "1", 10, 20));
    assert.equal(await edits.save(), true);
    const [{ url, init, body }] = stub.requests;
    assert.equal(url, SAVE_ENDPOINT);
    assert.equal(init.method, "POST");
    assert.equal(init.headers[TOKEN_HEADER], "secret");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.deepEqual(body, {
        version: "first",
        view: "B",
        views: { A: { elements: { 1: { x: 10, y: 20 } } } },
    });
    assert.deepEqual(edits.status(), { state: "saved", waiting: false });
    assert.equal(stub.timers.size, 0, "a save at once cancels the autosave");

    edits.record(change("A", "2", 1, 2));
    await edits.save();
    assert.equal(
        stub.requests[1].body.version,
        "v2",
        "the next save carries the version the server returned",
    );
    assert.deepEqual(stub.requests[1].body.views, {
        A: { elements: { 2: { x: 1, y: 2 } } },
    });
});

test("a save with nothing waiting sends nothing", async () => {
    const stub = stubHost();
    assert.equal(await session(stub).save(), true);
    assert.equal(stub.requests.length, 0);
});

test("a refused save shows the reason and keeps its changes for the next one", async () => {
    const stub = stubHost([
        { status: 409, body: { error: "workspace.json changed on disk" } },
    ]);
    const edits = session(stub);
    const statuses = [];
    edits.onStatus((status) => statuses.push(status.state));
    edits.record(change("A", "1", 10, 20));
    assert.equal(await edits.save(), false);
    assert.deepEqual(edits.status(), {
        state: "failed",
        reason: "workspace.json changed on disk",
        waiting: true,
    });
    assert.deepEqual(statuses, ["unsaved", "saving", "failed"]);

    edits.record(change("A", "2", 5, 5));
    assert.equal(await edits.save(), true);
    assert.deepEqual(stub.requests[1].body.views, {
        A: { elements: { 1: { x: 10, y: 20 }, 2: { x: 5, y: 5 } } },
    });
    assert.deepEqual(edits.status(), { state: "saved", waiting: false });
});

test("a server out of reach is a failed save that says so", async () => {
    const stub = stubHost([new Error("connection refused")]);
    const edits = session(stub);
    edits.record(change("A", "1", 10, 20));
    await edits.save();
    assert.equal(edits.status().state, "failed");
    assert.match(edits.status().reason, /connection refused/);
});

test("a change made while a save is on its way waits for the next one", async () => {
    let release;
    const held = new Promise((resolve) => {
        release = () => resolve({ status: 200, body: { version: "v2" } });
    });
    const stub = stubHost([held]);
    const edits = session(stub);
    edits.record(change("A", "1", 10, 20));
    const first = edits.save();
    await Promise.resolve();
    assert.equal(edits.status().state, "saving");
    edits.record(change("A", "1", 50, 20));
    release();
    assert.equal(await first, false, "the later change is not saved yet");
    assert.deepEqual(edits.status(), { state: "unsaved", waiting: true });
    await edits.save();
    assert.deepEqual(stub.requests[1].body.views, {
        A: { elements: { 1: { x: 50, y: 20 } } },
    });
});

test("leaving the page sends what waits with keepalive", () => {
    const stub = stubHost();
    const edits = session(stub);
    edits.saveOnLeave();
    assert.equal(stub.requests.length, 0, "nothing waits, so nothing is sent");
    edits.record(change("A", "1", 10, 20));
    edits.saveOnLeave();
    assert.equal(stub.requests.length, 1);
    assert.equal(stub.requests[0].init.keepalive, true);
    assert.equal(stub.timers.size, 0);
});

test("a canvas change alone counts as unsaved and saves", async () => {
    const stub = stubHost();
    const edits = session(stub);
    edits.record({
        view: "A",
        before: { dimensions: { width: 2000, height: 2000 } },
        after: { dimensions: { width: 2100, height: 2100 }, paperSize: null },
    });
    assert.deepEqual(edits.status(), { state: "unsaved", waiting: true });
    assert.equal(await edits.save(), true);
    assert.deepEqual(stub.requests[0].body.views, {
        A: { dimensions: { width: 2100, height: 2100 }, paperSize: null },
    });
});

test("undo lays a change's before back, redo its after, one change per step and per view", async () => {
    const stub = stubHost();
    const edits = session(stub);
    assert.equal(edits.undo("A"), null, "nothing to undo yet");
    edits.record({
        view: "A",
        before: {
            elements: { 1: { x: 1, y: 1 } },
            relationships: { 9: { vertices: [] } },
            dimensions: { width: 2000, height: 2000 },
        },
        after: {
            elements: { 1: { x: 200, y: 200 } },
            relationships: { 9: { vertices: [{ x: 5, y: 5 }] } },
            dimensions: { width: 900, height: 600 },
        },
    });
    edits.record(change("B", "2", 30, 40));
    await edits.save();

    assert.deepEqual(edits.undo("A"), {
        elements: { 1: { x: 1, y: 1 } },
        relationships: { 9: { vertices: [] } },
        dimensions: { width: 2000, height: 2000 },
    });
    assert.deepEqual(edits.status(), { state: "unsaved", waiting: true });
    assert.equal(edits.undo("A"), null, "one step per change");
    assert.deepEqual(edits.layoutOf("B"), {
        elements: { 2: { x: 30, y: 40 } },
    });

    assert.deepEqual(edits.redo("A").dimensions, { width: 900, height: 600 });
    assert.equal(edits.redo("A"), null);
    edits.undo("A");
    edits.record(change("A", "1", 7, 7));
    assert.equal(edits.redo("A"), null, "a new edit clears redo");
});

test("the session says whether a view has a step to undo or redo, and tells its listeners when that changes", () => {
    const edits = session(stubHost());
    const heard = [];
    edits.onStatus(() => heard.push(edits.history("A")));
    assert.deepEqual(edits.history("A"), { undo: false, redo: false });

    edits.record(change("A", "1", 10, 10));
    assert.deepEqual(edits.history("A"), { undo: true, redo: false });
    assert.deepEqual(edits.history("B"), { undo: false, redo: false });

    edits.undo("A");
    assert.deepEqual(edits.history("A"), { undo: false, redo: true });
    assert.deepEqual(heard, [
        { undo: true, redo: false },
        { undo: false, redo: true },
    ]);
});

test("clearing a view's history keeps its edited layout and the other views' histories", () => {
    const edits = session(stubHost());
    edits.record(change("A", "1", 10, 10));
    edits.record(change("A", "1", 20, 20));
    edits.undo("A");
    edits.record(change("B", "2", 30, 40));
    let heard = 0;
    edits.onStatus(() => heard++);

    edits.clearHistory("A");
    assert.deepEqual(edits.history("A"), { undo: false, redo: false });
    assert.equal(edits.undo("A"), null);
    assert.equal(edits.redo("A"), null);
    assert.deepEqual(edits.layoutOf("A"), { elements: { 1: { x: 0, y: 0 } } });
    assert.deepEqual(edits.history("B"), { undo: true, redo: false });
    assert.equal(heard, 1, "the listeners never heard the history go");
});

test("a save keeps every view's history", async () => {
    const edits = session(stubHost());
    edits.record(change("A", "1", 10, 10));
    assert.equal(await edits.save(), true);
    assert.deepEqual(edits.history("A"), { undo: true, redo: false });
});
