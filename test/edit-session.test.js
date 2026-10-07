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
/** The time the stub host's clock always reads. */
const SAVED_AT = Date.UTC(2026, 9, 7, 17, 30);

/** Where saving stands, without when the file was last saved. */
const statusOf = (edits) => {
    const { savedAt, ...status } = edits.status();
    return status;
};

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
            now: () => SAVED_AT,
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
    assert.deepEqual(statusOf(edits), { state: "saved", waiting: false });
    edits.record(change("A", "1", 10, 20));
    const layout = edits.record(change("A", "2", 30, 40));
    assert.deepEqual(layout, {
        elements: { 1: { x: 10, y: 20 }, 2: { x: 30, y: 40 } },
    });
    assert.deepEqual(edits.layoutOf("A"), layout);
    assert.deepEqual(edits.layouts(), { A: layout });
    assert.equal(edits.layoutOf("B"), undefined);
    assert.deepEqual(statusOf(edits), { state: "unsaved", waiting: true });
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
        source: edits.source,
    });
    assert.equal(typeof edits.source, "string");
    assert.notEqual(
        edits.source,
        session(stubHost()).source,
        "two pages name themselves alike",
    );
    assert.deepEqual(statusOf(edits), { state: "saved", waiting: false });
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
    assert.deepEqual(statusOf(edits), {
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
    assert.deepEqual(statusOf(edits), { state: "saved", waiting: false });
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
    assert.deepEqual(statusOf(edits), { state: "unsaved", waiting: true });
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
    assert.deepEqual(statusOf(edits), { state: "unsaved", waiting: true });
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
    assert.deepEqual(statusOf(edits), { state: "unsaved", waiting: true });
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

/* ------------------------------------------------------------ live reload */

/** A workspace from disk at `version`, where every view keeps what it had. */
const arrival = (
    version,
    { hold = (_key, layout) => layout, touched = () => false } = {},
) => ({ version, hold, touched });

test("a workspace from disk drops saved edited layouts, keeps untouched histories and takes the new version, saying nothing", async () => {
    const stub = stubHost();
    const edits = session(stub);
    edits.record(change("A", "1", 10, 10));
    edits.record(change("B", "2", 20, 20));
    await edits.save();

    const held = edits.takeWorkspace(
        arrival("disk", { touched: (key) => key === "B" }),
    );
    assert.deepEqual(held, []);
    assert.deepEqual(edits.held(), []);
    assert.equal(edits.layoutOf("A"), undefined);
    assert.equal(edits.layoutOf("B"), undefined);
    assert.deepEqual(edits.history("A"), { undo: true, redo: false });
    assert.deepEqual(edits.history("B"), { undo: false, redo: false });
    assert.deepEqual(statusOf(edits), { state: "saved", waiting: false });

    edits.record(change("A", "1", 30, 30));
    await edits.save();
    assert.equal(stub.requests.at(-1).body.version, "disk");
});

test("edits waiting when a workspace arrives lie over it by id, hold the autosave and wait for Keep", async () => {
    const stub = stubHost();
    const edits = session(stub);
    edits.record(change("A", "1", 10, 10));
    await edits.save();
    edits.record(change("A", "2", 20, 20));
    edits.record(change("A", "gone", 30, 30));
    let heard = 0;
    edits.onStatus(() => heard++);

    const held = edits.takeWorkspace(
        arrival("disk", {
            hold: (_key, layout) => ({
                elements: Object.fromEntries(
                    Object.entries(layout.elements).filter(
                        ([id]) => id !== "gone",
                    ),
                ),
            }),
        }),
    );
    assert.deepEqual(held, ["A"]);
    assert.deepEqual(edits.held(), ["A"]);
    assert.ok(heard > 0, "the listeners never heard of the held edits");
    assert.deepEqual(
        edits.layoutOf("A"),
        { elements: { 2: { x: 20, y: 20 } } },
        "the saved edit stayed, or the lost element came along",
    );
    assert.equal(stub.timers.size, 0, "the autosave still runs");
    edits.record(change("A", "2", 25, 25));
    assert.equal(stub.timers.size, 0, "a change started the autosave again");
    assert.deepEqual(statusOf(edits), { state: "unsaved", waiting: true });

    // Keep my changes: save them against the new version.
    assert.equal(await edits.save(), true);
    assert.deepEqual(edits.held(), []);
    assert.deepEqual(stub.requests.at(-1).body, {
        version: "disk",
        view: null,
        views: { A: { elements: { 2: { x: 25, y: 25 } } } },
        source: edits.source,
    });
    edits.record(change("A", "2", 30, 30));
    assert.equal(stub.timers.size, 1, "Keep left the autosave held");
});

test("discarding held edits takes the file and clears those views' histories", () => {
    const edits = session(stubHost());
    edits.record(change("A", "1", 10, 10));
    edits.record(change("B", "2", 20, 20));
    edits.takeWorkspace(arrival("disk"));
    assert.deepEqual(edits.held(), ["A", "B"]);

    assert.deepEqual(edits.discard(), ["A", "B"]);
    assert.deepEqual(edits.held(), []);
    assert.equal(edits.layoutOf("A"), undefined);
    assert.deepEqual(edits.history("A"), { undo: false, redo: false });
    assert.deepEqual(edits.history("B"), { undo: false, redo: false });
    assert.deepEqual(statusOf(edits), { state: "saved", waiting: false });
});

test("a save refused as stale holds its edits, drawn again, until the author keeps or discards them", async () => {
    let release;
    const answer = new Promise((resolve) => {
        release = () =>
            resolve({
                status: 409,
                body: { error: "workspace.json changed on disk" },
            });
    });
    const stub = stubHost([answer]);
    const edits = session(stub);
    edits.record(change("A", "1", 10, 10));
    const saving = edits.save();
    await Promise.resolve();
    // The workspace arrives while the save is on its way.
    edits.takeWorkspace(arrival("disk"));
    assert.equal(edits.layoutOf("A"), undefined);
    release();
    assert.equal(await saving, false);

    assert.deepEqual(edits.held(), ["A"]);
    assert.deepEqual(edits.layoutOf("A"), {
        elements: { 1: { x: 10, y: 10 } },
    });
    assert.equal(stub.timers.size, 0, "the autosave still runs");
    assert.equal(await edits.save(), true);
    assert.equal(stub.requests.at(-1).body.version, "disk");
});

test("a stale save's edits lie over a workspace that arrived while it was on its way, so Keep never writes back what the author left alone", async () => {
    let release;
    const answer = new Promise((resolve) => {
        release = () =>
            resolve({ status: 409, body: { error: "stale", version: "disk" } });
    });
    const stub = stubHost([answer]);
    const edits = session(stub);
    // A first change carries every element; the author moved only 1.
    edits.record({
        view: "A",
        before: { elements: { 1: { x: 0, y: 0 }, 2: { x: 0, y: 0 } } },
        after: { elements: { 1: { x: 10, y: 10 }, 2: { x: 0, y: 0 } } },
    });
    const saving = edits.save();
    await Promise.resolve();
    // Another page moved element 2; the workspace keeps only what the
    // author changed from what the page drew before.
    edits.takeWorkspace(
        arrival("disk", {
            hold: (_key, layout) => ({
                elements: { 1: layout.elements[1] },
            }),
        }),
    );
    release();
    assert.equal(await saving, false);
    assert.deepEqual(edits.held(), ["A"]);
    assert.deepEqual(edits.layoutOf("A"), {
        elements: { 1: { x: 10, y: 10 } },
    });
    assert.equal(await edits.save(), true);
    assert.deepEqual(stub.requests.at(-1).body.views, {
        A: { elements: { 1: { x: 10, y: 10 } } },
    });
});

test("a save refused as stale takes the version the server names, so Keep saves against it before any workspace arrives", async () => {
    const stub = stubHost([
        {
            status: 409,
            body: { error: "workspace.json changed on disk", version: "v9" },
        },
    ]);
    const edits = session(stub);
    edits.record(change("A", "1", 10, 10));
    assert.equal(await edits.save(), false);
    assert.deepEqual(edits.held(), ["A"]);
    assert.equal(await edits.save(), true, "Keep failed again");
    assert.equal(stub.requests.at(-1).body.version, "v9");
});

test("a save on its way counts as unsaved, so a view switch asks first", async () => {
    let release;
    const held = new Promise((resolve) => {
        release = () => resolve({ status: 200, body: { version: "v2" } });
    });
    const stub = stubHost([held]);
    const edits = session(stub);
    assert.equal(edits.unsaved(), false);
    edits.record(change("A", "1", 10, 20));
    const saving = edits.save();
    await Promise.resolve();
    assert.equal(edits.waiting(), false, "the Save button stays off");
    assert.equal(edits.unsaved(), true);
    release();
    await saving;
    assert.equal(edits.unsaved(), false);
});

test("a failed save counts as unsaved", async () => {
    const stub = stubHost([{ status: 500, body: { error: "disk full" } }]);
    const edits = session(stub);
    edits.record(change("A", "1", 10, 20));
    await edits.save();
    assert.equal(edits.unsaved(), true);
});

test("the session knows when the file was last saved: from the workspace it loaded, then from each save that succeeds", async () => {
    const stub = stubHost();
    const loaded = Date.UTC(2026, 0, 1);
    const edits = new EditSession({
        version: "v1",
        token: "secret",
        savedAt: loaded,
        host: stub.host,
    });
    assert.equal(edits.status().savedAt, loaded);
    edits.record(change("View", "1", 10, 20));
    assert.equal(await edits.save(), true);
    assert.equal(edits.status().savedAt, SAVED_AT);
});

test("a session that doesn't know when the file was saved says nothing about it", () => {
    assert.equal("savedAt" in session(stubHost()).status(), false);
});

test("revert undoes every view back to where it stood when the author entered editing, and waits for a save", async () => {
    const stub = stubHost();
    const edits = session(stub);
    edits.record(change("A", "1", 10, 10));
    await edits.save();
    edits.enter();
    edits.record({
        view: "A",
        before: { elements: { 1: { x: 10, y: 10 } } },
        after: { elements: { 1: { x: 20, y: 20 } } },
    });
    edits.record(change("B", "2", 30, 30));
    edits.record(change("B", "2", 40, 40));
    await edits.save();

    assert.deepEqual(edits.revert().sort(), ["A", "B"]);
    assert.deepEqual(edits.layoutOf("A").elements["1"], { x: 10, y: 10 });
    assert.deepEqual(edits.layoutOf("B").elements["2"], { x: 0, y: 0 });
    assert.equal(statusOf(edits).state, "unsaved");
    assert.deepEqual(edits.history("A"), { undo: true, redo: true });
    assert.deepEqual(edits.revert(), [], "a second revert has nothing left");
});

test("revert goes back no further than a change on disk that cleared a view's history", () => {
    const edits = session(stubHost());
    edits.enter();
    edits.record(change("A", "1", 10, 10));
    edits.clearHistory("A");
    edits.record(change("A", "1", 20, 20));
    assert.deepEqual(edits.revert(), ["A"]);
    assert.deepEqual(edits.layoutOf("A").elements["1"], { x: 0, y: 0 });
});
