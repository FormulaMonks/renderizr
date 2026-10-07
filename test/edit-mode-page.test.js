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
import { after } from "node:test";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

globalThis.__RENDERIZR_EDIT_MODE__ = true;
after(() => {
    globalThis.__RENDERIZR_EDIT_MODE__ = false;
});

const { WorkspaceModel, isEditable, whyNotEditable } =
    await importSrc("model/index");
const { editingSearch, isEditingRoute, readingSearch } = await importSrc(
    "components/editing-route",
);
const { takeSessionToken, SESSION_TOKEN_KEY } = await importSrc(
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
function stubRoute(editing = false) {
    const calls = [];
    return {
        calls,
        isEditing: () => editing,
        edit: (key) => calls.push(["edit", key]),
        done: () => calls.push(["done"]),
        href: (key) => `#?page=diagrams&view=${key}&mode=edit`,
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

test("in editing the toolbar shows Done in place of the pencil, and Done returns to reading", () => {
    const { toolbar, route, pencil, done } = toolbarFor(
        "Landscape",
        stubRoute(true),
    );
    assert.equal(pencil, null, "editing shows no pencil");
    assert.ok(done, "editing shows Done");
    assert.equal(done.textContent.trim(), "Done");

    done.click();
    assert.deepEqual(route.calls, [["done"]]);
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

/* ------------------------------------------- the drawer and the base view */

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
