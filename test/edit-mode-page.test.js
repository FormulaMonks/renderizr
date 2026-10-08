/**
 * Edit mode in the page (spec 4.5, 4.6 and 8): which views edit mode accepts,
 * the editing route, the session token and the pencil and Done buttons in
 * the toolbar.
 *
 * Edit mode's page code sits behind `__RENDERIZR_EDIT_MODE__`, which builds
 * set to false (ADR 15). These tests set the global themselves, the way the
 * edit-mode server's define does.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

// No root `after` puts the flag back. This file awaits imports between its
// tests, and node:test runs a root `after` hook as soon as the tests queued
// so far finish, before the ones below the next `await`: the flag went false
// under the edit toolbar's tests. `node --test` runs each file in its own
// process, so nothing else sees the flag.
globalThis.__RENDERIZR_EDIT_MODE__ = true;

const { WorkspaceModel, isEditable, whyNotEditable } =
    await importSrc("model/index");
const { editingSearch, isEditingRoute, readingSearch } = await importSrc(
    "components/editing-route",
);
const { sessionToken, takeSessionToken, SESSION_TOKEN_KEY } = await importSrc(
    "components/session-token",
);
const { default: CurrentView } = await importSrc("components/current-view");

const { document } = dom;

const VIEW_TYPES = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/view-types.json", import.meta.url),
        "utf-8",
    ),
);

/** A stored-layout view of `type`, with whatever `extra` adds. */
const view = (type, extra = {}) => ({
    key: "View",
    type,
    description: "",
    elements: [],
    relationships: [],
    ...extra,
});

/** The automatic layout as structurizr-java 5 writes it, `applied` included. */
const JAVA_5_AUTOMATIC_LAYOUT = {
    implementation: "Graphviz",
    rankDirection: "TopBottom",
    rankSeparation: 300,
    nodeSeparation: 300,
    edgeSeparation: 0,
    vertices: false,
    applied: false,
};

/** The automatic layout as Structurizr 2026 writes it: no `implementation`, no `applied`. */
const STRUCTURIZR_2026_AUTOMATIC_LAYOUT = {
    rankDirection: "LeftRight",
    rankSeparation: 100,
    nodeSeparation: 50,
    edgeSeparation: 50,
    vertices: true,
};

/* -------------------------------------------------------------- isEditable */

const EDITABLE_TYPES = [
    "SystemLandscape",
    "SystemContext",
    "Container",
    "Component",
    "Dynamic",
    "Deployment",
    "Custom",
];

for (const type of EDITABLE_TYPES) {
    test(`isEditable accepts a ${type} view with no automaticLayout`, () => {
        assert.equal(isEditable(view(type)), true);
        assert.equal(whyNotEditable(view(type)), null);
    });

    test(`isEditable rejects a ${type} view with an automaticLayout in either shape`, () => {
        for (const automaticLayout of [
            JAVA_5_AUTOMATIC_LAYOUT,
            { ...JAVA_5_AUTOMATIC_LAYOUT, applied: true },
            STRUCTURIZR_2026_AUTOMATIC_LAYOUT,
        ]) {
            const automatic = view(type, { automaticLayout });
            assert.equal(isEditable(automatic), false);
            assert.equal(whyNotEditable(automatic), "automaticLayout");
        }
    });
}

test("isEditable rejects filtered views and image views", () => {
    const filtered = view("Filtered", { baseViewKey: "Landscape" });
    assert.equal(isEditable(filtered), false);
    assert.equal(whyNotEditable(filtered), "filtered");

    const image = view("Image", { content: "data:image/png;base64," });
    assert.equal(isEditable(image), false);
    assert.equal(whyNotEditable(image), "image");
});

test("isEditable accepts a view whose elements have no coordinates", () => {
    const unplaced = view("SystemLandscape", {
        elements: [{ id: "1" }, { id: "2", x: 0, y: 0 }],
    });
    assert.equal(isEditable(unplaced), true);
});

test("isEditable reads the views of a real workspace", () => {
    const model = new WorkspaceModel(structuredClone(VIEW_TYPES));
    const verdicts = Object.fromEntries(
        ["Landscape", "NoExternal", "Warehouse", "Picture"].map((key) => [
            key,
            isEditable(model.findViewByKey(key)),
        ]),
    );
    assert.deepEqual(verdicts, {
        Landscape: true,
        NoExternal: false,
        Warehouse: true,
        Picture: false,
    });
});

/* --------------------------------------------------------- editing route */

test("the editing route names the view and edit mode in the search", () => {
    const search = editingSearch("?page=diagrams&view=Other", "Landscape");
    const params = new URLSearchParams(search);
    assert.equal(params.get("page"), "diagrams");
    assert.equal(params.get("view"), "Landscape");
    assert.equal(isEditingRoute(search), true);
    assert.equal(isEditingRoute(`?${search}`), true, "a leading ? is fine");
});

test("the reading route drops edit mode and keeps the view", () => {
    const search = readingSearch(
        editingSearch("?page=diagrams&view=Other", "Landscape"),
    );
    assert.equal(isEditingRoute(search), false);
    assert.equal(new URLSearchParams(search).get("view"), "Landscape");
    assert.equal(isEditingRoute("?page=diagrams&view=Landscape"), false);
});

/* --------------------------------------------------------- session token */

/** A stand-in for the page's location, session storage and history. */
function stubWindow(href) {
    const values = new Map();
    const replaced = [];
    return {
        replaced,
        values,
        location: new URL(href),
        storage: {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
        },
        replaceUrl: (url) => replaced.push(url),
    };
}

test("the page keeps the token from the URL for the tab and drops it from the address bar", () => {
    const page = stubWindow(
        "http://127.0.0.1:5173/?token=s3cret#?page=diagrams&view=Landscape",
    );
    assert.equal(takeSessionToken(page), "s3cret");
    assert.equal(page.values.get(SESSION_TOKEN_KEY), "s3cret");
    assert.deepEqual(page.replaced, ["/#?page=diagrams&view=Landscape"]);
});

test("a reload without the token in the URL reads the one the tab kept", () => {
    const page = stubWindow("http://127.0.0.1:5173/#?page=diagrams");
    page.values.set(SESSION_TOKEN_KEY, "kept");
    assert.equal(takeSessionToken(page), "kept");
    assert.deepEqual(page.replaced, [], "the address bar is left alone");
});

test("a page without session storage still reads the token from the URL", () => {
    const page = stubWindow("http://127.0.0.1:5173/?token=s3cret");
    page.storage = {
        getItem() {
            throw new Error("storage is unavailable");
        },
        setItem() {
            throw new Error("storage is unavailable");
        },
    };
    assert.equal(takeSessionToken(page), "s3cret");
    assert.deepEqual(page.replaced, ["/"]);
});

test("the page keeps the token it took in memory, so a later read works without session storage", () => {
    const page = stubWindow("http://127.0.0.1:5173/?token=s3cret");
    page.storage = {
        getItem() {
            throw new Error("storage is unavailable");
        },
        setItem() {
            throw new Error("storage is unavailable");
        },
    };
    takeSessionToken(page);
    // The address bar has lost the token by now, and storage never had it.
    assert.equal(sessionToken(), "s3cret");
});

/* ------------------------------------------------------ pencil and Done */

const model = new WorkspaceModel(
    (() => {
        const workspace = structuredClone(VIEW_TYPES);
        // An automatic-layout view beside the stored ones.
        workspace.views.customViews.push({
            key: "WarehouseAutomatic",
            order: 8,
            title: "Warehouse, laid out automatically",
            description: "",
            automaticLayout: STRUCTURIZR_2026_AUTOMATIC_LAYOUT,
            elements: [{ id: "20" }, { id: "21" }],
            relationships: [{ id: "22" }],
        });
        return workspace;
    })(),
);

/** The engine as the toolbar sees it, doing nothing. */
const stubEngine = () => ({
    setColorScheme() {},
    setLabels() {},
    fit() {},
    zoomIn() {},
    zoomOut() {},
    play() {},
    pause() {},
    stepForward() {},
    stepBack() {},
    stop() {},
    onAnimationChanged(callback) {
        callback({ steps: 0, step: null, playing: false });
        return () => {};
    },
});

/** The editing route as the toolbar sees it, recording every navigation. */
function stubRoute(
    editing = false,
    {
        status = { state: "saved", waiting: false },
        notice = null,
        edge = null,
        state = { selected: 0, undo: false, redo: false },
    } = {},
) {
    const calls = [];
    return {
        calls,
        isEditing: () => editing,
        edit: (key) => calls.push(["edit", key]),
        done: () => calls.push(["done"]),
        discard: () => calls.push(["discard"]),
        href: (key) => `#?page=diagrams&view=${key}&mode=edit`,
        status: () => status,
        notice: () => notice,
        edge: () => edge,
        setRouting: (mode) => calls.push(["setRouting", mode]),
        resizeCanvas: (command, recenter) =>
            calls.push(["resizeCanvas", command, recenter]),
        calculateLayout: () => calls.push(["calculateLayout"]),
        align: (edge) => calls.push(["align", edge]),
        distribute: (axis) => calls.push(["distribute", axis]),
        undo: () => calls.push(["undo"]),
        redo: () => calls.push(["redo"]),
        showShortcuts: () => calls.push(["shortcuts"]),
        editState: () => state,
    };
}

/** The toolbar rendered for `key`, with `route` as its editing route. */
function toolbarFor(key, route = stubRoute()) {
    const element = document.createElement("section");
    const toolbar = new CurrentView(element, stubEngine(), model, route);
    toolbar.render(model.findViewByKey(key));
    return {
        toolbar,
        route,
        pencil: element.querySelector(".edit-view"),
        done: element.querySelector(".done-editing"),
        discard: element.querySelector(".discard-editing"),
    };
}

test("the pencil on an editable view opens its editing route", () => {
    const { toolbar, route, pencil, done } = toolbarFor("Warehouse");
    assert.ok(pencil, "an editable view shows the pencil");
    assert.equal(pencil.getAttribute("aria-disabled"), null);
    assert.equal(done, null, "reading shows no Done");

    pencil.click();
    assert.deepEqual(route.calls, [["edit", "Warehouse"]]);
    toolbar.clear();
});

test("the pencil on an automatic-layout view is disabled and says why", () => {
    const { toolbar, route, pencil } = toolbarFor("WarehouseAutomatic");
    assert.ok(pencil, "an automatic-layout view shows the pencil");
    assert.equal(pencil.getAttribute("aria-disabled"), "true");
    assert.equal(
        pencil.title,
        "This view uses automatic layout; remove `autoLayout` from the DSL to edit it.",
    );

    pencil.click();
    assert.deepEqual(route.calls, [], "a disabled pencil goes nowhere");
    toolbar.clear();
});

test("the pencil on a filtered view is disabled and links to the base view's editing route", () => {
    const { toolbar, pencil } = toolbarFor("NoExternal");
    assert.ok(pencil, "a filtered view shows the pencil");
    assert.equal(pencil.getAttribute("aria-disabled"), "true");
    const link = toolbar.element.querySelector("a.edit-base-view");
    assert.ok(link, "the pencil links to the base view");
    assert.equal(
        link.getAttribute("href"),
        "#?page=diagrams&view=Landscape&mode=edit",
    );
    assert.match(
        link.title,
        /The shop and everyone it deals with/,
        "it names the base view",
    );
    assert.match(
        pencil.title,
        /filtered/i,
        "the pencil says why the view itself is read-only",
    );
    toolbar.clear();
});

test("an image view shows no pencil", () => {
    const { toolbar, pencil, done } = toolbarFor("Picture");
    assert.equal(pencil, null);
    assert.equal(done, null);
    toolbar.clear();
});

test("in editing the toolbar shows Save and close and Discard in place of the pencil, each returning to reading", () => {
    const { toolbar, route, pencil, done, discard } = toolbarFor(
        "Landscape",
        stubRoute(true),
    );
    assert.equal(pencil, null, "editing shows no pencil");
    assert.ok(done, "editing shows Save and close");
    assert.equal(done.getAttribute("aria-label"), "Save and close");
    assert.ok(done.querySelector("svg"), "Save and close is an icon");
    assert.ok(discard, "editing shows Discard");
    assert.equal(
        discard.getAttribute("aria-label"),
        "Discard changes and close",
    );
    assert.ok(discard.querySelector("svg"), "Discard is an icon");

    done.click();
    discard.click();
    assert.deepEqual(route.calls, [["done"], ["discard"]]);
    toolbar.clear();
});

test("a toolbar without an editing route shows neither the pencil nor Done", () => {
    const element = document.createElement("section");
    const toolbar = new CurrentView(element, stubEngine(), model);
    toolbar.render(model.findViewByKey("Warehouse"));
    assert.equal(element.querySelector(".edit-view"), null);
    assert.equal(element.querySelector(".done-editing"), null);
    toolbar.clear();
});

test("with edit mode compiled out the toolbar shows no pencil, even given a route", () => {
    globalThis.__RENDERIZR_EDIT_MODE__ = false;
    try {
        const { toolbar, pencil, done } = toolbarFor("Warehouse");
        assert.equal(pencil, null);
        assert.equal(done, null);
        toolbar.clear();
    } finally {
        globalThis.__RENDERIZR_EDIT_MODE__ = true;
    }
});

/* ------------------------------------------------------ the edit toolbar */

const { paintRouting, paintSaveStatus } = await importSrc(
    "components/edit-buttons",
);
const { layoutNotice } = await importSrc("components/editing-route");

test("in editing the toolbar shows where saving stands as a dot whose tooltip says it", () => {
    const { toolbar } = toolbarFor("Landscape", stubRoute(true));
    const status = toolbar.element.querySelector(".save-status");
    assert.equal(status.textContent, "Saved");
    assert.equal(status.title, "Saved");
    assert.equal(status.dataset.state, "saved");
    assert.equal(toolbar.element.querySelector(".save-layout"), null);

    const savedAt = Date.UTC(2026, 9, 7, 17, 30);
    paintSaveStatus(toolbar.element, {
        state: "saved",
        waiting: false,
        savedAt,
    });
    assert.equal(status.textContent, "Saved");
    assert.equal(
        status.title,
        `Last saved at ${new Date(savedAt).toLocaleString()}`,
    );

    paintSaveStatus(toolbar.element, { state: "unsaved", waiting: true });
    assert.equal(status.textContent, "Unsaved changes");
    assert.equal(status.title, "Unsaved changes");
    assert.equal(status.dataset.state, "unsaved");

    paintSaveStatus(toolbar.element, { state: "saving", waiting: true });
    assert.equal(status.textContent, "Saving…");
    assert.equal(status.dataset.state, "saving");

    paintSaveStatus(toolbar.element, {
        state: "failed",
        reason: "workspace.json changed on disk",
        waiting: true,
    });
    assert.equal(
        status.textContent,
        "Save failed: workspace.json changed on disk",
    );
    assert.equal(status.title, "Save failed: workspace.json changed on disk");
    assert.equal(status.dataset.state, "failed");
    toolbar.clear();
});

const { paintEditState } = await importSrc("components/edit-buttons");

const ALIGN_TOOLTIPS = [
    ["left", /^Align left \((⌥A|Alt\+A)\)$/],
    ["center", /^Align horizontal centers \((⌥H|Alt\+H)\)$/],
    ["right", /^Align right \((⌥D|Alt\+D)\)$/],
    ["top", /^Align top \((⌥W|Alt\+W)\)$/],
    ["middle", /^Align vertical centers \((⌥V|Alt\+V)\)$/],
    ["bottom", /^Align bottom \((⌥S|Alt\+S)\)$/],
];

test("every edit toolbar button with a shortcut names it in its tooltip", () => {
    const { toolbar } = toolbarFor("Landscape", stubRoute(true));
    const button = (selector) => toolbar.element.querySelector(selector);
    for (const [edge, tooltip] of ALIGN_TOOLTIPS)
        assert.match(
            button(`.align-selection[data-edge="${edge}"]`).title,
            tooltip,
        );
    assert.match(
        button('.distribute-selection[data-axis="horizontal"]').title,
        /^Distribute horizontally \((⌥⇧H|Alt\+Shift\+H)\)$/,
    );
    assert.match(
        button('.distribute-selection[data-axis="vertical"]').title,
        /^Distribute vertically \((⌥⇧V|Alt\+Shift\+V)\)$/,
    );
    assert.match(button(".undo-layout").title, /^Undo \((⌘Z|Ctrl\+Z)\)$/);
    assert.match(
        button(".redo-layout").title,
        /^Redo \((⇧⌘Z|Ctrl\+Shift\+Z)\)$/,
    );
    assert.equal(button(".show-shortcuts").title, "Keyboard shortcuts (?)");
    assert.equal(button(".undo-layout").getAttribute("aria-label"), "Undo");
    toolbar.clear();
});

test("the arranging buttons follow the selection: align from two elements, distribute from three", () => {
    const route = stubRoute(true);
    const { toolbar } = toolbarFor("Landscape", route);
    const aligns = [...toolbar.element.querySelectorAll(".align-selection")];
    const distributes = [
        ...toolbar.element.querySelectorAll(".distribute-selection"),
    ];
    assert.equal(aligns.length, 6);
    assert.equal(distributes.length, 2);
    const enabled = () => [
        aligns.every((button) => !button.disabled),
        distributes.every((button) => !button.disabled),
    ];
    assert.deepEqual(enabled(), [false, false], "nothing selected");

    paintEditState(toolbar.element, { selected: 1, undo: false, redo: false });
    assert.deepEqual(enabled(), [false, false], "one element selected");
    paintEditState(toolbar.element, { selected: 2, undo: false, redo: false });
    assert.deepEqual(enabled(), [true, false], "two elements selected");
    paintEditState(toolbar.element, { selected: 3, undo: false, redo: false });
    assert.deepEqual(enabled(), [true, true], "three elements selected");

    aligns[0].click();
    distributes[1].click();
    assert.deepEqual(route.calls, [
        ["align", "left"],
        ["distribute", "vertical"],
    ]);
    toolbar.clear();
});

test("undo and redo follow the view's history, and the keyboard button opens the shortcuts", () => {
    const route = stubRoute(true, {
        state: { selected: 0, undo: true, redo: false },
    });
    const { toolbar } = toolbarFor("Landscape", route);
    const undo = toolbar.element.querySelector(".undo-layout");
    const redo = toolbar.element.querySelector(".redo-layout");
    assert.equal(undo.disabled, false, "undo waits with a step to undo");
    assert.equal(redo.disabled, true, "redo is enabled with nothing undone");

    paintEditState(toolbar.element, { selected: 0, undo: false, redo: true });
    assert.equal(undo.disabled, true);
    assert.equal(redo.disabled, false);

    redo.click();
    paintEditState(toolbar.element, { selected: 0, undo: true, redo: false });
    undo.click();
    toolbar.element.querySelector(".show-shortcuts").click();
    assert.deepEqual(route.calls, [["redo"], ["undo"], ["shortcuts"]]);
    toolbar.clear();
});

const { openShortcuts } = await importSrc("components/shortcuts-dialog");
const { DOMEvent: KeyEvent } = await import("./support/dom.js");

test("the Keyboard shortcuts dialog lists every group, and Escape closes it", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dialog = () => host.querySelector("[data-shortcuts-dialog]");

    openShortcuts(host);
    assert.match(dialog().textContent, /Keyboard shortcuts/);
    assert.deepEqual(
        [...dialog().querySelectorAll("h3")].map((heading) =>
            heading.textContent.trim(),
        ),
        ["Selection", "Moving", "Arranging", "History", "View"],
    );
    assert.match(dialog().textContent, /Distribute horizontally/);
    openShortcuts(host);
    assert.equal(
        host.querySelectorAll("[data-shortcuts-dialog]").length,
        1,
        "a second ? opened a second dialog",
    );

    const press = new KeyEvent("keydown", { bubbles: true });
    press.key = "Escape";
    document.body.dispatchEvent(press);
    assert.equal(dialog(), null, "Escape left the dialog open");
    assert.equal(document.listenersFor("keydown").length, 0);

    openShortcuts(host);
    dialog().querySelector(".close-shortcuts").click();
    assert.equal(dialog(), null, "Close left the dialog open");
    host.remove();
});

test("while an edge is selected the toolbar shows its routing mode, and a click sets the next one", () => {
    const { toolbar, route } = toolbarFor("Landscape", stubRoute(true));
    const button = toolbar.element.querySelector(".routing-mode");
    assert.ok(button, "the edit toolbar has no routing-mode button");
    assert.equal(button.hidden, true, "the button shows with no edge selected");

    paintRouting(toolbar.element, { id: "7", routing: "Direct" });
    assert.equal(button.hidden, false);
    assert.equal(button.getAttribute("aria-label"), "Routing mode: Direct");
    assert.match(
        button.title,
        /^Routing mode: Direct \(click or (⌥R|Alt\+R) for Orthogonal\)$/,
    );
    assert.equal(button.getAttribute("aria-keyshortcuts"), "Alt+R");
    assert.ok(button.querySelector("svg"), "the button shows no icon");
    button.click();
    assert.deepEqual(route.calls, [["setRouting", "Orthogonal"]]);

    paintRouting(toolbar.element, { id: "7", routing: "Orthogonal" });
    assert.equal(button.getAttribute("aria-label"), "Routing mode: Orthogonal");
    button.click();
    paintRouting(toolbar.element, { id: "7", routing: "Curved" });
    button.click();
    assert.deepEqual(route.calls.slice(1), [
        ["setRouting", "Curved"],
        ["setRouting", "Direct"],
    ]);

    paintRouting(toolbar.element, null);
    assert.equal(button.hidden, true);
    toolbar.clear();

    // A toolbar drawn again keeps showing the selected edge.
    const again = toolbarFor(
        "Landscape",
        stubRoute(true, { edge: { id: "7", routing: "Curved" } }),
    );
    const shown = again.toolbar.element.querySelector(".routing-mode");
    assert.equal(shown.hidden, false);
    assert.equal(shown.getAttribute("aria-label"), "Routing mode: Curved");
    again.toolbar.clear();
});

test("the editing route of a view without coordinates says its first edit saves what it shows", () => {
    assert.equal(
        layoutNotice("automatic", 0),
        "This view has no stored layout yet; your first edit saves the positions shown",
    );
    assert.equal(
        layoutNotice("unplaced", 2),
        "2 unplaced elements; your first edit saves where they appear",
    );
    assert.equal(
        layoutNotice("unplaced", 1),
        "1 unplaced element; your first edit saves where they appear",
    );
    assert.equal(layoutNotice("stored", 0), null);

    const notice =
        "2 unplaced elements; your first edit saves where they appear";
    const editing = toolbarFor("Landscape", stubRoute(true, { notice }));
    assert.equal(
        editing.toolbar.element.querySelector(".edit-notice").textContent,
        notice,
    );
    editing.toolbar.clear();
    const reading = toolbarFor("Landscape", stubRoute(false, { notice }));
    assert.equal(reading.toolbar.element.querySelector(".edit-notice"), null);
    reading.toolbar.clear();
});

test("editing disables the player buttons", () => {
    const element = document.createElement("section");
    const engine = {
        ...stubEngine(),
        onAnimationChanged(callback) {
            callback({ steps: 3, step: 2, playing: false });
            return () => {};
        },
    };
    const editing = new CurrentView(element, engine, model, stubRoute(true));
    editing.render(model.findViewByKey("Landscape"));
    for (const name of ["prev-step", "play-animation", "next-step"])
        assert.equal(
            element.querySelector(`.${name}`).disabled,
            true,
            `${name} plays while editing`,
        );
    editing.clear();

    const reading = new CurrentView(element, engine, model, stubRoute(false));
    reading.render(model.findViewByKey("Landscape"));
    for (const name of ["prev-step", "play-animation", "next-step"])
        assert.equal(element.querySelector(`.${name}`).disabled, false);
    reading.clear();
});

/* ---------------------------------------------- the unsaved-changes dialog */

const { confirmLeave } = await importSrc("components/unsaved-dialog");
const { DOMEvent } = await import("./support/dom.js");

test("the leave dialog warns that changes will be lost, offers Discard and continue and Stay, and Escape stays", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dialog = () => host.querySelector("[data-unsaved-dialog]");

    const discarding = confirmLeave(host, "Warehouse");
    assert.match(dialog().textContent, /Leave Warehouse\? .* will be lost/);
    assert.equal(
        document.activeElement,
        dialog().querySelector(".stay"),
        "Stay, which loses nothing, takes the focus",
    );
    dialog().querySelector(".discard-and-continue").click();
    assert.equal(await discarding, true);
    assert.equal(dialog(), null, "the dialog stayed open");

    const staying = confirmLeave(host, "Warehouse");
    dialog().querySelector(".stay").click();
    assert.equal(await staying, false);

    const escaping = confirmLeave(host, "Warehouse");
    const press = new DOMEvent("keydown", { bubbles: true });
    press.key = "Escape";
    document.body.dispatchEvent(press);
    assert.equal(await escaping, false);
    assert.equal(dialog(), null);
    assert.equal(document.listenersFor("keydown").length, 0);
    host.remove();
});

/* ------------------------------------------- the drawer and the base view */

test("a click on another view in the drawer goes through the page's guard", async () => {
    const { default: history } = await import("./support/history.js");
    const { default: DiagramNavigation } = await importSrc(
        "components/diagram-navigation",
    );
    history.replace({ search: "?page=diagrams&view=Warehouse" });
    const shown = [];
    const held = [];
    const navigation = new DiagramNavigation(
        document.createElement("nav"),
        { changeView: (key) => shown.push(key), getCurrentView: () => null },
        model,
        () => false,
        (proceed) => held.push(proceed),
    );
    navigation.render();
    assert.deepEqual(
        shown,
        ["Warehouse"],
        "the drawer opens its first view at once",
    );
    const other = model.getViews().find((v) => v.key !== "Warehouse").key;
    navigation.element.querySelector(`li[data-viewkey="${other}"]`).click();
    assert.deepEqual(shown, ["Warehouse"], "the click went past the guard");
    held[0]();
    assert.deepEqual(shown, ["Warehouse", other]);
    navigation.clear();
    history.replace({ search: "" });
});

test("the drawer opens a view it doesn't list when the page can show it", async () => {
    const { default: history } = await import("./support/history.js");
    const { default: DiagramNavigation } = await importSrc(
        "components/diagram-navigation",
    );
    // Landscape is the base of two filtered views, so the drawer hides it;
    // its editing route still has to open it.
    history.replace({ search: "?page=diagrams&view=Landscape&mode=edit" });
    const shown = [];
    const switcher = {
        changeView: (key) => shown.push(key),
        getCurrentView: () => null,
    };
    const element = document.createElement("nav");

    const reading = new DiagramNavigation(element, switcher, model);
    reading.render();
    assert.deepEqual(
        shown,
        [model.getViews()[0].key],
        "by default it opens its first view",
    );
    reading.clear();

    history.replace({ search: "?page=diagrams&view=Landscape&mode=edit" });
    shown.length = 0;
    const editing = new DiagramNavigation(
        element,
        switcher,
        model,
        (key) => key === "Landscape",
    );
    editing.render();
    assert.deepEqual(shown, ["Landscape"]);
    assert.equal(
        new URLSearchParams(history.location.search).get("mode"),
        "edit",
        "the drawer keeps the editing route",
    );
    editing.clear();
    history.replace({ search: "" });
});
